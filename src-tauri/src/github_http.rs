use serde_json::Value;
use std::io::Read;
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
pub struct Https;
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
        let client = reqwest::blocking::Client::builder()
            .user_agent(concat!("ThreadLine/", env!("CARGO_PKG_VERSION")))
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "GH_REQUEST_FAILED")?;
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
        let response = builder.send().map_err(|e| {
            if e.is_timeout() {
                "GH_TIMEOUT"
            } else {
                "GH_REQUEST_FAILED"
            }
        })?;
        let status = response.status().as_u16();
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
        if bytes.len() as u64 > MAX_BYTES {
            return Err("GH_RESPONSE_TOO_LARGE".into());
        }
        let body = serde_json::from_slice(&bytes).map_err(|_| "GH_RESPONSE_ERROR")?;
        Ok(Response { status, body, next })
    }
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
    use std::collections::VecDeque;
    use std::sync::Mutex;
    #[derive(Default)]
    pub struct FakeHttp {
        pub responses: Mutex<VecDeque<Result<Response, String>>>,
        pub requests: Mutex<Vec<Request>>,
    }
    impl FakeHttp {
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
            self.requests.lock().unwrap().push(request);
            self.responses
                .lock()
                .unwrap()
                .pop_front()
                .expect("unexpected HTTP request")
        }
    }
    #[test]
    fn finds_next_page_without_following_an_unrelated_relation() {
        assert_eq!(next_link("<https://api.github.com/a?page=2>; rel=\"next\", <https://api.github.com/a?page=3>; rel=\"last\""), Some("https://api.github.com/a?page=2".into()));
        assert_eq!(next_link("<https://evil.test/>; rel=\"last\""), None);
    }
}
