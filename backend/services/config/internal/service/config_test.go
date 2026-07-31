package service

import (
	"testing"
	"time"

	"github.com/lens077/ecommerce/backend/services/config/internal/biz"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 历史版本存的是写入当时的明文。GetKey 把密钥打成 ****** 而 ListRevisions/GetRevision
// 原样吐出真值的话,脱敏就等于没做 —— 历史页面正是把 revision.value 直接渲染出来的地方。
func TestToPBRevision_MasksSecret(t *testing.T) {
	now := time.Now()
	rev := &biz.ConfigRevision{
		ID:        7,
		EntryID:   3,
		Version:   5,
		Format:    biz.FormatYAML,
		Value:     "password: hunter2",
		IsSecret:  true,
		Comment:   "改密码",
		Author:    "admin_01",
		CreatedAt: now,
	}

	pb := toPBRevision(rev)

	assert.Equal(t, maskedValue, pb.Value, "密钥的历史值必须脱敏")
	// 元数据照常返回:看得到「谁在什么时候改了」,只是看不到改成了什么
	assert.Equal(t, int32(5), pb.Version)
	assert.Equal(t, "admin_01", pb.Author)
	assert.Equal(t, "改密码", pb.Comment)
	require.NotNil(t, pb.CreatedAt)
	assert.Equal(t, now.Unix(), pb.CreatedAt.Seconds)
}

func TestToPBRevision_KeepsPlainValue(t *testing.T) {
	pb := toPBRevision(&biz.ConfigRevision{
		Version:  2,
		Format:   biz.FormatYAML,
		Value:    "server:\n  addr: \"0.0.0.0:30006\"\n",
		IsSecret: false,
	})
	assert.Equal(t, "server:\n  addr: \"0.0.0.0:30006\"\n", pb.Value)
}

// toPBEntry 与 toPBRevision 必须用同一个占位值,否则前端要认两种「已脱敏」的写法。
func TestMaskedValue_SharedByEntryAndRevision(t *testing.T) {
	entry := toPBEntry(&biz.ConfigEntry{Value: "s3cret", IsSecret: true}, false)
	revision := toPBRevision(&biz.ConfigRevision{Value: "s3cret", IsSecret: true})
	assert.Equal(t, entry.Value, revision.Value)
	assert.Equal(t, maskedValue, entry.Value)
}
