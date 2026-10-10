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
| GPT-6.1 Sol through OpenRouter | General improvement | [Matsenas/reflect-open#1](https://github.com/Matsenas/reflect-open/pull/1) | Not offered | One catalog entry in `packages/core/src/ai/provider-catalog.ts`. Drop if upstream adds the model. |
| R2 asset publisher plan | Fork-only feature | [Matsenas/reflect-open#2](https://github.com/Matsenas/reflect-open/pull/2) | Fork-only | Planned, not built: [docs/plans/fork-r2-asset-publisher.md](docs/plans/fork-r2-asset-publisher.md). Runs outside the app, so it never touches app code. |
| OpenAI data-residency regions | General improvement | [Matsenas/reflect-open#3](https://github.com/Matsenas/reflect-open/pull/3) | Not offered | Region picker in desktop and mobile AI provider settings (`openai-region-select.tsx`, `use-ai-providers.ts`). |
| Mac build overlay | Fork identity and config | [Matsenas/reflect-open#4](https://github.com/Matsenas/reflect-open/pull/4) | Fork-only | `tauri.fork.conf.json`: ad-hoc signing, no iCloud entitlements, dead updater endpoint. Build steps in `AGENTS.md`. |
| Note aliases in the context sidebar | General improvement | `11cfb119` | Open: [team-reflect/reflect-open#1444](https://github.com/team-reflect/reflect-open/pull/1444) | Mirrors the upstream PR byte for byte. If upstream merges a revised version, take theirs on sync. |
| iCloud self-conflicts no longer duplicate lines | General improvement | [Matsenas/reflect-open#5](https://github.com/Matsenas/reflect-open/pull/5) | Not offered | `conflict/own_writes.rs` plus the draft guard in `conflict/union.rs`. Worth offering upstream. |

## Keeping this current

- **New change:** add a row in the same PR that introduces it.
- **Offered upstream:** set the status to `Open:` with the upstream PR link.
- **Upstream merged it, or shipped an equivalent:** after the sync that brings
  it in, confirm the fork's copy is gone or identical, then delete the row.
- **Weekly sync:** when merging the `sync/upstream` PR, check its "Conflicts
  with fork changes" list against this table.

Status values: `Fork-only`, `Not offered`, `Open: <upstream PR>`.
