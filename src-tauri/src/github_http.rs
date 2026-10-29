use serde_json::Value;
use std::io::Read;
use std::sync::OnceLock;
use std::time::Duration;

pub const API: &str = "https://api.github.com";
pub const DEVICE: &str = "https://github.com/login/device/code";
pub const TOKEN: &str = "https://github.com/login/oauth/access_token";
const MAX_BYTES: u64 = 32 * 1024 * 1024;

// Deliberately not Debug/Serialize: request bodies and headers can contain credentials.
pub struct Request {
    pub url: String,
    pub bearer: Option<String>,
    pub json: Option<Value>,
    pub form: Vec<(String, String)>,
}
impl Request {
    pub fn get(url: String, token: &str) -> Self {
        Self {
            url,
            bearer: Some(token.into()),
            json: None,
            form: Vec::new(),
        }
    }
    pub fn oauth(url: &str, form: &[(&str, &str)]) -> Self {
        Self {
            url: url.into(),
            bearer: None,
            json: None,
            form: form
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }
}
pub struct Response {
    pub status: u16,
    pub body: Value,
    pub next: Option<String>,
}
pub trait Transport: Send + Sync {
    fn send(&self, request: Request) -> Result<Response, String>;
}
#[derive(Default)]
pub struct Https {
    client: OnceLock<Result<reqwest::blocking::Client, String>>,
}
impl Https {
    fn client(&self) -> Result<&reqwest::blocking::Client, String> {
        self.client
            .get_or_init(|| {
                reqwest::blocking::Client::builder()
                    .user_agent(concat!("ThreadLine/", env!("CARGO_PKG_VERSION")))
                    .timeout(Duration::from_secs(30))
                    .redirect(reqwest::redirect::Policy::none())
                    .build()
                    .map_err(|_| "GH_REQUEST_FAILED".to_string())
            })
            .as_ref()
            .map_err(Clone::clone)
    }
}
impl Transport for Https {
    fn send(&self, request: Request) -> Result<Response, String> {
        let url = reqwest::Url::parse(&request.url).map_err(|_| "GH_INVALID_URL")?;
        // No configurable host or redirects: credentials must never reach another origin.
        if url.scheme() != "https"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port_or_known_default() != Some(443)
            || !(url.host_str() == Some("api.github.com")
                || request.url == DEVICE
                || request.url == TOKEN)
        {
            return Err("GH_INVALID_URL".into());
        }
        // Only REST GETs and the app's GraphQL queries are safe to replay. OAuth exchanges
        // can rotate credentials and must never be retried by this transport.
        let read_only = is_api_read(&request, &url);
        let client = self.client()?;
        let mut builder = if request.json.is_some() || !request.form.is_empty() {
            client.post(url)
        } else {
            client.get(url)
        };
        builder = builder
            .header(
                "Accept",
                if request.url == DEVICE || request.url == TOKEN {
                    "application/json"
                } else {
                    "application/vnd.github+json"
                },
            )
            .header("X-GitHub-Api-Version", "2022-11-28");
        if let Some(token) = request.bearer {
            builder = builder.bearer_auth(token);
        }
        if let Some(json) = request.json {
            builder = builder.json(&json);
        }
        if !request.form.is_empty() {
            builder = builder.form(&request.form);
        }
        read_with_retry(
            read_only,
            || {
                let response = builder
                    .try_clone()
                    .ok_or("GH_REQUEST_FAILED")?
                    .send()
                    .map_err(|e| {
                        if e.is_timeout() {
                            "GH_TIMEOUT"
                        } else {
                            "GH_REQUEST_FAILED"
                        }
                    })?;
                let status = response.status().as_u16();
                let retry_after = response.headers().contains_key("retry-after");
                let next = response
                    .headers()
                    .get("link")
                    .and_then(|h| h.to_str().ok())
                    .and_then(next_link);
                let mut bytes = Vec::new();
                response
                    .take(MAX_BYTES + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|_| "GH_REQUEST_FAILED")?;
                let body = decode_body(status, &bytes)?;
                Ok((Response { status, body, next }, retry_after))
            },
            || std::thread::sleep(Duration::from_millis(750)),
        )
    }
}
fn is_api_read(request: &Request, url: &reqwest::Url) -> bool {
    url.host_str() == Some("api.github.com")
        && request.form.is_empty()
        && request.json.as_ref().is_none_or(|body| {
            url.path() == "/graphql"
                && body["query"].as_str().is_some_and(|query| {
                    let query = query.trim_start();
                    query.starts_with("query ")
                        || query.starts_with("query(")
                        || query.starts_with("query (")
                })
        })
}

// Preserve HTTP failure classification even when a proxy returns HTML or an empty body.
// Never include remote bodies in errors: they may contain private records or credentials.
fn decode_body(status: u16, bytes: &[u8]) -> Result<Value, String> {
    if bytes.len() as u64 > MAX_BYTES {
        return Err("GH_RESPONSE_TOO_LARGE".into());
    }
    match serde_json::from_slice(bytes) {
        Ok(body) => Ok(body),
        Err(_) if !(200..300).contains(&status) => Ok(Value::Null),
        Err(_) => Err(format!(
            "GH_RESPONSE_ERROR: GitHub 返回了无效数据 (HTTP {status})"
        )),
    }
}

fn read_with_retry(
    read_only: bool,
    mut send: impl FnMut() -> Result<(Response, bool), String>,
    mut pause: impl FnMut(),
) -> Result<Response, String> {
    let first = send();
    let retry = read_only
        && match &first {
            Ok((response, retry_after)) => {
                !retry_after && matches!(response.status, 500 | 502 | 503 | 504)
            }
            Err(error) => {
                error == "GH_REQUEST_FAILED"
                    || error == "GH_TIMEOUT"
                    || error.starts_with("GH_RESPONSE_ERROR:")
            }
        };
    if retry {
        pause();
        return send().map(|(response, _)| response);
    }
    first.map(|(response, _)| response)
}

fn next_link(header: &str) -> Option<String> {
    header.split(',').find_map(|part| {
        let (url, relation) = part.trim().split_once(';')?;
        if relation.trim() == "rel=\"next\"" {
            Some(url.strip_prefix('<')?.strip_suffix('>')?.to_string())
        } else {
            None
        }
    })
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::collections::{HashMap, VecDeque};
    use std::sync::Mutex;
    #[derive(Default)]
    pub struct FakeHttp {
        pub responses: Mutex<VecDeque<Result<Response, String>>>,
        pub requests: Mutex<Vec<Request>>,
        routes: Mutex<HashMap<String, VecDeque<Result<Response, String>>>>,
    }
    impl FakeHttp {
        pub fn push_for(&self, endpoint: &str, body: Value) {
            self.routes
                .lock()
                .unwrap()
                .entry(format!("{API}{endpoint}"))
                .or_default()
                .push_back(Ok(Response {
                    status: 200,
                    body,
                    next: None,
                }));
        }
        pub fn push(&self, body: Value) {
            self.responses.lock().unwrap().push_back(Ok(Response {
                status: 200,
                body,
                next: None,
            }));
        }
    }
    impl Transport for FakeHttp {
        fn send(&self, request: Request) -> Result<Response, String> {
            let response = self
                .routes
                .lock()
                .unwrap()
                .get_mut(&request.url)
                .and_then(VecDeque::pop_front);
            self.requests.lock().unwrap().push(request);
            if let Some(response) = response {
                return response;
            }
            self.responses
                .lock()
                .unwrap()
                .pop_front()
                .expect("unexpected HTTP request")
        }
    }
    #[test]
    fn only_api_gets_and_graphql_queries_can_replay() {
        let get = Request::get(format!("{API}/user"), "test-token");
        assert!(is_api_read(&get, &reqwest::Url::parse(&get.url).unwrap()));
        for (query, allowed) in [
            (include_str!("github-search.graphql"), true),
            (include_str!("github-pull.graphql"), true),
            ("query PullHead { viewer { login } }", true),
            (
                "mutation { updateIssue(input: {}) { clientMutationId } }",
                false,
            ),
            ("", false),
        ] {
            let mut request = Request::get(format!("{API}/graphql"), "test-token");
            request.json = Some(serde_json::json!({"query":query}));
            assert_eq!(
                is_api_read(&request, &reqwest::Url::parse(&request.url).unwrap()),
                allowed
            );
            request.url = format!("{API}/other");
            assert!(!is_api_read(
                &request,
                &reqwest::Url::parse(&request.url).unwrap()
            ));
        }
        for endpoint in [DEVICE, TOKEN] {
            let request = Request::oauth(endpoint, &[("grant_type", "refresh_token")]);
            assert!(!is_api_read(
                &request,
                &reqwest::Url::parse(&request.url).unwrap()
            ));
        }
    }

    #[test]
    fn non_json_http_failures_keep_status_and_never_expose_remote_content() {
        for status in [401, 403, 404, 429, 500, 502, 503, 504] {
            assert!(decode_body(status, b"<html>private-token-secret</html>")
                .unwrap()
                .is_null());
            assert!(decode_body(status, b"").unwrap().is_null());
        }
        let error = decode_body(200, b"private-token-secret").unwrap_err();
        assert!(error.starts_with("GH_RESPONSE_ERROR:"));
        assert!(error.contains("200"));
        assert!(!error.contains("private-token-secret"));
        assert_eq!(
            decode_body(200, br#"{"login":"user"}"#).unwrap()["login"],
            "user"
        );
    }

    fn response(status: u16, bytes: &[u8], retry_after: bool) -> Result<(Response, bool), String> {
        Ok((
            Response {
                status,
                body: decode_body(status, bytes)?,
                next: None,
            },
            retry_after,
        ))
    }

    #[test]
    fn first_read_recovers_from_html_gateway_errors_and_transport_failures() {
        for first in [
            response(502, b"<html>Bad Gateway</html>", false),
            response(503, b"", false),
            Err("GH_REQUEST_FAILED".into()),
            Err("GH_TIMEOUT".into()),
            response(200, b"truncated JSON", false),
        ] {
            let mut attempts =
                VecDeque::from([first, response(200, br#"{"data":"fresh"}"#, false)]);
            let mut pauses = 0;
            let result =
                read_with_retry(true, || attempts.pop_front().unwrap(), || pauses += 1).unwrap();
            assert_eq!(result.status, 200);
            assert_eq!(result.body["data"], "fresh");
            assert!(attempts.is_empty());
            assert_eq!(pauses, 1);
        }
    }

    #[test]
    fn recovery_is_bounded_and_preserves_the_final_failure() {
        let mut attempts = 0;
        let result = read_with_retry(
            true,
            || {
                attempts += 1;
                response(502, b"private-proxy-error", false)
            },
            || {},
        )
        .unwrap();
        assert_eq!(attempts, 2);
        assert_eq!(result.status, 502);
        assert!(result.body.is_null());
        let mut attempts = 0;
        let error = read_with_retry(
            true,
            || {
                attempts += 1;
                Err("GH_TIMEOUT".into())
            },
            || {},
        )
        .err()
        .unwrap();
        assert_eq!(attempts, 2);
        assert_eq!(error, "GH_TIMEOUT");
    }

    #[test]
    fn oauth_authorization_limits_and_retry_after_are_never_replayed() {
        for (read_only, status, retry_after) in [
            (false, 502, false), // OAuth token rotation
            (true, 401, false),
            (true, 403, false),
            (true, 404, false),
            (true, 429, false),
            (true, 503, true), // Leave server-directed waiting to the caller.
            (true, 200, false),
        ] {
            let mut attempts = 0;
            let result = read_with_retry(
                read_only,
                || {
                    attempts += 1;
                    response(status, b"{}", retry_after)
                },
                || panic!("must not pause"),
            );
            assert_eq!(result.unwrap().status, status);
            assert_eq!(attempts, 1);
        }
        for error in [
            "GH_INVALID_URL",
            "GH_RESPONSE_TOO_LARGE",
            "GH_SECURE_STORAGE",
        ] {
            let error = read_with_retry(true, || Err(error.into()), || panic!("must not pause"))
                .err()
                .unwrap();
            assert!(!error.is_empty());
        }
    }

    #[test]
    fn finds_next_page_without_following_an_unrelated_relation() {
        assert_eq!(next_link("<https://api.github.com/a?page=2>; rel=\"next\", <https://api.github.com/a?page=3>; rel=\"last\""), Some("https://api.github.com/a?page=2".into()));
        assert_eq!(next_link("<https://evil.test/>; rel=\"last\""), None);
    }
}
