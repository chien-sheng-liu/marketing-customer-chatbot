/**
 * tokenStore — in-memory access token storage.
 *
 * The access token is NEVER written to localStorage or sessionStorage.
 * It lives only in this module's closure and is cleared on page reload,
 * which is the expected behaviour (the refresh token in the httpOnly
 * cookie will re-issue a new access token on next load).
 */

let _accessToken: string | null = null;

export const tokenStore = {
  get: (): string | null => _accessToken,
  set: (token: string | null): void => { _accessToken = token; },
  clear: (): void => { _accessToken = null; },
};
