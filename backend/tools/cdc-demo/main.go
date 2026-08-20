// Command cdc-demo 端到端验证 CDC 链路：
//
//	同事务(业务写 + outbox) → outbox-relay → NATS JetStream → search-indexer → Meilisearch
//
// 前置：postgres/nats/meilisearch 已起（compose.yaml）、迁移已跑、
// outbox-relay 与 search-indexer 两个进程在运行（run.sh 一键编排）。
//
// 步骤：
//  1. 在一个事务里 upsert 一条演示 SPU 并写 outbox(spu.upserted，payload=完整文档投影)；
//  2. 轮询 Meilisearch 搜索，直到能搜到该文档（证明 upsert 贯通）；
//  3. 写 outbox(spu.deleted)；轮询直到文档消失（证明 tombstone 贯通）；
//  4. 校验 outbox 里两条事件均已标记 published。
//
// 全部通过输出 PASS 并退出 0，任一步超时输出 FAIL 并退出 1。
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/meilisearch/meilisearch-go"

	"github.com/lens077/ecommerce/backend/pkg/outbox"
	"github.com/lens077/ecommerce/backend/pkg/searchindex"
)

const demoSpuCode = "cdc-demo-luban-lamp"

func main() {
	var (
		dsn       = flag.String("dsn", "", "PostgreSQL DSN（缺省 DB_URI/DB_SOURCE/本地默认）")
		meiliHost = flag.String("meili", "http://127.0.0.1:17700", "Meilisearch 地址")
		meiliKey  = flag.String("meili-key", "cdc-demo-master-key", "Meilisearch API key")
		index     = flag.String("index", "products", "索引 uid")
		timeout   = flag.Duration("timeout", 30*time.Second, "每步等待上限")
	)
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), 3**timeout)
	defer cancel()

	pool, err := pgxpool.New(ctx, resolveDSN(*dsn))
	if err != nil {
		fail("连接 PostgreSQL", err)
	}
	defer pool.Close()
	sm := meilisearch.New(*meiliHost, meilisearch.WithAPIKey(*meiliKey))
	defer sm.Close()

	// ── 步骤 1：同事务写业务行 + outbox 事件 ────────────────────────────
	start := time.Now()
	spuID, doc, err := upsertDemoSpu(ctx, pool)
	if err != nil {
		fail("同事务写入 spus+outbox", err)
	}
	fmt.Printf("① 已在同一事务提交 SPU(id=%d) 与 outbox 事件 spu.upserted\n", spuID)

	// ── 步骤 2：等待文档可搜 ───────────────────────────────────────────
	if err := waitFor(ctx, *timeout, func() (bool, error) {
		res, err := sm.Index(*index).SearchWithContext(ctx, "鲁班灯", &meilisearch.SearchRequest{Limit: 5})
		if err != nil {
			return false, nil // 索引未建好前的 404 属预期，继续等
		}
		for _, hit := range res.Hits {
			var idv int64
			if raw, ok := hit["id"]; ok {
				if json.Unmarshal(raw, &idv) == nil && idv == spuID {
					return true, nil
				}
			}
		}
		return false, nil
	}); err != nil {
		fail("等待 Meilisearch 可搜到文档", err)
	}
	fmt.Printf("② Meilisearch 已可搜到该文档（%.1fs）：%s\n", time.Since(start).Seconds(), doc.Name)

	// ── 步骤 3：发 tombstone，等待文档消失 ─────────────────────────────
	delStart := time.Now()
	if err := emitDeleted(ctx, pool, spuID); err != nil {
		fail("写入 spu.deleted 事件", err)
	}
	if err := waitFor(ctx, *timeout, func() (bool, error) {
		err := sm.Index(*index).GetDocumentWithContext(ctx, fmt.Sprintf("%d", spuID), nil, new(map[string]any))
		return err != nil, nil // 查不到 = 已删除
	}); err != nil {
		fail("等待 tombstone 删除文档", err)
	}
	fmt.Printf("③ tombstone 已生效，文档从索引删除（%.1fs）\n", time.Since(delStart).Seconds())

	// ── 步骤 4：outbox 应全部 published ────────────────────────────────
	var unpublished int
	if err := pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM products.outbox WHERE subject = $1 AND published_at IS NULL`,
		fmt.Sprintf("spu:%d", spuID)).Scan(&unpublished); err != nil {
		fail("检查 outbox 发布状态", err)
	}
	if unpublished != 0 {
		fail("outbox 仍有未发布事件", fmt.Errorf("%d 条", unpublished))
	}
	fmt.Println("④ outbox 两条事件均已标记 published")
	fmt.Println("PASS：PG(同事务 outbox) → relay → NATS JetStream → search-indexer → Meilisearch 全链贯通")
}

// upsertDemoSpu 在一个事务里 upsert 演示 SPU 并写 outbox，payload 即索引文档投影。
func upsertDemoSpu(ctx context.Context, pool *pgxpool.Pool) (int64, *searchindex.Doc, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var (
		id        int64
		updatedAt time.Time
	)
	// 演示商品：真实业务里这是 product 服务的写 RPC；这里直接落库以演示同事务语义。
	if err := tx.QueryRow(ctx, `
