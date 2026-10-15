// Release builds are a GUI program: no console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    markflow_studio_lib::run()
}
