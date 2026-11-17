# Fork Plan — Multiple Google Accounts

**Goal:** Sign in to several Google accounts at once (for example a Workspace
account and two personal Gmail accounts) and choose, per account, what Reflect
may use it for. The planner then shows every enabled account's calendars
together.

**Shape:** Google accounts move out of the single-connection dialog into
_Settings → Accounts_: one card per account with its name, address, and a
switch per permission. It is a simpler version of the reference design: two
switches (Calendar, Email), no Contacts, Resources or Email Settings rows.

**Status:** Planned. Fork-only (`Matsenas/reflect-open`); not intended for upstream.

**Depends on:** the Google Calendar integration
(`apps/desktop/src/features/google-calendar/`,
[docs/fork-google-calendar.md](../fork-google-calendar.md)), the loopback
listener (`apps/desktop/src-tauri/src/oauth_loopback.rs`), and the existing
_Accounts_ settings section (`apps/desktop/src/components/settings/accounts-section.tsx`).
[Event details](fork-calendar-event-details.md) and
[the email client](fork-email-client.md) build on this plan.

## Scope

**In:**

- Any number of Google accounts, each signed in through the existing browser
  flow with the one stored OAuth client.
- A card per account in _Settings → Accounts_: avatar initial, display name,
  address, and a switch per permission:
  - **Calendar** — view, create and update events.
  - **Email** — view, send and organise mail. Present but disabled with
    "Coming with the email client" until that plan ships.
- A **Primary** account, marked on its card: new events go to its primary
  calendar unless the event-details modal says otherwise.
- _Add Google account_, and per card _Remove account_ (revokes and forgets).
- The planner reading events from every account whose Calendar switch is on.
- Moving the stored connection of today's single account into the new shape
  without asking the user to sign in again.

**Out:**

- Contacts, meeting rooms (Resources) and email signature settings.
- A per-calendar chooser inside Reflect. Calendars keep following the ticks in
  Google Calendar's sidebar, per account.
- Non-Google accounts (Microsoft, iCloud mail).
- More than one OAuth client. All accounts sign in through the same one.

## Key decisions / contracts

- **One keychain entry per account.** `google-account:<id>` holds
  `{ accessToken, refreshToken, expiresAt, email, name, scope }`. The OAuth
  client stays in `google-calendar-oauth-client`. The list of account ids,
  the primary id and the per-account switches are not secrets and live in
  the settings document under a fork-only key, `googleAccounts`, the way
  `taskPlannerGroups` does. Settings never hold a token.
- **The account id is Google's `sub`.** Sign-in adds the `openid email profile`
  scopes and reads `sub`, `email` and `name` from the userinfo endpoint. Today
  the address comes from the primary calendar's id, which cannot label an
  account whose Calendar switch is off.
- **A switch is a scope grant.** Turning a switch on for the first time opens
  the consent page for that account with `include_granted_scopes=true` and
  `login_hint=<address>`, asking only for the missing scopes. Turning it off
  only stops Reflect using that data: Google cannot drop one scope from a
  grant, so the switch says so ("Reflect stops reading this; to withdraw the
  permission at Google, remove the account"). Turning it back on needs no
  browser trip when the scope is still granted.
- **The granted scopes are the truth.** A switch shows on only when the stored
  `scope` contains what it needs (`grantsEventWrites` generalised to a
  `grants(scope, permission)` table). A user who unticks a permission on
  Google's page gets a switch that stays off, with a one-line reason.
- **The service becomes per-account.** `GoogleCalendarService` splits into:
  - `GoogleAccountsService` — the account list, sign-in, token refresh,
    removal, and `getToken(accountId, permission)`.
  - `GoogleCalendarService` — calendar reads and writes for one token,
    unchanged in behaviour.
    State is `{ accounts: GoogleAccount[], primaryId }`. A refresh failure or a
    401 marks only that account as needing sign-in; the others keep working.
- **Events carry their account.** `GoogleCalendarEvent` gains `accountId`,
  the query key gains the enabled account ids, and a write goes out with the
  token of the event's own account. An invitation that sits on two of the
  user's accounts shows once (the iCal UID already collapses it); the copy
  kept is the one the user can edit.
- **One Google Cloud audience decision.** The fork's project is _Internal_ to
  `matsenas.ee`, so `@gmail.com` accounts cannot sign in to it. Supporting
  them means switching the audience to _External_. See Open decisions.
- **Upstream seams stay thin.** `accounts-section.tsx` gains one line,
  `<GoogleAccountsField />`. The Google row in `integrations-section.tsx` is
  removed, and the planner header button opens _Settings → Accounts_.

## Steps

1. Add `openid email profile` to the sign-in, read userinfo, and store `sub`
   and `name`. Tests for the userinfo read.
2. Introduce `GoogleAccountsService` over per-account keychain entries, with
   the one-time move of `google-calendar-auth` into `google-account:<id>`.
   Port the existing service tests; add multi-account refresh and removal.
3. Make `GoogleCalendarService` take an account, add `accountId` to events,
   and fan the planner's events query out over enabled accounts.
4. Build the account card and `GoogleAccountsField`; move the OAuth client
   form behind _Add Google account_ when no client is stored.
5. Wire the Calendar switch to incremental consent; ship the Email switch
   disabled.
6. Primary account: marker, _Make primary_ in the card's menu, and its use as
   the default for new events.
7. Update [docs/fork-google-calendar.md](../fork-google-calendar.md) and the
   `FORK.md` row.

## Acceptance criteria

- Three accounts can be signed in at once and each shows a card with the
  right address.
- Turning Calendar off for one account removes only that account's events
  from the planner, at once, with no browser trip.
- Removing an account deletes its keychain entry and revokes its token; the
  other accounts stay connected.
- An account whose refresh token has lapsed shows "Sign in again" on its own
  card and does not blank the planner.
- A user who connected one account before this change sees it as a card
  after updating, still connected.
- Dragging an event owned by the second account updates it through that
  account.

## Open decisions

- **External audience: Testing or In production.** _Testing_ needs each
  address added as a test user and expires every sign-in after 7 days.
  _In production_ without verification shows Google's "unverified app"
  warning and is capped at 100 users, which is fine for personal use.
  Recommended: _In production_, unverified. Confirm the cap and warning
  still apply when implementing; Google changes these rules.
- **Where the planner button leads:** straight to _Settings → Accounts_
  (recommended), or a small popover listing accounts with a link to Settings.
- **Per-account calendar colours** when two accounts use the same colour for
  different calendars: leave as Google reports them (recommended).

## Risks

- **Keychain prompts.** Each fork rebuild changes the ad-hoc signature, and
  macOS asks once per keychain entry. Several accounts mean several prompts
  after every update. One entry holding all accounts would cut that to one
  prompt, at the cost of rewriting every account's tokens on each refresh.
- **Rate limits.** Every account's calendars are read on focus and every five
  minutes. Three accounts with many calendars multiply the requests; batch
  per account and keep the 60-second stale time.
- **Audience switch is one-way in practice.** Moving the project from
  Internal to External changes the consent screen for the Workspace account
  too, and switching back signs the personal accounts out.
