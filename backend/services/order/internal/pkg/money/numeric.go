package money

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
)

func NumericToFloat(n pgtype.Numeric) (float64, error) {
	// 1. 检查 Numeric 是否有效（非 NULL）
	if !n.Valid {
		return 0, fmt.Errorf("numeric value is NULL")
	}

	// 2. 使用内置方法转换为 float64
	floatValue, err := n.Float64Value()
	if err != nil {
		return 0, fmt.Errorf("convert numeric to float64 failed: %w", err)
	}

	// 3. 检查转换结果是否有效
	if !floatValue.Valid {
		return 0, fmt.Errorf("numeric cannot be represented as float64")
	}

	return floatValue.Float64, nil
}
