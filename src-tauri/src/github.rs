use serde_json::{json, Value};
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

// GitHub requests use fixed argument vectors, never a shell or a frontend-supplied command.
fn command(args: &[String]) -> Result<Value, String> {
    let mut command = Command::new("gh");
    command
        .args(args)
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|_| "GH_NOT_FOUND: 请安装 GitHub CLI，并重新启动 ThreadLine。".to_string())?;
    let stdout = child.stdout.take().ok_or("GH_IO_ERROR")?;
    let stderr = child.stderr.take().ok_or("GH_IO_ERROR")?;
    let output = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(32 * 1024 * 1024)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let errors = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr.take(65536).read_to_end(&mut bytes).map(|_| bytes)
    });
    let start = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|_| "GH_IO_ERROR")? {
            break status;
        }
        if start.elapsed() > Duration::from_secs(90) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("GH_TIMEOUT: GitHub 请求超时，请重试。".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let bytes = output
        .join()
        .map_err(|_| "GH_IO_ERROR")?
        .map_err(|_| "GH_IO_ERROR")?;
    let error = errors
        .join()
        .map_err(|_| "GH_IO_ERROR")?
        .map_err(|_| "GH_IO_ERROR")?;
    if !status.success() {
        return Err(classify_error(&String::from_utf8_lossy(&error)));
    }
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|_| "GH_RESPONSE_ERROR: GitHub 返回了无效数据。")?;
    if value.get("errors").is_some()
        || value
            .as_array()
            .is_some_and(|pages| pages.iter().any(|page| page.get("errors").is_some()))
    {
        return Err("GH_API_ERROR: GitHub 查询未完整成功，请检查权限与请求额度。".into());
    }
    Ok(value)
}

fn classify_error(error: &str) -> String {
    let lower = error.to_lowercase();
    if lower.contains("401") || lower.contains("auth login") || lower.contains("not logged") {
        "GH_AUTH_REQUIRED: 请先通过 gh 登录 GitHub。"
    } else if lower.contains("rate limit") || lower.contains("429") {
        "GH_RATE_LIMIT: GitHub 请求额度已耗尽，请稍后重试。"
    } else if lower.contains("403") || lower.contains("scope") {
        "GH_FORBIDDEN: 当前 gh 账号没有所需权限，请检查仓库访问权限及通知权限。"
    } else if lower.contains("404") {
        "GH_NOT_FOUND: 仓库或记录不存在，或当前账号无权访问。"
    } else {
        "GH_REQUEST_FAILED: 无法获取 GitHub 数据，请检查网络和 gh 登录状态。"
    }
    .into()
}

fn api(endpoint: &str, paginate: bool) -> Result<Value, String> {
    let mut args: Vec<String> = [
        "api",
        "--hostname",
        "github.com",
        "--method",
        "GET",
        endpoint,
    ]
    .map(String::from)
    .into();
    if paginate {
        args.extend(["--paginate".into(), "--slurp".into()]);
    }
    command(&args)
}

pub fn account() -> Result<Value, String> {
    api("/user", false)
}

fn valid_repo(repo: &str) -> bool {
    let parts: Vec<_> = repo.split('/').collect();
    parts.len() == 2
        && parts.iter().all(|part| {
            !part.is_empty()
                && *part != "."
                && *part != ".."
                && part.len() <= 100
                && part
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        })
}

const SEARCH_QUERY: &str = include_str!("github-search.graphql");

fn search(query: &str) -> Result<Value, String> {
    let value = command(&[
        "api".into(),
        "--hostname".into(),
        "github.com".into(),
        "graphql".into(),
        "--paginate".into(),
        "--slurp".into(),
        "-f".into(),
        format!("query={SEARCH_QUERY}"),
        "-f".into(),
        format!("search={query}"),
    ])?;
    if value.as_array().is_some_and(|pages| {
        pages
            .iter()
            .any(|p| p["data"]["search"]["issueCount"].as_u64().unwrap_or(0) > 1000)
    }) {
        return Err(
            "GH_SEARCH_LIMIT: 相关记录超过 GitHub 搜索的 1000 条上限，无法完整加载。".into(),
        );
    }
    Ok(value)
}

