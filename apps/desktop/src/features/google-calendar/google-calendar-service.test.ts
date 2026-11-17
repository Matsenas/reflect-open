import { describe, expect, it } from 'vitest'
import { isAppError } from '@reflect/core'
import {
  createTestClockService,
  createTestHttpService,
  createTestIpcBridgeService,
  createTestLoggerService,
  createTestSecretStoreService,
} from '@reflect/core/testing'
import {
  createGoogleCalendarService,
  GOOGLE_CALENDAR_AUTH_SECRET,
  GOOGLE_CALENDAR_CLIENT_SECRET,
  type GoogleCalendarService,
} from './google-calendar-service.ts'
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL } from './lib/google-oauth.ts'

const NOW = Date.parse('2026-11-16T10:00:00Z')
const CLIENT = { clientId: 'client-id', clientSecret: 'client-secret' }
const API = 'https://www.googleapis.com/calendar/v3'

interface Harness {
  service: GoogleCalendarService
  http: ReturnType<typeof createTestHttpService>
  keychain: ReturnType<typeof createTestSecretStoreService>
  clock: ReturnType<typeof createTestClockService>
  opened: string[]
  ipc: ReturnType<typeof createTestIpcBridgeService>
}

interface HarnessOptions {
  secrets?: Record<string, string>
  /** The redirect query, given the `state` of the opened consent URL. */
  redirect?: (state: string) => string | null
}

function storedAuth(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: NOW + 3_600_000,
    email: 'me@example.com',
    ...overrides,
  })
}

function connectedSecrets(overrides: Record<string, unknown> = {}): Record<string, string> {
  return {
    [GOOGLE_CALENDAR_CLIENT_SECRET]: JSON.stringify(CLIENT),
    [GOOGLE_CALENDAR_AUTH_SECRET]: storedAuth(overrides),
  }
}

function createHarness(options: HarnessOptions = {}): Harness {
  const opened: string[] = []
  const redirect = options.redirect ?? ((state: string) => `state=${state}&code=code-1`)
  const ipc = createTestIpcBridgeService({
    commands: {
      oauth_loopback_start: () => 51234,
      oauth_loopback_wait: () => {
        const state = new URL(opened.at(-1) ?? '').searchParams.get('state') ?? ''
        return redirect(state)
      },
      oauth_loopback_cancel: () => null,
    },
  })
  const http = createTestHttpService()
  const keychain = createTestSecretStoreService(options.secrets)
  const clock = createTestClockService({ now: NOW })
  const service = createGoogleCalendarService({
    ipc,
    http,
    clock,
    logger: createTestLoggerService(),
    keychain,
    openUrl: (url) => {
      opened.push(url)
      return Promise.resolve()
    },
  })
  return { service, http, keychain, clock, opened, ipc }
}

function serveTokens(http: Harness['http'], json: unknown, status = 200): void {
  http.on('POST', GOOGLE_TOKEN_URL, { status, json })
}

describe('connect', () => {
  it('signs in through the loopback redirect and keeps the tokens in the keychain', async () => {
    const { service, http, keychain, opened } = createHarness()
    serveTokens(http, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 })
    http.on('GET', `${API}/calendars/primary?fields=id`, {
      status: 200,
      json: { id: 'me@example.com' },
    })

    expect(await service.connect(CLIENT)).toBe(true)

    expect(service.getState()).toEqual({
      status: 'connected',
      email: 'me@example.com',
      hasClient: true,
    })
    const consent = new URL(opened[0] ?? '')
    expect(consent.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:51234')
    const exchange = new URLSearchParams(
      http.requests().find((request) => request.url === GOOGLE_TOKEN_URL)?.body ?? '',
    )
    expect(exchange.get('code')).toBe('code-1')
    expect(exchange.get('redirect_uri')).toBe('http://127.0.0.1:51234')
    expect(exchange.get('code_verifier')).not.toBeNull()
    expect(JSON.parse(keychain.snapshot()[GOOGLE_CALENDAR_AUTH_SECRET] ?? '')).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: NOW + 3_600_000,
      email: 'me@example.com',
    })
    expect(JSON.parse(keychain.snapshot()[GOOGLE_CALENDAR_CLIENT_SECRET] ?? '')).toEqual(CLIENT)
  })

  it('refuses a redirect whose state is not this sign-in’s', async () => {
    const { service, http, keychain } = createHarness({
      redirect: () => 'state=forged&code=code-1',
    })

    await expect(service.connect(CLIENT)).rejects.toThrow('did not match')

    expect(http.requests()).toEqual([])
    expect(keychain.snapshot()).toEqual({})
    expect(service.getState().status).toBe('disconnected')
  })

  it('resolves false and stores nothing when the sign-in is cancelled', async () => {
    const { service, keychain } = createHarness({ redirect: () => null })

    expect(await service.connect(CLIENT)).toBe(false)

    expect(keychain.snapshot()).toEqual({})
    expect(service.getState().status).toBe('disconnected')
  })

  it('reports a declined consent', async () => {
    const { service } = createHarness({
      redirect: (state) => `error=access_denied&state=${state}`,
    })
    await expect(service.connect(CLIENT)).rejects.toThrow('cancelled')
  })

  it('surfaces Google’s explanation when the Calendar API is not enabled', async () => {
    const { service, http, keychain } = createHarness()
    serveTokens(http, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 })
    http.on('GET', `${API}/calendars/primary?fields=id`, {
      status: 403,
      json: { error: { message: 'Google Calendar API has not been used in project 1 before.' } },
    })

    await expect(service.connect(CLIENT)).rejects.toThrow('has not been used in project')
    expect(keychain.snapshot()).toEqual({})
  })

  it('needs an OAuth client', async () => {
    const { service } = createHarness()
    await expect(service.connect()).rejects.toThrow('client ID')
  })
})

