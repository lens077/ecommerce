package data

import (
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/lens077/ecommerce/backend/services/address/internal/biz"
)

// 2026-09-23：旧代码用 `err == sql.ErrNoRows` 判断查不到，但 sqlc 查询走 pgx，
// 返回的是 pgx.ErrNoRows，条件永远不成立。
func TestIsNoRows_RecognizesPgxNotDatabaseSQL(t *testing.T) {
	if !isNoRows(pgx.ErrNoRows) {
		t.Fatal("pgx.ErrNoRows 必须被识别为查不到")
	}
	if !isNoRows(fmt.Errorf("query: %w", pgx.ErrNoRows)) {
		t.Fatal("包装过的 pgx.ErrNoRows 也必须被识别")
	}
	if isNoRows(errors.New("connection refused")) {
		t.Fatal("普通数据库错误不能当成查不到")
	}
}

func TestParseAddressID_WrapsInvalidInput(t *testing.T) {
	if _, err := parseAddressID("not-a-uuid"); !errors.Is(err, biz.ErrInvalidAddressID) {
		t.Fatalf("非法 ID 必须包装为 ErrInvalidAddressID，got %v", err)
	}
	if _, err := parseAddressID("0199b8a2-7c3e-7000-8000-000000000001"); err != nil {
		t.Fatalf("合法 UUID 不应报错: %v", err)
	}
}
