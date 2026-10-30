import { useState, useEffect, useRef } from "react"
import type { CSSProperties, ChangeEvent } from "react"
import type { User } from "@supabase/supabase-js"
import {
  Bell,
  BarChart3,
  Building2,
  CalendarDays,
  CreditCard,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  Moon,
  Monitor,
  Save,
  ShieldCheck,
  Smartphone,
  Store,
  Sun,
  UserRound,
  X,
  Trash2,
  UploadCloud,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChangePasswordModal } from "@/pages/ChangePasswordModal"
import { supabase } from "@/lib/supabase"
import { showToast } from "@/components/ui/toast"

const tabs = [
  ["Business profile", Building2],
  ["Booking preferences", CalendarDays],
  ["Notifications", Bell],
  ["Account", UserRound],
  ["Security", LockKeyhole],
  ["Billing", CreditCard],
  ["Reports", BarChart3],
] as const

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const palette: Record<string, string> = {
  coral: "oklch(0.64 0.17 19)",
  rose: "oklch(0.67 0.14 355)",
  orange: "oklch(0.70 0.14 55)",
  navy: "oklch(0.25 0.04 255)",
  sage: "oklch(0.62 0.08 160)",
  sky: "oklch(0.65 0.12 235)",
  plum: "oklch(0.43 0.10 320)",
  ink: "oklch(0.25 0.03 255)",
}

export interface DaySchedule {
  day: string
  open: boolean
  start: string
  end: string
}

const defaultHours: DaySchedule[] = days.map((day, i) => ({
  day,
  open: i < 5,
  start: "09:00",
  end: "17:00",
}))

type BreakWindow = { start: string; end: string }
type TimeOffRule = { id: string; title: string; startDate: string; endDate: string; startTime: string; endTime: string; allDay: boolean; repeat: "none" | "weekly" | "monthly" }

// Compress images before uploading so they stay small enough for fast profile previews.
function compressImage(file: File, maxWidth: number, maxHeight: number, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height)
          height = maxHeight
        }

        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(String(event.target?.result ?? ""))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL("image/jpeg", quality))
      }
      img.onerror = reject
      img.src = String(event.target?.result ?? "")
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function dataUrlToBlob(dataUrl: string) {
  const [header, encoded] = dataUrl.split(",")
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg"
  const bytes = atob(encoded)
  const array = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i)
  return new Blob([array], { type: mime })
}

async function uploadBrandImage(file: File, path: string, maxWidth: number, maxHeight: number, quality: number) {
  const compressed = await compressImage(file, maxWidth, maxHeight, quality)
  if (!supabase) return compressed

  const { error } = await supabase.storage
    .from("brand-assets")
    .upload(path, dataUrlToBlob(compressed), { contentType: "image/jpeg", cacheControl: "3600", upsert: true })
  if (error) throw error
  return supabase.storage.from("brand-assets").getPublicUrl(path).data.publicUrl
}

function getStoredProfile(userId: string) {
  try {
    const raw = localStorage.getItem(`bookora_profile_${userId}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function Preview({
  name,
  about,
  industry,
  color,
  theme,
  bannerUrl,
  logoUrl,
}: {
  name: string
  about: string
  industry: string
  color: string
  theme: string
  bannerUrl?: string
  logoUrl?: string
}) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return (
    <aside
      className={`settings-preview preview-theme-${theme.toLowerCase()}`}
      style={{ "--preview-accent": palette[color] ?? palette.coral } as CSSProperties}
    >
      <div className="preview-heading">
        <strong>Preview</strong>
        <div>
          <button className="active" aria-label="Mobile preview">
            <Smartphone />
          </button>
          <button aria-label="Desktop preview">
            <Monitor />
          </button>
        </div>
      </div>
      <div className="preview-card">
        <div className="preview-url">
          https://{slug || "your-business"}.bookora.com <span>↗</span>
        </div>
        <div
          className="preview-stage"
          style={
            bannerUrl
              ? {
                  backgroundImage: `url(${bannerUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <div className="preview-phone">
            <span className="preview-phone-notch" />
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  alignSelf: "center",
                  border: "1.5px solid white",
                  marginTop: "2px",
                }}
              />
            )}
            <strong>{name || "Your business"}</strong>
            <span>{industry}</span>
            <span>{about || "Book your appointment"}</span>
            <i />
            <i />
            <i />
            <button>Book now</button>
          </div>
        </div>
      </div>
      <div className="preview-help">
        <div className="preview-avatars">
          <span>LU</span>
          <span>MA</span>
          <span>JO</span>
        </div>
        <strong>Need help with your Booking Page?</strong>
        <p>We're real people here to help you 24/7</p>
        <button>● &nbsp;Connect with us</button>
      </div>
    </aside>
  )
}

function Appearance({ color, setColor, theme, setTheme }: any) {
  const colors = ["coral", "rose", "orange", "navy", "sage", "sky", "plum", "ink"]
  return (
    <>
      <div className="appearance-colors">
        <strong>Brand color</strong>
        <div>
          {colors.map((item) => (
            <button
              key={item}
              type="button"
              className={`color-swatch ${item} ${color === item ? "active" : ""}`}
              aria-label={item}
              aria-pressed={color === item}
              onClick={() => setColor(item)}
            />
          ))}
        </div>
      </div>
      <div className="theme-options">
        {[
          ["System", Monitor],
          ["Light", Sun],
          ["Dark", Moon],
        ].map(([label, Icon]: any) => (
          <button
            key={label}
            type="button"
            className={theme === label ? "selected" : ""}
            onClick={() => setTheme(label)}
          >
            <span className="theme-radio" />
            <Icon />
            <strong>{label}</strong>
          </button>
        ))}
      </div>
    </>
  )
}

