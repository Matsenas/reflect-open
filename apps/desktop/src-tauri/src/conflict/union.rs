//! Append-union: the daily-note rule. Two devices captured into the same note
//! while apart — both versions share a common prefix (the note as last synced,
//! or the template seed both devices created it from) and diverge only by what
//! each appended. Keep the prefix and both tails, older side's tail first.
//!
//! The guard that keeps this from mangling *edits*: the two tails must be
//! line-disjoint. A mid-note edit puts the note's own following lines in both
//! tails (they overlap), which refuses the union and falls through to markers
//! — never a silently duplicated half-note. An edit to the *last* line leaves
//! no shared following line, so the guard also treats a line that merely
//! extends or truncates a line in the other tail (`- buy milk` vs
//! `- buy milk and eggs`) as overlap: two drafts of one line, not two appends.

/// Union `first` and `second` when they diverge append-only. `None` when the
/// shape doesn't qualify (overlapping tails — a real edit, not an append).
pub(super) fn append_union(first: &str, second: &str) -> Option<String> {
    let first_lines: Vec<&str> = first.split('\n').collect();
    let second_lines: Vec<&str> = second.split('\n').collect();

    let shared = first_lines
        .iter()
        .zip(second_lines.iter())
        .take_while(|(a, b)| a == b)
        .count();
    let first_tail = trim_trailing_blank(&first_lines[shared..]);
    let second_tail = trim_trailing_blank(&second_lines[shared..]);

    // One side is a pure prefix of the other: the longer side already holds
    // everything.
    if first_tail.is_empty() {
        return Some(second.to_string());
    }
    if second_tail.is_empty() {
        return Some(first.to_string());
    }

    // Overlapping lines mean the divergence isn't append-shaped.
    if tails_overlap(first_tail, second_tail) {
        return None;
    }

    let mut merged: Vec<&str> = Vec::new();
    merged.extend_from_slice(&first_lines[..shared]);
    merged.extend_from_slice(first_tail);
    merged.extend_from_slice(second_tail);
    let mut out = merged.join("\n");
    // Blank trailing pieces were trimmed off the tails; restore the single
    // trailing newline notes carry.
    if (first.ends_with('\n') || second.ends_with('\n')) && !out.ends_with('\n') {
        out.push('\n');
    }
    Some(out)
}

/// Shortest line text (after [`line_text`]) that counts as a draft of a
/// longer line. Shorter stems (`a`, `ok`) prefix too many unrelated lines.
const MIN_DRAFT_CHARS: usize = 3;

/// Whether any non-blank line appears in both tails, or one tail's line is a
/// draft of the other's — the same line, extended or cut short.
fn tails_overlap(first_tail: &[&str], second_tail: &[&str]) -> bool {
    let first_texts: Vec<&str> = first_tail
        .iter()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line_text(line))
        .collect();
    second_tail
        .iter()
        .filter(|line| !line.trim().is_empty())
        .any(|second| {
            first_tail.contains(second)
                || first_texts
                    .iter()
                    .any(|first| is_draft_pair(first, line_text(second)))
        })
}

/// Whether one line text is a strict prefix of the other, with a stem long
/// enough to mean anything.
fn is_draft_pair(left: &str, right: &str) -> bool {
    let (shorter, longer) = if left.len() <= right.len() {
        (left, right)
    } else {
        (right, left)
    };
    shorter.chars().count() >= MIN_DRAFT_CHARS && shorter != longer && longer.starts_with(shorter)
}

/// A line's comparable text: indentation, a list marker (`-`, `*`, `+`,
/// `1.`, `1)`), and a task box (`[ ]`, `[x]`) stripped, so a draft is
/// recognized whatever list it sits in.
fn line_text(line: &str) -> &str {
    let mut text = line.trim();
    if let Some(rest) = ["- ", "* ", "+ "]
        .iter()
        .find_map(|marker| text.strip_prefix(marker))
    {
        text = rest.trim_start();
    } else if let Some(rest) = strip_ordered_marker(text) {
        text = rest.trim_start();
    }
    if let Some(rest) = ["[ ] ", "[x] ", "[X] "]
        .iter()
        .find_map(|marker| text.strip_prefix(marker))
    {
        text = rest.trim_start();
    }
    text.trim_end()
}

