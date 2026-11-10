import { useEffect, useState } from "react"
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

export function BillingSettings({ user }: { user: User }) {
  const [subscription, setSubscription] = useState<OwnerSubscriptionInfo | null>(null)
  const [plans, setPlans] = useState<SubscriptionPlanRow[]>([])
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly")
  const [loading, setLoading] = useState(true)
  const [upgradingCode, setUpgradingCode] = useState<string | null>(null)
  const [paywallNotice, setPaywallNotice] = useState("")

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const [mySub, publicPlans] = await Promise.all([
          fetchMySubscription(),
          fetchSubscriptionPlans(false),
        ])
        if (!active) return
        setSubscription(mySub)
        setPlans(publicPlans.filter((p) => p.is_public))
      } catch {
        // Ignore if preview user
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [user.id])

  const handleUpgrade = async (plan: SubscriptionPlanRow) => {
    if (!supabase || user.id === "preview-user-123") {
      showToast("Sign in with a live Bookora account to upgrade your plan.", "error")
      return
    }
    setUpgradingCode(plan.code)
    setPaywallNotice("")
    try {
      const { data, error } = await supabase.functions.invoke("xendit-create-checkout", {
        body: {
          plan_code: plan.code,
          billing_cycle: billingCycle,
          success_redirect_url: `${window.location.origin}/settings`,
          failure_redirect_url: `${window.location.origin}/settings`,
        },
      })
      if (error) {
        const msg = error.message || "Xendit paywall checkout is not enabled yet."
        setPaywallNotice(
          "Online upgrades via Xendit (GCash, Maya, Cards, QRPH) are coming soon. Contact Bookora PH support to change your plan manually."
        )
        showToast(msg, "error")
        return
      }
      if (data?.invoice_url) {
        window.location.href = String(data.invoice_url)
        return
      }
      setPaywallNotice("Checkout session created, but no redirect URL was returned.")
    } catch (err) {
      setPaywallNotice(
        err instanceof Error
          ? err.message
          : "Online upgrades via Xendit are not active yet."
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
          <p>View your active Bookora PH plan and upgrade options powered by Xendit.</p>
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
              <strong>{subscription?.billing_provider === "xendit" ? "Xendit" : "Bookora Managed"}</strong>
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

      {paywallNotice && (
        <div className="admin-security-banner">
          <CreditCard size={16} />
          <div>
            <strong>Xendit Paywall Notice</strong>
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
          return (
            <article className="admin-card admin-plan-card" key={plan.code}>
              <div className="admin-plan-card-head">
                <div>
                  <div className="admin-inline-badges">
                    {isCurrent && <OwnerStatusBadge label="Current Plan" tone="success" />}
                  </div>
                  <h3>{plan.name}</h3>
                  <p className="admin-muted">{plan.description}</p>
                </div>
                <div className="admin-plan-price">
                  <strong>{formatCurrency(price)}</strong>
                  <small>/{billingCycle === "annual" ? "year" : "month"}</small>
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
                      Upgrade to {plan.name}
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

