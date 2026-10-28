import { FormEvent, useState } from "react"
import { ArrowRight, BarChart3, CalendarDays, Eye, EyeOff, Loader2, LockKeyhole, Mail, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { hasSupabaseConfig, supabase } from "@/lib/supabase"
import { clearCrossSubdomainCookie } from "@/lib/domain"

export function AuthCard({
  mode,
  setMode,
}: {
  mode: "signup" | "login"
  setMode: (m: "signup" | "login") => void
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle")
  const [loadingProvider, setLoadingProvider] = useState<"google" | "email" | null>(null)
  const [message, setMessage] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const isLogin = mode === "login"

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      setStatus("error")
      setLoadingProvider(null)
      setMessage("Connect Supabase first by adding your environment variables.")
      return
    }
    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "").trim()
    const password = String(form.get("password") ?? "")

    setLoadingProvider("email")
    setStatus("loading")
    setMessage("")

    if (isLogin) {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setStatus("error")
        setLoadingProvider(null)
        setMessage(error.message)
      } else {
        const loggedUser = signInData.user
        const isRootDomain = ["bookoraph.com", "www.bookoraph.com", "bookora.com", "www.bookora.com"].includes(
          window.location.hostname
        )
        if (isRootDomain) {
          clearCrossSubdomainCookie("bookora_client_slug")
          clearCrossSubdomainCookie("bookora_client_return")
          setStatus("success")
          setMessage("Signed in successfully! Opening your workspace…")
          window.setTimeout(() => {
            window.location.href = "/dashboard"
          }, 300)
          return
        }
        const isClient = Boolean(
          !isRootDomain &&
            (loggedUser?.user_metadata?.account_type === "client" ||
              loggedUser?.user_metadata?.role === "client" ||
              loggedUser?.user_metadata?.client_slug)
        )
        if (isClient) {
          const clientSlug = loggedUser.user_metadata?.client_slug
          const busName = loggedUser.user_metadata?.client_business_name || clientSlug || "your studio"
          setStatus("success")
          setMessage(`Signed in as a client of ${busName}! Taking you to your booking page…`)
          window.setTimeout(() => {
            const target = clientSlug ? `/book?slug=${encodeURIComponent(clientSlug)}` : "/book"
            window.location.href = target
          }, 800)
          return
        }
        setStatus("success")
        setMessage("Signed in successfully! Loading your workspace…")
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding`,
          data: {
            account_type: "business",
            role: "business",
          },
        },
      })
      if (error) {
        setStatus("error")
        setLoadingProvider(null)
        setMessage(error.message)
      } else {
        setStatus("success")
        setMessage(data.session ? "Your account is ready." : "Check your email to confirm your account.")
      }
    }
  }

  const oauthGoogle = async () => {
    if (!supabase) {
      setStatus("error")
      setLoadingProvider(null)
      setMessage("Connect Supabase first by adding your environment variables.")
      return
    }
    setLoadingProvider("google")
    setStatus("loading")
    setMessage("")

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      })
      if (error) {
        setStatus("error")
        setLoadingProvider(null)
        setMessage(error.message)
      }
    } catch (err: any) {
      setStatus("error")
      setLoadingProvider(null)
      setMessage(err?.message || "Google sign-in failed.")
    }
  }

  return (
    <div className="signup-ref-form-box" id="signup">
      {status === "loading" && loadingProvider && (
        <div className="signup-card-loading-overlay">
          <div className="customer-modal-loading-card">
            <div className="customer-modal-spinner-wrap">
              <Loader2 size={32} className="animate-spin customer-modal-spinner" />
            </div>
            <h3>
              {loadingProvider === "google"
                ? "Connecting to Google"
                : isLogin
                ? "Signing in"
                : "Creating your account"}
            </h3>
            <p>
              {loadingProvider === "google"
                ? "Please wait while we connect your Google account…"
                : "Please wait a moment while we process your request…"}
            </p>
            <button
              type="button"
              className="customer-modal-loading-cancel"
              onClick={() => {
                setStatus("idle")
                setLoadingProvider(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="signup-ref-kicker">{isLogin ? "WELCOME BACK" : "GET STARTED"}</p>
      <h2 className="signup-ref-title">{isLogin ? "Sign in to your account" : "Create your free account"}</h2>
      <p className="signup-ref-subtitle">
        {isLogin ? "Sign in to manage your appointments and salon." : "Start accepting client bookings in minutes."}
      </p>

      <form className="signup-ref-form" onSubmit={submit}>
        <div className="signup-ref-field">
          <label htmlFor="hero-email">Email address</label>
          <div className="signup-ref-input-wrap">
            <Mail size={18} aria-hidden="true" className="signup-ref-input-icon" />
            <input
              id="hero-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="signup-ref-field">
          <label htmlFor="hero-password">Password</label>
          <div className="signup-ref-input-wrap">
            <LockKeyhole size={18} aria-hidden="true" className="signup-ref-input-icon" />
            <input
              id="hero-password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder={isLogin ? "Enter your password" : "At least 8 characters"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? 1 : 8}
              required
            />
            <button
              className="signup-ref-eye-btn"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button className="signup-ref-submit-btn" type="submit" disabled={status === "loading"}>
          {status === "loading" && loadingProvider === "email" ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>{isLogin ? "Signing in…" : "Creating account…"}</span>
            </>
          ) : (
            <>
              <span>{isLogin ? "Sign in to account" : "Create free account"}</span>
              <ArrowRight size={18} className="signup-ref-submit-arrow" />
            </>
          )}
        </button>

        {(status === "error" || status === "success") && (
          <p className={status === "error" ? "auth-error" : "auth-note"} role={status === "error" ? "alert" : "status"}>
            {message}
          </p>
        )}

        <div className="signup-ref-or">
          <span />
          <em>or continue with</em>
          <span />
        </div>

        <div className="signup-ref-socials">
          <button
            type="button"
            className="signup-ref-social-btn"
            onClick={oauthGoogle}
            disabled={status === "loading"}
          >
            {status === "loading" && loadingProvider === "google" ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Connecting to Google…</span>
              </>
            ) : (
              <>
                <img
                  className="signup-ref-social-icon"
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt=""
                />
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>

        <div className="signup-ref-footer">
          {isLogin ? (
            <p className="signup-ref-switch">
              Don’t have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup")
                  setMessage("")
                  setStatus("idle")
                }}
              >
                Create free account
              </button>
            </p>
          ) : (
            <p className="signup-ref-switch">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login")
                  setMessage("")
                  setStatus("idle")
                }}
              >
                Log in
              </button>
            </p>
          )}

          <p className="signup-ref-terms">
            By creating an account, you agree to our <a href="#terms">Terms of Service</a>
            <br />
            and <a href="#privacy">Privacy Policy</a>.
          </p>

          {!hasSupabaseConfig && (
            <p className="auth-note" style={{ textAlign: "left", marginTop: 6 }}>
              OAuth is ready once Supabase environment variables are added.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

export function SignupPage() {
  const initialMode = new URLSearchParams(window.location.search).get("mode") === "login" ? "login" : "signup"
  const [authMode, setAuthMode] = useState<"signup" | "login">(initialMode)

  return (
    <div className="signup-ref-shell">
      <main className="signup-ref-page">
        <div className="signup-ref-card">
          {/* Left Marketing & Salon Visual Panel */}
          <section className="signup-ref-left" aria-label="Bookora platform highlights">
            <div className="signup-ref-left-content">
              <a href="/" className="signup-ref-brand" aria-label="Bookora home">
                <img className="signup-ref-brand-logo" src="/assets/bookora-logo.png" alt="" />
                <span className="signup-ref-brand-text">
                  Book<span>ora</span>
                </span>
              </a>

              <div className="signup-ref-hero-copy">
                <h1>
                  Grow your <br />
                  beauty business <br />
                  <span>effortlessly</span>
                </h1>
                <p>
                  Manage bookings, clients, and payments <br />
                  all in one simple platform.
                </p>
              </div>

              <ul className="signup-ref-features">
                <li>
                  <span className="signup-ref-feature-icon">
                    <CalendarDays size={20} />
                  </span>
                  <div>
                    <strong>Accept online bookings</strong>
                    <span>Let clients book 24/7</span>
                  </div>
                </li>
                <li>
                  <span className="signup-ref-feature-icon">
                    <Users size={20} />
                  </span>
                  <div>
                    <strong>Manage your clients</strong>
                    <span>Keep everything organized</span>
                  </div>
                </li>
                <li>
                  <span className="signup-ref-feature-icon">
                    <BarChart3 size={20} />
                  </span>
                  <div>
                    <strong>Grow your business</strong>
                    <span>More bookings, less hassle</span>
                  </div>
                </li>
              </ul>

              <blockquote className="signup-ref-testimonial">
                <span className="signup-ref-quote-mark" aria-hidden="true">
                  “
                </span>
                <div className="signup-ref-quote-body">
                  <p>“Bookora made it so easy for my clients to book online. My schedule is always full!”</p>
                  <footer>– Sarah L., Salon Owner</footer>
                </div>
              </blockquote>
            </div>
          </section>

          {/* Right Form Panel */}
          <section className="signup-ref-right">
            <div className="signup-ref-topbar">
              <a href="/" className="signup-ref-mobile-brand" aria-label="Bookora home">
                <img className="signup-ref-brand-logo" src="/assets/bookora-logo.png" alt="" />
                <span className="signup-ref-brand-text">
                  Book<span>ora</span>
                </span>
              </a>
              <button
                type="button"
                className="signup-ref-back-link"
                onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
              >
                <span>{authMode === "login" ? "Create account" : "Log in"}</span>
              </button>
            </div>

            <div className="signup-ref-right-body">
              <AuthCard mode={authMode} setMode={setAuthMode} />
            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-main">
          <div className="footer-brand-block">
            <a href="/" className="footer-brand">
              Book<span>ora</span>
            </a>
            <p>Simple booking for modern beauty businesses.</p>
          </div>
          <div className="footer-links">
            <span>Explore Bookora</span>
            <nav aria-label="Footer navigation">
              <a href="/#features">Features</a>
              <a href="/#solutions">Solutions</a>
              <a href="/#pricing">Pricing</a>
            </nav>
          </div>
          <div className="footer-newsletter">
            <span>Stay in the loop</span>
            <p>Tips and ideas for a fuller salon calendar.</p>
            <form onSubmit={(event) => event.preventDefault()}>
              <input type="email" aria-label="Email address" placeholder="Your email address" required />
              <Button type="submit">Subscribe</Button>
            </form>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Bookora</span>
          <span>Built for beauty businesses</span>
        </div>
      </footer>
    </div>
  )
}