/// `12. rest` / `12) rest` → `rest`; `None` when the line isn't numbered.
fn strip_ordered_marker(text: &str) -> Option<&str> {
    let digits = text.chars().take_while(char::is_ascii_digit).count();
    if digits == 0 {
        return None;
    }
    let rest = &text[digits..];
    rest.strip_prefix(". ").or_else(|| rest.strip_prefix(") "))
}

/// Drop trailing blank pieces (the empty split artifact of a trailing newline
/// plus any blank last lines) so tail comparison sees real content only.
fn trim_trailing_blank<'a>(lines: &'a [&'a str]) -> &'a [&'a str] {
    let mut end = lines.len();
    while end > 0 && lines[end - 1].trim().is_empty() {
        end -= 1;
    }
    &lines[..end]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_devices_appended_to_the_same_daily_note() {
        let first = "# 2026-07-04\n\n- morning standup\n- mac task\n";
        let second = "# 2026-07-04\n\n- morning standup\n- phone capture\n";
        assert_eq!(
            append_union(first, second),
            Some("# 2026-07-04\n\n- morning standup\n- mac task\n- phone capture\n".to_string())
        );
    }

    #[test]
    fn a_pure_append_keeps_the_longer_side() {
        let first = "# Note\n\n- a\n";
        let second = "# Note\n\n- a\n- b\n";
        assert_eq!(append_union(first, second), Some(second.to_string()));
        assert_eq!(append_union(second, first), Some(second.to_string()));
    }

    #[test]
    fn creation_collision_with_no_shared_content_unions_both() {
        // Two devices created today's note offline with different content and
        // no template seed: nothing shared, keep both bodies.
        let first = "- from the mac\n";
        let second = "- from the phone\n";
        assert_eq!(
            append_union(first, second),
            Some("- from the mac\n- from the phone\n".to_string())
        );
    }

    #[test]
    fn a_mid_note_edit_refuses_the_union() {
        // First edited line two; second appended. Tails overlap on "- c".
        let first = "- a\n- B\n- c\n";
        let second = "- a\n- b\n- c\n- d\n";
        assert_eq!(append_union(first, second), None);
    }

    #[test]
    fn an_extended_last_line_is_an_edit_not_an_append() {
        // The same line typed further on one side: keeping both would leave a
        // half-typed copy above the finished line.
        let first = "# 2026-10-08\n\n- buy milk\n";
        let second = "# 2026-10-08\n\n- buy milk and eggs\n";
        assert_eq!(append_union(first, second), None);
        assert_eq!(append_union(second, first), None);
    }

    #[test]
    fn drafts_match_across_list_and_task_markers() {
        let first = "- seed\n+ [ ] call the bank\n";
        let second = "- seed\n+ [x] call the bank about the card\n";
        assert_eq!(append_union(first, second), None);
        let numbered = "- seed\n1. write the summary\n";
        let bullet = "- seed\n- write the summary for Tuesday\n";
        assert_eq!(append_union(numbered, bullet), None);
    }

    #[test]
    fn short_stems_and_empty_bullets_still_union() {
        // A two-character stem or an empty bullet is not evidence of a draft.
        let first = "- seed\n- ok\n-\n";
        let second = "- seed\n- okay then, shipping it\n";
        assert_eq!(
            append_union(first, second),
            Some("- seed\n- ok\n-\n- okay then, shipping it\n".to_string())
        );
    }

    #[test]
    fn identical_up_to_trailing_blank_lines_keeps_one_side() {
        // Both tails are blank after trimming; the first-tail-empty arm wins,
        // so the second side comes back. Which side is irrelevant (the ladder
        // catches whitespace-equality earlier) — determinism is what matters.
        let first = "- a\n";
        let second = "- a\n\n";
        assert_eq!(append_union(first, second), Some(second.to_string()));
    }
}
