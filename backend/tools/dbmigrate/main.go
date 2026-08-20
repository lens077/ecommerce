// dbmigrate 是全部微服务共用的数据库迁移入口（goose v3 以库形态内嵌，不依赖外部 CLI）。
//
// 每个服务的迁移文件在 services/<svc>/internal/data/migrations/（goose 注解 SQL，
// 也是 sqlc 的 schema 输入），示例种子在 services/<svc>/internal/data/seeds/
// （goose no-versioning 模式，必须写成可重复执行的幂等语句）。
// 10 个服务共用一个 ecommerce 库、各占一个 PG schema，版本表按服务隔离在
// public.goose_db_version_<svc>，互不影响、可独立演进。
//
// 用法（在 backend/ 下执行，或用根 Makefile 的 migrate-* 目标）：
//
//	go run ./tools/dbmigrate -svc all up            # 全部服务迁移到最新
//	go run ./tools/dbmigrate -svc cart status       # 查看 cart 的迁移状态
//	go run ./tools/dbmigrate -svc cart down         # 回滚 cart 最近一条
//	go run ./tools/dbmigrate -svc cart down-to 0    # 回滚 cart 全部
//	go run ./tools/dbmigrate -svc all baseline      # 存量库记账（已手工建过表的环境，见下）
//	go run ./tools/dbmigrate -svc product seed      # 灌 product 的示例数据（幂等，可重复跑）
//	go run ./tools/dbmigrate -svc product seed-down # 清掉示例数据
//	go run ./tools/dbmigrate -svc cart create add_coupon_column   # 生成下一号迁移骨架
//
// DSN 取值优先级：-dsn 参数 > DB_URI > DB_SOURCE > 本地默认
// (postgres://postgres:postgres@127.0.0.1:15432/ecommerce?sslmode=disable)。
//
// baseline：本仓的表历史上是手工 psql 建的（集群 CNPG 的 ecommerce 库已有全部对象）。
// 在这类存量环境上不能重放 00001 初始迁移（CREATE TYPE 会撞已存在对象），
// 先跑 baseline 把「当前已有结构 = 已应用到最新版本」记进版本表，之后的增量迁移正常 up。
// 只允许对空版本表 baseline；有记录时直接报错防止误用。
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/database"
	"github.com/pressly/goose/v3/lock"
)

const defaultDSN = "postgres://postgres:postgres@127.0.0.1:15432/ecommerce?sslmode=disable"

func main() {
	var (
		svcFlag  = flag.String("svc", "all", "服务名，逗号分隔，或 all")
		dsnFlag  = flag.String("dsn", "", "PostgreSQL DSN；缺省依次读 DB_URI / DB_SOURCE / 本地默认")
		baseFlag = flag.String("base", "services", "服务目录的根（相对 backend/）")
		timeout  = flag.Duration("timeout", 5*time.Minute, "整体超时")
	)
	flag.Parse()
	args := flag.Args()
	if len(args) == 0 {
		flag.Usage()
		fatal(errors.New("缺少命令：up | up-by-one | up-to N | down | down-to N | status | version | baseline | seed | seed-down | create NAME"))
	}
	cmd, cmdArgs := args[0], args[1:]

	services, err := discoverServices(*baseFlag)
	if err != nil {
		fatal(err)
	}
	targets, err := selectServices(services, *svcFlag)
	if err != nil {
		fatal(err)
	}

	// create 只写文件，不连库。
	if cmd == "create" {
		if len(cmdArgs) != 1 {
			fatal(errors.New("create 需要一个迁移名，例如: create add_coupon_column"))
		}
		if len(targets) != 1 {
			fatal(errors.New("create 必须用 -svc 指定单个服务"))
		}
		fatalIf(createMigration(*baseFlag, targets[0], cmdArgs[0]))
		return
	}

	dsn := resolveDSN(*dsnFlag)
	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	var failed []string
	for _, svc := range targets {
		if err := runService(ctx, *baseFlag, svc, dsn, cmd, cmdArgs); err != nil {
			fmt.Fprintf(os.Stderr, "❌ %s: %v\n", svc, err)
			failed = append(failed, svc)
		}
	}
	if len(failed) > 0 {
		fatal(fmt.Errorf("失败的服务: %s", strings.Join(failed, ", ")))
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "dbmigrate:", err)
	os.Exit(1)
}

func fatalIf(err error) {
	if err != nil {
		fatal(err)
	}
}

