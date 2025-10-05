// 截屏功能模块
pub mod screenshot_window;
pub mod scrolling_screenshot;
pub mod screen_utils;
pub mod image_stitcher;
pub mod auto_selection;

// 公共接口
pub use screenshot_window::*;
pub use scrolling_screenshot::*;
pub use auto_selection::*;

