package decimal

import (
	"github.com/lens077/ecommerce/backend/constants"
	"github.com/shopspring/decimal"
	"google.golang.org/genproto/googleapis/type/money"
)

// DecimalToCNYMoney 将 decimal.Decimal 转换为 google.type.Money
func DecimalToCNYMoney(d decimal.Decimal) *money.Money {
	// 获取整数部分
	units := d.IntPart()

	// 获取小数部分 (d - units) 并乘以 10^9 得到 Nanos
	fraction := d.Sub(decimal.NewFromInt(units))
	nanos := fraction.Mul(decimal.NewFromInt(1e9)).IntPart()

	return &money.Money{
		CurrencyCode: string(constants.CNY),
		Units:        units,
		Nanos:        int32(nanos),
	}
}
