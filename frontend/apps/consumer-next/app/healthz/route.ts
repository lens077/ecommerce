// K8s 探针端点：只证明 Next 进程存活，有意不探网关/下游——
// 下游故障时前端 Pod 不应被摘（页面自身会渲染降级态），避免级联不可用。
export function GET() {
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
