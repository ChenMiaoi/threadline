use serde::Serialize;
use std::{collections::BTreeMap, sync::OnceLock};

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SystemFont {
    family: String,
    monospace: bool,
}

fn collect_families(faces: impl Iterator<Item = (String, bool)>) -> Vec<SystemFont> {
    let mut families = BTreeMap::<String, SystemFont>::new();
    for (family, monospace) in faces {
        let family = family.trim();
        if family.is_empty() || family.len() > 256 || family.chars().any(char::is_control) {
            continue;
        }
        families
            .entry(family.to_lowercase())
            .and_modify(|font| font.monospace |= monospace)
            .or_insert_with(|| SystemFont {
                family: family.to_owned(),
                monospace,
            });
    }
    families.into_values().collect()
}

pub fn system_fonts() -> Vec<SystemFont> {
    static FONTS: OnceLock<Vec<SystemFont>> = OnceLock::new();
    FONTS
        .get_or_init(|| {
            // Read installed font metadata once, off the UI thread. Font bytes and paths
            // stay in the host; only family names and fixed-pitch flags cross the bridge.
            let mut database = fontdb::Database::new();
            database.load_system_fonts();
            collect_families(database.faces().filter_map(|face| {
                face.families
                    .first()
                    .map(|(family, _)| (family.clone(), face.monospaced))
            }))
        })
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deduplicates_faces_sorts_families_and_keeps_monospace_metadata() {
        let fonts = collect_families(
            [
                ("微软雅黑", false),
                ("Consolas", true),
                ("consolas", false),
                ("Arial", false),
                ("\n", false),
            ]
            .into_iter()
            .map(|(family, mono)| (family.into(), mono)),
        );
        assert_eq!(fonts.len(), 3);
        assert_eq!(fonts[0].family, "Arial");
        assert_eq!(fonts[1].family, "Consolas");
        assert!(fonts[1].monospace);
        assert_eq!(fonts[2].family, "微软雅黑");
    }
}
