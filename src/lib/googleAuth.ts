// Deprecated: Google One-Tap has been replaced with direct Supabase OAuth redirect.
// Standard OAuth uses the Google Console redirect URI and avoids double account selection dialogs.

export async function signInWithGoogle(): Promise<void> {
  console.warn("signInWithGoogle (One-Tap) is deprecated. Use supabase.auth.signInWithOAuth instead.")
}
