# Fork Plan — Email Client

**Goal:** An _Email_ entry in the sidebar that opens a mail client inside
Reflect: read, search, reply, compose and archive mail from every Google
account whose Email switch is on in _Settings → Accounts_.

**Shape:** a new route beside Planner, in three panes: accounts and labels,
the thread list, and the open thread. Mail is read live from the Gmail API
and held in memory; nothing is written to the graph. The keyboard drives
everything, as in the rest of the app.

**Status:** Planned. Fork-only (`Matsenas/reflect-open`); not intended for upstream.

**Depends on:** [multiple Google accounts](fork-google-accounts.md) — this
plan turns its Email switch on. It reuses that plan's account service and
token handling, and the route and sidebar seams the planner added
(`packages/app/src/navigation/route.ts`,
`apps/desktop/src/components/sidebar/sidebar.tsx`,
`apps/desktop/src/lib/commands/app-commands.ts`).

## Scope

**In:**

- An **Email** sidebar item and `nav.email` command with a keybinding.
- A unified inbox across enabled accounts, and a per-account view.
- Gmail's system labels (Inbox, Starred, Sent, Drafts, Archive, Spam, Bin)
  and the user's own labels, per account.
- Thread list with sender, subject, snippet, date, unread and starred state,
  loaded a page at a time.
- Thread view: every message in the thread, HTML bodies rendered safely,
  attachments listed with a _Save_ action.
- Actions: archive, mark read or unread, star, move to bin, apply or remove a
  label.
- Compose, reply, reply all and forward, as plain text with the quoted
  original, sent from the account the thread belongs to. Drafts are saved to
  Gmail.
- Search, using Gmail's own query syntax, per account or across all.
- _Copy to note_: the open message as markdown into today's daily note, with
  a link back to the message in Gmail.

**Out:**

- Offline mail and a local mail store. Reading needs a connection.
- Rich-text composing, signatures, templates, scheduled send, undo send.
- Filters, forwarding rules, vacation responders and other Gmail settings.
- Push notifications and an unread badge on the dock icon.
- Sending attachments (receiving and saving them is in).
- Non-Gmail mail (IMAP, Microsoft).
- Mobile.

## Key decisions / contracts

- **Scopes.** The Email switch requests `gmail.modify` (read, label, archive,
  bin, drafts) and `gmail.send`. `gmail.modify` cannot permanently delete, so
  "delete" always means the bin. The granted scope string decides what the UI
  offers: an account granted only `gmail.readonly` gets a read-only mailbox.
- **Restricted scopes shape the Google Cloud setup.** `gmail.modify` is a
  restricted scope. A public, verified app would need Google's security
  assessment. A personal project avoids that by staying unverified (with the
  "unverified app" warning and a 100-user cap) or by being _Internal_ to a
  Workspace. Confirm the current rules before building; they decide whether
  personal `@gmail.com` accounts can use this at all.
- **Live, in memory.** Lists come from `threads.list`, an open thread from
  `threads.get`. TanStack Query holds them for the session. Refresh is
  `history.list` from the last seen `historyId` on window focus and every
  minute while the Email route is open, falling back to a full reload when
  Gmail says the history has expired.
- **No fork-only index migration, and no mail in the graph.** If a cache is
  ever added it goes in its own SQLite file under the app's data directory,
  outside `.reflect/` and outside the shared migration list (AGENTS.md).
- **Mail never reaches an AI provider.** No summarising, drafting or
  searching of mail through the user's AI keys in this plan. Mail content
  crossing to a third service is a separate decision with its own switch.
- **Untrusted HTML is rendered in a sandbox.** Message bodies go into an
  `<iframe sandbox>` with no script, no same-origin access and no form
  submission, behind a strict CSP. Remote images are blocked until the user
  clicks _Show images_ for that message (tracking pixels). Links open in the
  system browser through the opener service, never inside the app.