describe('listEvents', () => {
  const range = {
    start: Date.parse('2026-11-16T00:00:00Z'),
    end: Date.parse('2026-11-23T00:00:00Z'),
  }

  function serveCalendars(http: Harness['http']): void {
    http.on('GET', (url) => url.startsWith(`${API}/users/me/calendarList`), {
      status: 200,
      json: {
        items: [
          { id: 'me@example.com', summary: 'Mine', selected: true, backgroundColor: '#111111' },
          { id: 'gone@example.com', summary: 'Gone', selected: true },
          { id: 'hols', summary: 'Holidays', selected: false },
        ],
      },
    })
    http.on('GET', (url) => url.startsWith(`${API}/calendars/gone%40example.com/events`), {
      status: 404,
      json: { error: { message: 'Not Found' } },
    })
  }

  it('reads the ticked calendars, following pages and skipping an unreadable one', async () => {
    const { service, http } = createHarness({ secrets: connectedSecrets() })
    serveCalendars(http)
    http.on(
      'GET',
      (url) => url.startsWith(`${API}/calendars/me%40example.com/events`),
      (request) => {
        const second = new URL(request.url).searchParams.get('pageToken') === 'page-2'
        return Response.json(
          second
            ? {
                items: [
                  {
                    id: 'b',
                    summary: 'Review',
                    start: { dateTime: '2026-11-17T12:00:00Z' },
                    end: { dateTime: '2026-11-17T13:00:00Z' },
                  },
                ],
              }
            : {
                nextPageToken: 'page-2',
                items: [
                  {
                    id: 'a',
                    summary: 'Standup',
                    start: { dateTime: '2026-11-18T09:00:00Z' },
                    end: { dateTime: '2026-11-18T09:30:00Z' },
                  },
                ],
              },
        )
      },
    )

    const events = await service.listEvents(range)

    expect(events.map((event) => [event.title, event.color])).toEqual([
      ['Review', '#111111'],
      ['Standup', '#111111'],
    ])
    const eventRequests = http.requests().filter((request) => request.url.includes('/events?'))
    expect(eventRequests.some((request) => request.url.includes('/calendars/hols/'))).toBe(false)
    const params = new URL(eventRequests[0]?.url ?? '').searchParams
    expect(params.get('timeMin')).toBe('2026-11-16T00:00:00.000Z')
    expect(params.get('timeMax')).toBe('2026-11-23T00:00:00.000Z')
    expect(params.get('singleEvents')).toBe('true')
    expect(eventRequests[0]?.headers.get('Authorization')).toBe('Bearer access-1')
  })

  it('refreshes an expired access token once for concurrent reads', async () => {
    const { service, http, keychain } = createHarness({
      secrets: connectedSecrets({ expiresAt: NOW - 1 }),
    })
    serveTokens(http, { access_token: 'access-2', expires_in: 3600 })
    http.on('GET', (url) => url.startsWith(API), { status: 200, json: { items: [] } })

    await Promise.all([service.listEvents(range), service.listEvents(range)])

    const refreshes = http.requests().filter((request) => request.url === GOOGLE_TOKEN_URL)
    expect(refreshes).toHaveLength(1)
    expect(new URLSearchParams(refreshes[0]?.body ?? '').get('refresh_token')).toBe('refresh-1')
    expect(JSON.parse(keychain.snapshot()[GOOGLE_CALENDAR_AUTH_SECRET] ?? '')).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-1',
      expiresAt: NOW + 3_600_000,
    })
  })

  it('disconnects when Google no longer honours the refresh token', async () => {
    const { service, http, keychain } = createHarness({
      secrets: connectedSecrets({ expiresAt: NOW - 1 }),
    })
    serveTokens(http, { error: 'invalid_grant' }, 400)

    const failure: unknown = await service.listEvents(range).catch((error: unknown) => error)

    expect(isAppError(failure) && failure.kind).toBe('auth')
    expect(service.getState()).toEqual({ status: 'disconnected', email: null, hasClient: true })
    expect(keychain.snapshot()[GOOGLE_CALENDAR_AUTH_SECRET]).toBeUndefined()
  })

  it('rejects while not connected', async () => {
    const { service } = createHarness()
    await expect(service.listEvents(range)).rejects.toThrow('not connected')
  })
})

describe('disconnect', () => {
  it('revokes the token and keeps the OAuth client for the next sign-in', async () => {
    const { service, http, keychain } = createHarness({ secrets: connectedSecrets() })
    http.on('POST', GOOGLE_REVOKE_URL, { status: 200 })
    await service.load()
    expect(service.getState().status).toBe('connected')

    await service.disconnect()

    expect(service.getState()).toEqual({ status: 'disconnected', email: null, hasClient: true })
    expect(Object.keys(keychain.snapshot())).toEqual([GOOGLE_CALENDAR_CLIENT_SECRET])
    const revoke = http.requests().find((request) => request.url === GOOGLE_REVOKE_URL)
    expect(new URLSearchParams(revoke?.body ?? '').get('token')).toBe('refresh-1')
  })

  it('forgets the OAuth client on request', async () => {
    const { service, keychain } = createHarness({ secrets: connectedSecrets() })

    await service.forgetClient()

    expect(keychain.snapshot()).toEqual({})
    expect(service.getState()).toEqual({ status: 'disconnected', email: null, hasClient: false })
  })
})
