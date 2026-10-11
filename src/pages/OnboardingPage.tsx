import { FormEvent, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { Logo } from "@/components/brand/Logo"

export function OnboardingPage({ user, onComplete }: { user: User; onComplete: () => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [error, setError] = useState("")
  const [brandName, setBrandName] = useState(String(user.user_metadata?.business_name ?? ""))
  const [industry, setIndustry] = useState("")
  const [phone, setPhone] = useState("")
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila")
  const [currency, setCurrency] = useState("PHP")

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setStatus("loading"); setError("")
    const { error: updateError } = await supabase.auth.updateUser({ data: step === 1 ? { business_name: brandName.trim(), industry, phone: phone.trim() } : { time_zone: timeZone, currency, onboarding_complete: true } })
    if (updateError) { setStatus("error"); setError(updateError.message); return }
    if (step === 1) { setStatus("idle"); setStep(2) } else onComplete()
  }

  return <main className="onboarding-page"><div className="onboarding-brand"><Logo /></div><Card className="onboarding-card"><CardHeader><CardTitle>{step === 1 ? "Let’s start with your brand" : "Confirm your time zone and currency"}</CardTitle><CardDescription>{step === 1 ? "Tell us a little about your business so we can make Bookora feel like yours." : "We’ll use these settings for your calendar, booking times, and payment reporting."}</CardDescription></CardHeader><CardContent><form className="onboarding-form" onSubmit={submit}>{step === 1 ? <FieldGroup><Field><FieldLabel htmlFor="brand-name">Brand name</FieldLabel><Input id="brand-name" value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="e.g. Glow Studio" required /></Field><Field><FieldLabel htmlFor="industry">Industry</FieldLabel><select id="industry" value={industry} onChange={(event) => setIndustry(event.target.value)} required><option value="" disabled>Select your industry</option><option value="nail-salon">Nail salon</option><option value="hair-salon">Hair salon</option><option value="barbershop">Barbershop</option><option value="facial-spa">Facial &amp; spa</option><option value="makeup-studio">Makeup studio</option><option value="beauty-clinic">Beauty clinic</option></select></Field><Field><FieldLabel htmlFor="phone">Phone number</FieldLabel><Input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. +63 917 123 4567" required /></Field></FieldGroup> : <FieldGroup><Field><FieldLabel htmlFor="time-zone">Time zone</FieldLabel><select id="time-zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required><option value="Asia/Manila">Philippine Time (GMT+8)</option><option value="Asia/Singapore">Singapore Time (GMT+8)</option><option value="Asia/Tokyo">Japan Time (GMT+9)</option><option value="America/Los_Angeles">Pacific Time (US)</option></select></Field><Field><FieldLabel htmlFor="currency">Currency</FieldLabel><select id="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} required><option value="PHP">Philippine Peso (₱ PHP)</option><option value="USD">US Dollar ($ USD)</option><option value="SGD">Singapore Dollar ($ SGD)</option></select></Field></FieldGroup>}{status === "error" && <p className="auth-error" role="alert">{error}</p>}<div className="onboarding-actions">{step === 2 && <Button variant="outline" size="lg" type="button" onClick={() => { setStep(1); setStatus("idle"); setError("") }}>Back</Button>}<Button className="onboarding-submit" size="lg" type="submit" disabled={status === "loading"}>{status === "loading" ? "Saving…" : step === 1 ? "Continue" : "Finish setup"} <ArrowRight data-icon="inline-end" /></Button></div></form></CardContent></Card><p className="onboarding-footnote">You can update these details later in Settings.</p></main>
}