- **Sending asks nothing extra, but is unmistakable.** _Send_ is Mod-Enter or
  a labelled button showing the From address. There is no auto-send, and a
  reply defaults to _Reply_, never _Reply all_.
- **`Copy to note` respects private notes.** It only writes into the graph;
  nothing about the note goes back to Google. It is the one place mail
  becomes markdown, and it is always a user action.
- **Code layout.** `apps/desktop/src/features/email/`: `gmail-service.ts`
  (API calls, zod schemas, MIME decode and encode), `lib/` for pure parsing
  (headers, bodies, quoting, the RFC 2822 message a send needs),
  the route screen and its panes, and hooks. The Rust side gains nothing:
  the HTTP plugin already reaches Google.
- **Upstream seams:** one route kind (`{ kind: 'email' }`), one sidebar item,
  one command, one lazy import in `route-content.tsx`.

## Steps

1. Scopes and switch: let the accounts plan's Email switch request
   `gmail.modify` and `gmail.send`; `grants()` entries and tests.
2. `gmail-service.ts`: labels, `threads.list`, `threads.get`, with schemas
   and a tested MIME body decoder (multipart, base64url, charsets).
3. Route, sidebar item, command; the three-pane screen with a read-only
   inbox for one account.
4. Sandboxed HTML rendering, blocked remote images, link handling. Security
   tests with hostile fixtures (scripts, forms, `javascript:` links,
   tracking pixels).
5. Unified inbox and per-account views; labels pane.
6. Actions: archive, read state, star, bin, label, with optimistic updates
   and rollback.
7. Compose, reply, reply all, forward; drafts; the RFC 2822 encoder and its
   tests (headers, threading via `In-Reply-To` and `References`, non-ASCII
   subjects).
8. Search.
9. Incremental refresh over `history.list`.
10. Attachments: list and save.
11. _Copy to note_.
12. A setup and troubleshooting page, `docs/fork-email.md`, and the
    `FORK.md` row.

## Acceptance criteria

- With Email on for two accounts, the unified inbox interleaves both by date
  and each thread shows which account it belongs to.
- Turning Email off for an account removes its mail from every view at once.
- A reply is sent from the account that received the thread and appears in
  the same Gmail thread.
- A message containing a script, a form and a remote image renders with the
  script inert, the form unusable and the image not requested.
- Archiving removes the thread from the inbox immediately and it is archived
  in Gmail; a failure puts it back and says why.
- Every action above is reachable without the mouse.
- No request made by this feature goes anywhere except Google.

## Open decisions

- **Is this in keeping with the product?** AGENTS.md asks for minimal UI and
  surfaces that do not compete with the editor. A mail client is the largest
  fork-only surface so far. A narrower alternative: no mailbox, only _Copy to
  note_ from a searchable list of recent mail. Recommended: build the reader
  first (steps 1 to 5) and decide on composing after living with it.
- **Plain text or rich composing.** Plain text is recommended; rich composing
  roughly doubles the work and the security surface.
- **Unified inbox as the default view**, or the primary account's inbox.
- **A local cache** for offline reading and faster search. Recommended: not
  in the first version.

## Risks

- **Security.** Rendering other people's HTML inside an app that holds the
  user's notes and keys is the main risk. The sandbox and CSP are the
  feature's hardest requirement, and must be reviewed before anything ships.
- **Google policy.** Restricted Gmail scopes are the most tightly governed in
  Google's platform. A rule change could stop personal accounts from
  connecting, or cut sign-ins to 7 days if the project has to stay in
  Testing.
- **Scale of work.** This is several times the size of the calendar
  integration. Steps 1 to 5 are a usable reader and a sensible first PR.
- **Wrong-account sends.** With several accounts the From address must be
  visible on every compose, and fixed for replies.
- **Fork maintenance.** A new route and sidebar item touch upstream-owned
  files the weekly sync also edits; keep each seam to one line.
