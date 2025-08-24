// Include tray icon bytes at compile time
pub const TRAY_ICON_DEFAULT: &[u8] = include_bytes!("../icons/tray/tray-default.png");
pub const TRAY_ICON_WORKING: &[u8] = include_bytes!("../icons/tray/tray-working.png");
pub const TRAY_ICON_PENDING: &[u8] = include_bytes!("../icons/tray/tray-pending.png");
pub const TRAY_ICON_ERROR: &[u8] = include_bytes!("../icons/tray/tray-error.png");