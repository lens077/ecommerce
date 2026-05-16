package dbutil

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/lib/pq/pqerror"
)

type CommonErrorMappings struct {
	BusinessErrors map[string]error
}

func NewCommonErrorMappings() *CommonErrorMappings {
	return &CommonErrorMappings{
		BusinessErrors: map[string]error{
			string(pqerror.UniqueViolation):        errors.New("唯一约束冲突"),
			string(pqerror.ForeignKeyViolation):    errors.New("外键约束冲突"),
			string(pqerror.NotNullViolation):       errors.New("非空约束冲突"),
			string(pqerror.CheckViolation):         errors.New("检查约束冲突"),
			string(pqerror.TRSerializationFailure): errors.New("并发冲突，请重试"),
			string(pqerror.TRDeadlockDetected):     errors.New("检测到死锁，请重试"),
			string(pqerror.LockNotAvailable):       errors.New("锁不可用，请重试"),
			string(pqerror.TooManyConnections):     errors.New("连接数过多，请稍后重试"),
			string(pqerror.QueryCanceled):          errors.New("查询超时"),
			string(pqerror.ReadOnlySQLTransaction): errors.New("只读事务中不能执行写操作"),
			string(pqerror.FeatureNotSupported):    errors.New("功能不支持"),
			string(pqerror.UndefinedTable):         errors.New("表不存在"),
			string(pqerror.UndefinedColumn):        errors.New("列不存在"),
			string(pqerror.UndefinedFunction):      errors.New("函数不存在"),
			string(pqerror.DuplicateTable):         errors.New("表已存在"),
			string(pqerror.DuplicateColumn):        errors.New("列已存在"),
			string(pqerror.DuplicateFunction):      errors.New("函数已存在"),
			string(pqerror.InvalidCursorState):     errors.New("无效的游标状态"),
		},
	}
}

func (m *CommonErrorMappings) GetBusinessError(pgErr *pgconn.PgError) error {
	if bizErr, ok := m.BusinessErrors[pgErr.Code]; ok {
		return bizErr
	}
	return nil
}

func (m *CommonErrorMappings) IsCommonError(code string) bool {
	_, exists := m.BusinessErrors[code]
	return exists
}
