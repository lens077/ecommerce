package product

import (
	"fmt"
	"strings"
)

// BuildSkuName 按SPU预设规格顺序拼接SKU名称
// spuName: SPU商品名
// specOrder: SPU的spec_template有序key数组
// skuAttrs: SKU的规格键值map
func BuildSkuName(spuName string, specOrder []string, skuAttrs map[string]any) string {
	var specParts []string
	// 严格按照模板定义的顺序遍历取值，解决map无序问题
	for _, key := range specOrder {
		val, exist := skuAttrs[key]
		if !exist || val == nil {
			continue // 当前SKU无该规格，跳过
		}
		specParts = append(specParts, fmt.Sprintf("%v", val))
	}
	if len(specParts) == 0 {
		return spuName
	}
	return fmt.Sprintf("%s %s", spuName, strings.Join(specParts, " "))
}
