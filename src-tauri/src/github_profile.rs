//! Repository-scoped projection of GitHub's contribution records, with complete pagination.
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet};

const KINDS: [(&str, &str, &str); 3] = [
    (
        "commits",
        "totalRepositoriesWithContributedCommits",
        "totalCommitContributions",
    ),
    (
        "issues",
        "totalRepositoriesWithContributedIssues",
        "totalIssueContributions",
    ),
    (
        "pulls",
        "totalRepositoriesWithContributedPullRequests",
        "totalPullRequestContributions",
    ),
];
pub fn read(
    repo: &str,
    year: u64,
    login: &str,
    mut fetch: impl FnMut(Value) -> Result<Value, String>,
) -> Result<Value, String> {
    let mut variables = json!({"from":format!("{year}-01-01T00:00:00Z"),"to":format!("{year}-12-31T23:59:59Z"),"commits":null,"issues":null,"pulls":null,"readCommits":true,"readIssues":true,"readPulls":true});
    let mut viewer = fetch(variables.clone())?;
    let mut daily = BTreeMap::<String, u64>::new();
    let mut totals = [0_u64; 4];
    let mut expected = [None; 3];
    let mut active = [true; 3];
    let mut cursors: [HashSet<String>; 3] = std::array::from_fn(|_| HashSet::new());
    loop {
        if viewer["login"].as_str() != Some(login) {
            return Err("GH_ACCOUNT_CHANGED".into());
        }
        let collection = &viewer["contributionsCollection"];
        for (index, (kind, count_field, _)) in KINDS.iter().enumerate() {
            if !active[index] {
                continue;
            }
            let groups = collection[kind].as_array().ok_or("GH_RESPONSE_ERROR")?;
            let repository_count = collection[count_field]
                .as_u64()
                .ok_or("GH_RESPONSE_ERROR")?;
            let group = groups.iter().find(|group| {
                group["repository"]["nameWithOwner"]
                    .as_str()
                    .is_some_and(|name| name.eq_ignore_ascii_case(repo))
            });
            let Some(group) = group else {
                // The non-paginated repository list is capped. Absence is only zero when complete.
                if repository_count > groups.len() as u64 {
                    return Err("GH_PROFILE_INCOMPLETE: GitHub 仓库列表达到上限，无法确认当前仓库的完整贡献。".into());
                }
                if expected[index].is_some() {
                    return Err("GH_PROFILE_CHANGED: 贡献数据已变化，请重试。".into());
                }
                active[index] = false;
                continue;
            };
            let connection = &group["contributions"];
            let total = connection["totalCount"]
                .as_u64()
                .ok_or("GH_RESPONSE_ERROR")?;
            if expected[index].is_some_and(|previous| previous != total) {
                return Err("GH_PROFILE_CHANGED: 贡献数据已变化，请重试。".into());
            }
            expected[index] = Some(total);
            let nodes = connection["nodes"].as_array().ok_or("GH_RESPONSE_ERROR")?;
            for node in nodes {
                let occurred = node["occurredAt"].as_str().ok_or("GH_RESPONSE_ERROR")?;
                let date = occurred
                    .get(..10)
                    .filter(|date| date.starts_with(&format!("{year}-")))
                    .ok_or("GH_RESPONSE_ERROR")?;
                if !occurred.ends_with('Z') {
                    return Err("GH_RESPONSE_ERROR".into());
                }
                let count = if index == 0 {
                    node["commitCount"].as_u64().ok_or("GH_RESPONSE_ERROR")?
                } else {
                    1
                };
                totals[index] = totals[index]
                    .checked_add(count)
                    .ok_or("GH_RESPONSE_ERROR")?;
                let day_total = daily.entry(date.to_owned()).or_default();
                *day_total = day_total.checked_add(count).ok_or("GH_RESPONSE_ERROR")?;
            }
            let more = connection["pageInfo"]["hasNextPage"]
                .as_bool()
                .ok_or("GH_RESPONSE_ERROR")?;
            if more {
                let cursor = connection["pageInfo"]["endCursor"]
                    .as_str()
                    .filter(|cursor| !cursor.is_empty())
                    .ok_or("GH_PAGINATION_ERROR")?;
                if nodes.is_empty() || !cursors[index].insert(cursor.to_owned()) {
                    return Err("GH_PAGINATION_ERROR".into());
                }
                variables[kind] = cursor.into();
            } else {
                // Commit connection totalCount counts commits, not the number of daily nodes.
                if totals[index] != total {
                    return Err("GH_PROFILE_INCOMPLETE: GitHub 未返回完整贡献，请重试。".into());
                }
                active[index] = false;
            }
        }
        if active.iter().all(|value| !value) {
            break;
        }
        for (index, flag) in ["readCommits", "readIssues", "readPulls"]
            .iter()
            .enumerate()
        {
            variables[flag] = active[index].into();
        }
        viewer = fetch(variables.clone())?;
    }
    let review_dates = crate::github_profile_reviews::read(repo, year, login, &mut fetch)?;
    totals[3] = review_dates.len() as u64;
    for date in review_dates {
        *daily.entry(date).or_default() += 1;
    }
    let mut days = Vec::new();
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let previous_year = year - 1;
    let mut weekday =
        ((year + previous_year / 4 - previous_year / 100 + previous_year / 400) % 7) as usize;
    let mut weeks: Vec<Value> = Vec::new();
    let max = daily.values().copied().max().unwrap_or(0);
    for (month, length) in month_days.iter().enumerate() {
        for day in 1..=*length {
            let date = format!("{year}-{:02}-{day:02}", month + 1);
            let count = daily.remove(&date).unwrap_or(0);
            let level = if count == 0 {
                "NONE"
            } else {
                [
                    "FIRST_QUARTILE",
                    "SECOND_QUARTILE",
                    "THIRD_QUARTILE",
                    "FOURTH_QUARTILE",
                ][((u128::from(count) * 4 - 1) / u128::from(max.max(1))).min(3) as usize]
            };
            days.push(json!({"date":date,"weekday":weekday,"contributionCount":count,"contributionLevel":level}));
            weekday = (weekday + 1) % 7;
            if weekday == 0 {
                weeks.push(json!({"contributionDays":std::mem::take(&mut days)}));
            }
        }
    }
    if !days.is_empty() {
        weeks.push(json!({"contributionDays":days}));
    }
    if !daily.is_empty() {
        return Err("GH_RESPONSE_ERROR".into());
    }
    let years = viewer["contributionsCollection"]["contributionYears"]
        .as_array()
        .filter(|years| years.iter().all(Value::is_u64))
        .ok_or("GH_RESPONSE_ERROR")?
        .clone();
    let total = totals
        .iter()
        .try_fold(0_u64, |sum, count| sum.checked_add(*count))
        .ok_or("GH_RESPONSE_ERROR")?;
    let mut collection = json!({"contributionYears":years,"contributionCalendar":{"totalContributions":total,"weeks":weeks}});
    for (index, (_, _, field)) in KINDS.iter().enumerate() {
        collection[field] = totals[index].into();
    }
    collection["totalPullRequestReviewContributions"] = totals[3].into();
    viewer["repository"] = repo.into();
    viewer["contributionsCollection"] = collection;
    Ok(viewer)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn group(repo: &str, nodes: Value, total: u64, more: bool, cursor: Value) -> Value {
        json!({"repository":{"nameWithOwner":repo},"contributions":{"nodes":nodes,"totalCount":total,"pageInfo":{"hasNextPage":more,"endCursor":cursor}}})
    }
    fn viewer() -> Value {
        let mut collection = json!({"contributionYears":[2024]});
        for (kind, count, _) in KINDS {
            collection[kind] = json!([]);
            collection[count] = 0.into();
        }
        json!({"login":"tester","contributionsCollection":collection,"viewer":{"login":"tester"},"repository":{"isFork":false},"search":{"issueCount":0,"nodes":[],"pageInfo":{"hasNextPage":false}}})
    }
    #[test]
    fn repository_projection_paginates_and_sums_only_matching_contributions_with_full_leap_year() {
        let mut first = viewer();
        let nodes: Vec<Value> = (0..100)
            .map(|_| json!({"occurredAt":"2024-02-29T10:00:00Z"}))
            .collect();
        first["contributionsCollection"]["issues"] = json!([
            group("other/repo", json!([]), 0, false, Value::Null),
            group("Owner/Repo", nodes.into(), 101, true, "next".into())
        ]);
        first["contributionsCollection"]["totalRepositoriesWithContributedIssues"] = 2.into();
        first["contributionsCollection"]["commits"] = json!([group(
            "owner/repo",
            json!([{"occurredAt":"2024-02-29T00:00:00Z","commitCount":7}]),
            7,
            false,
            Value::Null
        )]);
        first["contributionsCollection"]["totalRepositoriesWithContributedCommits"] = 101.into(); // Found target is still complete.
        let mut second = first.clone();
        second["contributionsCollection"]["issues"][1] = group(
            "owner/repo",
            json!([{"occurredAt":"2024-03-01T10:00:00Z"}]),
            101,
            false,
            Value::Null,
        );
        let mut requests = 0;
        let result = read("owner/repo", 2024, "tester", |variables| {
            if variables["query"].is_string() {
                return Ok(viewer());
            }
            requests += 1;
            if requests == 1 {
                Ok(first.clone())
            } else {
                assert_eq!(variables["issues"], "next");
                Ok(second.clone())
            }
        })
        .unwrap();
        let collection = &result["contributionsCollection"];
        assert_eq!(requests, 2);
        assert_eq!(collection["totalIssueContributions"], 101);
        assert_eq!(collection["totalCommitContributions"], 7);
        assert_eq!(collection["totalPullRequestContributions"], 0);
        let days: Vec<&Value> = collection["contributionCalendar"]["weeks"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|week| week["contributionDays"].as_array().unwrap())
            .collect();
        assert_eq!(days.len(), 366);
        assert_eq!(
            days.iter()
                .map(|day| day["contributionCount"].as_u64().unwrap())
                .sum::<u64>(),
            108
        );
        assert_eq!(
            days.iter().find(|day| day["date"] == "2024-02-29").unwrap()["contributionCount"],
            107
        );
        assert_eq!(days[0]["weekday"], 1);
    }
    #[test]
    fn reviewed_prs_feed_both_category_total_and_calendar() {
        let mut source = viewer();
        for (kind, count, total) in [
            ("commits", "totalRepositoriesWithContributedCommits", 8),
            ("issues", "totalRepositoriesWithContributedIssues", 3),
            ("pulls", "totalRepositoriesWithContributedPullRequests", 23),
        ] {
            let nodes: Vec<Value> = (0..total)
                .map(|_| json!({"occurredAt":"2024-10-01T00:00:00Z", "commitCount":1}))
                .collect();
            source["contributionsCollection"][kind] =
                json!([group("o/r", nodes.into(), total, false, Value::Null)]);
            source["contributionsCollection"][count] = 1.into();
        }
        let nodes: Vec<Value> = (1..=26).map(|number| json!({"number":number,"reviews":{"nodes":[{"submittedAt":"2024-10-02T00:00:00Z"}],"pageInfo":{"hasPreviousPage":false}}})).collect();
        let result = read("o/r", 2024, "tester", |variables| {
            if variables["query"].is_string() { Ok(json!({"viewer":{"login":"tester"},"repository":{"isFork":false},"search":{"issueCount":26,"nodes":nodes,"pageInfo":{"hasNextPage":false}}})) }
            else { Ok(source.clone()) }
        }).unwrap();
        let collection = &result["contributionsCollection"];
        assert_eq!(collection["totalPullRequestReviewContributions"], 26);
        assert_eq!(collection["contributionCalendar"]["totalContributions"], 60);
        let sum: u64 = collection["contributionCalendar"]["weeks"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|week| week["contributionDays"].as_array().unwrap())
            .map(|day| day["contributionCount"].as_u64().unwrap())
            .sum();
        assert_eq!(sum, 60);
    }
    #[test]
    fn absence_is_zero_only_for_complete_repository_lists() {
        let empty = viewer();
        assert_eq!(
            read("o/r", 2024, "tester", |_| Ok(empty.clone())).unwrap()["contributionsCollection"]
                ["contributionCalendar"]["totalContributions"],
            0
        );
        let mut capped = empty;
        capped["contributionsCollection"]["totalRepositoriesWithContributedCommits"] = 101.into();
        assert!(read("o/r", 2024, "tester", |_| Ok(capped.clone()))
            .unwrap_err()
            .starts_with("GH_PROFILE_INCOMPLETE"));
    }
    #[test]
    fn rejects_incomplete_or_repeated_pagination_and_changed_identity() {
        for cursor in [Value::Null, json!("repeat")] {
            let mut page = viewer();
            page["contributionsCollection"]["issues"] = json!([group(
                "o/r",
                json!([{"occurredAt":"2024-01-01T00:00:00Z"}]),
                3,
                true,
                cursor
            )]);
            assert_eq!(
                read("o/r", 2024, "tester", |_| Ok(page.clone())).unwrap_err(),
                "GH_PAGINATION_ERROR"
            );
        }
        let mut page = viewer();
        page["contributionsCollection"]["issues"] =
            json!([group("o/r", json!([]), 1, false, Value::Null)]);
        assert!(read("o/r", 2024, "tester", |_| Ok(page.clone()))
            .unwrap_err()
            .starts_with("GH_PROFILE_INCOMPLETE"));
        assert_eq!(
            read("o/r", 2024, "other", |_| Ok(viewer())).unwrap_err(),
            "GH_ACCOUNT_CHANGED"
        );
    }
}
