# Fork ledger

What `Matsenas/reflect-open` changes relative to `team-reflect/reflect-open`,
and where each change stands. The maintenance rules (branches, syncing,
mergeability) live at the end of [AGENTS.md](AGENTS.md); this file is the
inventory those rules are applied to.

## Kinds of change

Decide the kind before writing the change: it sets where the code goes and how
the change ends.

| Kind | Example | Where it lives | Long-term goal |
| --- | --- | --- | --- |
| **General improvement** | Note aliases, the iCloud sync fix | Built against upstream first, mirrored unchanged into the fork | Upstream merges it and the fork stops carrying it |
| **Fork-only feature** | Task buckets, a calendar tab | New modules (`apps/desktop/src/features/<name>/`, a new `packages/<name>`, a new plugin), with small hooks into upstream files | Stays in the fork, kept easy to merge |
| **Fork identity and config** | App name and ID, updater, version marker | Overlays (`apps/desktop/src-tauri/tauri.fork.conf.json`, the fork section of `AGENTS.md`) | Never edits upstream-owned files |

## Changes

| Change | Kind | Fork commit | Upstream status | Notes |
| --- | --- | --- | --- | --- |
| Fork maintenance rules | Fork identity and config | `f73f44f1` | Fork-only | The `# Fork Maintenance` section at the end of `AGENTS.md`. |
| R2 asset publisher plan | Fork-only feature | [Matsenas/reflect-open#2](https://github.com/Matsenas/reflect-open/pull/2) | Fork-only | Planned, not built: [docs/plans/fork-r2-asset-publisher.md](docs/plans/fork-r2-asset-publisher.md). Runs outside the app, so it never touches app code. |
| OpenAI data-residency regions | General improvement | [Matsenas/reflect-open#3](https://github.com/Matsenas/reflect-open/pull/3) | Not offered | Region picker in desktop and mobile AI provider settings (`openai-region-select.tsx`, `ai-provider-config-service.ts`, `language-model-service.ts`). |
| Mac build overlay | Fork identity and config | [Matsenas/reflect-open#4](https://github.com/Matsenas/reflect-open/pull/4) | Fork-only | `tauri.fork.conf.json`: ad-hoc signing, no iCloud entitlements, dead updater endpoint. Build steps in `AGENTS.md`. |
| Fork auto-updates | Fork identity and config | [Matsenas/reflect-open#12](https://github.com/Matsenas/reflect-open/pull/12) | Fork-only | `.github/workflows/fork-release.yml` plus the updater key and endpoint in `tauri.fork.conf.json`. |
| Note aliases in the context sidebar | General improvement | `11cfb119` | Open: [team-reflect/reflect-open#1444](https://github.com/team-reflect/reflect-open/pull/1444) | Ported to the core services in the 2026-11 sync, so #1444 needs the same port before it can merge. If upstream merges a revised version, take theirs on sync. |
| iCloud self-conflicts no longer duplicate lines | General improvement | [Matsenas/reflect-open#5](https://github.com/Matsenas/reflect-open/pull/5) | Not offered | `crates/graph-io/src/conflict/own_writes.rs`, the self-conflict check in `icloud/sweep.rs`, and the draft guard in `conflict/union.rs`. Upstream's [#1736](https://github.com/team-reflect/reflect-open/pull/1736) covers plain prefix extensions only. The fork still adds reworded or trimmed self-conflicts and drafts under a different list marker. Worth offering upstream. |
| `open` 5.4.5 stops zombie processes | General improvement | [Matsenas/reflect-open#11](https://github.com/Matsenas/reflect-open/pull/11) | Not offered | `Cargo.lock` only. `open` 5.4.0 never reaped its helper, leaving one zombie per opened link or file. Drop once upstream's lockfile reaches 5.4.5. |
| Task planner (week calendar with coloured groups) | Fork-only feature | This PR | Fork-only | `apps/desktop/src/features/task-planner/`. A second view of the Tasks route over Reflect's own tasks: a group is the task's first `#tag`, a slot is its `[[YYYY-MM-DD]]` due date plus an optional `HH:MM-HH:MM` after it, so nothing is stored outside the notes. Group colours and the chosen view live under the fork-only settings keys `taskPlannerGroups` and `tasksViewMode`. Upstream seams: the lazy import in `route-content.tsx` and the `<TasksViewToggle />` line in `tasks-screen.tsx`. |
| Google Calendar in the task planner | Fork-only feature | This PR | Fork-only | `apps/desktop/src/features/google-calendar/` plus the loopback listener `apps/desktop/src-tauri/src/oauth_loopback.rs`. Signs in with the user's own Google OAuth client (type Desktop app, PKCE, read-only calendar scope) through the system browser; the client and tokens live in the keychain entries `google-calendar-oauth-client` and `google-calendar-auth`, and events are fetched live from Google, never stored. Upstream seams: the `mod` line and three handler lines in `lib.rs`, and the `<GoogleCalendarField />` line in `integrations-section.tsx`. |

## Keeping this current

- **New change:** add a row in the same PR that introduces it.
- **Offered upstream:** set the status to `Open:` with the upstream PR link.
- **Upstream merged it, or shipped an equivalent:** after the sync that brings
  it in, confirm the fork's copy is gone or identical, then delete the row.
- **Weekly sync:** when merging the `sync/upstream` PR, check its "Conflicts
  with fork changes" list against this table.

Status values: `Fork-only`, `Not offered`, `Open: <upstream PR>`.
