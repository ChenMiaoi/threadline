fn main() {
    let args: Vec<String> = std::env::args().collect();
    if matches!(
        args.get(1).map(String::as_str),
        Some("--measure" | "--measure-full")
    ) {
        let result = match (args.get(2), args.get(3).and_then(|v| v.parse::<u64>().ok())) {
            (Some(repo), Some(number)) => {
                threadline_lib::preview::measure(repo, number, args[1] == "--measure-full")
            }
            _ => Err("Usage: github-preview --measure owner/repository number".into()),
        };
        if let Err(error) = result {
            eprintln!("{error}");
            std::process::exit(1);
        }
    } else {
        threadline_lib::preview::run_bridge();
    }
}
