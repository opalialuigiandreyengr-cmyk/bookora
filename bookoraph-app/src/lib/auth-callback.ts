import * as ExpoLinking from 'expo-linking';

export type OAuthSignInResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type AuthCallbackValues = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  mode: string | null;
  type: string | null;
};

export function createAuthCallbackUrl(queryParams?: Record<string, string>) {
  return ExpoLinking.createURL('auth/callback', {
    scheme: 'bookoraph',
    queryParams,
  });
}

export function parseAuthCallbackUrl(url: string | null): AuthCallbackValues {
  const values = new URLSearchParams();

  if (url) {
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
    const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';

    new URLSearchParams(query).forEach((value, key) => values.set(key, value));
    new URLSearchParams(hash).forEach((value, key) => values.set(key, value));
  }

  return {
    accessToken: values.get('access_token'),
    refreshToken: values.get('refresh_token'),
    code: values.get('code'),
    error: values.get('error'),
    errorDescription: values.get('error_description'),
    mode: values.get('mode'),
    type: values.get('type'),
  };
}
