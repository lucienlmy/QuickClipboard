#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    quickclipboard_lib::install_startup_panic_hook();
    quickclipboard_lib::run();
}
