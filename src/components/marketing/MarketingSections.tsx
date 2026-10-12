import { ArrowRight, BarChart3, Check, ChevronDown, Crown, Sprout, Store } from "lucide-react"
import { Button } from "@/components/ui/button"

const sectionVariants = ["studio", "guided", "compact", "showcase", "calm"] as const
type SectionVariant = typeof sectionVariants[number]

const solutions = [
  { eyebrow: "For independent pros", title: "Run your chair, your way", copy: "Share one booking link, protect your time, and keep every client detail close without adding admin work.", points: ["Personal booking page", "Deposits and reminders", "Client notes and history"] },
  { eyebrow: "For growing salons", title: "Keep the whole team in sync", copy: "Coordinate schedules, services, and availability from one calm workspace built for a busy front desk.", points: ["Staff calendars", "Service assignments", "Daily schedule overview"] },
  { eyebrow: "For multiple locations", title: "See every location clearly", copy: "Standardize the client experience while giving each branch the flexibility it needs to operate smoothly.", points: ["Location-level access", "Shared service catalog", "Business-wide reporting"] },
]

const plans = [
  { icon: Sprout, name: "Free", price: "₱0", description: "Perfect for getting started.", features: ["1 business location", "Basic booking calendar", "Up to 1 staff", "Service management", "Email notifications", "Basic reports"], action: "Get started" },
  { icon: Store, name: "Starter", price: "₱249", description: "Ideal for small salons.", features: ["1 business location", "Up to 3 staff", "Online booking page", "Service and pricing setup", "Automated reminders", "Basic reports", "Customer management"], action: "Start free trial" },
  { icon: BarChart3, name: "Pro", price: "₱499", description: "For growing salons.", features: ["Multiple locations (up to 3)", "Unlimited staff", "Online booking page", "Service and package setup", "Automated reminders", "Payments (GCash, Maya, cards)", "Reports and analytics", "Promotions and discounts", "Custom branding"], action: "Start free trial", recommended: true },
]

const faqs = [
  "Is there a free trial?",
  "Can I cancel my subscription anytime?",
  "Do you support multiple locations?",
  "What payment methods are available?",
]

