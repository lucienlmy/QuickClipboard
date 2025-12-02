mod model;
pub mod storage;
mod state;

pub use model::AppSettings;
pub use state::{get_settings, update_settings, update_with, get_data_directory};