INSERT INTO products.spus (spu_code, name, description, category_id, merchant_id, brand_id, status, main_media_url, specs, images_gallery)
VALUES ($1, '鲁班灯 CDC 演示灯', '对抗审阅第4轮的端到端演示商品：一盏会自己进搜索索引的灯。',
        9001, 'ca8ceec3-3345-48ce-b2db-40afe710eb61', 99, 'online', 'https://cdn.example.com/luban/main.jpg', '{}', '[]')
ON CONFLICT (spu_code) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
RETURNING id, updated_at`, demoSpuCode).Scan(&id, &updatedAt); err != nil {
		return 0, nil, err
	}

	doc := &searchindex.Doc{
		ID:           id,
		SpuCode:      demoSpuCode,
		Name:         "鲁班灯 CDC 演示灯",
		Description:  "对抗审阅第4轮的端到端演示商品：一盏会自己进搜索索引的灯。",
		Status:       "online",
		MainMediaURL: "https://cdn.example.com/luban/main.jpg",
		MerchantID:   "ca8ceec3-3345-48ce-b2db-40afe710eb61",
		Price:        129.00,
		SaleCount:    0,
		UpdatedAt:    updatedAt.UTC().Format(time.RFC3339),
	}
	payload, err := json.Marshal(doc)
	if err != nil {
		return 0, nil, err
	}
	if _, err := outbox.Insert(ctx, tx, "products.outbox", outbox.Message{
		Source:  "/service/product",
		Type:    searchindex.EventTypeUpserted,
		Subject: fmt.Sprintf("spu:%d", id),
		Payload: payload,
	}); err != nil {
		return 0, nil, err
	}
	return id, doc, tx.Commit(ctx)
}

func emitDeleted(ctx context.Context, pool *pgxpool.Pool, spuID int64) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	payload := fmt.Appendf(nil, `{"id":%d}`, spuID)
	if _, err := outbox.Insert(ctx, tx, "products.outbox", outbox.Message{
		Source:  "/service/product",
		Type:    searchindex.EventTypeDeleted,
		Subject: fmt.Sprintf("spu:%d", spuID),
		Payload: payload,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func waitFor(ctx context.Context, limit time.Duration, cond func() (bool, error)) error {
	deadline := time.Now().Add(limit)
	for time.Now().Before(deadline) {
		ok, err := cond()
		if err != nil {
			return err
		}
		if ok {
			return nil
		}
		select {
		case <-time.After(300 * time.Millisecond):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return fmt.Errorf("超时（%s）", limit)
}

func resolveDSN(v string) string {
	if v != "" {
		return v
	}
	if e := os.Getenv("DB_URI"); e != "" {
		return e
	}
	if e := os.Getenv("DB_SOURCE"); e != "" {
		return e
	}
	return "postgres://postgres:postgres@127.0.0.1:15432/ecommerce?sslmode=disable"
}

func fail(step string, err error) {
	fmt.Fprintf(os.Stderr, "FAIL：%s：%v\n", step, err)
	os.Exit(1)
}
