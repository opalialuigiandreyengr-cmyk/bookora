import { supabase } from "@/lib/supabase"

type GoogleCredentialResponse = { credential: string }

type GoogleAccounts = {
  id: {
    initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }) => void
    prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; isDismissedMoment: () => boolean; getNotDisplayedReason?: () => string; getSkippedReason?: () => string }) => void) => void
  }
}

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts }
  }
}

let scriptPromise: Promise<void> | null = null

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]')
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Unable to load Google sign-in.")), { once: true })
      return
    }
    const script = document.createElement("script")
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Unable to load Google sign-in."))
    document.head.appendChild(script)
  })
  return scriptPromise
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error("Connect Supabase first by adding your environment variables.")
  const client = supabase
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error("Google sign-in is not configured yet.")

  await loadGoogleIdentityScript()
  if (!window.google?.accounts?.id) throw new Error("Google sign-in is unavailable. Please try again.")

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Google sign-in timed out. Please try standard login."))
    }, 15000)

    try {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        cancel_on_tap_outside: true,
        callback: async (response) => {
          clearTimeout(timer)
          if (!response.credential) {
            reject(new Error("Google did not return a sign-in credential."))
            return
          }
          const { error } = await client.auth.signInWithIdToken({ provider: "google", token: response.credential })
          if (error) reject(error)
          else resolve()
        },
      })
      window.google?.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          clearTimeout(timer)
          reject(new Error("Google One-Tap unavailable: " + (notification.getNotDisplayedReason?.() || notification.getSkippedReason?.() || "skipped")))
        } else if (notification.isDismissedMoment()) {
          clearTimeout(timer)
          reject(new Error("Google sign-in was dismissed."))
        }
      })
    } catch (err) {
      clearTimeout(timer)
      reject(err)
    }
  })
}