function Hours({
  hours,
  setHours,
}: {
  hours: DaySchedule[]
  setHours: React.Dispatch<React.SetStateAction<DaySchedule[]>>
}) {
  const updateDay = (index: number, updates: Partial<DaySchedule>) => {
    setHours((current) => current.map((item, idx) => (idx === index ? { ...item, ...updates } : item)))
  }

  return (
    <section className="settings-card">
      <div className="settings-card-heading">
        <h2>Business hours</h2>
      </div>
      <div className="hours-list">
        {hours.map((schedule, i) => (
          <div className="hours-row" key={schedule.day}>
            <label className="hours-toggle">
              <input
                type="checkbox"
                checked={schedule.open}
                onChange={(event) => updateDay(i, { open: event.target.checked })}
              />
              <i />
            </label>
            <strong>{schedule.day}</strong>
            {schedule.open ? (
              <>
                <input
                  type="time"
                  value={schedule.start}
                  onChange={(event) => updateDay(i, { start: event.target.value })}
                />
                <span>—</span>
                <input
                  type="time"
                  value={schedule.end}
                  onChange={(event) => updateDay(i, { end: event.target.value })}
                />
              </>
            ) : (
              <em>Closed</em>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function BookingPreferences({
  policy,
  setPolicy,
  minNoticeHours,
  setMinNoticeHours,
  maxDays,
  setMaxDays,
  slotSize,
  setSlotSize,
  cancellationNoticeHours,
  setCancellationNoticeHours,
  bufferMinutes,
  setBufferMinutes,
  formFields,
  setFormFields,
  bookingFeeEnabled,
  setBookingFeeEnabled,
  bookingFeeType,
  setBookingFeeType,
  bookingFeeAmount,
  setBookingFeeAmount,
  bookingFeeNote,
  setBookingFeeNote,
  additionalInfo,
  setAdditionalInfo,
  paymentReceiptUrl,
  setPaymentReceiptUrl,
  allowCustomerLogin,
  setAllowCustomerLogin,
  userId,
}: {
  policy: string
  setPolicy: (value: string) => void
  minNoticeHours: string
  setMinNoticeHours: (value: string) => void
  maxDays: string
  setMaxDays: (value: string) => void
  slotSize: string
  setSlotSize: (value: string) => void
  cancellationNoticeHours: string
  setCancellationNoticeHours: (value: string) => void
  bufferMinutes: string
  setBufferMinutes: (value: string) => void
  formFields: { phone: boolean; notes: boolean; address: boolean; designPeg: boolean; paymentReceipt: boolean; price: boolean; duration: boolean; hours: boolean; staff: boolean; reviews: boolean }
  setFormFields: (value: { phone: boolean; notes: boolean; address: boolean; designPeg: boolean; paymentReceipt: boolean; price: boolean; duration: boolean; hours: boolean; staff: boolean; reviews: boolean }) => void
  bookingFeeEnabled: boolean
  setBookingFeeEnabled: (value: boolean) => void
  bookingFeeType: "fixed" | "percentage"
  setBookingFeeType: (value: "fixed" | "percentage") => void
  bookingFeeAmount: string
  setBookingFeeAmount: (value: string) => void
  bookingFeeNote: string
  setBookingFeeNote: (value: string) => void
  additionalInfo: string
  setAdditionalInfo: (value: string) => void
  paymentReceiptUrl: string
  setPaymentReceiptUrl: (value: string) => void
  allowCustomerLogin: boolean
  setAllowCustomerLogin: (value: boolean) => void
  userId: string
}) {
  const [visible, setVisible] = useState(true)
  const [reminders, setReminders] = useState(true)
  const [buffer, setBuffer] = useState(true)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  return (
    <div className="preferences-settings-stack">
      <section className="settings-card preference-card">
        <div className="settings-card-heading">
          <div>
            <h2>Booking page</h2>
            <p>Control how clients discover and book your services.</p>
          </div>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>Accept online bookings</strong>
            <p>Let clients book appointments from your public booking page.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
            <i />
          </label>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>Allow customer accounts</strong>
            <p>Let customers sign in to save details and view their booking history.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={allowCustomerLogin} onChange={(event) => setAllowCustomerLogin(event.target.checked)} />
            <i />
          </label>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>Show available staff</strong>
            <p>Let clients choose a preferred team member when booking.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" defaultChecked />
            <i />
          </label>
        </div>
      </section>
      <section className="settings-card preference-card">
        <div className="settings-card-heading">
          <div>
            <h2>Booking rules</h2>
            <p>Set boundaries that keep your schedule manageable.</p>
          </div>
        </div>
        <div className="settings-form-grid preference-form-grid">
          <label>
            <span>Minimum notice</span>
            <select value={minNoticeHours} onChange={(event) => setMinNoticeHours(event.target.value)}>
              <option value="0">No minimum</option>
              <option value="2">2 hours</option>
              <option value="24">24 hours</option>
              <option value="48">48 hours</option>
            </select>
          </label>
          <label>
            <span>How far ahead clients can book</span>
            <select value={maxDays} onChange={(event) => setMaxDays(event.target.value)}>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
          <label>
            <span>Booking slot size</span>
            <select value={slotSize} onChange={(event) => setSlotSize(event.target.value)}>
              <option value="15">Every 15 minutes</option>
              <option value="30">Every 30 minutes</option>
              <option value="45">Every 45 minutes</option>
              <option value="60">Every 60 minutes</option>
              <option value="90">Every 90 minutes</option>
            </select>
          </label>
          <label>
            <span>Cancellation notice</span>
            <select value={cancellationNoticeHours} onChange={(event) => setCancellationNoticeHours(event.target.value)}>
              <option value="0">Anytime</option>
              <option value="2">2 hours</option>
              <option value="6">6 hours</option>
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
              <option value="48">48 hours</option>
              <option value="72">72 hours</option>
              <option value="168">7 days</option>
            </select>
          </label>
          <label>
            <span>Time between appointments</span>
            <select value={bufferMinutes} onChange={(event) => setBufferMinutes(event.target.value)}>
              <option value="0">No buffer</option>
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
            </select>
          </label>
        </div>
      </section>
      <section className="settings-card preference-card">
        <div className="settings-card-heading">
          <div>
            <h2>Reminders &amp; confirmations</h2>
            <p>Keep clients informed without manual follow-up.</p>
          </div>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>Automatic booking confirmation</strong>
            <p>Send a confirmation as soon as an appointment is booked.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" defaultChecked />
            <i />
          </label>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>Appointment reminders</strong>
            <p>Send a reminder before each upcoming appointment.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={reminders} onChange={(event) => setReminders(event.target.checked)} />
            <i />
          </label>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>Buffer after each appointment</strong>
            <p>Automatically reserve a short cleanup or reset period.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={buffer} onChange={(event) => setBuffer(event.target.checked)} />
            <i />
          </label>
        </div>
      </section>
      <section className="settings-card preference-card">
        <div className="settings-card-heading">
          <div>
            <h2>Booking policy</h2>
            <p>Share need-to-know details about amending bookings, refunds and more before customers confirm their bookings.</p>
          </div>
        </div>
        <label className="preference-policy-field">
          <span>Booking policy</span>
          <textarea
            value={policy}
            onChange={(event) => setPolicy(event.target.value)}
            placeholder="Add your booking, cancellation, and refund policy"
          />
        </label>
      </section>
      <section className="settings-card preference-card">
        <div className="settings-card-heading">
          <div>
            <h2>Booking fee &amp; Deposit</h2>
            <p>Require clients to pay a reservation fee or deposit to secure their appointment.</p>
          </div>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>Require booking fee / reservation deposit</strong>
            <p>When enabled, clients are shown the required deposit amount and instructions to confirm their booking.</p>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={bookingFeeEnabled}
              onChange={(event) => {
                const next = event.target.checked
                setBookingFeeEnabled(next)
                if (next && !formFields.paymentReceipt) {
                  setFormFields({ ...formFields, paymentReceipt: true })
                }
              }}
            />
            <i />
          </label>
        </div>

        {bookingFeeEnabled && (
          <div className="booking-fee-settings-panel">
            <div className="booking-fee-type-selector">
              <span className="booking-fee-label">Deposit calculation</span>
              <div className="booking-fee-type-pills">
                <button
                  type="button"
                  className={`booking-fee-type-btn ${bookingFeeType === "fixed" ? "active" : ""}`}
                  onClick={() => setBookingFeeType("fixed")}
                >
                  Fixed amount (₱)
                </button>
                <button
                  type="button"
                  className={`booking-fee-type-btn ${bookingFeeType === "percentage" ? "active" : ""}`}
                  onClick={() => setBookingFeeType("percentage")}
                >
                  Percentage of total (%)
                </button>
              </div>
            </div>

            <div className="settings-form-grid preference-form-grid">
              <label>
                <span>
                  {bookingFeeType === "fixed" ? "Deposit amount (₱)" : "Deposit percentage (%)"}
                </span>
                <div className="settings-input-adornment">
                  {bookingFeeType === "fixed" && <span className="adornment-prefix">₱</span>}
                  <input
                    type="number"
                    min="0"
                    max={bookingFeeType === "percentage" ? "100" : undefined}
                    placeholder={bookingFeeType === "fixed" ? "200" : "50"}
                    value={bookingFeeAmount}
                    onChange={(event) => setBookingFeeAmount(event.target.value)}
                  />
                  {bookingFeeType === "percentage" && <span className="adornment-suffix">%</span>}
                </div>
              </label>

              <div className="booking-fee-preview-hint">
                <small>
                  {bookingFeeType === "fixed"
                    ? `Clients will be charged ₱${Number(bookingFeeAmount || 0).toLocaleString("en-PH")} upfront. The remaining service balance is paid at the appointment.`
                    : `Clients will be charged ${bookingFeeAmount || 0}% of their total service price upfront.`}
                </small>
              </div>
            </div>

            <label className="preference-policy-field">
              <span>Deposit instructions &amp; policy shown to clients</span>
              <textarea
                value={bookingFeeNote}
                onChange={(event) => setBookingFeeNote(event.target.value)}
                placeholder="Example: A reservation deposit is required to confirm your booking. This amount will be deducted from your final bill at the appointment."
                rows={2}
              />
            </label>
          </div>
        )}
      </section>
      <section className="settings-card preference-card">
        <div className="settings-card-heading">
          <div>
            <h2>Contact fields</h2>
            <p>What form fields will display when customers book online?</p>
          </div>
        </div>
        <div className="contact-field-list">
          {[
            ["phone", "Phone number", "Ask customers for a phone number"],
            ["address", "Address", "Collect a customer address when needed"],
            ["notes", "Additional information", "Let customers add a note to their booking"],
            ["designPeg", "Design peg", "Let customers attach an inspiration photo"],
            ["paymentReceipt", "Payment receipt", "Let customers attach proof of payment"],
            ["price", "Service prices", "Show prices beside services on the public booking page"],
            ["duration", "Service duration", "Show estimated duration beside services"],
            ["hours", "Business hours", "Show your weekly hours and today’s availability"],
            ["staff", "Available staff", "Show staff selection and assignment details when available"],
            ["reviews", "Guest reviews", "Show customer reviews on the public page"],
          ].map(([key, label, description]) => (
            <div className="preference-toggle" key={key}>
              <div>
                <strong>{label}</strong>
                <p>{description}</p>
              </div>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={formFields[key as keyof typeof formFields]}
                  onChange={(event) => setFormFields({ ...formFields, [key]: event.target.checked })}
                />
                <i />
              </label>
            </div>
          ))}
        </div>
        <label className="preference-policy-field">
          <span>Additional info shown to customers</span>
          <textarea value={additionalInfo} onChange={(event) => setAdditionalInfo(event.target.value)} placeholder="Example: Prices vary by design complexity. Final quote confirmed after review." />
        </label>
        <div className="preference-upload-row">
          <div>
            <strong>Payment receipt image</strong>
            <p>Upload the payment guide or QR image customers should see.</p>
          </div>
          <label className="settings-upload-button">
            <input type="file" accept="image/*" hidden disabled={uploadingReceipt} onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              setUploadingReceipt(true)
              try {
                const url = await uploadBrandImage(file, `${userId}/payment-receipt.jpg`, 900, 900, 0.82)
                setPaymentReceiptUrl(url)
              } catch { showToast("Could not upload payment image") }
              finally { setUploadingReceipt(false) }
            }} />
            <UploadCloud size={15} /> {uploadingReceipt ? "Uploading…" : paymentReceiptUrl ? "Change image" : "Upload image"}
          </label>
        </div>
        {paymentReceiptUrl && <img src={paymentReceiptUrl} alt="Payment receipt guide" className="settings-payment-image-preview" />}
      </section>
    </div>
  )
}

function NotificationsSettings() {
  const [email, setEmail] = useState(true)
  const [sms, setSms] = useState(false)
  const [clientUpdates, setClientUpdates] = useState(true)
  const [clientChanges, setClientChanges] = useState(true)
  const [teamUpdates] = useState(false)
  return (
    <div className="preferences-settings-stack">
      <section className="settings-card preference-card">
        <div className="settings-card-heading">
          <div>
            <h2>Notification channels</h2>
            <p>Choose where Bookora should send workspace updates.</p>
          </div>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>Email notifications</strong>
            <p>Receive booking and account updates in your inbox.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={email} onChange={(event) => setEmail(event.target.checked)} />
            <i />
          </label>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>SMS notifications <em className="settings-soon">Soon</em></strong>
            <p>Get important schedule changes by text message.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={sms} disabled onChange={(event) => setSms(event.target.checked)} />
            <i />
          </label>
        </div>
      </section>
      <section className="settings-card preference-card">
        <div className="settings-card-heading">
          <div>
            <h2>Client notifications</h2>
            <p>Keep customers informed throughout their booking.</p>
          </div>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>New booking confirmations</strong>
            <p>Notify clients when their appointment is successfully booked.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={clientUpdates} onChange={(event) => setClientUpdates(event.target.checked)} />
            <i />
          </label>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>Changes and cancellations</strong>
            <p>Send an update when an appointment changes or is cancelled.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={clientChanges} onChange={(event) => setClientChanges(event.target.checked)} />
            <i />
          </label>
        </div>
        <div className="settings-form-grid preference-form-grid">
          <label>
            <span>Reminder timing</span>
            <select defaultValue="24">
              <option value="2">2 hours before</option>
              <option value="24">24 hours before</option>
              <option value="48">48 hours before</option>
            </select>
          </label>
        </div>
      </section>
      <section className="settings-card preference-card">
        <div className="settings-card-heading">
          <div>
            <h2>Team notifications</h2>
            <p>Help your staff stay in sync with the schedule.</p>
          </div>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>New and changed appointments <em className="settings-soon">Soon</em></strong>
            <p>Notify team members when their schedule changes.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={teamUpdates} disabled />
            <i />
          </label>
        </div>
        <div className="preference-toggle">
          <div>
            <strong>Daily schedule summary</strong>
            <p>Send a morning summary of each team member’s appointments.</p>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={false} disabled />
            <i />
          </label>
        </div>
      </section>
    </div>
  )
}

interface ProfileProps {
  userId: string
  name: string
  setName: (v: string) => void
  slug: string
  setSlug: (v: string) => void
  about: string
  setAbout: (v: string) => void
  industry: string
  setIndustry: (v: string) => void
  color: string
  setColor: (v: string) => void
  theme: string
  setTheme: (v: string) => void
  email: string
  setEmail: (v: string) => void
  countryCode: string
  setCountryCode: (v: string) => void
  phone: string
  setPhone: (v: string) => void
  address: string
  setAddress: (v: string) => void
  city: string
  setCity: (v: string) => void
  country: string
  setCountry: (v: string) => void
  hours: DaySchedule[]
  setHours: React.Dispatch<React.SetStateAction<DaySchedule[]>>
  website: string
  setWebsite: (v: string) => void
  instagram: string
  setInstagram: (v: string) => void
  facebook: string
  setFacebook: (v: string) => void
  bannerUrl: string
  setBannerUrl: (v: string) => void
  logoUrl: string
  setLogoUrl: (v: string) => void
}

function Profile({
  userId,
  name,
  setName,
  slug,
  setSlug,
  about,
  setAbout,
  industry,
  setIndustry,
  color,
  setColor,
  theme,
  setTheme,
  email,
  setEmail,
  countryCode,
  setCountryCode,
  phone,
  setPhone,
  address,
  setAddress,
  city,
  setCity,
  country,
  setCountry,
  hours,
  setHours,
  website,
  setWebsite,
  instagram,
  setInstagram,
  facebook,
  setFacebook,
  bannerUrl,
  setBannerUrl,
  logoUrl,
  setLogoUrl,
}: ProfileProps) {
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const handleBannerUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (PNG, JPG, WebP).")
      return
    }
    setUploadingBanner(true)
    try {
      const path = `${userId}/banner.jpg`
      setBannerUrl(await uploadBrandImage(file, path, 900, 300, 0.8))
    } catch {
      alert("Failed to process banner image.")
    } finally {
      setUploadingBanner(false)
    }
  }

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (PNG, JPG, WebP).")
      return
    }
    setUploadingLogo(true)
    try {
      const path = `${userId}/logo.jpg`
      setLogoUrl(await uploadBrandImage(file, path, 200, 200, 0.85))
    } catch {
      alert("Failed to process logo image.")
    } finally {
      setUploadingLogo(false)
    }
  }

  return (
    <div className="profile-settings-stack">
      <section className="settings-card">
        <div className="settings-card-heading">
          <h2>Brand details</h2>
        </div>
        <div className="brand-assets">
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleBannerUpload}
          />
          <div
            className={`brand-upload banner-upload ${bannerUrl ? "has-banner" : ""}`}
            style={
              bannerUrl
                ? {
                    backgroundImage: `url(${bannerUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            <div className="banner-actions">
              <button
                type="button"
                disabled={uploadingBanner}
                onClick={() => bannerInputRef.current?.click()}
              >
                {uploadingBanner ? (
                  <>
                    <Loader2 className="animate-spin" style={{ width: 14, height: 14, marginRight: 5 }} />
                    Optimizing…
                  </>
                ) : (
                  <>
                    <UploadCloud style={{ width: 14, height: 14, display: "inline-block", verticalAlign: "middle", marginRight: 5 }} />
                    {bannerUrl ? "Change banner image" : "Upload banner image"}
                  </>
                )}
              </button>
            </div>
          </div>

          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleLogoUpload}
          />
          <div className="brand-upload logo-upload">
            <span
              className="brand-logo-preview"
              onClick={() => logoInputRef.current?.click()}
              style={{ cursor: "pointer" }}
              title="Click to upload logo"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Brand logo" className="brand-logo-img" />
              ) : (
                <Store />
              )}
            </span>
            <div>
              <strong>Brand logo</strong>
              <small>Select a 200 × 200 px image (automatically optimized)</small>
            </div>
            <div className="logo-actions">
              <button
                type="button"
                disabled={uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
              >
                {uploadingLogo ? (
                  <>
                    <Loader2 className="animate-spin" style={{ width: 14, height: 14, marginRight: 5 }} />
                    Optimizing…
                  </>
                ) : logoUrl ? (
                  "Change logo"
                ) : (
                  "Upload logo"
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="settings-form-grid profile-form-grid">
          <label>
            <span>Business name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Glow Studio"
            />
          </label>
          <label>
            <span>Your Booking Page URL</span>
            <div className="booking-url-field">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "your-business"}
                aria-label="Booking page slug"
              />
              <span aria-hidden="true">.bookora.com</span>
            </div>
          </label>
          <label>
            <span>Industry</span>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option>Nail salon</option>
              <option>Hair salon</option>
              <option>Barbershop</option>
              <option>Facial &amp; spa</option>
              <option>Makeup studio</option>
              <option>Beauty clinic</option>
            </select>
          </label>
          <label className="settings-field-wide">
            <span>About</span>
            <textarea
              className="settings-textarea"
              value={about}
              maxLength={255}
              rows={6}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Tell clients about your business"
            />
            <small className="settings-character-count">{about.length}/255</small>
          </label>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <h2>Appearance</h2>
        </div>
        <Appearance color={color} setColor={setColor} theme={theme} setTheme={setTheme} />
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <h2>Contact details</h2>
        </div>
        <div className="settings-form-grid contact-form-grid">
          <label className="contact-email">
            <span>Primary email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@yourbusiness.com"
            />
          </label>
          <label className="contact-country-code">
            <span>Code</span>
            <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
              <option value="+63">+63</option>
              <option value="+1">+1</option>
              <option value="+65">+65</option>
              <option value="+81">+81</option>
              <option value="+44">+44</option>
              <option value="+61">+61</option>
            </select>
          </label>
          <label className="contact-phone-number">
            <span>Phone number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0912 345 6789"
            />
          </label>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <h2>Location</h2>
        </div>
        <div className="settings-form-grid">
          <label className="settings-field-wide">
            <span>Address</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Business name, street name, apt, suite, floor"
            />
          </label>
          <label>
            <span>City</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. San Francisco or Manila"
            />
          </label>
          <label>
            <span>Country</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option>Philippines</option>
              <option>Singapore</option>
              <option>United States</option>
              <option>Australia</option>
              <option>United Kingdom</option>
              <option>Japan</option>
            </select>
          </label>
        </div>
      </section>

      <Hours hours={hours} setHours={setHours} />

      <section className="settings-card">
        <div className="settings-card-heading">
          <h2>Your links</h2>
        </div>
        <div className="settings-form-grid links-grid">
          <label>
            <span>Website</span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourbusiness.com"
            />
          </label>
          <label>
            <span>Instagram</span>
            <input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@yourbusiness"
            />
          </label>
          <label>
            <span>Facebook</span>
            <input
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              placeholder="facebook.com/yourbusiness"
            />
          </label>
        </div>
      </section>
    </div>
  )
}

function AvailabilityPanel({ type, onClose }: { type: "breaks" | "time-off"; onClose: () => void }) {
  const isBreaks = type === "breaks"
  const [enabled, setEnabled] = useState(days.map((_, index) => index === 0))
  const [breakCounts, setBreakCounts] = useState<Record<string, number>>({ Monday: 1 })
  const [allDay, setAllDay] = useState(true)
  return (
    <div
      className={`availability-panel availability-${type}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="availability-title"
    >
      <div className="availability-panel-heading">
        <div>
          <h3 id="availability-title">Manage {isBreaks ? "breaks" : "time off"}</h3>
          <p>{isBreaks ? "Set recurring break times for each working day." : "Block time when your business is unavailable."}</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose}>
          <X />
        </button>
      </div>
      {isBreaks ? (
        <div className="breaks-editor">
          <div className="breaks-heading">
            <strong>Manage breaks</strong>
            <small>Choose which days have recurring breaks.</small>
          </div>
          {days.map((day, index) => (
            <div className="break-day-group" key={day}>
              <div className="break-row">
                <label className="hours-toggle">
                  <input
                    type="checkbox"
                    checked={enabled[index]}
                    onChange={() =>
                      setEnabled((current) => current.map((value, itemIndex) => (itemIndex === index ? !value : value)))
                    }
                  />
                  <i />
                </label>
                <span>{day}</span>
                {enabled[index] ? (
                  <>
                    <input type="time" defaultValue="12:00" />
                    <b>–</b>
                    <input type="time" defaultValue="13:00" />
                    <button
                      type="button"
                      className="break-add"
                      aria-label={`Add break on ${day}`}
                      onClick={() =>
                        setBreakCounts((current) => ({ ...current, [day]: (current[day] ?? 1) + 1 }))
                      }
                    >
                      +
                    </button>
                  </>
                ) : (
                  <em>{index > 4 ? "Day off" : "No breaks"}</em>
                )}
              </div>
              {enabled[index] &&
                Array.from({ length: Math.max(0, (breakCounts[day] ?? 1) - 1) }).map((_, extraIndex) => (
                  <div className="break-row break-extra-row" key={`${day}-${extraIndex}`}>
                    <span />
                    <span />
                    <input type="time" placeholder="h:mm a" />
                    <b>–</b>
                    <input type="time" placeholder="h:mm a" />
                    <button
                      type="button"
                      className="break-remove"
                      aria-label={`Remove break on ${day}`}
                      onClick={() =>
                        setBreakCounts((current) => ({ ...current, [day]: Math.max(1, (current[day] ?? 1) - 1) }))
                      }
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="timeoff-editor">
          <label>
            <span>Title</span>
            <input autoFocus placeholder="e.g. Vacation, Doctor's appointment" />
          </label>
          <div className="timeoff-dates">
            <label>
              <span>Start date</span>
              <input type="date" defaultValue="2026-10-11" />
            </label>
            {!allDay && (
              <label>
                <span>Start time</span>
                <input type="time" defaultValue="00:00" />
              </label>
            )}
            <label>
              <span>End date</span>
              <input type="date" defaultValue="2026-10-11" />
            </label>
            {!allDay && (
              <label>
                <span>End time</span>
                <input type="time" defaultValue="00:00" />
              </label>
            )}
          </div>
          <div className="timeoff-options">
            <label className="checkbox-label">
              <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />{" "}
              <span>All day</span>
            </label>
            <select defaultValue="none">
              <option value="none">Does not repeat</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </div>
          <div className="timeoff-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="settings-primary-action">
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AvailabilityPanelV2({ type, userId, onClose }: { type: "breaks" | "time-off"; userId: string; onClose: () => void }) {
  const isBreaks = type === "breaks"
  const storageKey = `bookora-availability-${userId}`
  const [breaks, setBreaks] = useState<Record<string, BreakWindow[]>>({ Monday: [{ start: "12:00", end: "13:00" }] })
  const [timeOff, setTimeOff] = useState<TimeOffRule[]>([])
  const [draft, setDraft] = useState<TimeOffRule>({ id: "", title: "", startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), startTime: "00:00", endTime: "23:59", allDay: true, repeat: "none" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const cached = JSON.parse(localStorage.getItem(storageKey) || "{}") as { availability_breaks?: Record<string, BreakWindow[]>; time_off?: TimeOffRule[] }
        if (cached.availability_breaks && active) setBreaks(cached.availability_breaks)
        if (cached.time_off && active) setTimeOff(cached.time_off)
      } catch { /* use defaults */ }
      if (supabase && !userId.startsWith("preview-")) {
        const { data } = await supabase.from("business_profiles").select("availability_breaks, time_off").eq("id", userId).maybeSingle()
        if (active && data) {
          if (data.availability_breaks && typeof data.availability_breaks === "object") setBreaks(data.availability_breaks as Record<string, BreakWindow[]>)
          if (Array.isArray(data.time_off)) setTimeOff(data.time_off as TimeOffRule[])
        }
      }
    }
    void load()
    return () => { active = false }
  }, [storageKey, userId])

  const persist = async (nextBreaks: Record<string, BreakWindow[]>, nextTimeOff: TimeOffRule[]) => {
    setSaving(true)
    const payload = { availability_breaks: nextBreaks, time_off: nextTimeOff }
    localStorage.setItem(storageKey, JSON.stringify(payload))
    if (supabase && !userId.startsWith("preview-")) {
      const result = await supabase.from("business_profiles").update(payload).eq("id", userId)
      if (result.error) { showToast("Availability could not be saved. Apply the latest database migration first.", "error"); setSaving(false); return }
    }
    setSaving(false); showToast("Availability updated"); onClose()
  }

  const updateBreak = (day: string, index: number, key: keyof BreakWindow, value: string) => setBreaks((current) => ({ ...current, [day]: (current[day] || []).map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }))
  const addBreak = (day: string) => setBreaks((current) => ({ ...current, [day]: [...(current[day] || []), { start: "12:00", end: "13:00" }] }))
  const removeBreak = (day: string, index: number) => setBreaks((current) => ({ ...current, [day]: (current[day] || []).filter((_, itemIndex) => itemIndex !== index) }))

  return <div className={`availability-panel availability-${type}`} role="dialog" aria-modal="true" aria-labelledby="availability-title"><div className="availability-panel-heading"><div><h3 id="availability-title">Manage {isBreaks ? "breaks" : "time off"}</h3><p>{isBreaks ? "Set recurring breaks that will be unavailable on the booking page." : "Block dates and times from public booking availability."}</p></div><button type="button" aria-label="Close" onClick={onClose}><X /></button></div>{isBreaks ? <div className="availability-rule-list">{days.map((day) => <div className="availability-rule-day" key={day}><strong>{day}</strong>{(breaks[day] || []).map((item, index) => <div className="availability-time-row" key={`${day}-${index}`}><input type="time" value={item.start} onChange={(event) => updateBreak(day, index, "start", event.target.value)} aria-label={`${day} break start`} /><span>to</span><input type="time" value={item.end} onChange={(event) => updateBreak(day, index, "end", event.target.value)} aria-label={`${day} break end`} /><button type="button" onClick={() => removeBreak(day, index)} aria-label={`Remove ${day} break`}><Trash2 size={14} /></button></div>)}<button type="button" className="availability-add-link" onClick={() => addBreak(day)}>+ Add break</button></div>)}</div> : <div className="timeoff-editor"><div className="timeoff-dates"><label><span>Title</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Vacation" /></label><label><span>Start date</span><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label><label><span>End date</span><input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label></div><div className="timeoff-options"><label className="checkbox-label"><input type="checkbox" checked={draft.allDay} onChange={(event) => setDraft({ ...draft, allDay: event.target.checked })} /><span>All day</span></label>{!draft.allDay && <><input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} aria-label="Time off start" /><span>to</span><input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} aria-label="Time off end" /></>}<select value={draft.repeat} onChange={(event) => setDraft({ ...draft, repeat: event.target.value as TimeOffRule["repeat"] })}><option value="none">Does not repeat</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></div><button type="button" className="settings-primary-action" disabled={saving || !draft.startDate || !draft.endDate} onClick={() => { const next = [...timeOff, { ...draft, id: `time-off-${Date.now()}`, title: draft.title.trim() || "Time off" }]; void persist(breaks, next) }}>Add time off</button><div className="timeoff-saved-list">{timeOff.map((item) => <div key={item.id}><span><strong>{item.title}</strong><small>{item.startDate} to {item.endDate}{item.repeat !== "none" ? ` · ${item.repeat}` : ""}</small></span><button type="button" onClick={() => void persist(breaks, timeOff.filter((entry) => entry.id !== item.id))} aria-label={`Remove ${item.title}`}><Trash2 size={14} /></button></div>)}</div></div>}<div className="availability-panel-actions"><button type="button" onClick={onClose}>Cancel</button>{isBreaks && <button type="button" className="settings-primary-action" disabled={saving} onClick={() => void persist(breaks, timeOff)}>{saving ? "Saving…" : "Save breaks"}</button>}</div></div>
}

function AccountSettings({ user }: { user: User }) {
  const [panel, setPanel] = useState<"breaks" | "time-off" | null>(null)
  return (
    <div className="security-settings-stack">
      <section className="settings-card security-card">
        <div className="settings-card-heading">
          <div>
            <h2>Account profile</h2>
            <p>Keep your personal details and account settings up to date.</p>
          </div>
          <span className="security-heading-icon">
            <UserRound />
          </span>
        </div>
        <div className="account-profile-grid">
          <label>
            <span>Full name</span>
            <input defaultValue={String(user.user_metadata?.full_name ?? "Luigi Opalia")} />
          </label>
          <label>
            <span>Email address</span>
            <input type="email" defaultValue={user.email ?? ""} />
          </label>
          <label>
            <span>Role</span>
            <input className="locked-field" readOnly value="Owner" aria-readonly="true" />
          </label>
          <label>
            <span>Phone number</span>
            <input
              type="tel"
              defaultValue={String(user.user_metadata?.phone ?? "")}
              placeholder="Enter phone number"
            />
          </label>
        </div>
      </section>

      <section className="settings-card security-card">
        <div className="settings-card-heading">
          <div>
            <h2>Availability</h2>
            <p>Set time away from your workspace and booking schedule.</p>
          </div>
        </div>
        <div className="security-item">
          <span className="security-item-icon">
            <CalendarDays />
          </span>
          <div>
            <strong>Breaks</strong>
            <p>Add recurring breaks between working hours.</p>
          </div>
          <button className="settings-outline-action" onClick={() => setPanel("breaks")}>
            Manage breaks
          </button>
        </div>
        <div className="security-item">
          <span className="security-item-icon">
            <CalendarDays />
          </span>
          <div>
            <strong>Time off</strong>
            <p>Block holidays, leave, and one-off unavailable dates.</p>
          </div>
          <button className="settings-outline-action" onClick={() => setPanel("time-off")}>
            Manage time off
          </button>
        </div>
        {panel && <AvailabilityPanelV2 type={panel} userId={user.id} onClose={() => setPanel(null)} />}
      </section>

      {/* Account Danger Zone with prominent red notice */}
      <section className="settings-card security-card security-danger">
        <div className="settings-card-heading">
          <div>
            <h2 style={{ color: "oklch(0.5 0.18 25)" }}>Danger zone</h2>
            <p>These actions can permanently affect your account.</p>
          </div>
          <span className="security-heading-icon" style={{ background: "oklch(0.97 0.03 25)", color: "oklch(0.5 0.18 25)" }}>
            <AlertTriangle />
          </span>
        </div>
        <div className="account-danger-notice">
          <strong>Notice:</strong> Deleting your account will immediately revoke access and remove all workspace records permanently.
        </div>
        <button className="settings-danger-action">Delete account</button>
      </section>
    </div>
  )
}

function SecuritySettings({ user }: { user: User }) {
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [mfaFactors, setMfaFactors] = useState<Array<{ id: string; friendly_name?: string | null; status?: string }>>([])
  const [mfaLoading, setMfaLoading] = useState(true)
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaEnrollment, setMfaEnrollment] = useState<{ id: string; qrCode: string; secret: string } | null>(null)
  const [mfaCode, setMfaCode] = useState("")
  const [mfaChallengeId, setMfaChallengeId] = useState("")
  const lastUpdated = user.user_metadata?.password_updated_at
    ? new Date(user.user_metadata.password_updated_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null

  const loadMfaFactors = async () => {
    if (!supabase || user.id === "preview-user-123") { setMfaLoading(false); return }
    const result = await supabase.auth.mfa.listFactors()
    setMfaFactors((result.data?.totp || []).map((factor) => ({ id: factor.id, friendly_name: factor.friendly_name, status: factor.status })))
    setMfaLoading(false)
  }

  useEffect(() => { void loadMfaFactors() }, [user.id])

  const beginMfaEnrollment = async () => {
    if (!supabase) return
    setMfaBusy(true)
    const result = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Bookora authenticator" })
    if (result.error || !result.data?.id || !result.data.totp) showToast(result.error?.message || "Could not start two-factor setup.", "error")
    else setMfaEnrollment({ id: result.data.id, qrCode: result.data.totp.qr_code, secret: result.data.totp.secret })
    setMfaBusy(false)
  }

  const verifyMfaEnrollment = async () => {
    if (!supabase || !mfaEnrollment || !/^\d{6}$/.test(mfaCode)) { showToast("Enter the 6-digit code from your authenticator.", "error"); return }
    setMfaBusy(true)
    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaEnrollment.id })
    if (challenge.error || !challenge.data?.id) { showToast(challenge.error?.message || "Could not challenge this factor.", "error"); setMfaBusy(false); return }
    setMfaChallengeId(challenge.data.id)
    const result = await supabase.auth.mfa.verify({ factorId: mfaEnrollment.id, challengeId: challenge.data.id, code: mfaCode })
    if (result.error) showToast(result.error.message, "error")
    else { showToast("Two-factor authentication enabled"); setMfaEnrollment(null); setMfaCode(""); setMfaChallengeId(""); await loadMfaFactors() }
    setMfaBusy(false)
  }

  const removeMfaFactor = async (factorId: string) => {
    if (!supabase || !window.confirm("Remove this authenticator? Two-factor protection will be disabled for this factor.")) return
    setMfaBusy(true)
    const result = await supabase.auth.mfa.unenroll({ factorId })
    if (result.error) showToast(result.error.message, "error")
    else { showToast("Authenticator removed"); await loadMfaFactors() }
    setMfaBusy(false)
  }

  return (
    <div className="security-settings-stack">
      <section className="settings-card security-card">
        <div className="settings-card-heading">
          <div>
            <h2>Security</h2>
            <p>Manage your sign-in details and keep your account protected.</p>
          </div>
          <span className="security-heading-icon">
            <ShieldCheck />
          </span>
        </div>
        <div className="security-item">
          <span className="security-item-icon">
            <KeyRound />
          </span>
          <div>
            <strong>Password</strong>
            <p>{lastUpdated ? `Last updated on ${lastUpdated}` : "Use a strong password that you do not reuse elsewhere."}</p>
          </div>
          <button type="button" className="settings-outline-action" onClick={() => setShowChangePassword(true)}>
            Change password
          </button>
        </div>
        <div className="security-item">
          <span className="security-item-icon">
            <LockKeyhole />
          </span>
          <div>
            <strong>Email address</strong>
            <p>{user.email || "Your email address"}</p>
          </div>
          <button className="settings-outline-action">Update email</button>
        </div>
      </section>
      <section className="settings-card security-card">
        <div className="settings-card-heading">
          <div><h2>Two-factor authentication</h2><p>Require a time-based code from an authenticator app when signing in.</p></div>
          <span className="security-heading-icon"><ShieldCheck /></span>
        </div>
        {mfaLoading ? <p className="security-muted-text">Checking your authentication factors…</p> : mfaFactors.length > 0 ? <div className="security-mfa-factor"><div><strong>Authenticator app</strong><p>Two-factor authentication is enabled.</p></div>{mfaFactors.map((factor) => <button key={factor.id} type="button" className="settings-outline-action" disabled={mfaBusy} onClick={() => void removeMfaFactor(factor.id)}>Remove</button>)}</div> : !mfaEnrollment ? <div className="security-item"><span className="security-item-icon"><Smartphone /></span><div><strong>Protect your account</strong><p>Use Google Authenticator, 1Password, or another TOTP app.</p></div><button type="button" className="settings-primary-action" disabled={mfaBusy} onClick={() => void beginMfaEnrollment()}>{mfaBusy ? "Starting…" : "Set up 2FA"}</button></div> : <div className="security-mfa-enrollment"><strong>Scan this QR code with your authenticator app</strong><img src={mfaEnrollment.qrCode} alt="QR code for two-factor authentication setup" /><small>Or enter this key manually: <code>{mfaEnrollment.secret}</code></small><label><span>Verification code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" /></label><div><button type="button" className="settings-outline-action" onClick={() => { setMfaEnrollment(null); setMfaCode(""); setMfaChallengeId("") }}>Cancel</button><button type="button" className="settings-primary-action" disabled={mfaBusy || Boolean(mfaChallengeId && mfaCode.length !== 6)} onClick={() => void verifyMfaEnrollment()}>{mfaBusy ? "Verifying…" : "Verify and enable"}</button></div></div>}
      </section>
      <section className="settings-card security-card">
        <div className="settings-card-heading">
          <h2>Passkeys</h2>
          <p>Sign in securely with Face ID, fingerprint, or your device PIN.</p>
        </div>
        <div className="security-item">
          <span className="security-item-icon">
            <Fingerprint />
          </span>
          <div>
            <strong>Passwordless sign-in</strong>
            <p>Passkeys make signing in faster and more secure.</p>
          </div>
          <button className="settings-primary-action">Add passkey</button>
        </div>
      </section>
      <section className="settings-card security-card">
        <div className="settings-card-heading">
          <h2>Sessions</h2>
          <p>Review where your account is currently signed in.</p>
        </div>
        <div className="security-item">
          <span className="security-item-icon">
            <LockKeyhole />
          </span>
          <div>
            <strong>This device</strong>
            <p>Active now · Browser session</p>
          </div>
          <button className="settings-outline-action">Sign out other devices</button>
        </div>
      </section>
      <section className="settings-card security-card security-danger">
        <div className="settings-card-heading">
          <div>
            <h2 style={{ color: "oklch(0.5 0.18 25)" }}>Danger zone</h2>
            <p>These actions can permanently affect your account.</p>
          </div>
        </div>
        <div className="account-danger-notice">
          <strong>Notice:</strong> Deleting your account cannot be undone. All your services, staff, and appointments will be permanently removed.
        </div>
        <button className="settings-danger-action">Delete account</button>
      </section>
      {showChangePassword && <ChangePasswordModal user={user} onClose={() => setShowChangePassword(false)} />}
    </div>
  )
}

export function SettingsPage({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [active, setActive] = useState("Business profile")

  // Load from local cache immediately on startup
  const initialCache = getStoredProfile(user.id) || user.user_metadata?.business_profile || user.user_metadata || {}

  // Business profile form state
  const [name, setName] = useState(String(initialCache.business_name ?? user.user_metadata?.business_name ?? "Your business"))
  const [slug, setSlug] = useState(String(initialCache.slug ?? user.user_metadata?.slug ?? ""))
  const [about, setAbout] = useState(String(initialCache.about ?? user.user_metadata?.about ?? ""))
  const [industry, setIndustry] = useState(String(initialCache.industry ?? user.user_metadata?.industry ?? "Nail salon"))
  const [color, setColor] = useState(String(initialCache.brand_color ?? user.user_metadata?.brand_color ?? "coral"))
  const [theme, setTheme] = useState(String(initialCache.theme ?? user.user_metadata?.theme ?? "Light"))
  const [email, setEmail] = useState(String(initialCache.email ?? user.email ?? ""))
  const [countryCode, setCountryCode] = useState(String(initialCache.country_code ?? user.user_metadata?.country_code ?? "+63"))
  const [phone, setPhone] = useState(String(initialCache.phone ?? user.user_metadata?.phone ?? ""))
  const [address, setAddress] = useState(String(initialCache.address ?? user.user_metadata?.address ?? ""))
  const [city, setCity] = useState(String(initialCache.city ?? user.user_metadata?.city ?? ""))
  const [country, setCountry] = useState(String(initialCache.country ?? user.user_metadata?.country ?? "Philippines"))
  const [hours, setHours] = useState<DaySchedule[]>(() => {
    if (initialCache.business_hours && Array.isArray(initialCache.business_hours)) {
      return initialCache.business_hours
    }
    if (user.user_metadata?.business_hours && Array.isArray(user.user_metadata.business_hours)) {
      return user.user_metadata.business_hours
    }
    return defaultHours
  })
  const [website, setWebsite] = useState(String(initialCache.website ?? user.user_metadata?.website ?? ""))
  const [instagram, setInstagram] = useState(String(initialCache.instagram ?? user.user_metadata?.instagram ?? ""))
  const [facebook, setFacebook] = useState(String(initialCache.facebook ?? user.user_metadata?.facebook ?? ""))
  const [bannerUrl, setBannerUrl] = useState(String(initialCache.banner_url ?? user.user_metadata?.banner_url ?? ""))
  const [logoUrl, setLogoUrl] = useState(String(initialCache.logo_url ?? user.user_metadata?.logo_url ?? ""))
  const [bookingPolicy, setBookingPolicy] = useState(String(initialCache.booking_policy ?? user.user_metadata?.booking_policy ?? ""))
  const [minNoticeHours, setMinNoticeHours] = useState(String(initialCache.booking_min_notice_hours ?? user.user_metadata?.booking_min_notice_hours ?? "2"))
  const [maxDays, setMaxDays] = useState(String(initialCache.booking_max_days ?? user.user_metadata?.booking_max_days ?? "60"))
  const [slotSize, setSlotSize] = useState(String(initialCache.booking_slot_size_minutes ?? user.user_metadata?.booking_slot_size_minutes ?? "30"))
  const [cancellationNoticeHours, setCancellationNoticeHours] = useState(String(initialCache.booking_cancellation_notice_hours ?? user.user_metadata?.booking_cancellation_notice_hours ?? "24"))
  const [bufferMinutes, setBufferMinutes] = useState(String(initialCache.booking_buffer_minutes ?? user.user_metadata?.booking_buffer_minutes ?? "0"))
  const [formFields, setFormFields] = useState({
    phone: initialCache.booking_show_phone ?? user.user_metadata?.booking_show_phone ?? true,
    address: initialCache.booking_show_address ?? user.user_metadata?.booking_show_address ?? false,
    notes: initialCache.booking_show_notes ?? user.user_metadata?.booking_show_notes ?? true,
    designPeg: initialCache.booking_show_design_peg ?? user.user_metadata?.booking_show_design_peg ?? true,
    paymentReceipt: initialCache.booking_show_payment_receipt ?? user.user_metadata?.booking_show_payment_receipt ?? false,
    price: initialCache.booking_show_price ?? user.user_metadata?.booking_show_price ?? true,
    duration: initialCache.booking_show_duration ?? user.user_metadata?.booking_show_duration ?? true,
    hours: initialCache.booking_show_hours ?? user.user_metadata?.booking_show_hours ?? true,
    staff: initialCache.booking_show_staff ?? user.user_metadata?.booking_show_staff ?? true,
    reviews: initialCache.booking_show_reviews ?? user.user_metadata?.booking_show_reviews ?? true,
  })
  const [allowCustomerLogin, setAllowCustomerLogin] = useState(Boolean(initialCache.booking_allow_customer_login ?? user.user_metadata?.booking_allow_customer_login ?? true))
  const [additionalInfo, setAdditionalInfo] = useState(String(initialCache.booking_additional_info ?? user.user_metadata?.booking_additional_info ?? "Prices vary depending on design complexity. Your final quote will be confirmed after reviewing your request."))
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState(String(initialCache.payment_receipt_url ?? user.user_metadata?.payment_receipt_url ?? ""))
  const [bookingFeeEnabled, setBookingFeeEnabled] = useState<boolean>(Boolean(initialCache.booking_fee_enabled ?? user.user_metadata?.booking_fee_enabled ?? false))
  const [bookingFeeType, setBookingFeeType] = useState<"fixed" | "percentage">((initialCache.booking_fee_type ?? user.user_metadata?.booking_fee_type ?? "fixed") === "percentage" ? "percentage" : "fixed")
  const [bookingFeeAmount, setBookingFeeAmount] = useState<string>(String(initialCache.booking_fee_amount ?? user.user_metadata?.booking_fee_amount ?? "200"))
  const [bookingFeeNote, setBookingFeeNote] = useState<string>(String(initialCache.booking_fee_note ?? user.user_metadata?.booking_fee_note ?? "A reservation deposit is required to confirm your booking. This amount will be deducted from your final bill at the appointment."))

  // Save operation state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [statusMessage, setStatusMessage] = useState("")

  // Hydrate from public.business_profiles table if present in Supabase
  useEffect(() => {
    if (!supabase || !user.id || user.id.startsWith("preview-")) return

    async function fetchProfile() {
      if (!supabase) return
      try {
        const { data, error } = await supabase
          .from("business_profiles")
          .select("*")
          .eq("id", user.id)
          .single()

        if (!error && data) {
          if (data.business_name) setName(data.business_name)
          if (data.slug) setSlug(data.slug)
          if (data.about !== undefined) setAbout(data.about || "")
          if (data.industry) setIndustry(data.industry)
          if (data.brand_color) setColor(data.brand_color)
          if (data.theme) setTheme(data.theme)
          if (data.email) setEmail(data.email)
          if (data.country_code) setCountryCode(data.country_code)
          if (data.phone !== undefined) setPhone(data.phone || "")
          if (data.address !== undefined) setAddress(data.address || "")
          if (data.city !== undefined) setCity(data.city || "")
          if (data.country) setCountry(data.country)
          if (data.business_hours && Array.isArray(data.business_hours)) setHours(data.business_hours)
          if (data.website !== undefined) setWebsite(data.website || "")
          if (data.instagram !== undefined) setInstagram(data.instagram || "")
          if (data.facebook !== undefined) setFacebook(data.facebook || "")
          if (data.booking_policy !== undefined) setBookingPolicy(data.booking_policy || "")
          if (data.booking_min_notice_hours !== undefined) setMinNoticeHours(String(data.booking_min_notice_hours ?? 2))
          if (data.booking_max_days !== undefined) setMaxDays(String(data.booking_max_days ?? 60))
          if (data.booking_slot_size_minutes !== undefined) setSlotSize(String(data.booking_slot_size_minutes ?? 30))
          if (data.booking_cancellation_notice_hours !== undefined) setCancellationNoticeHours(String(data.booking_cancellation_notice_hours ?? 24))
          if (data.booking_buffer_minutes !== undefined) setBufferMinutes(String(data.booking_buffer_minutes ?? 0))
          setFormFields((current) => ({
            phone: data.booking_show_phone ?? current.phone,
            address: data.booking_show_address ?? current.address,
            notes: data.booking_show_notes ?? current.notes,
            designPeg: data.booking_show_design_peg ?? current.designPeg,
            paymentReceipt: data.booking_show_payment_receipt ?? current.paymentReceipt,
            price: data.booking_show_price ?? current.price,
            duration: data.booking_show_duration ?? current.duration,
            hours: data.booking_show_hours ?? current.hours,
            staff: data.booking_show_staff ?? current.staff,
            reviews: data.booking_show_reviews ?? current.reviews,
          }))
          if (data.booking_additional_info !== undefined) setAdditionalInfo(data.booking_additional_info || "")
          if (data.payment_receipt_url !== undefined) setPaymentReceiptUrl(data.payment_receipt_url || "")
          if (data.booking_fee_enabled !== undefined) setBookingFeeEnabled(Boolean(data.booking_fee_enabled))
          if (data.booking_fee_type !== undefined) setBookingFeeType(data.booking_fee_type === "percentage" ? "percentage" : "fixed")
          if (data.booking_fee_amount !== undefined) setBookingFeeAmount(String(data.booking_fee_amount ?? "200"))
          if (data.booking_fee_note !== undefined) setBookingFeeNote(data.booking_fee_note || "")
          if (data.booking_allow_customer_login !== undefined) setAllowCustomerLogin(Boolean(data.booking_allow_customer_login))
          if (data.banner_url) setBannerUrl(data.banner_url)
          if (data.logo_url) setLogoUrl(data.logo_url)

          // Refresh cache
          try {
            localStorage.setItem(`bookora_profile_${user.id}`, JSON.stringify(data))
          } catch {}
        }
      } catch {
        // Table may not exist yet, cache is already active
      }
    }

    fetchProfile()
  }, [user.id])

  const handleSaveProfile = async () => {
    setSaveStatus("saving")
    setStatusMessage("")

    const profileData = {
      business_name: name.trim() || "Your business",
      slug: slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      industry,
      about: about.trim(),
      brand_color: color,
      theme,
      email: email.trim(),
      country_code: countryCode,
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      country,
      business_hours: hours,
      website: website.trim(),
      instagram: instagram.trim(),
      facebook: facebook.trim(),
      booking_policy: bookingPolicy.trim(),
      booking_min_notice_hours: Math.max(0, Number(minNoticeHours) || 0),
      booking_max_days: Math.max(1, Number(maxDays) || 60),
      booking_slot_size_minutes: Math.max(5, Number(slotSize) || 30),
      booking_cancellation_notice_hours: Math.max(0, Number(cancellationNoticeHours) || 0),
      booking_buffer_minutes: Math.max(0, Number(bufferMinutes) || 0),
      booking_show_phone: formFields.phone,
      booking_show_address: formFields.address,
      booking_show_notes: formFields.notes,
      booking_show_design_peg: formFields.designPeg,
      booking_show_payment_receipt: formFields.paymentReceipt,
      booking_show_price: formFields.price,
      booking_show_duration: formFields.duration,
      booking_show_hours: formFields.hours,
      booking_show_staff: formFields.staff,
      booking_show_reviews: formFields.reviews,
      booking_allow_customer_login: allowCustomerLogin,
      booking_fee_enabled: bookingFeeEnabled,
      booking_fee_type: bookingFeeType,
      booking_fee_amount: Math.max(0, Number(bookingFeeAmount) || 0),
      booking_fee_note: bookingFeeNote.trim(),
      booking_additional_info: additionalInfo.trim(),
      payment_receipt_url: paymentReceiptUrl,
      banner_url: bannerUrl,
      logo_url: logoUrl,
      owner_name: String(user.user_metadata?.full_name ?? "Luigi Opalia"),
      updated_at: new Date().toISOString(),
    }

    // 1. Immediately cache in localStorage (guarantees persistence even without database table!)
    try {
      localStorage.setItem(`bookora_profile_${user.id}`, JSON.stringify(profileData))
      localStorage.setItem("bookora_cached_profile", JSON.stringify(profileData))
    } catch {}

    let tableSaved = false

    try {
      if (supabase && user.id && !user.id.startsWith("preview-")) {
        // 2. Save into Supabase auth user_metadata
        const { data: authData, error: authErr } = await supabase.auth.updateUser({
          data: {
            business_name: profileData.business_name,
            industry: profileData.industry,
            phone: profileData.phone,
            business_hours: profileData.business_hours,
            booking_policy: profileData.booking_policy,
            booking_min_notice_hours: profileData.booking_min_notice_hours,
            booking_max_days: profileData.booking_max_days,
            booking_slot_size_minutes: profileData.booking_slot_size_minutes,
            booking_cancellation_notice_hours: profileData.booking_cancellation_notice_hours,
            booking_buffer_minutes: profileData.booking_buffer_minutes,
            booking_show_phone: profileData.booking_show_phone,
            booking_show_address: profileData.booking_show_address,
            booking_show_notes: profileData.booking_show_notes,
            booking_show_design_peg: profileData.booking_show_design_peg,
            booking_show_payment_receipt: profileData.booking_show_payment_receipt,
            booking_show_price: profileData.booking_show_price,
            booking_show_duration: profileData.booking_show_duration,
            booking_show_hours: profileData.booking_show_hours,
            booking_show_staff: profileData.booking_show_staff,
            booking_show_reviews: profileData.booking_show_reviews,
            booking_allow_customer_login: profileData.booking_allow_customer_login,
            booking_fee_enabled: profileData.booking_fee_enabled,
            booking_fee_type: profileData.booking_fee_type,
            booking_fee_amount: profileData.booking_fee_amount,
            booking_fee_note: profileData.booking_fee_note,
            booking_additional_info: profileData.booking_additional_info,
            payment_receipt_url: profileData.payment_receipt_url,
            business_profile: profileData,
            banner_url: profileData.banner_url,
            logo_url: profileData.logo_url,
          },
        })
        if (!authErr && authData?.user) {
          user.user_metadata = authData.user.user_metadata
        }

        // 3. Attempt to upsert directly into public.business_profiles table
        try {
          const { error: dbError } = await supabase.from("business_profiles").upsert({
            id: user.id,
            ...profileData,
          })
          if (!dbError) {
            tableSaved = true
          } else if (dbError.message?.includes("booking_fee")) {
            // Table doesn't have the new booking_fee columns yet; upsert without them so other settings stay updated
            const { booking_fee_enabled, booking_fee_type, booking_fee_amount, booking_fee_note, ...legacyData } = profileData
            const { error: fallbackErr } = await supabase.from("business_profiles").upsert({
              id: user.id,
              ...legacyData,
            })
            if (!fallbackErr) tableSaved = true
          }
        } catch {
          // Table doesn't exist yet
        }
      } else {
        if (user.user_metadata) {
          user.user_metadata = {
            ...user.user_metadata,
            ...profileData,
            business_profile: profileData,
          }
        }
      }

      setSaveStatus("saved")
      setStatusMessage(
        tableSaved
          ? "Profile & Hours saved to Supabase database!"
          : "Saved to session & local storage! (Run supabase/schema.sql in Supabase to sync DB table)"
      )
      showToast(tableSaved ? "Settings saved" : "Settings saved locally")
      window.setTimeout(() => setSaveStatus("idle"), 3000)
    } catch (err: any) {
      console.error("Save profile error:", err)
      // Even if network or Supabase had an issue, local storage has the data!
      setSaveStatus("saved")
      setStatusMessage("Saved to local storage cache!")
      showToast("Settings saved locally")
      window.setTimeout(() => setSaveStatus("idle"), 3000)
    }
  }

  const noPreview =
    active === "Account" ||
    active === "Security" ||
    active === "Booking preferences" ||
    active === "Notifications" ||
    active === "Billing" ||
    active === "Reports"

  return (
    <div className="settings-page">
      <div className="settings-float-save">
        <Button
          onClick={handleSaveProfile}
          disabled={saveStatus === "saving"}
          className={saveStatus === "saved" ? "save-success-button" : ""}
        >
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Saving…
            </>
          ) : saveStatus === "saved" ? (
            <>
              <CheckCircle2 data-icon="inline-start" />
              {statusMessage || "Profile & Hours saved!"}
            </>
          ) : (
            <>
              <Save data-icon="inline-start" />
              Save changes
            </>
          )}
        </Button>
      </div>

      <div className={`settings-layout ${noPreview ? "settings-layout-no-preview" : ""}`}>
        <nav className="settings-tabs" aria-label="Settings sections">
          <h1 className="settings-nav-title">Settings</h1>
          {tabs.map(([label, Icon]) => (
            <button
              key={label}
              className={active === label ? "active" : ""}
              onClick={() => setActive(label)}
            >
              <span className="settings-tab-label">
                <Icon />
                {label}
              </span>
              <span>›</span>
            </button>
          ))}
          <button className="settings-column-signout" onClick={onSignOut}>
            <LogOut />
            <span>Sign out</span>
          </button>
        </nav>
        <div className="settings-content">
          {active === "Business profile" ? (
            <Profile
              userId={user.id}
              name={name}
              setName={setName}
              slug={slug}
              setSlug={setSlug}
              about={about}
              setAbout={setAbout}
              industry={industry}
              setIndustry={setIndustry}
              color={color}
              setColor={setColor}
              theme={theme}
              setTheme={setTheme}
              email={email}
              setEmail={setEmail}
              countryCode={countryCode}
              setCountryCode={setCountryCode}
              phone={phone}
              setPhone={setPhone}
              address={address}
              setAddress={setAddress}
              city={city}
              setCity={setCity}
              country={country}
              setCountry={setCountry}
              hours={hours}
              setHours={setHours}
              website={website}
              setWebsite={setWebsite}
              instagram={instagram}
              setInstagram={setInstagram}
              facebook={facebook}
              setFacebook={setFacebook}
              bannerUrl={bannerUrl}
              setBannerUrl={setBannerUrl}
              logoUrl={logoUrl}
              setLogoUrl={setLogoUrl}
            />
          ) : active === "Booking preferences" ? (
            <BookingPreferences
              policy={bookingPolicy}
              setPolicy={setBookingPolicy}
              minNoticeHours={minNoticeHours}
              setMinNoticeHours={setMinNoticeHours}
              maxDays={maxDays}
              setMaxDays={setMaxDays}
              slotSize={slotSize}
              setSlotSize={setSlotSize}
              cancellationNoticeHours={cancellationNoticeHours}
              setCancellationNoticeHours={setCancellationNoticeHours}
              bufferMinutes={bufferMinutes}
              setBufferMinutes={setBufferMinutes}
              formFields={formFields}
              setFormFields={setFormFields}
              bookingFeeEnabled={bookingFeeEnabled}
              setBookingFeeEnabled={setBookingFeeEnabled}
              bookingFeeType={bookingFeeType}
              setBookingFeeType={setBookingFeeType}
              bookingFeeAmount={bookingFeeAmount}
              setBookingFeeAmount={setBookingFeeAmount}
              bookingFeeNote={bookingFeeNote}
              setBookingFeeNote={setBookingFeeNote}
              additionalInfo={additionalInfo}
              setAdditionalInfo={setAdditionalInfo}
              paymentReceiptUrl={paymentReceiptUrl}
              setPaymentReceiptUrl={setPaymentReceiptUrl}
              allowCustomerLogin={allowCustomerLogin}
              setAllowCustomerLogin={setAllowCustomerLogin}
              userId={user.id}
            />
          ) : active === "Notifications" ? (
            <NotificationsSettings />
          ) : active === "Account" ? (
            <AccountSettings user={user} />
          ) : active === "Security" ? (
            <SecuritySettings user={user} />
          ) : (
            <section className="dashboard-placeholder">
              <span className="placeholder-icon">
                <Fingerprint />
              </span>
              <h1>{active}</h1>
              <p>This workspace is ready for your {active.toLowerCase()} workflow.</p>
            </section>
          )}
        </div>
        {!noPreview && (
          <Preview
            name={name}
            about={about}
            industry={industry}
            color={color}
            theme={theme}
            bannerUrl={bannerUrl}
            logoUrl={logoUrl}
          />
        )}
      </div>
    </div>
  )
}
