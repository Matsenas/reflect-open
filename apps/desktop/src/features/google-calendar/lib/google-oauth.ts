import { z } from 'zod'

/**
 * Google's OAuth for installed apps: the consent page opens in the system
 * browser and redirects to a loopback address, with PKCE binding the code to
 * this sign-in. Everything here is pure; the flow itself is
 * `GoogleCalendarService.connect`.
 */

/**
 * Read-only access to calendars and their events: the only scope requested.
 */
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

/**
 * The user's own OAuth client (type "Desktop app") from Google Cloud Console.
 * Reflect ships no client of its own, so nothing is proxied or shared. Google
 * does not treat a desktop client's secret as confidential, but it still
 * requires it at the token endpoint.
 */
export interface GoogleOAuthClient {
  readonly clientId: string
  readonly clientSecret: string
}

export const googleOAuthClientSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
})

export interface PkcePair {
  readonly verifier: string
  readonly challenge: string
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function randomToken(byteLength: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

/**
 * A fresh PKCE verifier and its S256 challenge.
 */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomToken(48)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

/**
 * An unguessable `state` value tying a redirect to the sign-in that began it.
 */
export function createOAuthState(): string {
  return randomToken(24)
}

/**
 * The redirect URI for a loopback listener on `port`. Google accepts any port
 * on `127.0.0.1` for a desktop client without registering it.
 */
export function loopbackRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}`
}

export interface AuthorizeUrlOptions {
  readonly clientId: string
  readonly redirectUri: string
  readonly challenge: string
  readonly state: string
}

/**
 * The consent page URL. `access_type=offline` with `prompt=consent` makes
 * Google return a refresh token on every sign-in, not only the first.
 */
export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    code_challenge: options.challenge,
    code_challenge_method: 'S256',
    state: options.state,
    access_type: 'offline',
    prompt: 'consent',
  }).toString()
  return url.href
}

export type OAuthCallback =
  | { readonly kind: 'code'; readonly code: string }
  /** The user declined on the consent page. */
  | { readonly kind: 'denied' }
  | { readonly kind: 'invalid'; readonly reason: string }

/**
 * Read the redirect's query string. A redirect whose `state` is not this
 * sign-in's is rejected before its code is looked at.
 */
export function parseOAuthCallback(query: string, expectedState: string): OAuthCallback {
  const params = new URLSearchParams(query)
  if (params.get('state') !== expectedState) {
    return { kind: 'invalid', reason: 'The sign-in response did not match this request.' }
  }
  const error = params.get('error')
  if (error === 'access_denied') {
    return { kind: 'denied' }
  }
  if (error !== null) {
    return { kind: 'invalid', reason: `Google refused the sign-in (${error}).` }
  }
  const code = params.get('code')
  if (code === null || code === '') {
    return { kind: 'invalid', reason: 'The sign-in response carried no authorization code.' }
  }
  return { kind: 'code', code }
}

/**
 * The token endpoint's answer, to a code exchange or a refresh. Errors come
 * back in the same shape with `error` set.
 */
export const tokenResponseSchema = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
})

export type TokenResponse = z.infer<typeof tokenResponseSchema>

export interface CodeExchangeOptions {
  readonly client: GoogleOAuthClient
  readonly code: string
  readonly verifier: string
  readonly redirectUri: string
}

/**
 * The form body that trades an authorization code for tokens.
 */
export function codeExchangeBody(options: CodeExchangeOptions): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.code,
    code_verifier: options.verifier,
    redirect_uri: options.redirectUri,
    client_id: options.client.clientId,
    client_secret: options.client.clientSecret,
  })
}

/**
 * The form body that trades a refresh token for a new access token.
 */
export function refreshBody(client: GoogleOAuthClient, refreshToken: string): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: client.clientId,
    client_secret: client.clientSecret,
  })
}
