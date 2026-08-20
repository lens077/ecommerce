# 支付系统设计（支付宝 / 微信 SDK 适配）

> 从根 `DESIGN.md` 拆出（2026-08-08）。现状：5 个 RPC 全部是显式 `Unimplemented` 桩，
> 原实现依赖已移除的 balance/consumerOrder client（注释保留在 `data/payment.go`），
> `pay.alipay.*` 凭据在 KV 里是空占位——恢复计划见 `TODO.md`。
> 实际表结构以 [`backend/services/payment/internal/data/migrations/`](../../../backend/services/payment/internal/data/migrations/) 为准。
> 微信支付未接（依赖只有 `smartwalle/alipay`，见 `STACK.md`）。


基于策略模式设计，适配支付宝、微信支付第三方 SDK，实现支付渠道的灵活扩展与统一管理

核心架构设计

1. 支付渠道抽象与策略模式实现
    - 定义统一的Payer接口，封装支付核心能力，所有支付渠道实现该接口，通过 Fx 依赖注入框架完成渠道实例的管理，新增支付渠道无需修改核心业务代码。
    ```go
    // 统一支付接口定义
    type Payer interface {
    // 创建支付单：生成第三方支付所需的支付参数
    CreatePayment(ctx context.Context, req *CreatePaymentRequest) (*CreatePaymentResponse, error)
    // 查询支付状态：同步第三方支付结果
    QueryPayment(ctx context.Context, req *QueryPaymentRequest) (*QueryPaymentResponse, error)
    // 申请退款：发起退款申请
    Refund(ctx context.Context, req *RefundRequest) (*RefundResponse, error)
    // 查询退款状态：同步退款结果
    QueryRefund(ctx context.Context, req *QueryRefundRequest) (*QueryRefundResponse, error)
    }
    ```

    - 基于该接口，分别实现AlipayClient与WechatPayClient，适配支付宝、微信官方 Go SDK，封装签名、验签、请求发送、回调处理等通用逻辑，屏蔽不同渠道的接口差异。

2. 支付核心流程设计
    - 下单支付流程：订单服务创建订单→支付服务生成支付单→根据用户选择的支付渠道调用对应 SDK
      生成支付参数→前端唤起支付→用户支付完成→第三方异步回调支付结果→支付服务验签后更新支付状态→发布OrderPaidEvent事件→订单服务、库存服务同步处理后续流程。
    - 退款流程：用户 / 商家发起退款申请→订单服务校验退款权限→支付服务创建退款单→调用对应支付渠道 SDK
      发起退款→第三方回调退款结果→支付服务更新退款状态→发布PaymentRefundedEvent事件→订单服务、履约服务同步更新订单状态。

3. 回调与幂等设计
   统一的回调处理入口，针对支付宝、微信支付的回调分别实现验签逻辑，确保回调请求的合法性，避免伪造回调导致的资金风险。
   所有支付、退款操作均通过「支付单号 / 退款单号」实现幂等处理，重复回调、重复请求不会导致重复支付 / 重复退款，保证资金安全。

4. 对账管理
   每日自动拉取支付宝、微信支付的对账单，与系统内的支付流水、退款流水进行自动对账，生成对账差异报表，方便财务核对，保证账账一致。

## 支付表（早期设计稿）

6. 支付单表

    ```sql
       CREATE TYPE payment.pay_status_enum AS ENUM ('pending','success','failed','closed','refunding','refunded');
    
    CREATE TABLE IF NOT EXISTS payment.main
    (
        id           BIGSERIAL PRIMARY KEY,
        pay_no       VARCHAR(64)             NOT NULL UNIQUE,
        order_no     VARCHAR(64)             NOT NULL,
        user_id      VARCHAR(64)             NOT NULL,
        merchant_id  BIGINT                  NOT NULL,
        pay_amount   DECIMAL(10, 2)          NOT NULL,
        pay_channel  VARCHAR(32)             NOT NULL, -- alipay/wechat
        status       payment.pay_status_enum NOT NULL DEFAULT 'pending',
        third_pay_no VARCHAR(64),
        paid_at      timestamptz,
        created_at   timestamptz             NOT NULL DEFAULT now(),
        updated_at   timestamptz             NOT NULL DEFAULT now()
    );
    COMMENT ON TABLE payment.main IS '支付单主表';
    ```

7. 退款单表

    ```sql
       CREATE TABLE IF NOT EXISTS payment.refund
       (
           id              BIGSERIAL PRIMARY KEY,
           refund_no       VARCHAR(64)    NOT NULL UNIQUE,
           order_no        VARCHAR(64)    NOT NULL,
           pay_no          VARCHAR(64)    NOT NULL REFERENCES payment.main (pay_no),
           refund_amount   DECIMAL(10, 2) NOT NULL,
           refund_reason   TEXT           NOT NULL,
           status          VARCHAR(32)    NOT NULL DEFAULT 'pending',
           third_refund_no VARCHAR(64),
           refunded_at     timestamptz,
           created_at      timestamptz    NOT NULL DEFAULT now(),
           updated_at      timestamptz    NOT NULL DEFAULT now()
       );
    COMMENT ON TABLE payment.refund IS '退款单表';
    ```