pub fn request(operation: &str, repo: &str, number: u64, login: &str) -> Result<Value, String> {
    if operation == "repositories" {
        return api("/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member", true);
    }
    if !valid_repo(repo) {
        return Err("INVALID_REPOSITORY".into());
    }
    let base = format!("/repos/{repo}");
    match operation {
        "repository" => api(&base, false),
        "inbox" => api(&format!("{base}/notifications?all=true&per_page=100"), true),
        "authored" | "review" | "issues" => {
            if operation == "review" {
                let mut pages = Vec::new();
                for qualifier in ["reviewed-by", "review-requested", "commenter"] {
                    let value = search(&format!(
                        "repo:{repo} is:pr {qualifier}:{login} -author:{login} sort:updated-desc"
                    ))?;
                    pages.extend(value.as_array().ok_or("GH_RESPONSE_ERROR")?.iter().cloned());
                }
                return Ok(pages.into());
            }
            let qualifier = match operation {
                "authored" => format!("is:pr author:{login}"),
                "review" => format!("is:pr involves:{login} -author:{login}"),
                _ => format!("is:issue involves:{login}"),
            };
            let query = format!("repo:{repo} {qualifier} sort:updated-desc");
            search(&query)
        }
        "detail" if number > 0 => {
            let pull = api(&format!("{base}/pulls/{number}"), false)?;
            let comments = api(
                &format!("{base}/issues/{number}/comments?per_page=100"),
                true,
            )?;
            let reviews = api(&format!("{base}/pulls/{number}/reviews?per_page=100"), true)?;
            let review_comments = api(
                &format!("{base}/pulls/{number}/comments?per_page=100"),
                true,
            )?;
            let files = api(&format!("{base}/pulls/{number}/files?per_page=100"), true)?;
            let sha = pull["head"]["sha"].as_str().ok_or("GH_RESPONSE_ERROR")?;
            if !sha.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err("GH_RESPONSE_ERROR".into());
            }
            let checks = api(
                &format!("{base}/commits/{sha}/check-runs?per_page=100&filter=latest"),
                true,
            );
            let statuses = api(&format!("{base}/commits/{sha}/status?per_page=100"), true);
            if api(&format!("{base}/pulls/{number}"), false)?["head"]["sha"] != pull["head"]["sha"]
            {
                return Err(
                    "GH_HEAD_CHANGED: 读取期间 PR 的代码版本已更新，请重新加载详情。".into(),
                );
            }
            Ok(
                json!({ "pull":pull,"comments":comments,"reviews":reviews,"reviewComments":review_comments,"files":files,"checks":checks.as_ref().ok(),"statuses":statuses.as_ref().ok(),"checkError":checks.err().or(statuses.err()) }),
            )
        }
        "issue" if number > 0 => Ok(
            json!({"issue":api(&format!("{base}/issues/{number}"), false)?, "comments":api(&format!("{base}/issues/{number}/comments?per_page=100"), true)?}),
        ),
        _ => Err("INVALID_OPERATION".into()),
    }
}

pub fn open(url: &str) -> Result<(), String> {
    if !url.starts_with("https://github.com/")
        || url
            .chars()
            .any(|c| c.is_control() || matches!(c, '"' | '\'' | '`' | '<' | '>' | '|'))
    {
        return Err("INVALID_GITHUB_URL".into());
    }
    #[cfg(windows)]
    {
        Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(url)
            .spawn()
            .map_err(|_| "无法打开浏览器。")?;
    }
    #[cfg(not(windows))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|_| "无法打开浏览器。")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Requires an authenticated gh installation and explicit opt-in"]
    fn live_read_only_github_contract() {
        let user = account().expect("gh account");
        let login = user["login"].as_str().unwrap();
        let repo =
            std::env::var("THREADLINE_LIVE_REPO").unwrap_or_else(|_| "ChenMiaoi/threadline".into());
        for operation in [
            "repositories",
            "repository",
            "authored",
            "review",
            "issues",
            "inbox",
        ] {
            let value = request(operation, &repo, 0, login)
                .unwrap_or_else(|error| panic!("{operation}: {error}"));
            assert!(value.is_array() || operation == "repository");
            println!("{operation}: valid JSON response");
        }
        if let Ok(number) = std::env::var("THREADLINE_LIVE_PR") {
            let detail = request("detail", &repo, number.parse().unwrap(), login).unwrap();
            assert!(detail["pull"]["head"]["sha"].is_string());
            assert!(detail["files"].is_array());
            println!("detail: valid JSON response");
        }
    }
    #[test]
    fn rejects_paths_and_unregistered_operations_before_invoking_gh() {
        for repo in ["--help", "a/../b", "a/b?x", "a/b;echo", "a/", "/b", "a/.."] {
            assert!(!valid_repo(repo));
        }
        assert!(valid_repo("ChenMiaoi/threadline"));
        assert_eq!(
            request("delete", "a/b", 1, "a").unwrap_err(),
            "INVALID_OPERATION"
        );
        assert!(open("https://github.com.evil.test/a").is_err());
    }
    #[test]
    fn errors_are_actionable_and_do_not_echo_subprocess_output() {
        assert!(classify_error("HTTP 401 secret").starts_with("GH_AUTH_REQUIRED"));
        assert!(classify_error("HTTP 403 rate limit").starts_with("GH_RATE_LIMIT"));
        assert!(classify_error("HTTP 403 secret").starts_with("GH_FORBIDDEN"));
        assert!(!classify_error("token=secret").contains("secret"));
    }
}