// discoverServices 扫出所有带 migrations 目录的服务。
func discoverServices(base string) ([]string, error) {
	entries, err := os.ReadDir(base)
	if err != nil {
		return nil, fmt.Errorf("读取 %s 失败（请在 backend/ 目录下运行）: %w", base, err)
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if st, err := os.Stat(migrationsDir(base, e.Name())); err == nil && st.IsDir() {
			out = append(out, e.Name())
		}
	}
	sort.Strings(out)
	if len(out) == 0 {
		return nil, fmt.Errorf("在 %s 下没找到任何 internal/data/migrations 目录", base)
	}
	return out, nil
}

func selectServices(all []string, svcFlag string) ([]string, error) {
	if svcFlag == "all" || svcFlag == "" {
		return all, nil
	}
	known := make(map[string]bool, len(all))
	for _, s := range all {
		known[s] = true
	}
	var out []string
	for _, s := range strings.Split(svcFlag, ",") {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if !known[s] {
			return nil, fmt.Errorf("未知服务 %q（可选: %s）", s, strings.Join(all, " "))
		}
		out = append(out, s)
	}
	if len(out) == 0 {
		return nil, errors.New("-svc 为空")
	}
	return out, nil
}

func migrationsDir(base, svc string) string {
	return filepath.Join(base, svc, "internal", "data", "migrations")
}

func seedsDir(base, svc string) string {
	return filepath.Join(base, svc, "internal", "data", "seeds")
}

func resolveDSN(flagVal string) string {
	if flagVal != "" {
		return flagVal
	}
	if v := os.Getenv("DB_URI"); v != "" {
		return v
	}
	if v := os.Getenv("DB_SOURCE"); v != "" {
		return v
	}
	return defaultDSN
}

func versionTable(svc string) string {
	// 显式限定 public：goose 用非限定名读写版本表，一旦某条迁移改了会话的
	// search_path（历史 schema.sql 就干过），版本表会解析失败。双保险之一，
	// 另一半是迁移文件里不写 SET search_path。
	return "public.goose_db_version_" + strings.ReplaceAll(svc, "-", "_")
}

func openDB(dsn string) (*sql.DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	return db, nil
}

