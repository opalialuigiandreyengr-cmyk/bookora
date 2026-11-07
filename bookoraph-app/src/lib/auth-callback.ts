import * as ExpoLinking from 'expo-linking';
import { Platform } from 'react-native';

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
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const url = new URL('/app/auth/callback', window.location.origin);
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    return url.toString();
  }
  return ExpoLinking.createURL('auth/callback', {
    scheme: 'bookoraph',
    queryParams,
  });
}

export function parseAuthCallbackUrl(url: string | null): AuthCallbackValues {
  const values = new URLSearchParams();
  const effectiveUrl =
    Platform.OS === 'web' && typeof window !== 'undefined' && (!url || !url.includes('#'))
      ? window.location.href
      : url;

  if (effectiveUrl) {
    const query = effectiveUrl.includes('?') ? effectiveUrl.slice(effectiveUrl.indexOf('?') + 1).split('#')[0] : '';
    const hash = effectiveUrl.includes('#') ? effectiveUrl.slice(effectiveUrl.indexOf('#') + 1) : '';

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
