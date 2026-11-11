import { useCallback, useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { ArrowUpRight, Check, CreditCard, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OwnerStatusBadge } from "@/components/owner/OwnerDataPrimitives"
import { showToast } from "@/components/ui/toast"
import { supabase } from "@/lib/supabase"
import {
  fetchMySubscription,
  fetchSubscriptionPlans,
  type OwnerSubscriptionInfo,
  type SubscriptionPlanRow,
} from "@/lib/admin"

const formatCurrency = (amount: number) =>
  `₱${Number(amount ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`

const calculateCheckoutTotal = (basePhp: number) => {
  const clean = Math.max(0, Math.round(Number(basePhp || 0)))
  if (clean <= 0) return { basePhp: 0, feePhp: 0, totalPhp: 0 }
  const totalPhp = Math.ceil((clean + 30) / 0.92)
  return { basePhp: clean, feePhp: Math.max(0, totalPhp - clean), totalPhp }
}

export function BillingSettings({ user }: { user: User }) {
  const [subscription, setSubscription] = useState<OwnerSubscriptionInfo | null>(null)
  const [plans, setPlans] = useState<SubscriptionPlanRow[]>([])
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly")
  const [loading, setLoading] = useState(true)
  const [upgradingCode, setUpgradingCode] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [paywallNotice, setPaywallNotice] = useState("")

  const reloadBilling = useCallback(async () => {
    setLoading(true)
    try {
      const [mySub, publicPlans] = await Promise.all([
        fetchMySubscription(),
        fetchSubscriptionPlans(false),
      ])
      setSubscription(mySub)
      setPlans(publicPlans.filter((p) => p.is_public))
    } catch {
      // Ignore if preview user
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadBilling()
  }, [reloadBilling, user.id])

  useEffect(() => {
    if (!supabase || user.id === "preview-user-123") return
    const params = new URLSearchParams(window.location.search)
    const checkoutStatus = params.get("checkout_status") || params.get("xendit_status")
    const externalId = params.get("external_id") || undefined
    if (!checkoutStatus) return

    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`
    window.history.replaceState({}, "", cleanUrl)

    if (checkoutStatus === "failed") {
      showToast("Checkout was not completed.", "error")
      return
    }

    const verify = async () => {
      setVerifying(true)
      try {
        const { data, error } = await supabase!.functions.invoke("lemonsqueezy-create-checkout", {
          body: { action: "verify", external_id: externalId },
        })
        if (error) return
        if (data?.verified || data?.status === "paid") {
          showToast(data?.message || "Payment confirmed! Subscription activated.", "success")
          await reloadBilling()
        } else if (data?.message) {
          setPaywallNotice(String(data.message))
        }
      } finally {
        setVerifying(false)
      }
    }
    void verify()
  }, [reloadBilling, user.id])

  const handleUpgrade = async (plan: SubscriptionPlanRow) => {
    if (!supabase || user.id === "preview-user-123") {
      showToast("Sign in with a live Bookora account to upgrade your plan.", "error")
      return
    }
    setUpgradingCode(plan.code)
    setPaywallNotice("")
    try {
      const { data, error } = await supabase.functions.invoke("lemonsqueezy-create-checkout", {
        body: {
          action: "create",
          plan_code: plan.code,
          billing_cycle: billingCycle,
          success_redirect_url: `${window.location.origin}/settings`,
        },
      })
      if (error) {
        let parsedMsg = error.message || "Lemon Squeezy checkout is not configured yet."
        let configured = true
        try {
          const ctx = (error as { context?: { json?: () => Promise<Record<string, unknown>> } }).context
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json()
            if (typeof body?.error === "string" && body.error.trim()) parsedMsg = body.error.trim()
            if (body?.configured === false || body?.xendit_configured === false) configured = false
          }
        } catch {
          // Ignore parse failure
        }
        setPaywallNotice(
          configured
            ? parsedMsg
            : "Lemon Squeezy secrets are not configured in Supabase yet (LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_MONTHLY_VARIANT_ID). Add them to enable Google Pay, Apple Pay, Card, and PayPal upgrades."
        )
        showToast(parsedMsg, "error")
        return
      }
      const nextUrl = data?.checkout_url || data?.invoice_url
      if (nextUrl) {
        window.location.assign(String(nextUrl))
        return
      }
      setPaywallNotice("Checkout session created, but no redirect URL was returned.")
    } catch (err) {
      setPaywallNotice(
        err instanceof Error
          ? err.message
          : "Online upgrades are not active yet."
      )
    } finally {
      setUpgradingCode(null)
    }
  }

  const currentCode = subscription?.plan_code || "starter"

  return (
    <section className="admin-section">
      <div className="dashboard-page-heading">
        <div>
          <p className="dashboard-kicker">Plan & Subscription</p>
          <h1>Billing</h1>
          <p>View your active Bookora PH plan and upgrade via Google Pay, Apple Pay, Card, or PayPal.</p>
        </div>
      </div>

      <article className="admin-card">
        <div className="panel-heading">
          <div>
            <h2>Current Subscription</h2>
            <p>{subscription?.plan_description || "Your active Bookora workspace subscription."}</p>
          </div>
          <div className="admin-inline-badges">
            <OwnerStatusBadge label={subscription?.plan_name || "Starter"} tone="warning" />
            <OwnerStatusBadge label={subscription?.status || "active"} tone="success" />
          </div>
        </div>

        {loading ? (
          <p className="admin-muted">Loading subscription details…</p>
        ) : (
          <div className="admin-detail-grid">
            <div className="admin-kv">
              <span>Active Plan</span>
              <strong>
                {subscription?.plan_name || "Starter"} ({formatCurrency(subscription?.amount_php ?? 249)}/
                {subscription?.billing_cycle || "monthly"})
              </strong>
            </div>
            <div className="admin-kv">
              <span>Billing Provider</span>
              <strong>
                {subscription?.billing_provider === "lemonsqueezy"
                  ? "Lemon Squeezy"
                  : subscription?.billing_provider === "xendit"
                    ? "Xendit"
                    : "Bookora Managed"}
              </strong>
            </div>
            <div className="admin-kv">
              <span>Renewal / Period End</span>
              <strong>
                {subscription?.current_period_end
                  ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(
                    new Date(subscription.current_period_end)
                  )
                  : "Ongoing"}
              </strong>
            </div>
          </div>
        )}
      </article>

      {verifying && (
        <div className="admin-security-banner">
          <Loader2 size={16} className="animate-spin" />
          <div>
            <strong>Confirming Payment</strong>
            <p>Checking live order status with Lemon Squeezy…</p>
          </div>
        </div>
      )}

      {paywallNotice && (
        <div className="admin-security-banner">
          <CreditCard size={16} />
          <div>
            <strong>Checkout Notice</strong>
            <p>{paywallNotice}</p>
          </div>
        </div>
      )}

      <div className="admin-segmented">
        <button
          type="button"
          className={billingCycle === "monthly" ? "active" : ""}
          onClick={() => setBillingCycle("monthly")}
        >
          Monthly Billing
        </button>
        <button
          type="button"
          className={billingCycle === "annual" ? "active" : ""}
          onClick={() => setBillingCycle("annual")}
        >
          Annual Billing (Save ~17%)
        </button>
      </div>

      <div className="admin-plans-grid">
        {plans.map((plan) => {
          const isCurrent = plan.code === currentCode
          const price = billingCycle === "annual" ? plan.annual_price_php : plan.monthly_price_php
          const { feePhp, totalPhp } = calculateCheckoutTotal(price)
          return (
            <article className="admin-card admin-plan-card" key={plan.code}>
              <div className="admin-plan-card-head">
                <div>
                  <div className="admin-inline-badges">
                    {isCurrent && <OwnerStatusBadge label="Current Plan" tone="success" />}
                    {billingCycle === "annual" && plan.monthly_price_php > 0 && plan.annual_price_php < plan.monthly_price_php * 12 && (
                      <OwnerStatusBadge label="Save 17%" tone="warning" />
                    )}
                  </div>
                  <h3>{plan.name}</h3>
                  <p className="admin-muted">{plan.description}</p>
                </div>
                <div className="admin-plan-price">
                  {billingCycle === "annual" && plan.monthly_price_php > 0 && plan.annual_price_php < plan.monthly_price_php * 12 && (
                    <small style={{ textDecoration: "line-through", marginRight: 6 }}>
                      {formatCurrency(plan.monthly_price_php * 12)}
                    </small>
                  )}
                  <strong>{formatCurrency(price)}</strong>
                  <small>/{billingCycle === "annual" ? "year" : "month"}</small>
                  {price > 0 && (
                    <div className="admin-muted" style={{ fontSize: 12 }}>
                      +{formatCurrency(feePhp)} fee ({formatCurrency(totalPhp)} total)
                    </div>
                  )}
                </div>
              </div>

              <ul className="admin-plan-features">
                {plan.features.map((feat) => (
                  <li key={feat}>
                    <Check size={14} /> {feat}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <Button type="button" variant="outline" disabled>
                  <ShieldCheck data-icon="inline-start" />
                  Active Plan
                </Button>
              ) : price <= 0 ? (
                <Button type="button" variant="outline" disabled>
                  Free Tier
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void handleUpgrade(plan)}
                  disabled={upgradingCode === plan.code}
                >
                  {upgradingCode === plan.code ? (
                    <>
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                      Preparing Checkout…
                    </>
                  ) : (
                    <>
                      Upgrade to {plan.name} · {formatCurrency(totalPhp)}
                      <ArrowUpRight data-icon="inline-end" />
                    </>
                  )}
                </Button>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

