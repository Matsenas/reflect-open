//! The own-write ledger: the last few contents this process wrote to each
//! note, so the conflict sweep can recognize a conflict the device had with
//! **itself**.
//!
//! iCloud Drive can fork a note into conflict versions when a save replaces
//! the file while the previous save is still uploading — no other device
//! involved. Every side of such a conflict is something this app wrote, and
//! the current file is the newest of them: the editor buffer that produced it
//! already contained every earlier save. Folding those sides through the
//! ladder instead (with a stale shadow base, an edit to the note's last line
//! reads as two appends) duplicates half-typed lines.
//!
//! Proof, not inference: device names can't establish this — the version
//! store reports no saving device for the current version — so the sweep
//! treats a conflict as self-inflicted only when the current file is
//! byte-identical to this process's latest write **and** every conflict
//! version is byte-identical to an earlier one. Anything else (another
//! device's content, a second app instance, writes from before a restart)
//! takes the ordinary ladder. The ledger is in memory only: it must never
//! outlive the process whose writes it vouches for.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock, PoisonError};

use super::shadow::content_hash;

/// Writes remembered per note. A conflict version is an earlier save that was
/// mid-upload, so only recent history matters.
const HISTORY_PER_NOTE: usize = 16;

/// Notes tracked before the ledger starts over. Forgetting is always safe —
/// an unrecognized conflict just takes the ordinary ladder.
const MAX_NOTES: usize = 1024;

type Ledger = HashMap<PathBuf, VecDeque<String>>;

fn ledger() -> &'static Mutex<Ledger> {
    static LEDGER: OnceLock<Mutex<Ledger>> = OnceLock::new();
    LEDGER.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Remember that this process just wrote `content` to the note at `abs`.
/// Best-effort: a hashing failure records nothing, which only means a later
/// self-conflict on this note isn't recognized.
pub fn record(abs: &Path, content: &str) {
    let Ok(hash) = content_hash(content) else {
        return;
    };
    let mut ledger = ledger().lock().unwrap_or_else(PoisonError::into_inner);
    if ledger.len() >= MAX_NOTES && !ledger.contains_key(abs) {
        ledger.clear();
    }
    let history = ledger.entry(abs.to_path_buf()).or_default();
    if history.back() == Some(&hash) {
        return;
    }
    history.push_back(hash);
    if history.len() > HISTORY_PER_NOTE {
        history.pop_front();
    }
}

/// Whether a conflict on `abs` is one this process had with itself: `current`
/// is its latest write to the note and every one of `others` is an earlier
/// write. `others` must be non-empty.
pub fn is_self_conflict(abs: &Path, current: &str, others: &[&str]) -> bool {
    if others.is_empty() {
        return false;
    }
    let ledger = ledger().lock().unwrap_or_else(PoisonError::into_inner);
    let Some(history) = ledger.get(abs) else {
        return false;
    };
    let latest_matches = content_hash(current)
        .ok()
        .is_some_and(|hash| history.back() == Some(&hash));
    latest_matches
        && others.iter().all(|other| {
            content_hash(other)
                .ok()
                .is_some_and(|hash| history.contains(&hash))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(name: &str) -> PathBuf {
        // The ledger is process-global: every test uses its own path.
        PathBuf::from(format!("/own-writes-test/{name}.md"))
    }

    #[test]
    fn earlier_saves_against_the_latest_save_are_a_self_conflict() {
        let path = note("typing");
        record(&path, "- buy milk\n");
        record(&path, "- buy milk and eggs\n");
        assert!(is_self_conflict(
            &path,
            "- buy milk and eggs\n",
            &["- buy milk\n"]
        ));
    }

    #[test]
    fn a_current_file_that_is_not_the_latest_write_is_not() {
        // Another device's content became current: ours is now the conflict side.
        let path = note("arrived");
        record(&path, "- mac line\n");
        assert!(!is_self_conflict(
            &path,
            "- phone line\n",
            &["- mac line\n"]
        ));
        // An older write of ours being current is not proof either.
        record(&path, "- mac line, edited\n");
        assert!(!is_self_conflict(
            &path,
            "- mac line\n",
            &["- mac line, edited\n"]
        ));
    }

    #[test]
    fn a_conflict_version_this_process_never_wrote_is_not() {
        let path = note("foreign");
        record(&path, "- a\n");
        record(&path, "- a\n- b\n");
        assert!(!is_self_conflict(
            &path,
            "- a\n- b\n",
            &["- a\n", "- phone\n"]
        ));
    }

    #[test]
    fn untracked_notes_and_empty_conflicts_are_not() {
        assert!(!is_self_conflict(&note("never-written"), "x", &["y"]));
        let path = note("no-versions");
        record(&path, "x");
        assert!(!is_self_conflict(&path, "x", &[]));
    }

    #[test]
    fn history_is_bounded_per_note() {
        let path = note("bounded");
        record(&path, "v0");
        for index in 1..=HISTORY_PER_NOTE {
            record(&path, &format!("v{index}"));
        }
        let latest = format!("v{HISTORY_PER_NOTE}");
        assert!(!is_self_conflict(&path, &latest, &["v0"]));
        assert!(is_self_conflict(&path, &latest, &["v1"]));
    }
}
