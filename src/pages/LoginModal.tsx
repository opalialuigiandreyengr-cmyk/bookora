import { FormEvent, useEffect, useState } from "react"
import { Eye, EyeOff, LockKeyhole, Mail, X, Loader2, ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { hasSupabaseConfig, supabase } from "@/lib/supabase"

interface LoginModalProps {
  onClose: () => void
  onSwitchToSignup?: () => void
}

export function LoginModal({ onClose, onSwitchToSignup }: LoginModalProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle")
  const [message, setMessage] = useState("")
  const [isResetView, setIsResetView] = useState(false)

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && status !== "loading") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, status])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      setStatus("error")
      setMessage("Connect Supabase first by adding your environment variables.")
      return
    }

    setStatus("loading")
    setMessage("")

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setStatus("error")
      setMessage(error.message)
    } else {
      setStatus("success")
      setMessage("Signed in successfully! Opening your workspace…")
      window.setTimeout(() => {
        onClose()
      }, 500)
    }
  }

  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      setStatus("error")
      setMessage("Connect Supabase first by adding your environment variables.")
      return
    }

    setStatus("loading")
    setMessage("")

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/settings`,
    })

    if (error) {
      setStatus("error")
      setMessage(error.message)
    } else {
      setStatus("success")
      setMessage("Password reset email sent! Please check your inbox.")
    }
  }

  const oauth = async (provider: "google" | "apple") => {
    if (!supabase) {
      setStatus("error")
      setMessage("Connect Supabase first by adding your environment variables.")
      return
    }
    setStatus("loading")
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) {
      setStatus("error")
      setMessage(error.message)
    }
  }

  return (
    <div
      className="login-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && status !== "loading") {
          onClose()
        }
      }}
    >
      <section
        className="login-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        <button
          className="login-modal-close"
          type="button"
          aria-label="Close login modal"
          onClick={onClose}
          disabled={status === "loading"}
        >
          <X />
        </button>

        {isResetView ? (
          <div>
            <div className="login-modal-header">
              <div className="login-modal-icon">
                <LockKeyhole />
              </div>
              <p className="eyebrow">
                <span>Account Recovery</span>
              </p>
              <h2 id="login-modal-title">Reset your password</h2>
              <p className="login-modal-subtitle">
                Enter your registered email and we’ll send you a password reset link.
              </p>
            </div>

            <form onSubmit={handleForgotPassword} className="login-modal-form">
              <Field className="icon-field">
                <FieldLabel htmlFor="modal-reset-email">Email address</FieldLabel>
                <div className="input-shell">
                  <Mail aria-hidden="true" />
                  <Input
                    id="modal-reset-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </Field>

              <Button
                className="wide-button"
                size="lg"
                type="submit"
                disabled={status === "loading"}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    <span>Sending reset link…</span>
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>

              {(status === "error" || status === "success") && (
                <p
                  className={status === "error" ? "auth-error" : "auth-success-banner"}
                  role={status === "error" ? "alert" : "status"}
                >
                  {status === "success" && <CheckCircle2 className="inline-icon" />}
                  {message}
                </p>
              )}

              <button
                type="button"
                className="login-back-button"
                onClick={() => {
                  setIsResetView(false)
                  setMessage("")
                  setStatus("idle")
                }}
              >
                ← Back to login
              </button>
            </form>
          </div>
        ) : (
          <div>
            <div className="login-modal-header">
              <div className="login-modal-icon">
                <LockKeyhole />
              </div>
              <p className="eyebrow">
                <span>Welcome back</span>
              </p>
              <h2 id="login-modal-title">Sign in to Bookora</h2>
              <p className="login-modal-subtitle">
                Access your schedule, staff, and bookings.
              </p>
            </div>

            <form onSubmit={handleLogin} className="login-modal-form">
              <FieldGroup>
                <Field className="icon-field">
                  <FieldLabel htmlFor="modal-login-email">Email address</FieldLabel>
                  <div className="input-shell">
                    <Mail aria-hidden="true" />
                    <Input
                      id="modal-login-email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                </Field>

                <Field className="icon-field">
                  <div className="field-label-row">
                    <FieldLabel htmlFor="modal-login-password">Password</FieldLabel>
                    <button
                      type="button"
                      className="forgot-password-link"
                      onClick={() => {
                        setIsResetView(true)
                        setMessage("")
                        setStatus("idle")
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="input-shell">
                    <LockKeyhole aria-hidden="true" />
                    <Input
                      id="modal-login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() => setShowPassword((val) => !val)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </Field>
              </FieldGroup>

              <Button
                className="wide-button"
                size="lg"
                type="submit"
                disabled={status === "loading"}
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  "Sign in to account"
                )}
              </Button>

              {(status === "error" || status === "success") && (
                <p
                  className={status === "error" ? "auth-error" : "auth-success-banner"}
                  role={status === "error" ? "alert" : "status"}
                >
                  {status === "success" && <CheckCircle2 className="inline-icon" />}
                  {message}
                </p>
              )}

              <div className="or-row">
                <Separator />
                <span>or continue with</span>
                <Separator />
              </div>

              <div className="social-buttons">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => oauth("google")}
                  disabled={status === "loading"}
                >
                  <img
                    className="social-logo"
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt=""
                  />
                  Continue with Google
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => oauth("apple")}
                  disabled={status === "loading"}
                >
                  <img
                    className="social-logo"
                    src="https://cdn.simpleicons.org/apple/111827"
                    alt=""
                  />
                  Continue with Apple
                </Button>
              </div>

              <p className="modal-switcher">
                Don’t have an account yet?{" "}
                <button
                  type="button"
                  className="modal-switch-action"
                  onClick={() => {
                    onClose()
                    onSwitchToSignup?.()
                  }}
                >
                  Create free account <ArrowRight className="inline-arrow" />
                </button>
              </p>
            </form>
          </div>
        )}
      </section>
    </div>
  )
}
