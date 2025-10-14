use tauri::WebviewWindow;

// 设置窗口模糊效果
#[cfg(target_os = "windows")]
pub fn set_window_blur(window: &WebviewWindow) {
    use window_vibrancy::apply_acrylic;
    if let Err(e) = apply_acrylic(window, Some((255, 255, 255, 10))) {
        println!("设置窗口模糊效果失败: {}", e);
    }
}

// 非 Windows 平台的空实现
#[cfg(not(target_os = "windows"))]
pub fn set_window_blur(_window: &WebviewWindow) {
    println!("窗口模糊效果仅在 Windows 平台支持");
}
