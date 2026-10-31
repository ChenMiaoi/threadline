use chrono::{DateTime, SecondsFormat, TimeZone, Utc};
use chrono_tz::Tz;

pub struct ProfilePeriod {
    pub zone: Tz,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

impl ProfilePeriod {
    pub fn new(year: u64, zone: &str) -> Result<Self, String> {
        if !(2008..=9999).contains(&year) {
            return Err("GH_INVALID_YEAR".into());
        }
        let zone = parse_zone(zone)?;
        let midnight = |year| {
            zone.with_ymd_and_hms(year, 1, 1, 0, 0, 0)
                .earliest()
                .map(|date| date.with_timezone(&Utc))
                .ok_or_else(|| "GH_INVALID_YEAR".to_owned())
        };
        Ok(Self {
            zone,
            start: midnight(year as i32)?,
            end: midnight(year as i32 + 1)?,
        })
    }

    pub fn from(&self) -> String {
        self.start.to_rfc3339_opts(SecondsFormat::Secs, true)
    }

    pub fn to(&self) -> String {
        (self.end - chrono::Duration::milliseconds(1)).to_rfc3339_opts(SecondsFormat::Millis, true)
    }

    pub fn date(&self, timestamp: &str) -> Result<Option<String>, String> {
        let time = DateTime::parse_from_rfc3339(timestamp).map_err(|_| "GH_RESPONSE_ERROR")?;
        Ok((time >= self.start && time < self.end)
            .then(|| time.with_timezone(&self.zone).date_naive().to_string()))
    }
}

pub fn parse_zone(zone: &str) -> Result<Tz, String> {
    if zone.is_empty() {
        Ok(chrono_tz::UTC)
    } else {
        zone.parse().map_err(|_| "GH_INVALID_TIME_ZONE".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_midnight_and_year_boundaries_without_changing_the_instant() {
        let period = ProfilePeriod::new(2026, "Asia/Shanghai").unwrap();
        assert_eq!(period.from(), "2025-12-31T16:00:00Z");
        assert_eq!(period.to(), "2026-12-31T15:59:59.999Z");
        assert_eq!(
            period.date("2026-10-31T17:59:46Z").unwrap().as_deref(),
            Some("2026-11-01")
        );
        assert_eq!(
            period.date("2025-12-31T16:00:00Z").unwrap().as_deref(),
            Some("2026-01-01")
        );
        assert!(period.date("2026-12-31T16:00:00Z").unwrap().is_none());
        assert!(period.date("2025-12-31T15:59:59Z").unwrap().is_none());
    }

    #[test]
    fn supports_negative_offsets_dst_leap_years_and_rejects_invalid_input() {
        let period = ProfilePeriod::new(2024, "America/New_York").unwrap();
        assert_eq!(
            period.date("2024-03-10T04:30:00Z").unwrap().as_deref(),
            Some("2024-03-09")
        );
        assert_eq!(
            period.date("2024-03-10T07:30:00Z").unwrap().as_deref(),
            Some("2024-03-10")
        );
        assert_eq!(
            period.date("2024-02-29T12:00:00Z").unwrap().as_deref(),
            Some("2024-02-29")
        );
        assert!(period.date("not-a-date").is_err());
        assert!(ProfilePeriod::new(2000, "UTC").is_err());
        assert!(ProfilePeriod::new(2026, "Invalid/Zone").is_err());
    }
}
