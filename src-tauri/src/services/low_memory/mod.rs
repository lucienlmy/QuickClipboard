mod state;
mod manager;

pub use state::{is_low_memory_mode, set_low_memory_mode, set_user_requested_exit, is_user_requested_exit};
pub use manager::{enter_low_memory_mode, exit_low_memory_mode};
