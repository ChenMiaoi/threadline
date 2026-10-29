use crate::github_http::{Request, Transport, API};
use serde_json::{json, Value};
use std::collections::HashSet;
#[cfg(not(target_os = "macos"))]
use std::process::Command;
use std::sync::Arc;

const SEARCH_QUERY: &str = include_str!("github-search.graphql");
pub const READ_PERMISSIONS: &[&str] = &[
    "metadata",
    "contents",
    "issues",
    "pull_requests",
    "checks",
    "statuses",
];

pub struct Client {
    http: Arc<dyn Transport>,
    token: String,
}
impl Client {
    pub fn new(http: Arc<dyn Transport>, token: String) -> Self {
        Self { http, token }
    }
    fn checked(&self, request: Request) -> Result<crate::github_http::Response, String> {
        let response = self.http.send(request)?;
        if !(200..300).contains(&response.status) {
            return Err(http_error(response.status, &response.body));
        }
        if response.body.get("errors").is_some() {
            return Err("GH_API_ERROR: GitHub 查询未完整成功，请检查授权和额度。".into());
        }
        Ok(response)
    }
    pub fn account(&self) -> Result<Value, String> {
        self.api("/user", false)
    }
    pub fn validate_app(&self, slug: &str, client_id: &str) -> Result<(), String> {
        let app = self.api(&format!("/apps/{slug}"), false)?;
        if app["client_id"].as_str() != Some(client_id) {
            return Err("GH_APP_IDENTITY_MISMATCH: 返回的应用不是已配置的 ThreadLine。".into());
        }
        validate_permissions(&app["permissions"])
    }
    pub fn api(&self, endpoint: &str, paginate: bool) -> Result<Value, String> {
        if !endpoint.starts_with('/') || endpoint.starts_with("//") {
            return Err("GH_INVALID_URL".into());
        }
        let mut next = Some(format!("{API}{endpoint}"));
        let mut seen = HashSet::new();
        let mut pages = Vec::new();
        while let Some(url) = next {
            validate_api_url(&url)?;
            if !seen.insert(url.clone()) {
                return Err("GH_PAGINATION_ERROR".into());
            }
            let response = self.checked(Request::get(url, &self.token))?;
            pages.push(response.body);
            if !paginate {
                return pages.pop().ok_or("GH_RESPONSE_ERROR".into());
            }
            next = response.next;
        }
        Ok(pages.into())
    }
    pub fn installations(&self) -> Result<Vec<Value>, String> {
        let pages = self.api("/user/installations?per_page=100", true)?;
        let mut installations = Vec::new();
        for page in pages.as_array().ok_or("GH_RESPONSE_ERROR")? {
            for installation in page["installations"]
                .as_array()
                .ok_or("GH_RESPONSE_ERROR")?
            {
                validate_permissions(&installation["permissions"])?;
                installations.push(installation.clone());
            }
        }
        Ok(installations)
    }
    fn installation_repositories(&self) -> Result<Value, String> {
        let mut result = Vec::new();
        let mut ids = HashSet::new();
        for installation in self.installations()? {
            let id = installation["id"].as_u64().ok_or("GH_RESPONSE_ERROR")?;
            let pages = self.api(
                &format!("/user/installations/{id}/repositories?per_page=100"),
                true,
            )?;
            for page in pages.as_array().ok_or("GH_RESPONSE_ERROR")? {
                let mut repositories = Vec::new();
                for repo in page["repositories"].as_array().ok_or("GH_RESPONSE_ERROR")? {
                    let id = repo["id"].as_u64().ok_or("GH_RESPONSE_ERROR")?;
                    if ids.insert(id) {
                        repositories.push(repo.clone());
                    }
                }
                result.push(Value::Array(repositories));
            }
        }
        Ok(result.into())
    }
    pub fn ensure_repository(&self, repo: &str) -> Result<(), String> {
        if !valid_repo(repo) {
            return Err("INVALID_REPOSITORY".into());
        }
        let metadata = self.api(&format!("/repos/{repo}"), false)?;
        match metadata["private"].as_bool() {
            Some(false) => return Ok(()),
            Some(true) => (),
            None => return Err("GH_RESPONSE_ERROR".into()),
        }
        let repositories = self.installation_repositories()?;
        if repositories
            .as_array()
            .ok_or("GH_RESPONSE_ERROR")?
            .iter()
            .filter_map(Value::as_array)
            .flatten()
            .any(|r| {
                r["full_name"]
                    .as_str()
                    .is_some_and(|name| name.eq_ignore_ascii_case(repo))
            })
        {
            Ok(())
        } else {
            Err("GH_FORBIDDEN: 请先将 ThreadLine 安装到此仓库，并授予所需的只读权限。".into())
        }
    }
    fn search(&self, query: &str) -> Result<Value, String> {
        let mut pages = Vec::new();
        let mut cursor: Option<String> = None;
        let mut seen = HashSet::new();
        loop {
            let mut request = Request::get(format!("{API}/graphql"), &self.token);
            request.json = Some(
                json!({"query": SEARCH_QUERY, "variables": {"search":query,"endCursor":cursor}}),
            );
            let body = self.checked(request)?.body;
            let search = &body["data"]["search"];
            if search["issueCount"].as_u64().ok_or("GH_RESPONSE_ERROR")? > 1000 {
                return Err(
                    "GH_SEARCH_LIMIT: 相关记录超过 GitHub 搜索的 1000 条上限，无法完整加载。"
                        .into(),
                );
            }
            let more = search["pageInfo"]["hasNextPage"]
                .as_bool()
                .ok_or("GH_RESPONSE_ERROR")?;
            let end = search["pageInfo"]["endCursor"].as_str().map(str::to_string);
            pages.push(body);
            if !more {
                return Ok(pages.into());
            }
            let end = end.filter(|c| !c.is_empty()).ok_or("GH_PAGINATION_ERROR")?;
            if !seen.insert(end.clone()) {
                return Err("GH_PAGINATION_ERROR".into());
            }
            cursor = Some(end);
        }
    }
    pub fn request(
        &self,
        operation: &str,
        repo: &str,
        number: u64,
        login: &str,
    ) -> Result<Value, String> {
        if operation == "repositories" {
            if login.is_empty() || !login.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                return Err("GH_RESPONSE_ERROR".into());
            }
            let mut pages = self
                .api(
                    &format!("/users/{login}/repos?per_page=100&sort=updated&type=owner"),
                    true,
                )?
                .as_array()
                .ok_or("GH_RESPONSE_ERROR")?
                .clone();
            pages.extend(
                self.installation_repositories()?
                    .as_array()
                    .ok_or("GH_RESPONSE_ERROR")?
                    .iter()
                    .cloned(),
            );
            let mut seen = HashSet::new();
            for page in &mut pages {
                let repositories = page.as_array_mut().ok_or("GH_RESPONSE_ERROR")?;
                repositories.retain(|r| r["id"].as_u64().is_some_and(|id| seen.insert(id)));
            }
            return Ok(pages.into());
        }
        if !matches!(
            operation,
            "repository" | "inbox" | "authored" | "review" | "issues" | "detail" | "issue"
        ) {
            return Err("INVALID_OPERATION".into());
        }
        if !valid_repo(repo) {
            return Err("INVALID_REPOSITORY".into());
        }
        let base = format!("/repos/{repo}");
        match operation {
            "repository" => self.api(&base, false),
            "inbox" => Err(
                "GH_NOTIFICATIONS_UNSUPPORTED: GitHub 通知接口不支持只读 GitHub App 授权。".into(),
            ),
            "authored" | "review" | "issues" => {
                if operation == "review" {
                    let mut pages = Vec::new();
                    for qualifier in ["reviewed-by", "review-requested", "commenter"] {
                        let value = self.search(&format!(
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
                self.search(&query)
            }
            "detail" if number > 0 => {
                let pull = self.api(&format!("{base}/pulls/{number}"), false)?;
                let comments = self.api(
                    &format!("{base}/issues/{number}/comments?per_page=100"),
                    true,
                )?;
                let reviews =
                    self.api(&format!("{base}/pulls/{number}/reviews?per_page=100"), true)?;
                let review_comments = self.api(
                    &format!("{base}/pulls/{number}/comments?per_page=100"),
                    true,
                )?;
                let files = self.api(&format!("{base}/pulls/{number}/files?per_page=100"), true)?;
                let sha = pull["head"]["sha"].as_str().ok_or("GH_RESPONSE_ERROR")?;
                if !sha.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Err("GH_RESPONSE_ERROR".into());
                }
                let checks = self.api(
                    &format!("{base}/commits/{sha}/check-runs?per_page=100&filter=latest"),
                    true,
                );
                let statuses = self.api(&format!("{base}/commits/{sha}/status?per_page=100"), true);
                if self.api(&format!("{base}/pulls/{number}"), false)?["head"]["sha"]
                    != pull["head"]["sha"]
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
                json!({"issue":self.api(&format!("{base}/issues/{number}"), false)?, "comments":self.api(&format!("{base}/issues/{number}/comments?per_page=100"), true)?}),
            ),
            _ => Err("INVALID_OPERATION".into()),
        }
    }
}
pub fn validate_permissions(value: &Value) -> Result<(), String> {
    let permissions = value.as_object().ok_or("GH_RESPONSE_ERROR")?;
    if permissions.get("metadata").and_then(Value::as_str) != Some("read")
        || permissions.iter().any(|(name, access)| {
            !READ_PERMISSIONS.contains(&name.as_str()) || access.as_str() != Some("read")
        })
    {
        return Err(
            "GH_APP_PERMISSIONS_UNSAFE: ThreadLine GitHub App 必须仅具有文档列出的仓库只读权限。"
                .into(),
        );
    }
    Ok(())
}
fn validate_api_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "GH_INVALID_URL")?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("api.github.com")
        || parsed.port_or_known_default() != Some(443)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
    {
        return Err("GH_INVALID_URL".into());
    }
    Ok(())
}
fn http_error(status: u16, body: &Value) -> String {
    let rate_limit = body["message"]
        .as_str()
        .is_some_and(|m| m.to_lowercase().contains("rate limit"));
    match status {
        401 => "GH_AUTH_REQUIRED: ThreadLine 授权已失效，请重新登录。",
        429 => "GH_RATE_LIMIT: GitHub 请求额度已耗尽，请稍后重试。",
        403 if rate_limit => "GH_RATE_LIMIT: GitHub 请求额度已耗尽，请稍后重试。",
        403 => "GH_FORBIDDEN: ThreadLine 未获此仓库所需的只读权限。",
        404 => "GH_NOT_FOUND: 仓库或记录不存在，或 ThreadLine 尚未安装到此仓库。",
        _ => "GH_REQUEST_FAILED: 无法获取 GitHub 数据，请检查网络后重试。",
    }
    .into()
}
fn valid_repo(repo: &str) -> bool {
    let parts: Vec<_> = repo.split('/').collect();
    parts.len() == 2
        && parts.iter().all(|p| {
            !p.is_empty()
                && *p != "."
                && *p != ".."
                && p.len() <= 100
                && p.chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        })
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
    #[cfg(target_os = "macos")]
    {
        crate::macos::open(url)?;
    }
    #[cfg(not(any(windows, target_os = "macos")))]
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
    use crate::github_http::tests::FakeHttp;
    use crate::github_http::Response;
    fn client() -> (Client, Arc<FakeHttp>) {
        let http = Arc::new(FakeHttp::default());
        (Client::new(http.clone(), "ghu_fake-test".into()), http)
    }
    #[test]
    fn rejects_unsafe_paths_and_unknown_operations_without_network_requests() {
        let (client, http) = client();
        for repo in ["--help", "a/../b", "a/b?x", "a/b;echo", "a/", "/b", "a/.."] {
            assert!(!valid_repo(repo));
        }
        assert!(valid_repo("owner/project"));
        assert_eq!(
            client
                .request("delete", "owner/project", 1, "user")
                .unwrap_err(),
            "INVALID_OPERATION"
        );
        assert!(open("https://github.com.evil.test/a").is_err());
        assert!(http.requests.lock().unwrap().is_empty());
    }
    #[test]
    fn pagination_keeps_page_shapes_and_rejects_cross_origin_or_repeated_links() {
        let (client, http) = client();
        http.responses.lock().unwrap().push_back(Ok(Response {
            status: 200,
            body: json!([1]),
            next: Some("https://api.github.com/repos/o/r/issues?page=2".into()),
        }));
        http.push(json!([2]));
        assert_eq!(
            client.api("/repos/o/r/issues", true).unwrap(),
            json!([[1], [2]])
        );
        http.responses.lock().unwrap().push_back(Ok(Response {
            status: 200,
            body: json!([3]),
            next: Some("https://api.github.com.evil.test/private".into()),
        }));
        assert_eq!(
            client.api("/repos/o/r/issues", true).unwrap_err(),
            "GH_INVALID_URL"
        );
        assert_eq!(http.requests.lock().unwrap().len(), 3);
        http.responses.lock().unwrap().push_back(Ok(Response {
            status: 200,
            body: json!([]),
            next: Some("https://api.github.com/repos/o/r/issues".into()),
        }));
        assert_eq!(
            client.api("/repos/o/r/issues", true).unwrap_err(),
            "GH_PAGINATION_ERROR"
        );
    }
    #[test]
    fn public_repositories_do_not_require_installation_and_private_ones_do() {
        let (client, http) = client();
        http.push(json!({"private":false}));
        client.ensure_repository("llvm/llvm-project").unwrap();
        assert_eq!(http.requests.lock().unwrap().len(), 1);
        http.push(json!({"private":true}));
        http.push(json!({"installations":[]}));
        assert!(client
            .ensure_repository("owner/private")
            .unwrap_err()
            .starts_with("GH_FORBIDDEN"));
        http.push(json!({"private":true}));
        http.push(
            json!({"installations":[{"id":9,"permissions":{"metadata":"read","contents":"read"}}]}),
        );
        http.push(json!({"repositories":[{"id":4,"full_name":"owner/private","private":true}]}));
        client.ensure_repository("owner/private").unwrap();
    }
    #[test]
    fn repository_picker_merges_public_and_installed_repositories_without_duplicates() {
        let (client, http) = client();
        http.push(json!([{"id":1,"full_name":"owner/public","private":false}]));
        http.push(json!({"installations":[{"id":2,"permissions":{"metadata":"read"}}]}));
        http.push(json!({"repositories":[{"id":1,"full_name":"owner/public","private":false},{"id":3,"full_name":"org/private","private":true}]}));
        let pages = client.request("repositories", "", 0, "owner").unwrap();
        assert_eq!(
            pages
                .as_array()
                .unwrap()
                .iter()
                .flat_map(|p| p.as_array().unwrap())
                .count(),
            2
        );
    }
    #[test]
    fn app_permissions_must_be_read_only_and_limited_to_the_documented_set() {
        assert!(validate_permissions(&json!({"metadata":"read","contents":"read"})).is_ok());
        for permissions in [
            json!({"metadata":"read","contents":"write"}),
            json!({"metadata":"read","administration":"read"}),
            json!({"metadata":"read","emails":"read"}),
            json!({"contents":"read"}),
        ] {
            assert!(validate_permissions(&permissions)
                .unwrap_err()
                .starts_with("GH_APP_PERMISSIONS_UNSAFE"));
        }
        let (client, http) = client();
        http.push(json!({"client_id":"Iv1.wrong","permissions":{"metadata":"read"}}));
        assert!(client
            .validate_app("test", "Iv1.expected")
            .unwrap_err()
            .starts_with("GH_APP_IDENTITY_MISMATCH"));
    }
    fn search_page(cursor: Value, more: bool, total: u64) -> Value {
        json!({"data":{"search":{"issueCount":total,"nodes":[],"pageInfo":{"hasNextPage":more,"endCursor":cursor}}}})
    }
    #[test]
    fn graphql_follows_cursors_and_enforces_search_limit_and_partial_failure() {
        let (client, http) = client();
        http.push(search_page("next".into(), true, 60));
        http.push(search_page(Value::Null, false, 60));
        assert_eq!(
            client
                .request("authored", "owner/repo", 0, "owner")
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let requests = http.requests.lock().unwrap();
        assert!(requests.iter().all(|r| r.url == format!("{API}/graphql")));
        assert_eq!(
            requests[1].json.as_ref().unwrap()["variables"]["endCursor"],
            "next"
        );
        drop(requests);
        http.push(search_page(Value::Null, false, 1001));
        assert!(client
            .search("query")
            .unwrap_err()
            .starts_with("GH_SEARCH_LIMIT"));
        http.push(json!({"data":{},"errors":[{"message":"private-secret"}]}));
        let error = client.search("query").unwrap_err();
        assert!(error.starts_with("GH_API_ERROR"));
        assert!(!error.contains("private-secret"));
    }
    #[test]
    fn notifications_are_explicitly_unsupported_instead_of_empty_or_using_other_credentials() {
        let (client, http) = client();
        assert!(client
            .request("inbox", "owner/repo", 0, "owner")
            .unwrap_err()
            .starts_with("GH_NOTIFICATIONS_UNSUPPORTED"));
        assert!(http.requests.lock().unwrap().is_empty());
    }
    #[test]
    fn error_boundaries_do_not_return_remote_private_content() {
        let (client, http) = client();
        for (status, prefix) in [
            (401, "GH_AUTH_REQUIRED"),
            (403, "GH_FORBIDDEN"),
            (404, "GH_NOT_FOUND"),
            (429, "GH_RATE_LIMIT"),
            (500, "GH_REQUEST_FAILED"),
        ] {
            http.responses.lock().unwrap().push_back(Ok(Response {
                status,
                body: json!({"message":"private-token-secret"}),
                next: None,
            }));
            let error = client.account().unwrap_err();
            assert!(error.starts_with(prefix));
            assert!(!error.contains("private-token-secret"));
        }
    }
}
