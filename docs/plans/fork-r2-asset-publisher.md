# Fork Plan — R2 Asset Publisher

**Goal:** Every image and PDF that lands in the graph's `assets/` folder — pasted,
dropped, attached, browser-captured, or added on the iPhone — is published to the
owner's R2 bucket (`life-notes`, served at `https://files.matsenas.ee/`), and the
notes that reference it are rewritten to link the R2 copy, with the asset's AI
description carried into the image's alt text so it stays searchable.

**Shape:** a standalone publisher that runs once a day on the Mac, outside the app (launchd),
not an app feature. The official signed Reflect app, its iCloud conflict handling,
and the official iPhone app keep working unchanged: they only ever see ordinary
`https://` links. Nothing here touches upstream-owned app code, so it never
conflicts with the weekly upstream sync.

**Status:** Planned. Fork-only (`Matsenas/reflect-open`); not intended for upstream.

**Depends on:** the asset pipeline (`apps/desktop/src/editor/use-asset-persistence.ts`,
`apps/desktop/src/lib/attach-files.ts`, `packages/core/src/actions/capture-identity.ts`,
all of which write into `assets/`), Plan 20 asset descriptions
(`<asset>.reflect.md` sidecars), and the parsing rules in
`packages/core/src/markdown/extract.ts`.

## Scope

**In:**

- Publishing `png`, `jpg`/`jpeg`, `gif`, `webp`, `heic`, `svg`, and `pdf` files
  under `assets/` that are referenced by at least one note and by **no** private
  note.
- Rewriting every reference to a published asset in non-private notes to its
  public R2 URL: `![alt](assets/…)`, `[text](assets/…)`, and `![[assets/…]]`
  embeds (converted to `![alt](https://…)`), in every spelling the app accepts
  (percent-encoded, `./`-prefixed, note-relative).
- Alt text built from the asset's Plan 20 description (summary plus OCR text),
  so the image's contents are searchable after the link stops pointing at
  `assets/`.
- A verified upload (checksum + public URL) before any note changes, and one
  graph git commit per batch.
- A dry-run mode that prints the plan and a diff without uploading or writing.

**Out:**

- Any change to the Reflect app or `packages/*` behavior. The publisher only
  *reads* core's parsing code (see Key decisions).
- Audio memos (`audio-memos/`), the X archive cache (`assets/x/*.json`), and any
  other non-image, non-PDF attachment.
- Uploading at paste time, pending/uploading states in the editor, or offline
  queues inside the app.
- Backfilling alt text for the ~1,100 images already on R2 (they have no Plan 20
  description). Possible follow-up: the publisher describes R2 images itself with
  the owner's own AI key.
- Deleting anything from R2.

## Key decisions / contracts

- **Runs outside the app, once a day, on launchd.** A LaunchAgent runs the
  publisher daily (proposed 04:00 local time); launchd runs a missed job on the
  next wake, so a Mac that was asleep or off catches up. It needs no Claude
  session and no fork build. iPhone-created assets reach the Mac through iCloud and are
  published the same way.
- **Reuse core's parser, don't reimplement it.** The publisher is a TypeScript
  script in `tools/r2-publisher/` that imports the pure markdown functions from
  `@reflect/core` (note parsing, asset-reference extraction, `canonicalAssetPath`,
  frontmatter). The publisher then finds exactly the references the app finds. It
  reads markdown files directly and never opens `.reflect/index.sqlite`, so index
  schema changes upstream can't break it or be broken by it.
- **The privacy gate is the app's rule.** An asset is eligible only if it is
  referenced by ≥1 note and by 0 notes with `private: true` in frontmatter,
  re-checked from live files immediately before upload and again before each note
  write. A private referrer at any point → skip, leave everything local.
- **Content-addressed keys.** Key = `reflect-open/<sha256>.<ext>`. Identical files
  dedupe; a retried run can never overwrite a different file; the URL is stable.
  `Content-Type` comes from the file's actual bytes; `Content-Disposition` is
  `inline` with the original filename; object metadata records `source=reflect-open`
  and the original name (never note content).
- **Upload → verify → rewrite, never the reverse.** A note changes only after the
  object's ETag matches the local MD5 and `https://files.matsenas.ee/<key>` returns
  200 with the right type and size. Uploads use a dedicated write key; the existing
  read-only `r2` profile stays read-only.
- **Credentials in the Keychain.** A new token, *Object Read & Write* limited to
  `life-notes`, stored in the macOS Keychain and handed to the AWS CLI through a
  `credential_process` entry in a separate `r2-publisher` profile. No plaintext
  secret in `~/.aws/credentials`, the repo, or the graph.
- **Only idle, clean notes are rewritten.** A note is rewritten only if it hasn't
  been modified in the last 10 minutes, contains no conflict markers, and is not
  private. Otherwise its rewrite waits for a later run. This avoids racing an open
  editor (the app prompts when a dirty note changes on disk) and edits on the iPhone.
- **Atomic, minimal edits.** Only the link destination (and alt text) spans
  change; the rest of the file is byte-identical, checked by masking URLs and alt
  text before and after (the same check the R2 migration used). Writes go through
  temp-file + rename.
