use crate::github_http::{Request, Transport, API};
use serde_json::{json, Value};
use std::collections::HashSet;
#[cfg(not(target_os = "macos"))]
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Instant;

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
    started: Instant,
    timings: Mutex<Vec<Value>>,
}
impl Client {
    pub fn new(http: Arc<dyn Transport>, token: String) -> Self {
        Self {
            http,
            token,
            started: Instant::now(),
            timings: Mutex::new(Vec::new()),
        }
    }
    fn checked(&self, request: Request) -> Result<crate::github_http::Response, String> {
        let stage = if request.json.as_ref().is_some_and(|body| {
            body["query"]
                .as_str()
                .is_some_and(|query| query.contains("query PullHead"))
        }) {
            "headRecheck"
        } else if request.json.as_ref().is_some_and(|body| {
            body["query"]
                .as_str()
                .is_some_and(|query| query.contains("query PullOverview"))
        }) {
            "overview"
        } else {
            request_stage(&request.url)
        };
        let started = Instant::now();
        let offset = self.started.elapsed().as_secs_f64() * 1000.0;
        let result = self.http.send(request);
        if let Ok(mut timings) = self.timings.lock() {
            timings.push(json!({"stage":stage,"offsetMs":offset,"elapsedMs":started.elapsed().as_secs_f64()*1000.0}));
        }
        let response = result.map_err(|error| {
            if error.starts_with("GH_RESPONSE_ERROR") {
                format!("{error} [{stage}]")
            } else {
                error
            }
        })?;
        if !(200..300).contains(&response.status) {
            return Err(http_error(response.status, &response.body));
        }
        if response.body.get("errors").is_some() {
            return Err("GH_API_ERROR: GitHub 查询未完整成功，请检查授权和额度。".into());
        }
        Ok(response)
    }
    pub fn timings(&self) -> Vec<Value> {
        self.timings
            .lock()
            .map(|entries| entries.clone())
            .unwrap_or_default()
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
            if search["issueCount"]
                .as_u64()
                .ok_or("GH_RESPONSE_ERROR: search count")?
                > 1000
            {
                return Err(
                    "GH_SEARCH_LIMIT: 相关记录超过 GitHub 搜索的 1000 条上限，无法完整加载。"
                        .into(),
                );
            }
            let more = search["pageInfo"]["hasNextPage"]
                .as_bool()
                .ok_or("GH_RESPONSE_ERROR: search page info")?;
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
    pub fn section(
        &self,
        operation: &str,
        repo: &str,
        number: u64,
        login: &str,
        head: &str,
    ) -> Result<Value, String> {
        if !matches!(operation, "pull" | "discussion" | "files" | "checks") {
            return self.request(operation, repo, number, login);
        }
        if !valid_repo(repo) || number == 0 {
            return Err("INVALID_REPOSITORY".into());
        }
        if operation == "pull" {
            return Ok(json!({"pull":self.pull_overview(repo, number)?}));
        }
        if head.len() != 40 || !head.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("GH_INVALID_HEAD".into());
        }
        let base = format!("/repos/{repo}");
        let value = match operation {
            "discussion" => {
                let [comments, reviews, inline] = std::thread::scope(|scope| {
                    [
                        format!("{base}/issues/{number}/comments?per_page=100"),
                        format!("{base}/pulls/{number}/reviews?per_page=100"),
                        format!("{base}/pulls/{number}/comments?per_page=100"),
                    ]
                    .map(|endpoint| scope.spawn(move || self.api(&endpoint, true)))
                    .map(|job| job.join().unwrap_or_else(|_| Err("GH_TASK_FAILED".into())))
                });
                json!({"comments":comments?,"reviews":reviews?,"reviewComments":inline?})
            }
            "files" => {
                json!({"files":self.api(&format!("{base}/pulls/{number}/files?per_page=100"), true)?})
            }
            "checks" => {
                let [checks, statuses] = std::thread::scope(|scope| {
                    [
                        format!("{base}/commits/{head}/check-runs?per_page=100&filter=latest"),
                        format!("{base}/commits/{head}/status?per_page=100"),
                    ]
                    .map(|endpoint| scope.spawn(move || self.api(&endpoint, true)))
                    .map(|job| job.join().unwrap_or_else(|_| Err("GH_TASK_FAILED".into())))
                });
                json!({"checks":checks.as_ref().ok(),"statuses":statuses.as_ref().ok(),"checkError":checks.err().or(statuses.err())})
            }
            _ => unreachable!(),
        };
        // Files and reviews may change while fetching; never attach another revision to the overview.
        if self.pull_head(repo, number)? != head {
            return Err("GH_HEAD_CHANGED: PR 版本已更新，请刷新详情。".into());
        }
        Ok(value)
    }
    fn graphql_pull(&self, repo: &str, number: u64, query: &str) -> Result<Value, String> {
        let (owner, name) = repo.split_once('/').ok_or("INVALID_REPOSITORY")?;
        let mut request = Request::get(format!("{API}/graphql"), &self.token);
        request.json =
            Some(json!({"query":query,"variables":{"owner":owner,"name":name,"number":number}}));
        let body = self.checked(request)?.body;
        let pull = &body["data"]["repository"]["pullRequest"];
        if pull.is_null() {
            return Err("GH_NOT_FOUND".into());
        }
        Ok(pull.clone())
    }
    fn pull_head(&self, repo: &str, number: u64) -> Result<String, String> {
        let pull = self.graphql_pull(repo, number, "query PullHead($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid}}}")?;
        pull["headRefOid"]
            .as_str()
            .map(str::to_string)
            .ok_or("GH_RESPONSE_ERROR".into())
    }
    fn pull_overview(&self, repo: &str, number: u64) -> Result<Value, String> {
        let pull = self.graphql_pull(repo, number, include_str!("github-pull.graphql"))?;
        let sha = pull["headRefOid"].as_str().ok_or("GH_RESPONSE_ERROR")?;
        if sha.len() != 40 || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("GH_RESPONSE_ERROR".into());
        }
        Ok(
            json!({"number":pull["number"],"title":pull["title"],"body":pull["body"],"html_url":pull["url"],"state":if pull["state"] == "OPEN" { "open" } else { "closed" },"merged":pull["merged"],"draft":pull["isDraft"],"reviewDecision":pull["reviewDecision"],"mergeStateStatus":pull["mergeStateStatus"],"mergeable":pull["mergeable"],"checkState":pull["commits"]["nodes"][0]["commit"]["statusCheckRollup"]["state"],"user":pull["author"],"head":{"sha":sha,"ref":pull["headRefName"]},"base":{"ref":pull["baseRefName"]},"additions":pull["additions"],"deletions":pull["deletions"],"changed_files":pull["changedFiles"],"commits":pull["commits"]["totalCount"]}),
        )
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
            "repository"
                | "activity"
                | "inbox"
                | "authored"
                | "review"
                | "issues"
                | "detail"
                | "issue"
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
            "activity" => self.search(&format!(
                "repo:{repo} is:pr involves:{login} sort:updated-desc"
            )),
            "authored" | "review" | "issues" => {
                if operation == "review" {
                    let mut pages = Vec::new();
                    let results = std::thread::scope(|scope| {
                        ["reviewed-by", "review-requested", "commenter"].map(|qualifier| {
                            scope.spawn(move || self.search(&format!(
                                "repo:{repo} is:pr {qualifier}:{login} -author:{login} sort:updated-desc"
                            )))
                        }).map(|job| job.join().unwrap_or_else(|_| Err("GH_TASK_FAILED".into())))
                    });
                    for result in results {
                        let value = result?;
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
                let sha = pull["head"]["sha"].as_str().ok_or("GH_RESPONSE_ERROR")?;
                if sha.is_empty() || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Err("GH_RESPONSE_ERROR".into());
                }
                // Only independent reads run together; HEAD is revalidated after all finish.
                let [comments, reviews, review_comments, files, checks, statuses] =
                    std::thread::scope(|scope| {
                        [
                            format!("{base}/issues/{number}/comments?per_page=100"),
                            format!("{base}/pulls/{number}/reviews?per_page=100"),
                            format!("{base}/pulls/{number}/comments?per_page=100"),
                            format!("{base}/pulls/{number}/files?per_page=100"),
                            format!("{base}/commits/{sha}/check-runs?per_page=100&filter=latest"),
                            format!("{base}/commits/{sha}/status?per_page=100"),
                        ]
                        .map(|endpoint| scope.spawn(move || self.api(&endpoint, true)))
                        .map(|job| job.join().unwrap_or_else(|_| Err("GH_TASK_FAILED".into())))
                    });
                let (comments, reviews, review_comments, files) =
                    (comments?, reviews?, review_comments?, files?);
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
fn request_stage(url: &str) -> &'static str {
    if url.ends_with("/user") {
        "identity"
    } else if url.contains("/apps/") {
        "app"
    } else if url.ends_with("/graphql") {
        "search"
    } else if url.contains("/check-runs?") {
        "checks"
    } else if url.contains("/status?") {
        "statuses"
    } else if url.contains("/files?") {
        "files"
    } else if url.contains("/reviews?") {
        "reviews"
    } else if url.contains("/comments?") && url.contains("/pulls/") {
        "inlineComments"
    } else if url.contains("/comments?") {
        "comments"
    } else if url.contains("/pulls/") {
        "pull"
    } else if url.contains("/installations") {
        "installations"
    } else if url.contains("/issues/") {
        "issue"
    } else {
        "repository"
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
        _ => {
            return format!("GH_REQUEST_FAILED: 无法获取 GitHub 数据 (HTTP {status})，请稍后重试。")
        }
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
    struct ParallelHttp {
        arrivals: (std::sync::Mutex<usize>, std::sync::Condvar),
        head_reads: std::sync::atomic::AtomicUsize,
        changed: bool,
        fail_checks: bool,
        fail_files: bool,
    }
    impl ParallelHttp {
        fn new(changed: bool, fail_checks: bool, fail_files: bool) -> Self {
            Self {
                arrivals: (std::sync::Mutex::new(0), std::sync::Condvar::new()),
                head_reads: std::sync::atomic::AtomicUsize::new(0),
                changed,
                fail_checks,
                fail_files,
            }
        }
        fn rendezvous(&self, expected: usize) -> Result<(), String> {
            let (lock, ready) = &self.arrivals;
            let mut arrivals = lock.lock().unwrap();
            *arrivals += 1;
            ready.notify_all();
            let (arrivals, timeout) = ready
                .wait_timeout_while(arrivals, std::time::Duration::from_secs(2), |count| {
                    *count < expected
                })
                .unwrap();
            if timeout.timed_out() && *arrivals < expected {
                return Err("EXPECTED_CONCURRENT_READS".into());
            }
            Ok(())
        }
    }
    impl Transport for ParallelHttp {
        fn send(&self, request: Request) -> Result<Response, String> {
            let body = if request.url.ends_with("/graphql") {
                self.rendezvous(3)?;
                let query = &request.json.as_ref().unwrap()["variables"]["search"];
                json!({"data":{"search":{"issueCount":1,"nodes":[query],"pageInfo":{"hasNextPage":false}}}})
            } else if request.url.ends_with("/pulls/1") {
                let read = self
                    .head_reads
                    .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                json!({"head":{"sha": if self.changed && read > 0 { "bbbb" } else { "aaaa" }}})
            } else {
                self.rendezvous(6)?;
                if (self.fail_checks && request.url.contains("/check-runs?"))
                    || (self.fail_files && request.url.contains("/files?"))
                {
                    return Err("GH_REQUEST_FAILED".into());
                }
                if request.url.contains("/check-runs?") {
                    json!({"check_runs":[{"id":1}]})
                } else if request.url.contains("/status?") {
                    json!({"statuses":[{"context":"ci"}]})
                } else {
                    json!([{"source":request.url}])
                }
            };
            Ok(Response {
                status: 200,
                body,
                next: None,
            })
        }
    }
    #[test]
    fn review_searches_overlap_and_preserve_qualifier_order() {
        let http = Arc::new(ParallelHttp::new(false, false, false));
        let client = Client::new(http, "ghu_test".into());
        let pages = client.request("review", "owner/repo", 0, "user").unwrap();
        for (page, qualifier) in
            pages
                .as_array()
                .unwrap()
                .iter()
                .zip(["reviewed-by", "review-requested", "commenter"])
        {
            assert!(page["data"]["search"]["nodes"][0]
                .as_str()
                .unwrap()
                .contains(&format!("{qualifier}:user")));
        }
    }
    #[test]
    fn detail_reads_overlap_and_keep_each_endpoint_in_its_own_field() {
        let http = Arc::new(ParallelHttp::new(false, false, false));
        let client = Client::new(http.clone(), "ghu_test".into());
        let detail = client.request("detail", "owner/repo", 1, "user").unwrap();
        for (field, endpoint) in [
            ("comments", "/issues/1/comments?"),
            ("reviews", "/pulls/1/reviews?"),
            ("reviewComments", "/pulls/1/comments?"),
            ("files", "/pulls/1/files?"),
        ] {
            assert!(detail[field][0][0]["source"]
                .as_str()
                .unwrap()
                .contains(endpoint));
        }
        assert_eq!(detail["checks"][0]["check_runs"][0]["id"], 1);
        assert_eq!(detail["statuses"][0]["statuses"][0]["context"], "ci");
        assert!(detail["checkError"].is_null());
        assert_eq!(http.head_reads.load(std::sync::atomic::Ordering::SeqCst), 2);
    }
    #[test]
    fn parallel_details_reject_changed_head_and_required_failures_but_disclose_optional_checks() {
        for (changed, fail_checks, fail_files) in [
            (true, false, false),
            (false, true, false),
            (false, false, true),
        ] {
            let client = Client::new(
                Arc::new(ParallelHttp::new(changed, fail_checks, fail_files)),
                "ghu_test".into(),
            );
            let result = client.request("detail", "owner/repo", 1, "user");
            if changed {
                assert!(result.unwrap_err().starts_with("GH_HEAD_CHANGED"));
            } else if fail_files {
                assert_eq!(result.unwrap_err(), "GH_REQUEST_FAILED");
            } else {
                let detail = result.unwrap();
                assert!(detail["checks"].is_null());
                assert_eq!(detail["checkError"], "GH_REQUEST_FAILED");
                assert!(detail["statuses"].is_array());
            }
        }
    }
    struct SectionHttp {
        requests: Mutex<Vec<String>>,
        changed: bool,
    }
    impl Transport for SectionHttp {
        fn send(&self, request: Request) -> Result<Response, String> {
            self.requests.lock().unwrap().push(request.url.clone());
            let body = if request.url.ends_with("/graphql") {
                let query = request.json.as_ref().unwrap()["query"].as_str().unwrap();
                if query.contains("query PullHead") {
                    json!({"data":{"repository":{"pullRequest":{"headRefOid":if self.changed { "b".repeat(40) } else { "a".repeat(40) }}}}})
                } else {
                    assert_eq!(
                        request.json.as_ref().unwrap()["variables"],
                        json!({"owner":"owner","name":"repo","number":1})
                    );
                    json!({"data":{"repository":{"pullRequest":{"headRefOid":"a".repeat(40),"headRefName":"feature","baseRefName":"main","number":1,"title":"overview","body":"description","url":"https://github.com/owner/repo/pull/1","state":"OPEN","merged":false,"isDraft":false,"author":{"login":"tester"},"additions":3,"deletions":1,"changedFiles":2,"commits":{"totalCount":1}}}}})
                }
            } else if request.url.contains("check-runs") {
                json!({"check_runs":[]})
            } else if request.url.contains("/status?") {
                json!({"statuses":[]})
            } else {
                json!([{"source":request.url}])
            };
            Ok(Response {
                status: 200,
                body,
                next: None,
            })
        }
    }
    #[test]
    fn overview_is_one_graphql_request_without_waiting_for_discussion_files_or_checks() {
        let http = Arc::new(SectionHttp {
            requests: Mutex::new(Vec::new()),
            changed: false,
        });
        let client = Client::new(http.clone(), "ghu_secret-fixture".into());
        let result = client
            .section("pull", "owner/repo", 1, "tester", "")
            .unwrap();
        assert_eq!(result["pull"]["title"], "overview");
        assert_eq!(result["pull"]["head"]["sha"], "a".repeat(40));
        assert_eq!(http.requests.lock().unwrap().len(), 1);
        let timings = serde_json::to_string(&client.timings()).unwrap();
        for private in ["owner/repo", "description", "ghu_secret-fixture"] {
            assert!(!timings.contains(private));
        }
        assert!(timings.contains("overview"));
    }
    #[test]
    fn on_demand_sections_read_only_their_endpoints_and_recheck_the_requested_revision() {
        for operation in ["discussion", "files", "checks"] {
            for changed in [false, true] {
                let http = Arc::new(SectionHttp {
                    requests: Mutex::new(Vec::new()),
                    changed,
                });
                let client = Client::new(http.clone(), "ghu_test".into());
                let result = client.section(operation, "owner/repo", 1, "tester", &"a".repeat(40));
                if changed {
                    assert!(result.unwrap_err().starts_with("GH_HEAD_CHANGED"));
                } else {
                    assert!(result.unwrap().is_object());
                }
                let requests = http.requests.lock().unwrap();
                assert_eq!(
                    requests.len(),
                    match operation {
                        "discussion" => 4,
                        "files" => 2,
                        _ => 3,
                    }
                );
                assert!(requests.last().unwrap().ends_with("/graphql"));
                if operation != "files" {
                    assert!(!requests.iter().any(|url| url.contains("/files?")));
                }
                if operation != "checks" {
                    assert!(!requests.iter().any(|url| url.contains("check-runs")));
                }
            }
        }
    }
    #[test]
    fn sections_reject_invalid_revision_and_paths_without_network() {
        let (client, http) = client();
        for head in ["", "bad/path", "not-hex"] {
            assert_eq!(
                client
                    .section("files", "owner/repo", 1, "tester", head)
                    .unwrap_err(),
                "GH_INVALID_HEAD"
            );
        }
        assert!(client
            .section("pull", "owner/repo?token=x", 1, "tester", "")
            .is_err());
        assert!(http.requests.lock().unwrap().is_empty());
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
    fn activity_search_uses_explicit_pull_type_without_notifications_permission() {
        let (client, http) = client();
        http.push(search_page(Value::Null, false, 0));
        client
            .request("activity", "owner/repo", 0, "owner")
            .unwrap();
        let requests = http.requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        let query = requests[0].json.as_ref().unwrap()["variables"]["search"]
            .as_str()
            .unwrap();
        assert_eq!(
            query,
            "repo:owner/repo is:pr involves:owner sort:updated-desc"
        );
        assert!(query.contains("is:pr"));
        assert!(!query.contains("is:issue"));
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
