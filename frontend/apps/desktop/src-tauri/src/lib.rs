use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

/// 登录子窗口的固定 label，前后端约定一致
const AUTH_WINDOW_LABEL: &str = "auth";

/// 拦截到 OAuth 回调时广播给主窗口的事件名
const OAUTH_CALLBACK_EVENT: &str = "oauth://callback";

/// 登录窗口被销毁时广播的事件名，让前端的 promise 有机会收尾
const OAUTH_CANCELLED_EVENT: &str = "oauth://cancelled";

#[derive(Clone, serde::Serialize)]
struct OauthCallback {
    code: String,
    state: String,
}

/// 打开 Casdoor 登录子窗口。
///
/// 桌面端没有浏览器地址栏，Casdoor 又只认已白名单的 http 回调地址，
/// 所以这里开一个独立窗口加载登录页，在它导航到 `redirect_prefix` 的那一刻
/// 把 code/state 截下来广播给主窗口，并阻止这次导航（那个地址在桌面端根本不存在）。
#[tauri::command]
async fn open_login_window(
    app: AppHandle,
    url: String,
    redirect_prefix: String,
) -> Result<(), String> {
    // 重复点击登录时，先关掉上一个窗口，避免出现两个登录页
    if let Some(existing) = app.get_webview_window(AUTH_WINDOW_LABEL) {
        let _ = existing.close();
    }

    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    let handle = app.clone();

    let window = WebviewWindowBuilder::new(&app, AUTH_WINDOW_LABEL, WebviewUrl::External(parsed))
        .title("登录")
        .inner_size(520.0, 720.0)
        .on_navigation(move |target| {
            if !target.as_str().starts_with(&redirect_prefix) {
                return true;
            }

            let mut code = String::new();
            let mut state = String::new();
            for (key, value) in target.query_pairs() {
                match key.as_ref() {
                    "code" => code = value.into_owned(),
                    "state" => state = value.into_owned(),
                    _ => {}
                }
            }
            let _ = handle.emit(OAUTH_CALLBACK_EVENT, OauthCallback { code, state });

            // 关窗动作放到导航回调之外执行，避免在 webview 回调里同步销毁自己
            let closer = handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(window) = closer.get_webview_window(AUTH_WINDOW_LABEL) {
                    let _ = window.close();
                }
            });

            false
        })
        .build()
        .map_err(|e| e.to_string())?;

    // 窗口销毁时统一广播一次“已结束”。成功路径上前端早已 resolve 并解绑监听，
    // 这个事件只对用户手动关窗的情况生效。
    let cancel_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let _ = cancel_handle.emit(OAUTH_CANCELLED_EVENT, ());
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![open_login_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
