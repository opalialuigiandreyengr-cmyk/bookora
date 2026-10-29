import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { Check, Code2, Copy, ExternalLink, Facebook, Link2, Mail, QrCode, Share2, Smartphone, X } from "lucide-react"
import { OwnerMobileMenuButton, OwnerSidebar } from "@/components/owner/OwnerSidebar"
import { supabase } from "@/lib/supabase"
import { showToast } from "@/components/ui/toast"

export function BookingPagePage({ user }: { user: User; onSignOut: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [slug, setSlug] = useState(String(user.user_metadata?.slug || ""))
  const [businessName, setBusinessName] = useState(String(user.user_metadata?.business_name || "Your business"))
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [embedCopied, setEmbedCopied] = useState(false)
  const [captionCopied, setCaptionCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const isLive = Boolean(supabase && user.id !== "preview-user-123")

  useEffect(() => {
    if (!isLive || !supabase) { setLoading(false); return }
    supabase.from("business_profiles").select("slug, business_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.slug) setSlug(String(data.slug))
      if (data?.business_name) setBusinessName(String(data.business_name))
      setLoading(false)
    })
  }, [isLive, user.id])

  const bookingUrl = slug ? `${window.location.origin}/book?slug=${encodeURIComponent(slug)}` : `${window.location.origin}/book`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(bookingUrl)}`
  const embedCode = `<a href="${bookingUrl}" target="_blank" rel="noopener">Book an appointment</a>`
  const socialCaption = `Book your next appointment with ${businessName}: ${bookingUrl}`
  const copyLink = async () => { try { await navigator.clipboard?.writeText(bookingUrl); setCopied(true); showToast("Booking link copied"); window.setTimeout(() => setCopied(false), 1800) } catch { showToast("Copy failed. Select the link manually.", "error") } }
  const shareLink = async () => { if (navigator.share) { await navigator.share({ title: businessName, text: `Book with ${businessName}`, url: bookingUrl }); return }; await copyLink() }
  const copyEmbed = async () => { try { await navigator.clipboard?.writeText(embedCode); setEmbedCopied(true); showToast("Embed code copied"); window.setTimeout(() => setEmbedCopied(false), 1800) } catch { showToast("Copy failed. Select the code manually.", "error") } }
  const copyCaption = async () => { try { await navigator.clipboard?.writeText(socialCaption); setCaptionCopied(true); showToast("Social caption copied"); window.setTimeout(() => setCaptionCopied(false), 1800) } catch { showToast("Copy failed. Select the caption manually.", "error") } }

  return <div className="dashboard-shell booking-page-shell">
    <OwnerSidebar user={user} active="Booking Page" open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={(path) => window.location.assign(path)} />
    <div className="dashboard-content">
      <header className="dashboard-header"><OwnerMobileMenuButton onOpen={() => setSidebarOpen(true)} /><div className="dashboard-header-context"><span>Booking Page</span><small>Owner workspace</small></div></header>
      <main className="dashboard-main booking-page-main">
        <div className="dashboard-page-heading"><div><p className="dashboard-kicker">Customer-facing experience</p><h1>Booking Page</h1><p>Share one simple link so clients can discover your services and book online.</p></div><button className="booking-page-primary" type="button" onClick={() => window.open(bookingUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={16} /> Preview page</button></div>
        <section className="booking-page-grid">
          <article className="booking-link-card"><div className="booking-page-card-icon"><Link2 /></div><p className="dashboard-kicker">Your public booking link</p><h2>{businessName}</h2><p className="booking-link-copy" aria-live="polite">{loading ? "Loading your booking link…" : bookingUrl}</p><div className="booking-link-actions"><button type="button" className="booking-page-primary" onClick={() => void copyLink()}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}</button><button type="button" className="booking-page-secondary" onClick={() => void shareLink()}><Share2 size={15} /> Share</button><button type="button" className="booking-page-secondary" onClick={() => setShowQr(true)}><QrCode size={15} /> QR code</button><button type="button" className="booking-page-secondary" onClick={() => window.open(bookingUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={15} /> Open page</button></div></article>
          <article className="booking-preview-card"><div className="booking-preview-device"><Smartphone /><div><strong>{businessName}</strong><span>Book an appointment</span><i /><i /><i /></div></div><div><p className="dashboard-kicker">Ready to share</p><h2>Meet clients where they are</h2><p>Use the same booking link on your website, social profiles, business listing, and email signature.</p></div></article>
        </section>
        <section className="booking-distribution-card"><div><p className="dashboard-kicker">Distribution checklist</p><h2>Put your booking link to work</h2><p>These placements make it easy for a new or returning client to book without messaging back and forth.</p></div><div className="booking-distribution-grid"><article><Facebook size={17} /><div><strong>Instagram and Facebook</strong><p>Add the link to your profile bio, page action button, and a pinned post or story highlight.</p></div></article><article><GoogleBusinessIcon /><div><strong>Google Business Profile</strong><p>Open your profile’s booking or appointment-link editor and paste this URL as the primary booking action.</p></div></article><article><Mail size={17} /><div><strong>Email and messaging</strong><p>Add the link to your email signature, confirmation replies, and saved customer-service responses.</p></div></article></div><div className="booking-caption-row"><span>{socialCaption}</span><button type="button" onClick={() => void copyCaption()}>{captionCopied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy social caption</>}</button></div></section>
        <section className="booking-embed-card"><div><p className="dashboard-kicker">Website distribution</p><h2>Add booking to your website</h2><p>Paste this lightweight button into your website, link page, or email footer.</p></div><div className="booking-embed-code"><code>{embedCode}</code><button type="button" onClick={() => void copyEmbed()}>{embedCopied ? <><Check size={15} /> Copied</> : <><Code2 size={15} /> Copy code</>}</button></div></section>
      </main>
    </div>
    {showQr && <div className="booking-qr-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowQr(false) }}><div className="booking-qr-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-qr-title"><header><div><p className="dashboard-kicker">Print or share</p><h2 id="booking-qr-title">Booking QR code</h2></div><button type="button" aria-label="Close QR code" onClick={() => setShowQr(false)}><X size={18} /></button></header><img src={qrUrl} alt={`QR code for ${businessName} booking page`} /><p>Scan to open your public booking page.</p><a href={qrUrl} target="_blank" rel="noreferrer">Open image for printing</a></div></div>}
  </div>
}

function GoogleBusinessIcon() {
  return <span className="booking-google-icon" aria-hidden="true">G</span>
}
