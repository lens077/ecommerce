package product

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestBuildSkuName 测试SKU名称拼接逻辑
func TestBuildSkuName(t *testing.T) {
	// 统一SPU基础名称
	spuName := "Apple iPhone 15 Pro"
	// 固定规格模板顺序：颜色、容量、版本
	specTemplate := []string{"颜色", "容量", "版本"}

	tests := []struct {
		name       string         // 用例名称
		skuAttrs   map[string]any // SKU规格键值对
		wantResult string         // 预期拼接结果
	}{
		{
			name: "常规顺序规格",
			skuAttrs: map[string]any{
				"颜色": "原色钛金属",
				"容量": "256GB",
				"版本": "标准版",
			},
			wantResult: "Apple iPhone 15 Pro 原色钛金属 256GB 标准版",
		},
		{
			name: "map键乱序存储，模板强制排序",
			skuAttrs: map[string]any{
				"版本": "256GB",
				"颜色": "原色钛金属",
				"容量": "256GB",
			},
			wantResult: "Apple iPhone 15 Pro 原色钛金属 256GB 256GB",
		},
		{
			name: "缺少部分规格key，自动跳过",
			skuAttrs: map[string]any{
				"颜色": "蓝色钛金属",
				"容量": "512GB",
				// 无版本
			},
			wantResult: "Apple iPhone 15 Pro 蓝色钛金属 512GB",
		},
		{
			name: "仅单一规格",
			skuAttrs: map[string]any{
				"颜色": "黑色",
			},
			wantResult: "Apple iPhone 15 Pro 黑色",
		},
		{
			name:       "空规格，只返回SPU名称",
			skuAttrs:   map[string]any{},
			wantResult: "Apple iPhone 15 Pro",
		},
		{
			name: "存在nil值规格自动忽略",
			skuAttrs: map[string]any{
				"颜色": "原色钛金属",
				"容量": nil,
				"版本": "ProMax",
			},
			wantResult: "Apple iPhone 15 Pro 原色钛金属 ProMax",
		},
		{
			name: "SKU存在模板外多余key，自动忽略",
			skuAttrs: map[string]any{
				"颜色": "原色钛金属",
				"容量": "1TB",
				"材质": "钛合金", // specTemplate不存在该key，不会拼接
			},
			wantResult: "Apple iPhone 15 Pro 原色钛金属 1TB",
		},
	}

	// 循环执行所有测试用例
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := BuildSkuName(spuName, specTemplate, tt.skuAttrs)
			t.Log(result)
			t.Log(tt.wantResult)
			assert.Equal(t, tt.wantResult, result)
		})
	}
}

// TestBuildSkuName_DifferentTemplate 切换不同规格模板测试
func TestBuildSkuName_DifferentTemplate(t *testing.T) {
	spuName := "雅诗兰黛小棕瓶精华"
	skuAttrs := map[string]any{
		"容量":     "50ml",
		"适用肤质": "全肤质",
	}

	tests := []struct {
		name       string
		template   []string
		wantResult string
	}{
		{
			name:       "模板顺序：容量在前",
			template:   []string{"容量", "适用肤质"},
			wantResult: "雅诗兰黛小棕瓶精华 50ml 全肤质",
		},
		{
			name:       "模板顺序：肤质在前",
			template:   []string{"适用肤质", "容量"},
			wantResult: "雅诗兰黛小棕瓶精华 全肤质 50ml",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := BuildSkuName(spuName, tt.template, skuAttrs)
			assert.Equal(t, tt.wantResult, res)
		})
	}
}