- **Alt text contract.** Built from the description body (frontmatter stripped):
  the summary sentences, then the `## Text` OCR content, flattened to one line,
  with `[`, `]` and `\` escaped, capped at 1,500 characters at a word boundary.
  PDFs linked as `[text](…)` keep their link text; the description goes in a
  `title` (`[text](url "…")`) only if that proves searchable, otherwise it is
  skipped for links. If an asset has no description at run time, it is deferred
  to the next daily run; after two runs without one it publishes with its
  existing alt text and records `needs-description` in the ledger.
- **Unredacted OCR in alt text is accepted.** The app's describe prompt
  transcribes ID numbers, account numbers, addresses and signatures verbatim.
  Putting that text into alt text moves it from the sidecar file into the note
  body, so it travels wherever note content goes (AI chat context, exports, the
  `reflect` CLI, git backups). The owner accepted this on 2026-10-05; notes marked
  `private: true` remain excluded because their assets are never published.
- **Ledger outside the graph.** `~/Library/Application Support/reflect-r2-publisher/ledger.jsonl`
  records asset path, hash, key, size, verification result, notes rewritten, and
  the graph commit. It is a log, not a source of truth: content-addressed keys
  make every step re-derivable from the files.
- **One commit per batch** in the graph's git repo: `Publish N assets to R2`,
  under the owner's name, listing the assets in the body.
- **R2 lock for the new prefix is age-based.** A `reflect-open/` rule with
  `--retention-days 30`, not indefinite, so a mistakenly pasted sensitive
  screenshot can still be deleted after the window. The existing indefinite rules
  on `imgs/`, `reflect-classic/` and `coda/` are unaffected.

### Contract sketches

```ts
// tools/r2-publisher/src/plan.ts — pure, unit-tested
interface PublishCandidate {
  assetPath: string          // canonical, e.g. "assets/pasted-1791240000000.png"
  sha256: string
  key: string                // "reflect-open/<sha256>.png"
  referrers: string[]        // note paths, all non-private
  description: string | null // body of assets/…​.reflect.md, if present
}

interface NoteRewrite {
  notePath: string
  edits: Array<{ from: number; to: number; replacement: string }>
}

function planBatch(graphRoot: string, now: Date): {
  candidates: PublishCandidate[]
  rewrites: NoteRewrite[]
  skipped: Array<{ assetPath: string; reason: 'private' | 'unreferenced' | 'note-busy' | 'awaiting-description' | 'unsupported-type' }>
}
```

## Steps

1. **Bucket setup.** Create the write token (*Object Read & Write*, `life-notes`
   only), store it in the Keychain, add the `r2-publisher` AWS profile with
   `credential_process`. Add the `reflect-open/` lock rule with 30-day retention.
2. **Scaffold `tools/r2-publisher/`.** A private workspace package in the fork that
   depends on `@reflect/core` for markdown parsing. Commands: `plan` (dry run),
   `publish`, `verify` (re-check every ledger entry against R2).
3. **Planner.** Walk `daily/` and `notes/`, extract asset references with core's
   parser, canonicalize paths, apply the privacy gate, hash eligible files, read
   descriptions, and produce `PublishCandidate[]` + `NoteRewrite[]` + skips.
4. **Alt-text builder.** Description → one-line, escaped, capped alt text; unit
   tests for escaping, the cap, missing `## Text`, and multi-paragraph summaries.
5. **Uploader + verifier.** `put-object` with no-overwrite semantics (skip when
   the key already exists with the same ETag), then the ETag and public-URL checks.
6. **Rewriter.** Apply edits to idle, clean, non-private notes only; confirm the
   masked-text invariant per note; write atomically; commit the batch in the graph
   repo.
7. **Dry-run review.** Run `plan` against the real graph and review the output
   with the owner before the first `publish`.
8. **launchd.** A LaunchAgent (`~/Library/LaunchAgents/…r2-publisher.plist`) with a
   daily `StartCalendarInterval` run, logging to `~/Library/Logs/reflect-r2-publisher/`, plus a
   macOS notification on any failure.
9. **Backup integration.** The `~/R2` mirror sync picks up `reflect-open/`
   automatically; extend `~/R2/.verify_backup.py` runs to cover it.

## Acceptance criteria

- Pasting a screenshot into a non-private note results, on a later run, in
  `![<description>](https://files.matsenas.ee/reflect-open/<sha256>.png)` in that
  note, the object in R2 with the right `Content-Type`, and one graph commit.
- A screenshot referenced by any `private: true` note is never uploaded, and no
  private note is ever modified.
- A note edited within the last 10 minutes is not rewritten in that run, and is
  rewritten in a later one once idle.
- Searching the app (⌘K) for a word that appears only in a screenshot's OCR text
  finds the note after publishing.
- Running `publish` twice in a row changes nothing the second time.
- Pulling the network mid-run leaves no note rewritten for any asset whose
  upload wasn't verified.
- `plan` on a graph with nothing new prints "nothing to publish" and writes nothing.

## Open decisions

- **Local copies after publishing:** keep them (offline display, sidecar
  descriptions stay valid, simplest rollback; costs iCloud space), or delete them
  after a grace period (e.g. 30 days after verification). Recommendation: keep
  until the publisher has run cleanly for a while, then decide.
- **Alt text for PDFs:** whether a link `title` is indexed by search; if not, PDFs
  get no extra searchable text from this plan.

## Risks

- **Published files are public.** Anyone with a URL can open it; keys are
  unguessable hashes, but links shared from notes reveal them. The 30-day lock
  means a mistaken upload stays undeletable for 30 days.
- **Core API drift.** Upstream can rename or reshape the markdown helpers the
  publisher imports. The planner's tests run against the current core on each
  upstream sync PR, so breakage shows up there rather than in production.
- **Editing synced notes from outside the app.** Mitigated by the idle window,
  conflict-marker check, minimal edits and atomic writes; any residual iCloud
  conflict lands in the app's own resolution ladder, and the batch commit makes
  every rewrite revertible.
- **Description timing.** If auto-describe is off or the AI provider fails,
  assets publish with their existing (often empty) alt text after two daily runs
  and stay flagged `needs-description`.
- **Daily latency.** A pasted image keeps its local `assets/` link until the next
  daily run, so links on other devices point at the local copy until then (iCloud
  still syncs the file itself).
