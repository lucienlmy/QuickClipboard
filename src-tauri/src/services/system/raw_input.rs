use super::input_common;

#[cfg(target_os = "windows")]
mod windows_raw_input {
    use super::input_common;
    use std::mem::size_of;
    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
    use std::thread;
    use std::time::Duration;

    use windows::core::w;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::Input::{
        GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER,
        RID_INPUT, RIDEV_INPUTSINK,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, PeekMessageW, RegisterClassExW,
        TranslateMessage, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, MSG, PM_NOREMOVE, WM_DESTROY, WM_INPUT,
        WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP, WNDCLASSEXW, WS_OVERLAPPEDWINDOW,
    };

    use crate::services::sound::AppSounds;

    static RAW_INPUT_ACTIVE: AtomicBool = AtomicBool::new(false);
    static RAW_INPUT_THREAD_ID: AtomicU32 = AtomicU32::new(0);
    static CTRL_DOWN: AtomicBool = AtomicBool::new(false);
    static MIDDLE_BUTTON_DOWN: AtomicBool = AtomicBool::new(false);
    static MIDDLE_BUTTON_PRESS_ID: AtomicU64 = AtomicU64::new(0);

    pub(crate) fn start_raw_input_if_needed() {
        if RAW_INPUT_ACTIVE.swap(true, Ordering::SeqCst) {
            return;
        }

        thread::spawn(move || unsafe {
            let tid = GetCurrentThreadId();
            RAW_INPUT_THREAD_ID.store(tid, Ordering::SeqCst);

            let h_module = match GetModuleHandleW(PCWSTR::null()) {
                Ok(h) => h,
                Err(_) => {
                    eprintln!("[RawInput] GetModuleHandleW 失败");
                    RAW_INPUT_ACTIVE.store(false, Ordering::SeqCst);
                    RAW_INPUT_THREAD_ID.store(0, Ordering::SeqCst);
                    return;
                }
            };

            // 初始化线程消息队列（Windows 的消息队列是惰性创建的）
            let mut init_msg = MSG::default();
            let _ = PeekMessageW(&mut init_msg, None, 0, 0, PM_NOREMOVE);

            let class_name = w!("QuickClipboardRawInputSink");

            let wnd_class = WNDCLASSEXW {
                cbSize: size_of::<WNDCLASSEXW>() as u32,
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(raw_input_wnd_proc),
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: h_module.into(),
                hIcon: Default::default(),
                hCursor: Default::default(),
                hbrBackground: Default::default(),
                lpszMenuName: PCWSTR::null(),
                lpszClassName: class_name,
                hIconSm: Default::default(),
            };

            if RegisterClassExW(&wnd_class) == 0 {
                let err = windows::Win32::Foundation::GetLastError();
                if err != windows::Win32::Foundation::ERROR_CLASS_ALREADY_EXISTS {
                    eprintln!("[RawInput] RegisterClassExW 失败：{:?}", err);
                    RAW_INPUT_ACTIVE.store(false, Ordering::SeqCst);
                    RAW_INPUT_THREAD_ID.store(0, Ordering::SeqCst);
                    return;
                }
            }

            let hwnd = match CreateWindowExW(
                Default::default(),
                class_name,
                w!(""),
                WS_OVERLAPPEDWINDOW,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                None,
                None,
                Some(h_module.into()),
                None,
            ) {
                Ok(h) => h,
                Err(_) => {
                    eprintln!("[RawInput] CreateWindowExW 失败");
                    RAW_INPUT_ACTIVE.store(false, Ordering::SeqCst);
                    RAW_INPUT_THREAD_ID.store(0, Ordering::SeqCst);
                    return;
                }
            };

            let rid = [
                RAWINPUTDEVICE {
                    usUsagePage: 0x01,
                    usUsage: 0x06,
                    dwFlags: RIDEV_INPUTSINK,
                    hwndTarget: hwnd,
                },
                RAWINPUTDEVICE {
                    usUsagePage: 0x01,
                    usUsage: 0x02,
                    dwFlags: RIDEV_INPUTSINK,
                    hwndTarget: hwnd,
                },
            ];

            if let Err(_) = RegisterRawInputDevices(&rid, size_of::<RAWINPUTDEVICE>() as u32) {
                let err = windows::Win32::Foundation::GetLastError();
                eprintln!("[RawInput] RegisterRawInputDevices 失败：{:?}", err);
                RAW_INPUT_ACTIVE.store(false, Ordering::SeqCst);
                RAW_INPUT_THREAD_ID.store(0, Ordering::SeqCst);
                return;
            }

            println!("[RawInput] Raw Input 已启动");

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            println!("[RawInput] Raw Input 线程退出");
            RAW_INPUT_ACTIVE.store(false, Ordering::SeqCst);
            RAW_INPUT_THREAD_ID.store(0, Ordering::SeqCst);
        });
    }

