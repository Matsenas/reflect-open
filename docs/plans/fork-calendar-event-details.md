# Fork Plan — Calendar Event Details

**Goal:** Clicking a Google Calendar event in the planner opens its details:
title, time, description, location, guests and video call. From there the
event can be edited, people can be invited, and a Google Meet link is added
automatically as soon as the event has at least one guest.

**Shape:** a popover anchored to the clicked event block, not a full-screen
dialog, so the week stays visible. It doubles as the create form: a
double-click on an empty slot opens the same popover on a new event instead
of today's inline title field.

**Status:** Planned. Fork-only (`Matsenas/reflect-open`); not intended for upstream.

**Depends on:** the planner's Google event blocks
(`apps/desktop/src/features/google-calendar/google-event-block.tsx`), the
calendar service's `moveEvent` and `createEvent`, and
[multiple Google accounts](fork-google-accounts.md) for the account an event
belongs to. It can ship before that plan against the single account.

## Scope

**In:**

- A popover on click (and Enter on a focused block) showing, for any Google
  event: title, start and end, all-day, description, location, guests with
  their responses, the Meet link, and the calendar it is on.
- Editing, for events the account may change: title, start and end (date and
  time), all-day on or off, description, location.
- **Guests:** add by typing an address, remove, and see each guest's
  response. Suggestions come from person notes that carry an email (the index
  already has them) before any Google lookup.
- **Google Meet:** created when the first guest is added, with a _Join_
  button and _Copy link_. _Remove video call_ takes it off again and stops
  the automatic add for that event.
- **Your response** on invitations from others: Going, Maybe, Not going.
- **Delete event**, behind a confirmation.
- Opening the popover on a new event from a double-clicked slot.
- Keyboard: Enter opens, Escape closes without saving, Mod-Enter saves.

**Out:**

- Recurrence editing. A repeating event shows "Repeats" and edits apply to
  the clicked occurrence only, as moves already do.
- Reminders, visibility, busy or free, event colour, meeting rooms, and
  recording: the icon row at the bottom of the reference design.
- Apple Calendar events. They stay read-only blocks with no popover.
- Attachments and guest permissions.

## Key decisions / contracts

- **Details are fetched on open, not with the week.** The week's query keeps
  its narrow `fields` filter. Opening the popover fetches the one event in
  full (`events.get`), so descriptions and guest lists are read only for
  events the user asks about, and are never cached past the popover.
- **Explicit save.** Edits collect in the form and go out as one `PATCH` on
  _Save_ (or Mod-Enter). Closing with unsaved changes asks once. Dragging and
  resizing on the grid stay instant, as today.
- **Inviting people sends email, so it asks.** Today's writes never email
  anyone. A save that adds or removes guests, or changes the time of an
  event that has guests, shows "Email the guests about this change?" with
  _Send_ and _Don't send_, mapped to `sendUpdates=all` and `none`. Nothing is
  sent without that answer.
- **Guests are replaced as a whole list.** Google's `PATCH` overwrites
  `attendees`, so the form always sends the full list it loaded plus the
  edits. A guest added by someone else between open and save would be
  dropped; the save therefore sends the event's `etag` in `If-Match` and, on
  a 412, reloads and asks the user to redo the edit.
- **Meet is requested, not assembled.** Adding the first guest sets
  `conferenceData.createRequest` with a fresh `requestId` and the
  `hangoutsMeet` solution, and the request carries `conferenceDataVersion=1`.
  Google returns the link; Reflect never builds one. Removing it sends
  `conferenceData: null`. No extra scope is needed beyond `calendar.events`.
- **Auto-Meet is a rule with an opt-out.** The rule is "an event that gains
  its first guest and has no video call gets a Meet". It does not fire for
  events that already have a call (Zoom link in the location, an existing
  Meet), and a per-event _Remove video call_ suppresses it for that event
  until the popover closes. A settings switch under _Accounts_ turns the
  rule off entirely.
- **Deleting is new.** The integration has never deleted anything. Delete is
  a `DELETE` with the same guest-email question, behind a confirmation that
  names the event, and for a repeating event it removes the clicked
  occurrence only.
- **Responding is a patch of the user's own guest entry**, which Google
  allows without organiser rights.
- **New code stays in the feature folder:** `event-details-popover.tsx`, an
  `event-form.ts` (zod schema + react-hook-form), and
  `use-google-event-details.ts`. The service gains `getEvent`, `updateEvent`,
  `respondToEvent` and `deleteEvent`. The popover uses
  `components/ui/popover.tsx`.

## Steps

1. Service: `getEvent` (full fields, with `etag`), `updateEvent` (title,
   times, all-day, description, location), tests for each body.
2. Popover in read mode on click; make a click distinct from a drag (the
   block already ignores presses under 4 px of travel).
3. Edit mode with the form, explicit save, the unsaved-changes prompt, and
   optimistic update of the week's cache.
4. Guests: list, add, remove, the email question, `If-Match` handling.
5. Meet: the auto-add rule, _Join_, _Copy link_, _Remove video call_, and
   the settings switch.
6. Response buttons for invitations.
7. Delete with confirmation.
8. Replace the inline new-event field with the popover on a new event.
9. Update [docs/fork-google-calendar.md](../fork-google-calendar.md): the
   scopes paragraph (deletes now happen), the "never emailed" line, and the
   troubleshooting table.

## Acceptance criteria

- Clicking any Google event opens the popover with its real description,
  location and guest list; a read-only event shows no edit controls.
- Adding one guest to an event with no call and saving produces an event
  that has a Meet link in Google Calendar, and the popover shows _Join_.
- Choosing _Don't send_ adds the guest without Google sending an invitation
  email; choosing _Send_ sends one.
- An event that already has a Zoom link in its location does not gain a Meet.
- Editing the time in the popover moves the block on the grid.
- Deleting asks first, and removes one occurrence of a repeating event.
- A drag of under 4 px opens the popover; a longer one moves the event and
  opens nothing.

## Open decisions

- **Auto-save or explicit save.** The reference design saves as you type.
  Explicit save is recommended here because some edits email other people.
- **Guest suggestions from Google Contacts.** Needs another scope and the
  Contacts switch from the accounts plan. Recommended: person notes only at
  first.
- **Which calendar a new event goes on** when the account has several
  writable ones: the primary calendar (recommended), or a picker in the
  popover.

## Risks

- **Emailing the wrong people.** The guest question is the only guard
  between a slip of the hand and an invitation sent from the user's address.
  It must not have a remembered "always send" answer.
- **Personal accounts and Meet.** Meet creation works on consumer accounts,
  but a Workspace admin can disable it. A failed create must leave the event
  saved without a call and say so, not fail the whole save.
- **Private-note rule.** Guest suggestions read person notes. A note with
  `private: true` must not supply an address to a request that leaves the
  machine.