func runService(ctx context.Context, base, svc, dsn, cmd string, args []string) error {
	db, err := openDB(dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	switch cmd {
	case "seed", "seed-down":
		dir := seedsDir(base, svc)
		if st, err := os.Stat(dir); err != nil || !st.IsDir() {
			fmt.Printf("== %s: 无 seeds 目录，跳过\n", svc)
			return nil
		}
		// no-versioning：不写版本表；种子文件自身必须幂等。
		p, err := goose.NewProvider(goose.DialectPostgres, db, os.DirFS(dir),
			goose.WithDisableVersioning(true))
		if err != nil {
			return err
		}
		defer p.Close()
		if cmd == "seed" {
			res, err := p.Up(ctx)
			printResults(svc, "seed", res)
			return err
		}
		res, err := p.DownTo(ctx, 0)
		printResults(svc, "seed-down", res)
		return err
	case "baseline":
		return baseline(ctx, db, base, svc)
	}

	sessionLocker, err := lock.NewPostgresSessionLocker(
		// 每个服务用不同的咨询锁 ID，服务间迁移互不阻塞；同一服务多副本并发迁移被锁串行化。
		lock.WithLockID(hashLockID(svc)),
	)
	if err != nil {
		return err
	}
	p, err := goose.NewProvider(goose.DialectPostgres, db, os.DirFS(migrationsDir(base, svc)),
		goose.WithTableName(versionTable(svc)),
		goose.WithSessionLocker(sessionLocker),
	)
	if err != nil {
		return err
	}
	defer p.Close()

	switch cmd {
	case "up":
		res, err := p.Up(ctx)
		printResults(svc, "up", res)
		return err
	case "up-by-one":
		r, err := p.UpByOne(ctx)
		if r != nil {
			printResults(svc, "up-by-one", []*goose.MigrationResult{r})
		}
		if errors.Is(err, goose.ErrNoNextVersion) {
			fmt.Printf("== %s: 已是最新\n", svc)
			return nil
		}
		return err
	case "up-to":
		v, err := parseVersion(args)
		if err != nil {
			return err
		}
		res, err2 := p.UpTo(ctx, v)
		printResults(svc, "up-to", res)
		return err2
	case "down":
		r, err := p.Down(ctx)
		if r != nil {
			printResults(svc, "down", []*goose.MigrationResult{r})
		}
		if errors.Is(err, goose.ErrNoCurrentVersion) {
			fmt.Printf("== %s: 没有可回滚的版本\n", svc)
			return nil
		}
		return err
	case "down-to":
		v, err := parseVersion(args)
		if err != nil {
			return err
		}
		res, err2 := p.DownTo(ctx, v)
		printResults(svc, "down-to", res)
		return err2
	case "status":
		sts, err := p.Status(ctx)
		if err != nil {
			return err
		}
		fmt.Printf("== %s（版本表 %s）\n", svc, versionTable(svc))
		for _, st := range sts {
			applied := "pending"
			if st.State == goose.StateApplied {
				applied = st.AppliedAt.Format(time.DateTime)
			}
			fmt.Printf("   %-40s %s\n", st.Source.Path, applied)
		}
		return nil
	case "version":
		v, err := p.GetDBVersion(ctx)
		if err != nil {
			return err
		}
		fmt.Printf("== %s: version %d\n", svc, v)
		return nil
	default:
		return fmt.Errorf("未知命令 %q", cmd)
	}
}

func parseVersion(args []string) (int64, error) {
	if len(args) != 1 {
		return 0, errors.New("需要一个版本号参数")
	}
	return strconv.ParseInt(args[0], 10, 64)
}

func printResults(svc, cmd string, res []*goose.MigrationResult) {
	if len(res) == 0 {
		fmt.Printf("== %s: %s 无待执行项\n", svc, cmd)
		return
	}
	for _, r := range res {
		fmt.Printf("== %s: %s %s (%s)\n", svc, cmd, r.Source.Path, r.Duration.Round(time.Millisecond))
	}
}

// baseline 把「库里已手工建好的存量结构」按当前迁移文件清单记账为已应用。
// 仅当版本表不存在或没有任何已应用版本时允许执行。
func baseline(ctx context.Context, db *sql.DB, base, svc string) error {
	store, err := database.NewStore(database.DialectPostgres, versionTable(svc))
	if err != nil {
		return err
	}
	// 用一个只读 Provider 拿迁移清单（不触库）。
	p, err := goose.NewProvider(goose.DialectPostgres, db, os.DirFS(migrationsDir(base, svc)),
		goose.WithTableName(versionTable(svc)))
	if err != nil {
		return err
	}
	sources := p.ListSources()
	// 注意：不能在这里 p.Close()——它会连带关闭传入的 *sql.DB，
	// 而下面 store 的记账操作还要用同一个句柄（实测踩过 "sql: database is closed"）。

	if err := store.CreateVersionTable(ctx, db); err != nil {
		// 表已存在时 CreateVersionTable 会失败，继续走已有表检查。
		if !strings.Contains(err.Error(), "already exists") {
			return fmt.Errorf("创建版本表失败: %w", err)
		}
	}
	latest, err := store.GetLatestVersion(ctx, db)
	if err != nil && !errors.Is(err, database.ErrVersionNotFound) {
		return err
	}
	if latest > 0 {
		return fmt.Errorf("版本表 %s 已有记录（version %d），拒绝 baseline——它只用于首次接管存量库", versionTable(svc), latest)
	}
	for _, s := range sources {
		if err := store.Insert(ctx, db, database.InsertRequest{Version: s.Version}); err != nil {
			return fmt.Errorf("记账 version %d 失败: %w", s.Version, err)
		}
		fmt.Printf("== %s: baseline 记账 %s (version %d)\n", svc, filepath.Base(s.Path), s.Version)
	}
	if len(sources) == 0 {
		fmt.Printf("== %s: 无迁移文件，仅建版本表\n", svc)
	}
	return nil
}

// hashLockID 把服务名折叠成一个稳定的咨询锁 ID（FNV-1a，落在正整数域）。
func hashLockID(svc string) int64 {
	const (
		offset64 = 14695981039346656037
		prime64  = 1099511628211
	)
	var h uint64 = offset64
	for i := 0; i < len(svc); i++ {
		h ^= uint64(svc[i])
		h *= prime64
	}
	return int64(h & 0x7fffffffffffffff)
}

var migrationNameRe = regexp.MustCompile(`[^a-z0-9_]+`)

// createMigration 生成下一个顺序号的迁移骨架文件。
func createMigration(base, svc, name string) error {
	dir := migrationsDir(base, svc)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	next := int64(1)
	for _, e := range entries {
		parts := strings.SplitN(e.Name(), "_", 2)
		if len(parts) < 2 {
			continue
		}
		if v, err := strconv.ParseInt(parts[0], 10, 64); err == nil && v >= next {
			next = v + 1
		}
	}
	clean := migrationNameRe.ReplaceAllString(strings.ToLower(name), "_")
	path := filepath.Join(dir, fmt.Sprintf("%05d_%s.sql", next, clean))
	content := "-- +goose Up\n\n-- +goose Down\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return err
	}
	fmt.Println("已创建", path)
	return nil
}