    unsafe extern "system" fn raw_input_wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_INPUT => {
                handle_raw_input(lparam);
                LRESULT(0)
            }
            WM_DESTROY => LRESULT(0),
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    unsafe fn handle_raw_input(lparam: LPARAM) {
        let mut size: u32 = 0;

        let res = GetRawInputData(
            HRAWINPUT(lparam.0 as *mut _),
            RID_INPUT,
            None,
            &mut size,
            size_of::<RAWINPUTHEADER>() as u32,
        );

        if res == u32::MAX || size == 0 {
            return;
        }

        let mut buf = vec![0u8; size as usize];

        let res = GetRawInputData(
            HRAWINPUT(lparam.0 as *mut _),
            RID_INPUT,
            Some(buf.as_mut_ptr() as *mut _),
            &mut size,
            size_of::<RAWINPUTHEADER>() as u32,
        );

        if res == u32::MAX {
            return;
        }

        let raw: &RAWINPUT = &*(buf.as_ptr() as *const RAWINPUT);

        match raw.header.dwType {
            // 鼠标
            0 => {
                let mouse = raw.data.mouse;
                let button_flags = mouse.Anonymous.Anonymous.usButtonFlags;

                const RI_MOUSE_LEFT_BUTTON_DOWN: u16 = 0x0001;
                const RI_MOUSE_RIGHT_BUTTON_DOWN: u16 = 0x0004;
                const RI_MOUSE_MIDDLE_BUTTON_DOWN: u16 = 0x0010;
                const RI_MOUSE_MIDDLE_BUTTON_UP: u16 = 0x0020;
                const RI_MOUSE_WHEEL: u16 = 0x0400;

                if (button_flags & (RI_MOUSE_LEFT_BUTTON_DOWN | RI_MOUSE_RIGHT_BUTTON_DOWN)) != 0 {
                    input_common::run_on_main_thread(|| {
                        handle_click_outside_impl();
                    });
                }

                if (button_flags & RI_MOUSE_MIDDLE_BUTTON_UP) != 0 {
                    MIDDLE_BUTTON_DOWN.store(false, Ordering::SeqCst);
                    MIDDLE_BUTTON_PRESS_ID.fetch_add(1, Ordering::SeqCst);
                }

                if (button_flags & RI_MOUSE_MIDDLE_BUTTON_DOWN) != 0 {
                    handle_middle_button_down_impl();
                }

                if (button_flags & RI_MOUSE_WHEEL) != 0 {
                    let delta = mouse.Anonymous.Anonymous.usButtonData as i16 as i32;
                    if delta != 0 {
                        let dy = delta as i64;
                        input_common::run_on_main_thread(move || {
                            handle_wheel_event_impl(dy);
                        });
                    }
                }
            }
            // 键盘
            1 => {
                let kb = raw.data.keyboard;
                let vkey = kb.VKey as u32;
                let message = kb.Message;

                let is_keydown = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
                let is_keyup = message == WM_KEYUP || message == WM_SYSKEYUP;

                if vkey == 0x11 || vkey == 0xA2 || vkey == 0xA3 {
                    if is_keydown {
                        CTRL_DOWN.store(true, Ordering::Relaxed);
                    } else if is_keyup {
                        CTRL_DOWN.store(false, Ordering::Relaxed);
                    }
                    return;
                }

                if !CTRL_DOWN.load(Ordering::Relaxed) {
                    return;
                }

                if is_keydown {
                    if vkey == b'V' as u32 || vkey == b'v' as u32 {
                        AppSounds::play_paste_immediate();
                    }
                }
            }
            _ => {}
        }
    }

    use tauri::{Emitter, Manager, WebviewWindow};

