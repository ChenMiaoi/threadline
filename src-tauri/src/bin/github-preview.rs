fn main() {
    if std::env::args().nth(1).as_deref() == Some("--auth-bridge") {
        threadline_lib::run_auth_bridge();
        return;
    }
    let response = match threadline_lib::preview::run() {
        Ok(value) => serde_json::json!({"ok":true,"value":value}),
        Err(error) => serde_json::json!({"ok":false,"error":error}),
    };
    println!("{response}");
}
