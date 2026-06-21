// Notes — Tauri backend entry point.
//
// The frontend talks to SQLite directly through `tauri-plugin-sql`; schema is
// owned here via versioned migrations so the database evolves deterministically
// across releases. Keep migrations append-only: never edit a shipped migration,
// always add a new one.

mod stt;

use tauri_plugin_sql::{Migration, MigrationKind};

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_note_filename",
            sql: include_str!("../migrations/0002_add_note_filename.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:notes.db", migrations())
                .build(),
        )
        .manage(stt::SttManager::default())
        .invoke_handler(tauri::generate_handler![
            stt::stt_list_models,
            stt::stt_capabilities,
            stt::stt_status,
            stt::stt_download_model,
            stt::stt_delete_model,
            stt::stt_start,
            stt::stt_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
