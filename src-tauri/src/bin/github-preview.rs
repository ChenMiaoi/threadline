fn main() {
    let response = match threadline_lib::preview::run() {
        Ok(value) => serde_json::json!({"ok":true,"value":value}),
        Err(error) => serde_json::json!({"ok":false,"error":error}),
    };
    println!("{response}");
}
