export const authStorage =
  typeof window !== 'undefined' && window.localStorage
    ? window.localStorage
    : undefined;