    #[cfg(target_os = "windows")]
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN};

    fn should_handle_click_outside_impl() -> bool {
        if input_common::is_mouse_monitoring_enabled() {
            return true;
        }

        if crate::services::low_memory::is_low_memory_mode()
            && crate::services::low_memory::is_panel_visible()
        {
            return true;
        }

        #[cfg(feature = "screenshot-suite")]
        {
            if let Some(app) = input_common::try_get_app_handle() {
                if let Some(win) = app.get_webview_window("screenshot") {
                    return win.is_visible().unwrap_or(false);
                }
            }
        }

        false
    }

    fn handle_wheel_event_impl(_delta_y: i64) {
    }

    fn check_modifier_requirement_impl(required: &str) -> bool {
        let (ctrl, alt, shift, _meta) = get_modifier_keys_state_impl();

        if required == "None" || required.is_empty() {
            return true;
        }

        let parts: Vec<&str> = required.split('+').collect();
        let need_ctrl = parts.contains(&"Ctrl");
        let need_alt = parts.contains(&"Alt");
        let need_shift = parts.contains(&"Shift");

        (!need_ctrl || ctrl)
            && (!need_alt || alt)
            && (!need_shift || shift)
            && (need_ctrl || !ctrl)
            && (need_alt || !alt)
            && (need_shift || !shift)
    }

    fn get_modifier_keys_state_impl() -> (bool, bool, bool, bool) {
        unsafe {
            let ctrl = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
            let alt = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;
            let shift = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
            let meta = (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000) != 0
                || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000) != 0;
            (ctrl, alt, shift, meta)
        }
    }

    fn handle_middle_button_action_impl() {
        let settings = crate::get_settings();
        if !settings.mouse_middle_button_enabled {
            return;
        }

        if crate::services::system::is_front_app_globally_disabled_from_settings() {
            return;
        }

        if !check_modifier_requirement_impl(&settings.mouse_middle_button_modifier) {
            return;
        }

        if let Some(app) = input_common::try_get_app_handle() {
            crate::toggle_main_window_visibility(&app);
        }
    }

    fn handle_middle_button_down_impl() {
        let settings = crate::get_settings();
        if !settings.mouse_middle_button_enabled {
            return;
        }

        if crate::services::system::is_front_app_globally_disabled_from_settings() {
            return;
        }

        if !check_modifier_requirement_impl(&settings.mouse_middle_button_modifier) {
            return;
        }

        if settings.mouse_middle_button_modifier != "None" {
            input_common::run_on_main_thread(|| {
                handle_middle_button_action_impl();
            });
            return;
        }

        if settings.mouse_middle_button_trigger != "long_press" {
            input_common::run_on_main_thread(|| {
                handle_middle_button_action_impl();
            });
            return;
        }

        let threshold_ms = settings.mouse_middle_button_long_press_ms.max(1) as u64;
        let press_id = MIDDLE_BUTTON_PRESS_ID.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
        MIDDLE_BUTTON_DOWN.store(true, Ordering::SeqCst);

        thread::spawn(move || {
            thread::sleep(Duration::from_millis(threshold_ms));

            if !MIDDLE_BUTTON_DOWN.load(Ordering::SeqCst) {
                return;
            }

            if MIDDLE_BUTTON_PRESS_ID.load(Ordering::SeqCst) != press_id {
                return;
            }

            input_common::run_on_main_thread(move || {
                if !MIDDLE_BUTTON_DOWN.load(Ordering::SeqCst) {
                    return;
                }

                if MIDDLE_BUTTON_PRESS_ID.load(Ordering::SeqCst) != press_id {
                    return;
                }

                handle_middle_button_action_impl();
            });
        });
    }

    fn is_mouse_outside_window_impl(window: &WebviewWindow) -> bool {
        let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();

        let (win_x, win_y, win_width, win_height) = match crate::get_window_bounds(window) {
            Ok(bounds) => bounds,
            Err(_) => return false,
        };

        cursor_x < win_x || cursor_x > win_x + win_width as i32
            || cursor_y < win_y || cursor_y > win_y + win_height as i32
    }

    fn handle_click_outside_impl() {
        if crate::services::low_memory::is_low_memory_mode()
            && crate::services::low_memory::is_panel_visible()
        {
            let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
            if !crate::services::low_memory::is_point_in_panel(cursor_x, cursor_y) {
                let _ = crate::services::low_memory::hide_panel();
            }
            return;
        }

        if crate::is_context_menu_visible() {
            if let Some(main_window) = input_common::try_get_main_window() {
                if let Some(menu_window) = main_window.app_handle().get_webview_window("context-menu") {
                    let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
                    if menu_window.is_visible().unwrap_or(false)
                        && !crate::windows::plugins::context_menu::is_point_in_menu_region(cursor_x, cursor_y)
                    {
                        let _ = menu_window.emit("close-context-menu", ());
                    }
                }
            }
            return;
        }

        if !should_handle_click_outside_impl() {
            return;
        }

        if let Some(window) = input_common::try_get_main_window() {
            let state = crate::get_window_state();

            if state.is_hidden {
                return;
            }

            if state.is_pinned {
                return;
            }

            if window.is_visible().unwrap_or(false) && is_mouse_outside_window_impl(&window) {
                let _ = crate::check_snap(&window);
                crate::hide_main_window(&window);
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub(crate) use windows_raw_input::start_raw_input_if_needed;

#[cfg(not(target_os = "windows"))]
pub(crate) fn start_raw_input_if_needed() {}