const businessGallery = [
  { label: "Nail salon", image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=700&q=85" },
  { label: "Hair salon", image: "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=700&q=85" },
  { label: "Barbershop", image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=700&q=85" },
  { label: "Facial & spa", image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=700&q=85" },
  { label: "Makeup studio", image: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=700&q=85" },
  { label: "Beauty clinic", image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=700&q=85" },
]

function getVariant(): SectionVariant {
  const requested = new URLSearchParams(window.location.search).get("sections")
  return sectionVariants.includes(requested as SectionVariant) ? requested as SectionVariant : "studio"
}

function PreviewNavigation({ active }: { active: SectionVariant }) {
  if (!new URLSearchParams(window.location.search).has("sections")) return null
  return <aside className="section-preview-nav" aria-label="Marketing section design previews"><strong>Section preview</strong>{sectionVariants.map((variant, index) => <a className={variant === active ? "active" : ""} href={`?sections=${variant}#solutions`} key={variant}>{index + 1}. {variant}</a>)}</aside>
}

export function MarketingSections() {
  const variant = getVariant()
  return (
    <div className={`marketing-sections sections-${variant}`}>
      <PreviewNavigation active={variant} />

      <section className="solutions-section marketing-section section-hero-shell" id="solutions">
        <div className="section-heading solutions-heading">
          <div className="solutions-heading-main"><h2>One calm system for <span>every stage of growth.</span></h2></div>
          <p>Bookora handles the repetitive work behind every appointment, so you can give clients and your team more attention.</p>
        </div>
        <div className="solutions-grid">{solutions.map(({ eyebrow, title, copy, points }) => <article className="solution-item" key={title}><div className="solution-copy"><p>{eyebrow}</p><h3>{title}</h3><span>{copy}</span><ul>{points.map((point) => <li key={point}><Check /> {point}</li>)}</ul></div></article>)}</div>
        <div className="businesses" aria-label="Bookora solutions for different salon businesses"><div className="business-intro"><p className="eyebrow"><span>For all types of salon businesses</span></p><h2>Built for beauty<br />professionals like you.</h2><p>Whether you run a nail salon, hair salon, barbershop, facial and spa, or a full-service salon — Bookora adapts to your business.</p></div><div className="business-grid">{businessGallery.map((business) => <article className="business-card" key={business.label}><img src={business.image} alt={`${business.label} interior and beauty service`} loading="lazy" /><span>{business.label}</span></article>)}</div></div>
      </section>

      <section className="pricing-section hero-shell" id="pricing">
        <div className="section-heading pricing-heading">
          <div className="pricing-heading-copy">
            <h2>Start free. Upgrade when<br />your <span>calendar fills up.</span></h2>
          </div>
          <div className="pricing-heading-side">
            <p>Everything you need to grow your salon—without setup fees, long-term contracts, or surprise add-ons.</p>
            <div className="billing-toggle" aria-label="Billing period">
              <button className="active" type="button">Monthly</button>
              <button type="button">Yearly <span>Save 20%</span></button>
            </div>
          </div>
        </div>
        <div className="pricing-grid">{plans.map(({ icon: Icon, ...plan }) => <article className={`price-plan ${plan.recommended ? "recommended" : ""}`} key={plan.name}>{plan.recommended && <span className="plan-badge"><Crown /> Best for growing salons</span>}<div className="plan-heading"><span className="plan-icon"><Icon /></span><div><h3>{plan.name}</h3><p>{plan.description}</p></div></div><div className="plan-price"><strong>{plan.price}</strong><span>/ month</span></div><ul>{plan.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul><Button variant={plan.recommended ? "default" : "outline"} asChild><a href="#signup">{plan.action}<ArrowRight /></a></Button></article>)}</div>
      </section>

      <section className="faq-section marketing-section" id="faq" aria-labelledby="faq-title">
        <div className="faq-intro"><p className="section-kicker">FAQs</p><h2 id="faq-title">Frequently asked questions.</h2><p>Find answers to common questions about Bookora.</p><Button variant="outline" asChild><a href="#signup">View all FAQs <ArrowRight /></a></Button></div>
        <div className="faq-list">{faqs.map((question, index) => <details key={question} open={index === 0}><summary>{question}<ChevronDown /></summary><p>{index === 0 ? "Start with the free plan and upgrade when your salon is ready. No credit card is required." : "Yes — Bookora keeps your schedule, services, and client details organized as your business grows."}</p></details>)}</div>
        <section className="closing-cta" aria-label="Get started with Bookora">
          <div><p className="section-kicker">Ready to simplify your bookings?</p><h2>Make booking the easiest part of your day.</h2></div>
          <div><p>Set up your booking page and give clients an easier way to book.</p><Button size="lg" asChild><a href="#signup">Get started free <ArrowRight /></a></Button></div>
        </section>
      </section>

      <footer className="site-footer">
        <div className="footer-main">
          <div className="footer-brand-block"><a href="#top" className="footer-brand">Book<span>ora</span></a><p>Simple booking for modern beauty businesses.</p></div>
          <div className="footer-links"><span>Explore Bookora</span><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#solutions">Solutions</a><a href="#pricing">Pricing</a></nav></div>
          <div className="footer-newsletter"><span>Stay in the loop</span><p>Tips and ideas for a fuller salon calendar.</p><form onSubmit={(event) => event.preventDefault()}><input type="email" aria-label="Email address" placeholder="Your email address" required /><Button type="submit">Subscribe</Button></form></div>
        </div>
        <div className="footer-bottom"><span>© 2026 Bookora</span><span>Built for beauty businesses</span></div>
      </footer>
    </div>
  )
}
