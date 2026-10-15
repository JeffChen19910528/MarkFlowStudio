//! MarkFlow Studio desktop shell.
//!
//! The whole application is the web build in `dist/`, shown in the system WebView. All document
//! handling happens in that page; this shell deliberately exposes no commands to it.

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to start MarkFlow Studio");
}
