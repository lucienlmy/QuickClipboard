mod state;
mod manager;

pub use state::{
    init_window_activity_timestamp,
    is_low_memory_mode,
    is_user_requested_exit,
    set_user_requested_exit,
};
pub use manager::{enter_low_memory_mode, exit_low_memory_mode, init_auto_low_memory_manager};
