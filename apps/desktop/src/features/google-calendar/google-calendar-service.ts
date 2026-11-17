import { z, type ZodType } from 'zod'
import { safeParseJson } from '@reflect/utils'
import {
  AppError,
  isAppError,
  type ClockService,
  type HttpService,
  type IpcBridgeService,
  type LoggerService,
  type Unlisten,
} from '@reflect/core'
import {
  calendarListSchema,
  EVENT_FIELDS,
  eventListSchema,
  GOOGLE_CALENDAR_API,
  mergeCalendarEvents,
  toGoogleCalendarEvent,
  visibleCalendars,
  type CalendarListEntry,
  type GoogleApiEvent,
  type GoogleCalendar,
  type GoogleCalendarEvent,
  type TimeSpan,
} from './lib/google-events.ts'
import {
  buildAuthorizeUrl,
  codeExchangeBody,
  createOAuthState,
  createPkcePair,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  googleOAuthClientSchema,
  loopbackRedirectUri,
  parseOAuthCallback,
  refreshBody,
  tokenResponseSchema,
  type GoogleOAuthClient,
  type TokenResponse,
} from './lib/google-oauth.ts'

/**
 * The keychain entry holding the Google tokens (one account per machine).
 */
export const GOOGLE_CALENDAR_AUTH_SECRET = 'google-calendar-auth'

/**
 * The keychain entry holding the user's own OAuth client. Kept apart from the
 * tokens so disconnecting does not make the user paste the client again.
 */
export const GOOGLE_CALENDAR_CLIENT_SECRET = 'google-calendar-oauth-client'

const googleAuthSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Epoch ms when `accessToken` expires. */
  expiresAt: z.number(),
  /** The signed-in account, for display. */
  email: z.string().nullable(),
})

type GoogleAuth = z.infer<typeof googleAuthSchema>

const REFRESH_MARGIN_MS = 5 * 60 * 1000
/** Stops a pagination loop that never ends; far above any real week. */
const MAX_PAGES = 20

const apiErrorSchema = z.object({ error: z.object({ message: z.string() }) })

/**
 * What a {@link GoogleCalendarService} knows of the connection.
 */
export interface GoogleCalendarState {
  /**
   * `loading` until the keychain has been read; `connecting` while the
   * consent page is open in the browser.
   */
  readonly status: 'loading' | 'disconnected' | 'connecting' | 'connected'
  /** The connected account; null when unknown or not connected. */
  readonly email: string | null
  /** Whether an OAuth client is stored, so connecting needs no typing. */
  readonly hasClient: boolean
}

/**
 * The slice of the OS keychain this feature stores its credentials in.
 */
export interface KeychainPort {
  get(name: string): Promise<string | null>
  set(name: string, value: string): Promise<void>
  delete(name: string): Promise<void>
}

/**
 * A read-only Google Calendar connection for the week planner. The user signs
 * in with their own OAuth client; tokens live in the OS keychain, requests go
 * straight to Google, and events are fetched live and never stored.
 */
export interface GoogleCalendarService {
  getState: () => GoogleCalendarState
  /** Called after the state changes. */
  subscribe: (listener: () => void) => Unlisten
  /**
   * Read the stored connection from the keychain. Runs once; later calls
   * share the first read. Never rejects: an unreadable keychain is logged
   * and shows as disconnected.
   */
  load(): Promise<void>
  /**
   * Sign in through the system browser. `client` replaces the stored OAuth
   * client; without it the stored one is used. Resolves `false` when the
   * sign-in was cancelled, and rejects with an {@link AppError} when Google
   * or the user refused it.
   */
  connect(client?: GoogleOAuthClient): Promise<boolean>
  /** Abandon a sign-in that is waiting on the browser. */
  cancelConnect(): Promise<void>
  /** Revoke and forget the tokens. The OAuth client stays stored. */
  disconnect(): Promise<void>
  /** Disconnect and forget the OAuth client as well. */
  forgetClient(): Promise<void>
  /**
   * The displayable events overlapping `range`, from the calendars ticked in
   * Google Calendar, in start order. Rejects with an `auth` {@link AppError}
   * when not connected or the sign-in has lapsed.
   */
  listEvents(range: TimeSpan): Promise<GoogleCalendarEvent[]>
}

export interface GoogleCalendarServiceDeps {
  readonly ipc: IpcBridgeService
  readonly http: HttpService
  readonly clock: ClockService
  readonly logger: LoggerService
  readonly keychain: KeychainPort
  /** Opens the consent page in the system browser. */
  readonly openUrl: (url: string) => Promise<void>
}

