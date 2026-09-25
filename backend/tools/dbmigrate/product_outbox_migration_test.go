package main

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestProductOutboxMigration owns a disposable PostgreSQL container. It never
// reads DB_URI, DB_SOURCE or TEST_DB_URI; no shared database is a valid target.
func TestProductOutboxMigration(t *testing.T) {
	if testing.Short() {
		t.Skip("isolated PostgreSQL migration test")
	}
	if _, err := exec.LookPath("docker"); err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("Docker is required for isolated migration verification: %v", err)
		}
		t.Skip("Docker is required for isolated migration verification")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	t.Cleanup(cancel)
	docker := func(args ...string) string {
		t.Helper()
		var stderr bytes.Buffer
		command := exec.CommandContext(ctx, "docker", args...)
		command.Stderr = &stderr
		output, err := command.Output()
		require.NoError(t, err, "Docker 必须成功，才能使用自有隔离库：%s", stderr.String())
		return strings.TrimSpace(string(output))
	}
	dockerContext := docker("context", "show")
	endpoint := docker("context", "inspect", dockerContext, "--format", "{{.Endpoints.docker.Host}}")
	require.True(t, strings.HasPrefix(endpoint, "unix://"), "仅允许本机 Docker socket，不使用远端 Docker host")
	// Pin the proven local context on every subsequent call; ignore DOCKER_HOST.
	localDocker := func(args ...string) string {
		t.Helper()
		return docker(append([]string{"--context", dockerContext}, args...)...)
	}
	password := uuid.NewString()
	container := localDocker("create", "--label", "ecommerce.test=product-outbox-migration",
		"--publish", "127.0.0.1:0:5432", "--env", "POSTGRES_PASSWORD="+password,
		"postgres:18-alpine")
	t.Cleanup(func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer stopCancel()
		output, err := exec.CommandContext(stopCtx, "docker", "--context", dockerContext, "rm", "--force", "--volumes", container).CombinedOutput()
		assert.NoError(t, err, "必须删除本测试的容器及自有卷：%s", output)
	})
	localDocker("start", container)
	address := localDocker("port", container, "5432/tcp")
	host, port, err := net.SplitHostPort(address)
	require.NoError(t, err, "只能使用本测试容器的显式映射端口")
	require.Equal(t, "127.0.0.1", host, "测试数据库不得暴露到其他网络接口")
	dsn := fmt.Sprintf("postgres://postgres:%s@127.0.0.1:%s/postgres?sslmode=disable", password, port)
	admin, err := sql.Open("pgx", dsn)
	require.NoError(t, err, "必须显式连接测试创建的 PostgreSQL")
	t.Cleanup(func() { _ = admin.Close() })
	require.Eventually(t, func() bool {
		pingCtx, pingCancel := context.WithTimeout(ctx, time.Second)
		defer pingCancel()
		return admin.PingContext(pingCtx) == nil
	}, 30*time.Second, 100*time.Millisecond, "自有 PostgreSQL 必须就绪，不能回退到共享数据库")
	var serverVersion string
	require.NoError(t, admin.QueryRowContext(ctx, "SHOW server_version").Scan(&serverVersion), "必须记录实际 PostgreSQL 版本")
	require.True(t, strings.HasPrefix(serverVersion, "18."), "迁移验证必须使用 PostgreSQL 18，与目标主版本一致")
	t.Logf("owned container %s, PostgreSQL %s; no ambient database DSN used", container, serverVersion)

	for _, scenario := range []string{"fresh", "upgrade_down_up"} {
		t.Run(scenario, func(t *testing.T) {
			dbName := scenario + "_test"
			_, err := admin.ExecContext(ctx, "CREATE DATABASE "+dbName)
			require.NoError(t, err, "每条验收路径必须从独立空库开始")
			testDSN := fmt.Sprintf("postgres://postgres:%s@127.0.0.1:%s/%s?sslmode=disable", password, port, dbName)
			db, err := sql.Open("pgx", testDSN)
			require.NoError(t, err, "必须连接本用例的独立数据库")
			t.Cleanup(func() { _ = db.Close() })
			migrate := func(command string, args ...string) error {
				return runService(ctx, "../../services", "product", testDSN, command, args)
			}
			query := func(statement string) string {
				t.Helper()
				var value string
				require.NoError(t, db.QueryRowContext(ctx, statement).Scan(&value), "数据库断言必须可执行：%s", statement)
				return value
			}
			execSQL := func(statement string) {
				t.Helper()
				_, err := db.ExecContext(ctx, statement)
				require.NoError(t, err, "必须建立/清理隔离用例数据：%s", statement)
			}
			checkVersion := func(version int) {
				t.Helper()
				assert.Equal(t, strconv.Itoa(version), query("SELECT max(version_id)::text FROM public.goose_db_version_product WHERE is_applied"), "product 必须使用独立的 goose 版本表并记录正确版本")
			}
			checkRemoved := func() {
				t.Helper()
				assert.Equal(t, "true", query("SELECT (to_regclass('products.outbox') IS NULL AND to_regclass('products.outbox_id_seq') IS NULL)::text"), "Up 必须删除 outbox 及其自有序列")
				assert.Equal(t, "4", query("SELECT count(*)::text FROM pg_tables WHERE schemaname='products' AND tablename IN ('spus','skus','sale_detail','search_catalog')"), "不能误删商品表或搜索投影")
				assert.Equal(t, "3", query("SELECT count(*)::text FROM pg_trigger WHERE tgname IN ('trg_search_catalog_spus','trg_search_catalog_skus','trg_search_catalog_sale_detail') AND NOT tgisinternal"), "不能破坏现有搜索投影触发器")
				checkVersion(6)
			}
			if scenario == "fresh" {
				require.NoError(t, migrate("up"), "空库必须能完整应用 product 历史迁移")
				checkRemoved()
				assert.Equal(t, "1,2,3,4,5,6", query("SELECT string_agg(version_id::text, ',' ORDER BY version_id) FROM public.goose_db_version_product WHERE is_applied AND version_id > 0"), "fresh Up 必须逐条记录六个历史版本")
				return
			}

			require.NoError(t, migrate("up-to", "5"), "升级路径必须从真实 v5 schema 开始")
			checkVersion(5)
			before := query(productOutboxSchema)
			execSQL("INSERT INTO products.outbox (source,type,subject,partition_key,payload) VALUES ('migration-test','test','spu:1','spu:1','{}')")
			execSQL("SELECT setval('products.outbox_id_seq', 77)")
			// A dependent view must block the contract step; never resolve it via CASCADE.
			execSQL("CREATE VIEW products.outbox_dependency AS SELECT event_id FROM products.outbox")
			err = migrate("up")
			var pgErr *pgconn.PgError
			require.ErrorAs(t, err, &pgErr, "未知依赖必须使迁移失败，而不是被 CASCADE 删除")
			assert.Equal(t, "2BP01", pgErr.Code, "失败原因必须是依赖对象保护")
			assert.Equal(t, "1", query("SELECT count(*)::text FROM products.outbox_dependency"), "迁移失败后依赖视图和原有数据必须保留")
			checkVersion(5)
			assert.Equal(t, "0", query("SELECT count(*)::text FROM public.goose_db_version_product WHERE version_id=6"), "失败的事务不能留下 v6 版本记录")
			execSQL("DROP VIEW products.outbox_dependency")

			// An open reader must cause a bounded lock failure, not stall the contract step.
			reader, err := db.BeginTx(ctx, nil)
			require.NoError(t, err)
			t.Cleanup(func() { _ = reader.Rollback() })
			_, err = reader.ExecContext(ctx, "SELECT 1 FROM products.outbox LIMIT 1")
			require.NoError(t, err)
			lockCtx, lockCancel := context.WithTimeout(ctx, 8*time.Second)
			err = runService(lockCtx, "../../services", "product", testDSN, "up", nil)
			lockCancel()
			require.ErrorAs(t, err, &pgErr, "锁等待必须由数据库超时终止，而非测试 deadline")
			assert.Equal(t, "55P03", pgErr.Code)
			require.NoError(t, reader.Rollback())
			checkVersion(5)
			assert.Equal(t, "1", query("SELECT count(*)::text FROM products.outbox"))

			require.NoError(t, migrate("up"), "依赖处理后必须可应用 v6")
			checkRemoved()
			require.NoError(t, migrate("down"), "v6 必须可以回退空表结构")
			checkVersion(5)
			assert.JSONEq(t, before, query(productOutboxSchema), "Down 必须恢复 v5 的列、默认值、约束、索引和表注释")
			assert.Equal(t, "0", query("SELECT count(*)::text FROM products.outbox"), "Down 仅恢复结构，不能恢复被删除的行")
			assert.Equal(t, "1:false", query("SELECT last_value::text || ':' || is_called::text FROM products.outbox_id_seq"), "Down 创建新序列，不恢复旧序列进度")
			require.NoError(t, migrate("up"), "回退后必须能再次应用 v6")
			checkRemoved()
		})
	}
}

// Compare catalog definitions rather than copying 00004's DDL into the test.
const productOutboxSchema = `SELECT jsonb_build_object(
    'columns', (SELECT jsonb_agg(jsonb_build_object(
        'name', a.attname, 'type', format_type(a.atttypid,a.atttypmod),
        'not_null', a.attnotnull, 'default', pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid='products.outbox'::regclass AND a.attnum>0 AND NOT a.attisdropped),
    'constraints', (SELECT jsonb_agg(jsonb_build_object('name', conname, 'definition', pg_get_constraintdef(oid)) ORDER BY conname)
        FROM pg_constraint WHERE conrelid='products.outbox'::regclass),
    'indexes', (SELECT jsonb_agg(jsonb_build_object('name', indexname, 'definition', indexdef) ORDER BY indexname)
        FROM pg_indexes WHERE schemaname='products' AND tablename='outbox'),
    'comment', obj_description('products.outbox'::regclass, 'pg_class')
)::text`
