# Google Calendar in the task planner (fork)

The task planner can show events from a Google account on its week grid. This
page covers the one-time Google Cloud setup, how to connect, and what to do
when the connection breaks. The feature is fork-only; see [FORK.md](../FORK.md).

## What it does and does not do

- **Read-only.** Reflect requests one scope,
  `https://www.googleapis.com/auth/calendar.readonly`. It cannot create, move
  or delete events, and it does not touch Gmail or any other Google data.
- **Shown in the task planner only**, not in the daily note's events sidebar.
- **Calendars follow Google.** The planner shows the calendars ticked in
  Google Calendar's own sidebar. An account with none ticked falls back to its
  primary calendar.
- **Hidden events:** cancelled events, events you declined, and
  working-location markers.
- **Live reads.** Events are fetched for the shown week on window focus and
  every five minutes. Nothing is written to the graph or the index.
- **One account per machine.**

## Why you need your own Google Cloud project

Google only gives calendar access to a registered OAuth client. Reflect has no
hosted services and ships no client of its own, so each user registers one.
It is free, and the client only ever acts for accounts you allow.

## One-time setup in Google Cloud Console

Google renames these screens from time to time; the menu names below are the
ones in use in late 2026.

1. **Create a project.** Open <https://console.cloud.google.com/>, use the
   project picker at the top, and create a project (any name, for example
   "Reflect Calendar").
2. **Enable the Calendar API.** Go to *APIs & Services → Library*, search for
   "Google Calendar API", open it and press *Enable*. Skipping this makes the
   sign-in fail with "Google Calendar API has not been used in project…".
3. **Configure the consent screen.** Go to *Google Auth Platform* (formerly
   *APIs & Services → OAuth consent screen*) and press *Get started*:
   - App name: anything, for example "Reflect".
   - User support email and developer contact: your own address.
   - Audience: **External** for a personal `@gmail.com` account. For a Google
     Workspace account you administer, **Internal** is simpler and skips
     step 4.
4. **Allow your account.** Under *Audience*, either:
   - add your Google address under *Test users* (the app stays in "Testing",
     and Google expires the sign-in every 7 days), or
   - press *Publish app* to move it to "In production". Verification is not
     needed for personal use; Google shows a "Google hasn't verified this app"
     warning at sign-in, which you pass with *Advanced → Go to (app name)*.
     This is the option to pick to avoid reconnecting weekly.
5. **Create the client.** Under *Clients* (formerly *Credentials*), press
   *Create client*, choose application type **Desktop app**, and create it.
   Copy the **Client ID** and **Client secret** straight away, or download the
   JSON: newer console versions show the secret only once.

No redirect URI needs registering. A Desktop app client may redirect to any
port on `127.0.0.1`, which is what Reflect uses.

## Connecting in Reflect

1. Open the task planner and click the calendar button in its header, or go to
   *Settings → Integrations → Google Calendar → Connect…*.
2. Paste the client ID and client secret, then press *Connect Google Calendar*.
3. Your browser opens Google's consent page. Choose the account and allow
   access. The tab then says "Sign-in received" and can be closed.
4. Back in Reflect the dialog shows "Connected as (your address)" and the
   week grid fills in.

*Disconnect* revokes the tokens and removes them from this Mac but keeps the
OAuth client, so reconnecting is one click. *Use a different OAuth client*
forgets the client as well.

## Where things are stored

| What | Where |
| --- | --- |
| OAuth client ID and secret | macOS keychain, service `reflect-open`, entry `google-calendar-oauth-client` |
| Access and refresh tokens, account address | macOS keychain, service `reflect-open`, entry `google-calendar-auth` |
| Events | Nowhere. They are held in memory for the shown week. |

Nothing goes into markdown, Git, `.reflect/` or the settings file. Each fork
rebuild changes the app's ad-hoc signature, so macOS asks once more for
keychain access after an update.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "Access blocked" or `access_denied` on Google's page | The app is in "Testing" and your account is not a test user. Add it under *Audience → Test users*, or publish the app. |
| "Google hasn't verified this app" | Expected for a personal client. *Advanced → Go to (app name)*. |
| "Google Calendar API has not been used in project…" | Step 2 was skipped. Enable the API, wait a minute, connect again. |
| "Google rejected the OAuth client ID or secret" | A typo, or the client is not of type Desktop app. Use *Use a different OAuth client* and paste again. |
| Disconnected after about a week | The app is still in "Testing". Publish it (step 4) and connect again. |
| "The sign-in timed out" | The consent page was left open for more than 5 minutes. Connect again. |
| Some calendars are missing | Tick them in Google Calendar's sidebar on the web; the planner follows those ticks. |
| The same meeting shows twice | The account is also added to macOS Calendar and the two copies differ in title or time. Untick that calendar under *Settings → Integrations → Calendar events*. |

To cut off access from Google's side, remove the app at
<https://myaccount.google.com/connections>. Reflect notices on its next read
and shows as disconnected.

## How it works

- The sign-in is OAuth 2.0 for installed apps with PKCE. Reflect binds a
  listener on a free `127.0.0.1` port
  (`apps/desktop/src-tauri/src/oauth_loopback.rs`), opens the consent page in
  the system browser, and receives the authorization code on that port. The
  redirect's `state` is checked before the code is used.
- The code is exchanged at `oauth2.googleapis.com/token`. Access tokens last
  about an hour and are refreshed silently; a refresh token Google no longer
  honours disconnects the account.
- Events come from the Calendar API v3 (`calendarList`, then `events` per
  calendar with `singleEvents=true`), requesting only ids, titles, times,
  status and your own response.
- The code lives in `apps/desktop/src/features/google-calendar/`.

Making it read-write would mean requesting a wider scope (for example
`calendar.events`), which every user would have to re-consent to, and adding
write paths that do not exist today.
