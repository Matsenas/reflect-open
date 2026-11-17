import { describe, expect, it } from 'vitest'
import {
  buildAuthorizeUrl,
  codeExchangeBody,
  createPkcePair,
  GOOGLE_CALENDAR_SCOPES,
  grantsEventWrites,
  loopbackRedirectUri,
  parseOAuthCallback,
} from './google-oauth.ts'

describe('createPkcePair', () => {
  it('derives an unpadded base64url S256 challenge from the verifier', async () => {
    const pair = await createPkcePair()
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pair.verifier))
    const expected = Buffer.from(digest).toString('base64url')
    expect(pair.challenge).toBe(expected)
    expect(pair.verifier).toMatch(/^[\w-]{43,128}$/)
  })
})

describe('buildAuthorizeUrl', () => {
  it('asks to read calendars and edit events, with offline refresh', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'client.apps.googleusercontent.com',
        redirectUri: loopbackRedirectUri(51234),
        challenge: 'challenge',
        state: 'state-1',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client.apps.googleusercontent.com',
      redirect_uri: 'http://127.0.0.1:51234',
      response_type: 'code',
      scope: GOOGLE_CALENDAR_SCOPES,
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
      state: 'state-1',
      access_type: 'offline',
      prompt: 'consent',
    })
  })
})

describe('grantsEventWrites', () => {
  it('is true only when the events scope was granted', () => {
    expect(grantsEventWrites(GOOGLE_CALENDAR_SCOPES)).toBe(true)
    expect(grantsEventWrites('https://www.googleapis.com/auth/calendar.readonly')).toBe(false)
    expect(grantsEventWrites('')).toBe(false)
  })
})

describe('parseOAuthCallback', () => {
  it('reads the code of a matching redirect', () => {
    expect(parseOAuthCallback('state=s1&code=4%2Fabc&scope=x', 's1')).toEqual({
      kind: 'code',
      code: '4/abc',
    })
  })

  it('rejects a redirect from another sign-in before reading its code', () => {
    expect(parseOAuthCallback('state=other&code=4%2Fabc', 's1').kind).toBe('invalid')
  })

  it('tells a declined consent from other failures', () => {
    expect(parseOAuthCallback('error=access_denied&state=s1', 's1')).toEqual({ kind: 'denied' })
    expect(parseOAuthCallback('error=server_error&state=s1', 's1').kind).toBe('invalid')
    expect(parseOAuthCallback('state=s1', 's1').kind).toBe('invalid')
  })
})

describe('codeExchangeBody', () => {
  it('sends the verifier and the same redirect URI the consent used', () => {
    const body = codeExchangeBody({
      client: { clientId: 'id', clientSecret: 'secret' },
      code: 'code-1',
      verifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:51234',
    })
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      code_verifier: 'verifier-1',
      redirect_uri: 'http://127.0.0.1:51234',
      client_id: 'id',
      client_secret: 'secret',
    })
  })
})
