# Bookora PH mobile app

Native iOS and Android owner workspace built with Expo SDK 58, React Native, Expo Router, and Supabase.

## Included workflows

- Mobile overview with live business metrics
- Day and week appointment agenda
- Appointment search, approval, completion, and cancellation
- Client search and native add-client sheet
- Mobile payment ledger and record-payment sheet
- Service visibility management
- Account, connection, and session settings
- Required Supabase authentication with no local mock-data fallback
- Space Grotesk typography across native screens

## Run locally

1. Copy `.env.example` to `.env`.
2. Add the same Supabase project URL and publishable/anon client key used by the web app. The app will not enter the owner workspace without a valid Supabase session.
3. Install dependencies with `npm install`.
4. Start with `npx expo start`.
5. Scan the QR code with Expo Go, or press `a` for Android / `i` for iOS.

The mobile client expects these public variables:

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

The existing Supabase Row Level Security policies remain the security boundary. The app scopes reads and writes to the authenticated business ID, matching the web app.

## Native authentication redirects

Add `bookoraph://auth/callback` to **Supabase Dashboard > Authentication > URL Configuration > Redirect URLs**. Both Google sign-in and password recovery return to this route. A successful Google sign-in creates the Supabase session and opens the app dashboard.

To enable Google sign-in:

1. Create a **Web application** OAuth client in Google Auth Platform.
2. Add the Supabase callback URL shown in **Supabase Dashboard > Authentication > Sign In / Providers > Google** to the Google client's **Authorized redirect URIs**. It has the form `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Add that Google Client ID and Client Secret to the Supabase Google provider and enable it.
4. Keep `bookoraph://auth/callback` in the Supabase redirect URL allowlist.

Test Google sign-in in a development or production build, not Expo Go. The custom `bookoraph://` scheme and the `expo-web-browser` native configuration require an installed app build.

## Production builds

Configure an Expo Application Services project, then build with `npx eas-cli@latest build --platform android` or `npx eas-cli@latest build --platform ios`. The configured identifiers are `com.bookoraph.app` for both platforms.