class GoogleCalendarServiceImpl implements GoogleCalendarService {
  readonly #deps: GoogleCalendarServiceDeps
  readonly #listeners = new Set<() => void>()
  #state: GoogleCalendarState = { status: 'loading', email: null, hasClient: false }
  #client: GoogleOAuthClient | null = null
  #auth: GoogleAuth | null = null
  #loading: Promise<void> | null = null
  #refreshing: Promise<string> | null = null
  // Bumped by every connect and cancel, so a superseded sign-in changes nothing.
  #attempt = 0

  constructor(deps: GoogleCalendarServiceDeps) {
    this.#deps = deps
  }

  readonly getState = (): GoogleCalendarState => this.#state

  readonly subscribe = (listener: () => void): Unlisten => {
    const deliver = (): void => {
      listener()
    }
    this.#listeners.add(deliver)
    return () => {
      this.#listeners.delete(deliver)
    }
  }

  load(): Promise<void> {
    this.#loading ??= this.#readKeychain()
    return this.#loading
  }

  async connect(client?: GoogleOAuthClient): Promise<boolean> {
    await this.load()
    const chosen = client ?? this.#client
    if (chosen === null) {
      throw new AppError('auth', 'Enter your Google OAuth client ID and secret first.')
    }
    this.#attempt += 1
    const attempt = this.#attempt
    this.#publish({ status: 'connecting' })
    let auth: GoogleAuth | null
    try {
      auth = await this.#authorize(chosen)
    } catch (error: unknown) {
      if (attempt === this.#attempt) {
        this.#publishSettled()
      }
      throw error
    }
    if (attempt !== this.#attempt) {
      return false
    }
    if (auth === null) {
      this.#publishSettled()
      return false
    }
    const { keychain } = this.#deps
    await keychain.set(GOOGLE_CALENDAR_CLIENT_SECRET, JSON.stringify(chosen))
    await keychain.set(GOOGLE_CALENDAR_AUTH_SECRET, JSON.stringify(auth))
    this.#client = chosen
    this.#auth = auth
    this.#publishSettled()
    return true
  }

  async cancelConnect(): Promise<void> {
    this.#attempt += 1
    this.#publishSettled()
    await this.#cancelLoopback()
  }

  async disconnect(): Promise<void> {
    await this.load()
    this.#attempt += 1
    const auth = this.#auth
    const { http, logger } = this.#deps
    await this.#dropAuth()
    if (auth === null) {
      return
    }
    // Best effort: the tokens are already gone from this machine.
    try {
      await http.fetch(GOOGLE_REVOKE_URL, {
        method: 'POST',
        body: new URLSearchParams({ token: auth.refreshToken }),
      })
    } catch (cause: unknown) {
      logger.warn('revoking the Google token failed:', cause)
    }
  }

  async forgetClient(): Promise<void> {
    await this.disconnect()
    await this.#deps.keychain.delete(GOOGLE_CALENDAR_CLIENT_SECRET)
    this.#client = null
    this.#publishSettled()
  }

  async listEvents(range: TimeSpan): Promise<GoogleCalendarEvent[]> {
    const token = await this.#accessToken()
    const calendars = visibleCalendars(await this.#listCalendars(token))
    const perCalendar = await Promise.all(
      calendars.map(async (calendar) => {
        try {
          return await this.#listCalendarEvents(token, calendar, range)
        } catch (error: unknown) {
          // One unreadable calendar (unshared since, deleted) must not blank
          // the whole week.
          if (isAppError(error) && error.kind === 'notFound') {
            this.#deps.logger.warn(`skipping Google calendar "${calendar.title}":`, error)
            return []
          }
          throw error
        }
      }),
    )
    return mergeCalendarEvents(perCalendar)
  }

  async #readKeychain(): Promise<void> {
    const { keychain, logger } = this.#deps
    try {
      const [client, auth] = await Promise.all([
        keychain.get(GOOGLE_CALENDAR_CLIENT_SECRET),
        keychain.get(GOOGLE_CALENDAR_AUTH_SECRET),
      ])
      this.#client = parseStored(client, googleOAuthClientSchema)
      // Tokens are useless without the client that minted them.
      this.#auth = this.#client === null ? null : parseStored(auth, googleAuthSchema)
    } catch (cause: unknown) {
      logger.error('reading the Google Calendar connection failed:', cause)
    }
    this.#publishSettled()
  }

