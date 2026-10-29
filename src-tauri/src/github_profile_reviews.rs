//! The contribution API omits some review activity (including reviews on authored PRs).
//! Read reviewed PRs and count the latest submitted review per PR within the selected year.
use serde_json::{json, Value};
use std::collections::HashSet;

pub fn read(
    repo: &str,
    year: u64,
    login: &str,
    fetch: &mut impl FnMut(Value) -> Result<Value, String>,
) -> Result<Vec<String>, String> {
    let (owner, name) = repo.split_once('/').ok_or("INVALID_REPOSITORY")?;
    let start = format!("{year}-01-01T00:00:00Z");
    let end = format!("{year}-12-31T23:59:59Z");
    let mut variables = json!({"query":format!("repo:{repo} is:pr reviewed-by:{login} updated:>={year}-01-01 created:<={year}-12-31"),"after":null,"login":login,"owner":owner,"name":name});
    let mut dates = Vec::new();
    let mut pulls = HashSet::new();
    let mut cursors = HashSet::new();
    let mut expected = None;
    loop {
        let page = fetch(variables.clone())?;
        check_identity(&page, login)?;
        if page["repository"]["isFork"]
            .as_bool()
            .ok_or("GH_RESPONSE_ERROR")?
        {
            return Ok(Vec::new());
        }
        let search = &page["search"];
        let count = search["issueCount"].as_u64().ok_or("GH_RESPONSE_ERROR")?;
        if count > 1000 {
            return Err(
                "GH_PROFILE_INCOMPLETE: GitHub 评审搜索达到上限，无法确认完整贡献。".into(),
            );
        }
        if expected.is_some_and(|previous| previous != count) {
            return Err("GH_PROFILE_CHANGED".into());
        }
        expected = Some(count);
        for pull in search["nodes"].as_array().ok_or("GH_RESPONSE_ERROR")? {
            let number = pull["number"].as_u64().ok_or("GH_RESPONSE_ERROR")?;
            if !pulls.insert(number) {
                return Err("GH_PROFILE_CHANGED".into());
            }
            let mut reviews = pull["reviews"].clone();
            let mut review_cursors = HashSet::new();
            loop {
                let nodes = reviews["nodes"].as_array().ok_or("GH_RESPONSE_ERROR")?;
                let times = nodes
                    .iter()
                    .map(|node| {
                        node["submittedAt"]
                            .as_str()
                            .filter(|date| date.len() >= 20 && date.ends_with('Z'))
                            .ok_or("GH_RESPONSE_ERROR")
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                if let Some(date) = times
                    .iter()
                    .filter(|date| **date >= start.as_str() && **date <= end.as_str())
                    .max()
                {
                    dates.push(date[..10].to_owned());
                    break;
                }
                if times.iter().any(|date| *date < start.as_str())
                    || !reviews["pageInfo"]["hasPreviousPage"]
                        .as_bool()
                        .ok_or("GH_RESPONSE_ERROR")?
                {
                    break;
                }
                let cursor = reviews["pageInfo"]["startCursor"]
                    .as_str()
                    .filter(|cursor| !cursor.is_empty())
                    .ok_or("GH_PAGINATION_ERROR")?;
                if nodes.is_empty() || !review_cursors.insert(cursor.to_owned()) {
                    return Err("GH_PAGINATION_ERROR".into());
                }
                let older = fetch(
                    json!({"number":number,"before":cursor,"owner":owner,"name":name,"login":login}),
                )?;
                check_identity(&older, login)?;
                reviews = older["repository"]["pullRequest"]["reviews"].clone();
            }
        }
        if !search["pageInfo"]["hasNextPage"]
            .as_bool()
            .ok_or("GH_RESPONSE_ERROR")?
        {
            if pulls.len() as u64 != count {
                return Err("GH_PROFILE_INCOMPLETE".into());
            }
            break;
        }
        let cursor = search["pageInfo"]["endCursor"]
            .as_str()
            .filter(|cursor| !cursor.is_empty())
            .ok_or("GH_PAGINATION_ERROR")?;
        if !cursors.insert(cursor.to_owned()) {
            return Err("GH_PAGINATION_ERROR".into());
        }
        variables["after"] = cursor.into();
    }
    Ok(dates)
}
fn check_identity(page: &Value, login: &str) -> Result<(), String> {
    if page["viewer"]["login"].as_str() != Some(login) {
        return Err("GH_ACCOUNT_CHANGED".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn reviews(dates: &[&str], more: bool, cursor: Option<&str>) -> Value {
        json!({"nodes":dates.iter().map(|date| json!({"submittedAt":date})).collect::<Vec<_>>(),"pageInfo":{"hasPreviousPage":more,"startCursor":cursor}})
    }
    fn page(nodes: Vec<Value>, count: u64, more: bool, cursor: Option<&str>) -> Value {
        json!({"viewer":{"login":"me"},"repository":{"isFork":false},"search":{"nodes":nodes,"issueCount":count,"pageInfo":{"hasNextPage":more,"endCursor":cursor}}})
    }
    #[test]
    fn counts_each_reviewed_pr_once_including_authored_prs_and_paginates_search() {
        let first = page(
            vec![
                json!({"number":1,"reviews":reviews(&["2026-10-01T00:00:00Z","2026-10-02T00:00:00Z"],false,None)}),
            ],
            2,
            true,
            Some("next"),
        );
        let second = page(
            vec![json!({"number":2,"reviews":reviews(&["2026-10-03T00:00:00Z"],false,None)})],
            2,
            false,
            None,
        );
        let mut calls = 0;
        let dates = read("o/r", 2026, "me", &mut |variables| {
            calls += 1;
            assert!(variables["query"]
                .as_str()
                .unwrap()
                .contains("reviewed-by:me"));
            assert!(!variables["query"].as_str().unwrap().contains("-author:"));
            if calls == 1 {
                Ok(first.clone())
            } else {
                assert_eq!(variables["after"], "next");
                Ok(second.clone())
            }
        })
        .unwrap();
        assert_eq!(dates, vec!["2026-10-02", "2026-10-03"]);
    }
    #[test]
    fn historical_year_reads_older_review_pages_and_excludes_out_of_range_reviews() {
        let first = page(
            vec![
                json!({"number":1,"reviews":reviews(&["2027-01-01T00:00:00Z"],true,Some("older"))}),
                json!({"number":2,"reviews":reviews(&["2025-01-01T00:00:00Z"],false,None)}),
            ],
            2,
            false,
            None,
        );
        let dates = read("o/r",2026,"me", &mut |variables| {
            if variables["number"] == 1 { assert_eq!(variables["before"],"older"); Ok(json!({"viewer":{"login":"me"},"repository":{"pullRequest":{"reviews":reviews(&["2025-12-31T00:00:00Z","2026-12-31T23:59:59Z"],false,None)}}})) }
            else { Ok(first.clone()) }
        }).unwrap();
        assert_eq!(dates, vec!["2026-12-31"]);
    }
    #[test]
    fn refuses_truncated_search_or_changed_identity_instead_of_returning_partial_totals() {
        assert!(read("o/r", 2026, "me", &mut |_| Ok(page(
            vec![],
            1001,
            false,
            None
        )))
        .unwrap_err()
        .starts_with("GH_PROFILE_INCOMPLETE"));
        assert_eq!(
            read("o/r", 2026, "other", &mut |_| Ok(page(
                vec![],
                0,
                false,
                None
            )))
            .unwrap_err(),
            "GH_ACCOUNT_CHANGED"
        );
        assert_eq!(
            read("o/r", 2026, "me", &mut |_| Ok(page(vec![], 1, false, None))).unwrap_err(),
            "GH_PROFILE_INCOMPLETE"
        );
    }
    #[test]
    fn rejects_repeated_review_cursors_and_skips_fork_contributions() {
        let mut fork = page(vec![], 0, false, None);
        fork["repository"]["isFork"] = true.into();
        assert!(read("o/r", 2026, "me", &mut |_| Ok(fork.clone()))
            .unwrap()
            .is_empty());
        let first = page(
            vec![
                json!({"number":1,"reviews":reviews(&["2027-01-01T00:00:00Z"],true,Some("repeat"))}),
            ],
            1,
            false,
            None,
        );
        assert_eq!(read("o/r",2026,"me", &mut |variables| {
            if variables["number"].is_number() { Ok(json!({"viewer":{"login":"me"},"repository":{"pullRequest":{"reviews":reviews(&["2027-01-01T00:00:00Z"],true,Some("repeat"))}}})) } else { Ok(first.clone()) }
        }).unwrap_err(),"GH_PAGINATION_ERROR");
    }
}
