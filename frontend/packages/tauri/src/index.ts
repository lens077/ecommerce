// 这个 barrel 只导出对 web 构建无副作用的部分：
// 它会被三个 app 的入口无条件 import，不能把 @tauri-apps/* 拖进 web bundle。
// 桌面专属能力走子路径按需加载：
//   @ecommerce/tauri/settings、@ecommerce/tauri/auth、@ecommerce/tauri/dialog

export * from "./env";
export * from "./bootstrap";