  /**
   * Run the browser sign-in. `null` means it was cancelled or superseded.
   */
  async #authorize(client: GoogleOAuthClient): Promise<GoogleAuth | null> {
    const { ipc, clock, openUrl } = this.#deps
    const port = await ipc.call('oauth_loopback_start', {}, z.number().int().positive())
    const redirectUri = loopbackRedirectUri(port)
    const pkce = await createPkcePair()
    const state = createOAuthState()
    try {
      await openUrl(
        buildAuthorizeUrl({
          clientId: client.clientId,
          redirectUri,
          challenge: pkce.challenge,
          state,
        }),
      )
    } catch (error: unknown) {
      await this.#cancelLoopback()
      throw error
    }
    const query = await ipc.call('oauth_loopback_wait', {}, z.string().nullable())
    if (query === null) {
      return null
    }
    const callback = parseOAuthCallback(query, state)
    if (callback.kind === 'denied') {
      throw new AppError('auth', 'Google sign-in was cancelled.')
    }
    if (callback.kind === 'invalid') {
      throw new AppError('auth', callback.reason)
    }
    const tokens = await this.#requestTokens(
      codeExchangeBody({ client, code: callback.code, verifier: pkce.verifier, redirectUri }),
    )
    if (tokens.access_token === undefined || tokens.refresh_token === undefined) {
      throw new AppError('auth', 'Google returned no refresh token. Try connecting again.')
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: clock.now() + (tokens.expires_in ?? 0) * 1000,
      // Also proves the Calendar API is enabled for the user's project, so a
      // misconfigured client fails here with Google's own explanation.
      email: await this.#fetchEmail(tokens.access_token),
    }
  }

  async #cancelLoopback(): Promise<void> {
    try {
      await this.#deps.ipc.call('oauth_loopback_cancel', {}, z.null())
    } catch (cause: unknown) {
      this.#deps.logger.warn('cancelling the Google sign-in failed:', cause)
    }
  }

  /**
   * POST to the token endpoint. An `invalid_grant` answer is returned for
   * the caller to interpret; every other failure throws.
   */
  async #requestTokens(body: URLSearchParams): Promise<TokenResponse> {
    const response = await this.#deps.http.fetch(GOOGLE_TOKEN_URL, { method: 'POST', body })
    const parsed = tokenResponseSchema.safeParse(safeParseJson(await response.text()))
    if (!parsed.success) {
      throw new AppError('network', `Google sign-in failed (${response.status}).`)
    }
    const tokens = parsed.data
    if (response.ok || tokens.error === 'invalid_grant') {
      return tokens
    }
    if (tokens.error === 'invalid_client') {
      throw new AppError('auth', 'Google rejected the OAuth client ID or secret.')
    }
    const detail = tokens.error_description ?? tokens.error ?? String(response.status)
    throw new AppError(
      response.status >= 500 ? 'network' : 'auth',
      `Google sign-in failed: ${detail}`,
    )
  }

  async #accessToken(): Promise<string> {
    await this.load()
    const auth = this.#auth
    const client = this.#client
    if (auth === null || client === null) {
      throw new AppError('auth', 'Google Calendar is not connected.')
    }
    if (this.#deps.clock.now() < auth.expiresAt - REFRESH_MARGIN_MS) {
      return auth.accessToken
    }
    // Every query of a week asks at once; they share one refresh.
    this.#refreshing ??= this.#refresh(auth, client).finally(() => {
      this.#refreshing = null
    })
    return await this.#refreshing
  }

  async #refresh(auth: GoogleAuth, client: GoogleOAuthClient): Promise<string> {
    const { clock, keychain } = this.#deps
    const tokens = await this.#requestTokens(refreshBody(client, auth.refreshToken))
    if (tokens.access_token === undefined) {
      // `invalid_grant`: the refresh token was revoked or has lapsed.
      if (this.#auth === auth) {
        await this.#dropAuth()
      }
      throw new AppError('auth', 'The Google sign-in has expired. Connect Google Calendar again.')
    }
    const refreshed: GoogleAuth = {
      ...auth,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? auth.refreshToken,
      expiresAt: clock.now() + (tokens.expires_in ?? 0) * 1000,
    }
    // A disconnect or a new sign-in that landed meanwhile has the last word.
    if (this.#auth === auth) {
      this.#auth = refreshed
      await keychain.set(GOOGLE_CALENDAR_AUTH_SECRET, JSON.stringify(refreshed))
    }
    return refreshed.accessToken
  }

  async #fetchEmail(token: string): Promise<string | null> {
    // The primary calendar's id is the account's address, which saves asking
    // for a profile scope just to label the connection.
    const primary = await this.#getJson(
      `${GOOGLE_CALENDAR_API}/calendars/primary?fields=id`,
      token,
      z.object({ id: z.string() }),
    )
    return primary.id.includes('@') ? primary.id : null
  }

  async #listCalendars(token: string): Promise<CalendarListEntry[]> {
    const entries: CalendarListEntry[] = []
    let pageToken: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({ maxResults: '250' })
      if (pageToken !== undefined) {
        params.set('pageToken', pageToken)
      }
      const list = await this.#getJson(
        `${GOOGLE_CALENDAR_API}/users/me/calendarList?${params.toString()}`,
        token,
        calendarListSchema,
      )
      entries.push(...list.items)
      pageToken = list.nextPageToken
      if (pageToken === undefined) {
        break
      }
    }
    return entries
  }

  async #listCalendarEvents(
    token: string,
    calendar: GoogleCalendar,
    range: TimeSpan,
  ): Promise<GoogleCalendarEvent[]> {
    const items: GoogleApiEvent[] = []
    let pageToken: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        timeMin: new Date(range.start).toISOString(),
        timeMax: new Date(range.end).toISOString(),
        // Expands recurring events into their occurrences.
        singleEvents: 'true',
        maxResults: '250',
        fields: EVENT_FIELDS,
      })
      if (pageToken !== undefined) {
        params.set('pageToken', pageToken)
      }
      const list = await this.#getJson(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendar.id)}/events?${params.toString()}`,
        token,
        eventListSchema,
      )
      items.push(...list.items)
      pageToken = list.nextPageToken
      if (pageToken === undefined) {
        break
      }
    }
    return items.flatMap((item) => toGoogleCalendarEvent(item, calendar) ?? [])
  }

  async #getJson<TOutput>(
    url: string,
    token: string,
    schema: ZodType<TOutput, unknown>,
  ): Promise<TOutput> {
    const response = await this.#deps.http.fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    const body: unknown = safeParseJson(await response.text())
    if (response.ok) {
      const parsed = schema.safeParse(body)
      if (!parsed.success) {
        throw new AppError('parse', 'Google Calendar sent a response Reflect could not read.')
      }
      return parsed.data
    }
    const apiError = apiErrorSchema.safeParse(body)
    const detail = apiError.success ? apiError.data.error.message : `status ${response.status}`
    if (response.status === 401) {
      // The token was revoked from the Google account's side.
      if (this.#auth?.accessToken === token) {
        await this.#dropAuth()
      }
      throw new AppError('auth', 'Google no longer accepts this sign-in. Connect again.')
    }
    if (response.status === 403 || response.status === 404) {
      throw new AppError('notFound', `Google Calendar refused the request: ${detail}`)
    }
    throw new AppError('network', `Google Calendar request failed: ${detail}`)
  }

  async #dropAuth(): Promise<void> {
    this.#auth = null
    this.#publishSettled()
    await this.#deps.keychain.delete(GOOGLE_CALENDAR_AUTH_SECRET)
  }

  /**
   * Publish the state the stored connection implies, ending any `loading`
   * or `connecting`.
   */
  #publishSettled(): void {
    this.#publish({ status: this.#auth === null ? 'disconnected' : 'connected' })
  }

  #publish(change: Pick<GoogleCalendarState, 'status'>): void {
    const next: GoogleCalendarState = {
      status: change.status,
      email: this.#auth?.email ?? null,
      hasClient: this.#client !== null,
    }
    const current = this.#state
    if (
      current.status === next.status &&
      current.email === next.email &&
      current.hasClient === next.hasClient
    ) {
      return
    }
    this.#state = next
    for (const listener of this.#listeners) {
      listener()
    }
  }
}

function parseStored<TOutput>(
  raw: string | null,
  schema: ZodType<TOutput, unknown>,
): TOutput | null {
  if (raw === null) {
    return null
  }
  const parsed = schema.safeParse(safeParseJson(raw))
  return parsed.success ? parsed.data : null
}

export function createGoogleCalendarService(
  deps: GoogleCalendarServiceDeps,
): GoogleCalendarService {
  return new GoogleCalendarServiceImpl(deps)
}
