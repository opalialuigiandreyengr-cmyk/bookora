import { useEffect, useMemo, useState, type FormEvent } from "react"
import type { User } from "@supabase/supabase-js"
import {
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  Heart,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Moon,
  Phone,
  Scissors,
  Sparkles,
  Star,
  Sun,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { signInWithGoogle } from "@/lib/googleAuth"
import { showToast } from "@/components/ui/toast"

type Service = {
  id: string
  name: string
  description: string
  duration: string
  price: string
  image?: string
  color?: string
  categoryId?: string
  category?: string
}

type ServiceCategory = { id: string; name: string }

type BusinessProfile = {
  id: string
  business_name: string
  slug: string | null
  industry: string | null
  about: string | null
  city: string | null
  country: string | null
  country_code: string | null
  phone: string | null
  address: string | null
  logo_url: string | null
  banner_url: string | null
  business_hours: Array<{ day: string; open: boolean; start: string; end?: string }> | null
  owner_name?: string | null
}

export type Review = {
  id: string
  business_id: string
  customer_name: string
  customer_email: string
  rating: number
  comment: string
  service_name?: string
  created_at: string
}

type AppointmentRecord = {
  id: string
  customer_name: string
  customer_email: string
  service_names: string
  appointment_date: string
  appointment_time: string
  total_price: string
  status: string
  customer_note?: string
  created_at: string
}

const fallbackCategories: ServiceCategory[] = [
  { id: "cat-main", name: "Main Services" },
  { id: "cat-rem", name: "Removal" },
  { id: "cat-home", name: "Home Service" },
]

const fallbackServices: Service[] = [
  { id: "softgel-ext", name: "Softgel Extension", description: "(prices may vary depending on your design)", duration: "90 min", price: "₱500", category: "Main Services", categoryId: "cat-main" },
  { id: "mani-gel", name: "Manicure Gel Polish", description: "(prices may vary depending on your design)", duration: "45 min", price: "₱350", category: "Main Services", categoryId: "cat-main" },
  { id: "rem-my-work", name: "Softgel Extension (My work)", description: "Previous set done by studio artist", duration: "20 min", price: "₱150", category: "Removal", categoryId: "cat-rem" },
  { id: "rem-not-my-work", name: "Softgel Extension (Not my work)", description: "Previous set from other salons", duration: "30 min", price: "₱200", category: "Removal", categoryId: "cat-rem" },
  { id: "rem-only", name: "Softgel Extension (Removal only)", description: "Standalone nail soak-off", duration: "30 min", price: "₱200", category: "Removal", categoryId: "cat-rem" },
  { id: "rem-gel-polish", name: "Manicure Gel Polish Removal", description: "Gentle gel polish removal", duration: "15 min", price: "₱100", category: "Removal", categoryId: "cat-rem" },
  { id: "home-min-2", name: "Home Service (Minimum of 2pax)", description: "₱250 [EACH] · Min. 2 clients", duration: "0 min", price: "₱250", category: "Home Service", categoryId: "cat-home" },
  { id: "home-max-4", name: "Home Service (Maximum of 4pax)", description: "₱200 [EACH] · Up to 4 clients", duration: "0 min", price: "₱200", category: "Home Service", categoryId: "cat-home" },
]

const timeSlots = ["9:00 AM", "10:30 AM", "12:00 PM", "1:30 PM", "3:00 PM", "4:30 PM"]

const philippinesDateParts = () => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])) as Record<string, string>
const philippinesTodayKey = () => { const parts = philippinesDateParts(); return `${parts.year}-${parts.month}-${parts.day}` }
const calendarKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
const calendarLabel = (key: string) => { const [year, month, day] = key.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day)); return { day: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date), date: String(day), month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date) } }
const restorePublicServiceOrder = (services: Service[], businessId: string) => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`bookora-services-order-${businessId}`) ?? "[]") as string[]
    if (!saved.length) return services
    const positions = new Map(saved.map((key, index) => [key, index]))
    return [...services].sort((a, b) => (positions.get(a.id ?? a.name) ?? saved.length) - (positions.get(b.id ?? b.name) ?? saved.length))
  } catch {
    return services
  }
}

export function CustomerBookingPage() {
  const [step, setStep] = useState(1)
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem("bookora-booking-theme") === "dark")
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [liveServices, setLiveServices] = useState<Service[]>([])
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [selectedDateKey, setSelectedDateKey] = useState(() => philippinesTodayKey())
  const [calendarMonth, setCalendarMonth] = useState(() => { const [year, month] = philippinesTodayKey().split("-").map(Number); return new Date(Date.UTC(year, month - 1, 1)) })
  const [time, setTime] = useState("")
  const [details, setDetails] = useState({ name: "", email: "", phone: "", note: "" })
  const [pegImage, setPegImage] = useState<string>("")
  const [pegImageName, setPegImageName] = useState<string>("")
  const [submittingBooking, setSubmittingBooking] = useState(false)

  // Auth & user states
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showAllReviewsModal, setShowAllReviewsModal] = useState(false)
  const [showMyBookings, setShowMyBookings] = useState(false)
  const [customerBookings, setCustomerBookings] = useState<AppointmentRecord[]>([])

  // Real Reviews state (no fake reviews)
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewFilter, setReviewFilter] = useState<"all" | "5" | "4" | "recent">("all")

  // Listen to Supabase auth state & pre-fill customer details
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null
      setCurrentUser(user)
      if (user) {
        setDetails((prev) => ({
          ...prev,
          name: prev.name || String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? ""),
          email: prev.email || user.email || "",
        }))
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      setCurrentUser(user)
      if (user) {
        setDetails((prev) => ({
          ...prev,
          name: prev.name || String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? ""),
          email: prev.email || user.email || "",
        }))
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const handlePegImageUpload = (file: File) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file (PNG, JPG, WEBP).")
      return
    }
    setPegImageName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      setPegImage(result)
    }
    reader.readAsDataURL(file)
  }

  const removePegImage = () => {
    setPegImage("")
    setPegImageName("")
  }

  const visibleServices = liveServices.length ? liveServices : fallbackServices
  const activeCategories = serviceCategories.length ? serviceCategories : fallbackCategories
  const selectedServices = useMemo(() => visibleServices.filter((service) => serviceIds.includes(service.id)), [serviceIds, visibleServices])
  const selectedServiceLabel = selectedServices.map((service) => service.name).join(", ")
  const selectedPriceLabel = selectedServices.map((service) => service.price).join(" + ")

  const parsePrice = (priceStr?: string): number => {
    if (!priceStr || /free/i.test(priceStr)) return 0
    const cleaned = priceStr.replace(/[^0-9.]/g, "")
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
  }

  const parseDurationMinutes = (durStr?: string): number => {
    if (!durStr) return 0
    let mins = 0
    const hrMatch = durStr.match(/(\d+)\s*(?:hr|hour)/i)
    if (hrMatch) mins += parseInt(hrMatch[1], 10) * 60
    const minMatch = durStr.match(/(\d+)\s*min/i)
    if (minMatch) mins += parseInt(minMatch[1], 10)
    if (!hrMatch && !minMatch) {
      const plainNum = parseInt(durStr.replace(/\D/g, ""), 10)
      if (!isNaN(plainNum)) mins += plainNum
    }
    return mins
  }

  const totalPriceNum = useMemo(() => {
    return selectedServices.reduce((sum, s) => sum + parsePrice(s.price), 0)
  }, [selectedServices])

  const totalDurationMinutes = useMemo(() => {
    return selectedServices.reduce((sum, s) => sum + parseDurationMinutes(s.duration), 0)
  }, [selectedServices])

  const formattedTotalDuration = useMemo(() => {
    if (totalDurationMinutes <= 0) return ""
    const hrs = Math.floor(totalDurationMinutes / 60)
    const mins = totalDurationMinutes % 60
    if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`
    if (hrs > 0) return `${hrs} hr`
    return `${mins} min`
  }, [totalDurationMinutes])

  const selectedPriceDisplay = useMemo(() => {
    if (!selectedServices.length) return ""
    if (totalPriceNum > 0) {
      const formattedTotal = `₱${totalPriceNum.toLocaleString("en-PH")}`
      if (selectedServices.length > 1) {
        return `${formattedTotal} (${selectedServices.map((s) => s.price).join(" + ")})`
      }
      return formattedTotal
    }
    return selectedServices.map((s) => s.price).join(" + ")
  }, [selectedServices, totalPriceNum])

  const serviceGroups = useMemo(() => {
    const groups = activeCategories.map((category) => ({
      name: category.name,
      services: visibleServices.filter((service) => service.categoryId === category.id || service.category === category.name)
    })).filter((group) => group.services.length)
    const uncategorized = visibleServices.filter((service) =>
      (!service.categoryId && !service.category) ||
      (!activeCategories.some((category) => category.id === service.categoryId) && !activeCategories.some((category) => category.name === service.category))
    )
    if (uncategorized.length) groups.push({ name: "", services: uncategorized })
    return groups
  }, [activeCategories, visibleServices])

  const todayKey = philippinesTodayKey()
  const selectedDate = calendarLabel(selectedDateKey)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth(), 1))
    const start = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth(), 1 - firstDay.getUTCDay()))
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setUTCDate(start.getUTCDate() + index)
      return { key: calendarKey(date), date, currentMonth: date.getUTCMonth() === calendarMonth.getUTCMonth() }
    })
  }, [calendarMonth])
  const calendarMonthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(calendarMonth)

  const businessName = profile?.business_name || "Your Studio"
  const businessAbout = profile?.about || ""
  const businessLocation = profile?.city || ""
  const businessAddress = profile?.address || businessLocation
  const businessPhone = [profile?.country_code, profile?.phone].filter(Boolean).join(" ")
  const businessInitial = businessName.trim().charAt(0).toUpperCase()
  const bookingBrandName = profile?.slug || businessName

  // Owner Name & Team Resolution (Real value based on owner's full name)
  const ownerFullName = profile?.owner_name || (currentUser?.user_metadata?.full_name ? String(currentUser.user_metadata.full_name) : "Luigi Opalia")
  const ownerFirstName = ownerFullName.trim().split(" ")[0]
  const ownerInitials = ownerFullName.trim().split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  const ownerRole = profile?.industry === "Hair salon"
    ? "Founder · Master Stylist"
    : profile?.industry === "Nail salon" || !profile?.industry
    ? "Founder · Master Nail Artist"
    : `Founder · Lead ${profile?.industry} Specialist`

  const bookingPolicies = [
    "A 50% deposit is required to secure your appointment.",
    "Please arrive 5–10 minutes early for your appointment.",
    "Cancellations or reschedules should be made at least 24 hours ahead.",
  ]
  const schedule = profile?.business_hours ?? []
  const philippinesTimeZone = "Asia/Manila"
  const formatScheduleTime = (value?: string) => value ? new Intl.DateTimeFormat("en-US", { timeZone: philippinesTimeZone, hour: "numeric", minute: "2-digit" }).format(new Date(`1970-01-01T${value}:00+08:00`)) : "Closed"
  const timeToMinutes = (value?: string) => value ? Number(value.split(":")[0]) * 60 + Number(value.split(":")[1] || 0) : -1
  const philippinesNow = new Intl.DateTimeFormat("en-US", { timeZone: philippinesTimeZone, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date())
  const todayName = philippinesNow.find((part) => part.type === "weekday")?.value || ""
  const todaySchedule = schedule.find((item) => item.day.toLowerCase() === todayName.toLowerCase())
  const currentMinutes = Number(philippinesNow.find((part) => part.type === "hour")?.value || 0) * 60 + Number(philippinesNow.find((part) => part.type === "minute")?.value || 0)
  const isOpenNow = Boolean(todaySchedule?.open && currentMinutes >= timeToMinutes(todaySchedule.start) && currentMinutes < timeToMinutes(todaySchedule.end))
  const weekdayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const todayIndex = weekdayOrder.findIndex((day) => day.toLowerCase() === todayName.toLowerCase())
  const nextOpenSchedule = Array.from({ length: 7 }, (_, offset) => {
    const dayName = weekdayOrder[(todayIndex + offset + 7) % 7]
    const item = schedule.find((entry) => entry.day.toLowerCase() === dayName.toLowerCase())
    if (!item?.open || !item.start) return null
    if (offset === 0 && currentMinutes >= timeToMinutes(item.start)) return null
    return item
  }).find(Boolean)
  const todaySummary = isOpenNow ? `Open now · Closes ${formatScheduleTime(todaySchedule?.end)}` : nextOpenSchedule ? `Closed · Opens ${formatScheduleTime(nextOpenSchedule.start)} ${nextOpenSchedule.day.slice(0, 3)}` : todaySchedule?.open ? `Closed · Opens ${formatScheduleTime(todaySchedule.start)} ${todaySchedule.day.slice(0, 3)}` : "Hours unavailable"

  // Check if selected appointment date falls on a closed day
  const selectedDayOfWeekName = useMemo(() => {
    const [year, month, day] = selectedDateKey.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date)
  }, [selectedDateKey])

  const isSelectedDateClosed = useMemo(() => {
    if (!schedule.length) return false
    const match = schedule.find((s) => s.day.toLowerCase() === selectedDayOfWeekName.toLowerCase())
    return match ? !match.open : false
  }, [schedule, selectedDayOfWeekName])

  // Operating hours summary for left sidebar (dynamic instead of hardcoded)
  const dynamicScheduleSummary = useMemo(() => {
    if (!schedule.length) return "Mon–Sat · 9:00 AM–6:00 PM"
    const openDays = schedule.filter((s) => s.open)
    if (!openDays.length) return "By appointment only"
    const firstOpen = openDays[0]
    const lastOpen = openDays[openDays.length - 1]
    const timeRange = firstOpen.start && firstOpen.end ? `${formatScheduleTime(firstOpen.start)}–${formatScheduleTime(firstOpen.end)}` : "9:00 AM–5:00 PM"
    return `${firstOpen.day.slice(0, 3)}–${lastOpen.day.slice(0, 3)} · ${timeRange}`
  }, [schedule])

  // Real Reviews calculations (zero fake reviews)
  const totalReviews = reviews.length
  const averageRating = useMemo(() => {
    if (totalReviews === 0) return "5.0"
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
    return (sum / totalReviews).toFixed(1)
  }, [reviews, totalReviews])

  const ratingCounts = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    reviews.forEach((r) => {
      const star = r.rating as 1 | 2 | 3 | 4 | 5
      if (counts[star] !== undefined) counts[star]++
    })
    return counts
  }, [reviews])

  const filteredReviews = useMemo(() => {
    if (reviewFilter === "5") return reviews.filter((r) => r.rating === 5)
    if (reviewFilter === "4") return reviews.filter((r) => r.rating === 4)
    if (reviewFilter === "recent") return [...reviews].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return reviews
  }, [reviews, reviewFilter])

  // Top 3 Recent Reviews to showcase on the main booking page
  const topRecentReviews = useMemo(() => {
    return [...reviews]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3)
  }, [reviews])

  // Lock background body scroll when any modal is active
  const isAnyModalOpen = Boolean(showAuthModal || showReviewModal || showMyBookings || showAllReviewsModal)

  useEffect(() => {
    if (!isAnyModalOpen) return

    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    document.body.style.overflow = "hidden"
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
    }
  }, [isAnyModalOpen])

  useEffect(() => {
    window.localStorage.setItem("bookora-booking-theme", darkMode ? "dark" : "light")
  }, [darkMode])

  useEffect(() => {
    if (!scheduleOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".schedule-control")) setScheduleOpen(false)
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [scheduleOpen])

  useEffect(() => {
    let active = true
    const hostParts = window.location.hostname.split(".")
    const hostSuffix = hostParts.slice(-2).join(".")
    const hostSlug = hostParts.length >= 3 && ["bookora.com", "bookoraph.com"].includes(hostSuffix) ? hostParts[0] : ""
    const pathParts = window.location.pathname.split("/").filter(Boolean)
    const pathSlug = (pathParts[0] === "book" || pathParts[0] === "booking") && pathParts[1] ? decodeURIComponent(pathParts[1]) : ""
    const bookingSlug = new URLSearchParams(window.location.search).get("slug")?.trim() || pathSlug || hostSlug

    const loadPublicBookingData = async () => {
      if (!supabase) return
      const profileQuery = supabase
        .from("business_profiles")
        .select("id, business_name, slug, industry, about, city, country, country_code, phone, address, logo_url, banner_url, business_hours, owner_name")
      const { data: businesses, error: profileError } = bookingSlug
        ? await profileQuery.eq("slug", bookingSlug).limit(1)
        : await profileQuery.order("created_at", { ascending: true }).limit(1)
      const business = businesses?.[0]
      if (!active || profileError || !business) return
      setProfile(business as BusinessProfile)

      // Fetch reviews
      loadReviews(business.id)

      const [categoryRes, serviceRes] = await Promise.all([
        supabase.from("service_categories").select("id, name").eq("business_id", business.id).order("created_at"),
        supabase.from("services").select("id, name, description, duration_minutes, price, category_id, image_url, show_on_booking_page").eq("business_id", business.id).eq("show_on_booking_page", true).order("created_at"),
      ])
      if (!active) return

      let serviceRows: any[] | null = serviceRes.data
      if (serviceRes.error) {
        const fallbackRes = await supabase.from("services").select("id, name, duration_minutes, price, category_id, image_url, show_on_booking_page").eq("business_id", business.id).eq("show_on_booking_page", true).order("created_at")
        serviceRows = fallbackRes.data ?? []
      }

      setServiceCategories((categoryRes.data ?? []) as ServiceCategory[])
      const publicServices = (serviceRows ?? []).map((row: any, index: number) => ({
        id: row.id,
        name: row.name,
        description: row.description || (business.industry ? `${business.industry} service` : "Made with thoughtful detail"),
        duration: row.duration_minutes ? `${row.duration_minutes} min` : "Duration varies",
        price: row.price || "Price on request",
        categoryId: row.category_id || undefined,
        category: (categoryRes.data ?? []).find((category: any) => category.id === row.category_id)?.name,
        image: row.image_url || "",
        color: ["coral", "lavender", "mint", "peach"][index % 4],
      })) as Service[]
      setLiveServices(restorePublicServiceOrder(publicServices, business.id))
    }
    loadPublicBookingData().catch(() => undefined)
    return () => { active = false }
  }, [])

  // Load reviews from Supabase and localStorage fallback (no fake reviews)
  const loadReviews = async (businessId: string) => {
    const localKey = `bookora_reviews_${businessId}`
    let realReviews: Review[] = []
    try {
      const cached = localStorage.getItem(localKey)
      if (cached) realReviews = JSON.parse(cached)
    } catch {}

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("business_reviews")
          .select("*")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
        if (!error && data && data.length > 0) {
          setReviews(data as Review[])
          localStorage.setItem(localKey, JSON.stringify(data))
          return
        }
      } catch {}
    }

    setReviews(realReviews)
  }

  // Load user appointments
  const fetchUserBookings = async (email: string) => {
    let list: AppointmentRecord[] = []
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("appointments")
          .select("*")
          .eq("customer_email", email)
          .order("created_at", { ascending: false })
        if (!error && data) list = data as AppointmentRecord[]
      } catch {}
    }
    try {
      const local = JSON.parse(localStorage.getItem(`bookora_local_bookings_${email}`) || "[]")
      const ids = new Set(list.map((item) => item.id))
      local.forEach((item: AppointmentRecord) => {
        if (!ids.has(item.id)) list.push(item)
      })
    } catch {}
    setCustomerBookings(list)
  }

  const canContinue = step === 1 ? selectedServices.length > 0 : step === 2 ? Boolean(time) : Boolean(details.name.trim() && (details.email.trim() || details.phone.trim()))
  const toggleService = (id: string) => setServiceIds((current) => current.includes(id) ? current.filter((serviceId) => serviceId !== id) : [...current, id])
  const updateDetail = (key: keyof typeof details, value: string) => setDetails((current) => ({ ...current, [key]: value }))

  // Handle Review Submission
  const handleSubmitReview = async (reviewInput: { name: string; email: string; rating: number; comment: string; service?: string }) => {
    const businessId = profile?.id || "default-business"
    const newReview: Review = {
      id: crypto.randomUUID ? crypto.randomUUID() : `rev-${Date.now()}`,
      business_id: businessId,
      customer_name: reviewInput.name.trim(),
      customer_email: reviewInput.email.trim(),
      rating: reviewInput.rating,
      comment: reviewInput.comment.trim(),
      service_name: reviewInput.service || undefined,
      created_at: new Date().toISOString(),
    }

    try {
      if (supabase && profile?.id) {
        await supabase.from("business_reviews").insert(newReview)
      }
    } catch (err) {
      console.warn("Saved review locally", err)
    }

    const updated = [newReview, ...reviews]
    setReviews(updated)
    try {
      localStorage.setItem(`bookora_reviews_${businessId}`, JSON.stringify(updated))
    } catch {}

    showToast("✨ Thank you! Your review has been submitted.")
    setShowReviewModal(false)
  }

  return (
    <main className={`customer-booking-page ${darkMode ? "booking-dark" : ""} ${step >= 2 ? "date-time-page" : ""}`}>
      {/* Top Header */}
      <header className="booking-header">
        <a className="booking-brand" href="/" aria-label={`${bookingBrandName} booking page`}>
          {profile?.logo_url ? <img className="booking-brand-logo" src={profile.logo_url} alt="" /> : <span className="booking-brand-mark">b</span>}
          <span>{bookingBrandName}</span>
        </a>

        <nav className="booking-nav" aria-label="Main navigation">
          <a href="#services" onClick={() => setMenuOpen(false)}>Services</a>
          <a href="#team" onClick={() => setMenuOpen(false)}>Artist</a>
          <a href="#reviews" onClick={() => setMenuOpen(false)}>Reviews</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
        </nav>

        <div className="booking-header-actions">
          <button className="booking-host" type="button" onClick={() => (window.location.href = "/")}>
            List your studio
          </button>
          <button className="booking-language" type="button">
            <Globe2 size={16} /> EN <ChevronDown size={13} />
          </button>
          <button
            className="booking-theme-toggle"
            type="button"
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setDarkMode((enabled) => !enabled)}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* User Account / Guest Sign In in Header */}
          {!currentUser ? (
            <button
              className="booking-signin-btn"
              type="button"
              onClick={() => setShowAuthModal(true)}
              aria-label="Sign in or register"
            >
              <UserRound size={15} />
              <span>Sign in</span>
            </button>
          ) : (
            <div className="booking-menu-wrap">
              <button
                className={`booking-user-badge ${accountOpen ? "is-open" : ""}`}
                type="button"
                aria-label="Open user account menu"
                aria-expanded={accountOpen}
                onClick={() => {
                  setAccountOpen((open) => !open)
                  setMenuOpen(false)
                }}
              >
                <span className="booking-user-avatar">
                  {currentUser.user_metadata?.full_name?.charAt(0)?.toUpperCase() || currentUser.email?.charAt(0)?.toUpperCase() || "U"}
                </span>
                <span className="booking-user-name">
                  {currentUser.user_metadata?.full_name?.split(" ")[0] || currentUser.email?.split("@")[0] || "Account"}
                </span>
                <ChevronDown size={13} />
              </button>

              {accountOpen && (
                <div className="account-dropdown" role="menu">
                  <div className="account-user-meta">
                    <strong>{String(currentUser.user_metadata?.full_name ?? currentUser.email?.split("@")[0])}</strong>
                    <span>{currentUser.email}</span>
                    <span className="user-badge-tag">Verified Client</span>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false)
                      if (currentUser?.email) fetchUserBookings(currentUser.email)
                      setShowMyBookings(true)
                    }}
                  >
                    <CalendarDays size={15} /> My bookings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false)
                      setShowReviewModal(true)
                    }}
                  >
                    <Star size={15} /> Write a review
                  </button>
                  <button type="button" role="menuitem" onClick={() => setAccountOpen(false)}>
                    <Heart size={15} /> Saved studios
                  </button>
                  <div className="account-dropdown-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      setAccountOpen(false)
                      if (supabase) await supabase.auth.signOut()
                      setCurrentUser(null)
                      showToast("Signed out successfully.")
                    }}
                  >
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile navigation toggle */}
          <button
            className={`booking-mobile-toggle ${menuOpen ? "is-open" : ""}`}
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open)
              setAccountOpen(false)
            }}
          >
            {menuOpen ? <ChevronDown size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {menuOpen && (
        <div className="booking-mobile-menu" role="dialog" aria-label="Navigation menu">
          <div className="mobile-menu-heading">
            <strong>Explore {businessName}</strong>
            <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <a href="#services" onClick={() => setMenuOpen(false)}>
            Services <ArrowRight size={16} />
          </a>
          <a href="#team" onClick={() => setMenuOpen(false)}>
            Meet your artist <ArrowRight size={16} />
          </a>
          <a href="#reviews" onClick={() => setMenuOpen(false)}>
            Guest reviews ({totalReviews}) <ArrowRight size={16} />
          </a>
          <a href="#about" onClick={() => setMenuOpen(false)}>
            About the studio <ArrowRight size={16} />
          </a>
          {!currentUser ? (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setShowAuthModal(true)
              }}
              style={{ color: "#d85b53", fontWeight: 800 }}
            >
              Sign in to Bookora <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                if (currentUser.email) fetchUserBookings(currentUser.email)
                setShowMyBookings(true)
              }}
            >
              My Bookings <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}

      {/* Banner */}
      {profile?.banner_url && (
        <section className="booking-banner" aria-label={`${businessName} studio banner`}>
          <img src={profile.banner_url} alt="" />
          <div className="booking-banner-overlay">
            <div>
              <p>{profile.industry || "Boutique Studio"}</p>
              <h2>{businessName}</h2>
              <span>
                {businessAddress}
                {businessLocation && businessAddress !== businessLocation ? ` · ${businessLocation}` : ""}
              </span>
              {businessPhone && (
                <small>
                  <Phone size={13} /> {businessPhone}
                </small>
              )}
            </div>
            <a href="#choose-service">
              Book now <ArrowRight size={15} />
            </a>
          </div>
        </section>
      )}

      {/* Main Booking Interactive Layout */}
      <div className={`booking-layout ${step >= 2 ? "date-time-layout" : ""}`} id="booking-flow">
        {/* Left Side: Business Profile Summary */}
        <aside className="booking-business-panel">
          <div className="business-identity">
            <div className="business-avatar">{profile?.logo_url ? <img src={profile.logo_url} alt="" /> : businessInitial}</div>
            <div>
              <p className="booking-eyebrow">You’re booking with</p>
              <h1>{businessName}</h1>
            </div>
          </div>
          <p className="business-description">
            {businessAbout || `Welcome to ${businessName}. Dedicated to personalized treatments and thoughtful attention to detail.`}
          </p>

          <div className="business-meta">
            <Clock3 size={16} /> <span>{dynamicScheduleSummary}</span>
          </div>

          {/* Real Dynamic Business Rating */}
          <div className="business-rating">
            <span className="rating-stars" style={{ color: "#f59e0b" }}>
              {"★".repeat(totalReviews > 0 ? Math.round(Number(averageRating)) : 5)}
            </span>
            <strong>{totalReviews > 0 ? averageRating : "New"}</strong>
            <span>{totalReviews > 0 ? `(${totalReviews} client reviews)` : "Verified studio"}</span>
          </div>

          <div className="schedule-control">
            <button
              type="button"
              className="schedule-trigger"
              aria-expanded={scheduleOpen}
              onClick={() => setScheduleOpen((open) => !open)}
            >
              <span>
                <Clock3 size={16} /> <strong>{todaySummary}</strong>
              </span>
              <ChevronDown size={16} className={scheduleOpen ? "rotated" : ""} />
            </button>
            {scheduleOpen && (
              <div className="schedule-dropdown">
                {schedule.length ? (
                  schedule.map((item) => (
                    <div className={`schedule-row ${item.day.toLowerCase() === todayName.toLowerCase() ? "today" : ""}`} key={item.day}>
                      <span>
                        {item.day}
                        {item.day.toLowerCase() === todayName.toLowerCase() ? " · Today" : ""}
                      </span>
                      <strong>{item.open ? `${formatScheduleTime(item.start)} – ${formatScheduleTime(item.end)}` : "Closed"}</strong>
                    </div>
                  ))
                ) : (
                  <p className="schedule-empty">Hours haven’t been added yet.</p>
                )}
              </div>
            )}
          </div>

          <div className="business-divider" />

          <section className="booking-policy-card" aria-labelledby="booking-policy-title">
            <div className="policy-heading">
              <Sparkles size={15} />
              <h2 id="booking-policy-title">Booking policy</h2>
            </div>
            <ul>
              {bookingPolicies.map((policy) => (
                <li key={policy}>{policy}</li>
              ))}
            </ul>
          </section>

          <p className="business-note">
            <Sparkles size={16} /> Appointments are held for 10 minutes upon confirmation.
          </p>
        </aside>

        {/* Right Side: Step Wizard */}
        <section className={`booking-card ${step === 1 ? "service-selection-card" : ""}`} aria-labelledby="choose-service">
          {/* STEP 1: Select Services */}
          {step === 1 && (
            <div className="booking-step">
              <div className="step-heading">
                <div className="step-icon">
                  <Scissors size={19} />
                </div>
                <div>
                  <p className="booking-kicker">{businessName}</p>
                  <h2 id="choose-service">Choose services</h2>
                  <p>Select one or more services to book together.</p>
                </div>
              </div>
              <div className="service-list" role="radiogroup" aria-label="Available services">
                {serviceGroups.length ? (
                  serviceGroups.map((group) => (
                    <section className="service-category-group" key={group.name || "uncategorized"} aria-label={group.name || "Available services"}>
                      {group.name && <h3>{group.name}</h3>}
                      {group.services.map((service) => (
                        <button
                          key={service.id}
                          className={`service-option ${serviceIds.includes(service.id) ? "selected" : ""}`}
                          type="button"
                          role="checkbox"
                          aria-checked={serviceIds.includes(service.id)}
                          onClick={() => toggleService(service.id)}
                        >
                          {service.image ? (
                            <img className="service-image" src={service.image} alt="" />
                          ) : (
                            <span className="service-image service-image-placeholder">
                              <Sparkles size={16} />
                            </span>
                          )}
                          <span className="service-copy">
                            <strong>{service.name}</strong>
                            {service.description && <span title={service.description}>{service.description}</span>}
                            <small>
                              <Clock3 size={13} /> {service.duration}
                            </small>
                          </span>
                          <span className="service-price">
                            {service.price}
                            <span className="radio-indicator">{serviceIds.includes(service.id) && <Check size={14} />}</span>
                          </span>
                        </button>
                      ))}
                    </section>
                  ))
                ) : (
                  <p className="services-empty">No services are available for online booking yet.</p>
                )}
              </div>
              <div className="booking-actions">
                <span className="secure-note">
                  {selectedServices.length > 0 ? (
                    <>
                      <strong>{selectedServices.length} selected</strong> ·{" "}
                      {totalPriceNum > 0 ? `₱${totalPriceNum.toLocaleString("en-PH")}` : selectedPriceLabel}
                      {formattedTotalDuration ? ` · ~${formattedTotalDuration}` : ""}
                    </>
                  ) : (
                    "No payment required today"
                  )}
                </span>
                <button className="booking-primary" type="button" disabled={!canContinue} onClick={() => setStep(2)}>
                  Continue <ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Pick Date & Time */}
          {step === 2 && (
            <div className="booking-step">
              <button className="booking-back" type="button" onClick={() => setStep(1)}>
                <ChevronLeft size={16} /> Back to services
              </button>
              <div className="step-heading">
                <div className="step-icon">
                  <CalendarDays size={19} />
                </div>
                <div>
                  <p className="booking-kicker">
                    {selectedServiceLabel}
                    {formattedTotalDuration ? ` · ~${formattedTotalDuration}` : ""}
                  </p>
                  <h2>Pick a date & time</h2>
                  <p>All times are shown in Philippine Standard Time (PST).</p>
                </div>
              </div>

              {isSelectedDateClosed && (
                <div className="guest-auth-prompt" style={{ marginBottom: 18, background: "#fef3c7", borderColor: "#fde68a", color: "#92400e" }}>
                  <span>⚠️ Notice: The studio is normally closed on {selectedDayOfWeekName}s. Please select an open day, or pick an available slot below.</span>
                </div>
              )}

              <div className="calendar-picker" aria-label="Choose an appointment date">
                <div className="calendar-toolbar">
                  <strong>{calendarMonthLabel}</strong>
                  <div>
                    <button
                      type="button"
                      aria-label="Previous month"
                      disabled={calendarMonth.getTime() <= new Date(`${todayKey}T00:00:00Z`).setUTCDate(1)}
                      onClick={() => setCalendarMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="Next month"
                      onClick={() => setCalendarMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
                <div className="calendar-weekdays">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="calendar-grid">
                  {calendarDays.map((day) => {
                    const disabled = day.key < todayKey
                    return (
                      <button
                        key={day.key}
                        type="button"
                        className={`calendar-day ${day.currentMonth ? "" : "outside-month"} ${selectedDateKey === day.key ? "selected" : ""} ${day.key === todayKey ? "today" : ""}`}
                        disabled={disabled}
                        onClick={() => {
                          setSelectedDateKey(day.key)
                          setTime("")
                        }}
                      >
                        <span>{day.date.getUTCDate()}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="time-section">
                <div className="subsection-heading">
                  <span>Available times</span>
                  <small>
                    {selectedDate.day}, {selectedDate.month} {selectedDate.date}
                  </small>
                </div>
                <div className="time-grid">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot}
                      className={`time-option ${time === slot ? "selected" : ""}`}
                      type="button"
                      onClick={() => setTime(slot)}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              <div className="booking-actions">
                <span className="secure-note">
                  <CalendarDays size={14} /> Free cancellation up to 24 hours before
                </span>
                <button className="booking-primary" type="button" disabled={!canContinue} onClick={() => setStep(3)}>
                  Continue <ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Customer Details & Design Peg */}
          {step === 3 && (
            <div className="booking-step">
              <button className="booking-back" type="button" onClick={() => setStep(2)}>
                <ChevronLeft size={16} /> Back to date & time
              </button>
              <div className="step-heading">
                <div className="step-icon">
                  <UserRound size={19} />
                </div>
                <div>
                  <p className="booking-kicker">Almost there</p>
                  <h2>Your details</h2>
                  <p>We’ll use these to confirm your appointment and send details.</p>
                </div>
              </div>

              {/* Guest prompt OR Signed-in confirmation badge */}
              {!currentUser ? (
                <div className="guest-auth-prompt" style={{ marginBottom: 18 }}>
                  <div className="guest-auth-prompt-content">
                    <UserRound size={16} />
                    <span>Booking as a guest? You can type your info below, or sign in to save appointment history.</span>
                  </div>
                  <button type="button" className="guest-signin-link-btn" onClick={() => setShowAuthModal(true)}>
                    Sign in with Google / Email →
                  </button>
                </div>
              ) : (
                <div className="user-logged-badge" style={{ marginBottom: 18 }}>
                  <div className="user-logged-badge-left">
                    <CheckCircle2 size={16} />
                    <span>
                      Signed in as <strong>{String(currentUser.user_metadata?.full_name ?? currentUser.email?.split("@")[0])}</strong> ({currentUser.email})
                    </span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>Details auto-filled</span>
                </div>
              )}

              <form
                className="details-form"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (!canContinue || submittingBooking) return
                  setSubmittingBooking(true)
                  try {
                    const noteContent = [
                      details.note.trim(),
                      pegImageName ? `[Peg Reference Attached: ${pegImageName}]` : "",
                    ].filter(Boolean).join("\n")

                    const appointmentPayload = {
                      business_id: profile?.id || "demo-business",
                      customer_name: details.name.trim(),
                      customer_email: details.email.trim(),
                      customer_phone: details.phone.trim(),
                      customer_note: noteContent,
                      service_names: selectedServiceLabel,
                      total_price: totalPriceNum > 0 ? `₱${totalPriceNum.toLocaleString("en-PH")}` : selectedPriceLabel,
                      appointment_date: selectedDateKey,
                      appointment_time: time,
                      status: "pending",
                    }

                    if (supabase && profile?.id) {
                      await supabase.from("appointments").insert(appointmentPayload)
                    }

                    // Store locally so customer can see it in "My Bookings"
                    if (details.email) {
                      const localKey = `bookora_local_bookings_${details.email.trim()}`
                      const prevBookings = JSON.parse(localStorage.getItem(localKey) || "[]")
                      prevBookings.unshift({
                        ...appointmentPayload,
                        id: `apt-${Date.now()}`,
                        created_at: new Date().toISOString(),
                      })
                      localStorage.setItem(localKey, JSON.stringify(prevBookings))
                    }
                  } catch (err) {
                    console.warn("Notice: appointment saved locally", err)
                  } finally {
                    setSubmittingBooking(false)
                    setStep(4)
                  }
                }}
              >
                <label>
                  Full name
                  <input
                    autoComplete="name"
                    value={details.name}
                    onChange={(event) => updateDetail("name", event.target.value)}
                    placeholder="e.g. Maria Santos"
                    required
                  />
                </label>

                <div className="field-row">
                  <label>
                    Email address
                    <input
                      type="email"
                      autoComplete="email"
                      value={details.email}
                      onChange={(event) => updateDetail("email", event.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                  <label>
                    Mobile number
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={details.phone}
                      onChange={(event) => updateDetail("phone", event.target.value)}
                      placeholder="09XX XXX XXXX"
                      required
                    />
                  </label>
                </div>

                {/* Peg attachment */}
                <div className="peg-attachment-field">
                  <div className="peg-field-header">
                    <span>
                      Design peg / Inspo photo <span className="optional">Optional</span>
                    </span>
                    {pegImage && (
                      <button type="button" className="peg-remove-btn" onClick={removePegImage}>
                        <Trash2 size={13} /> Remove photo
                      </button>
                    )}
                  </div>

                  {!pegImage ? (
                    <label htmlFor="peg-file-input" className="peg-dropzone">
                      <input
                        id="peg-file-input"
                        type="file"
                        accept="image/*"
                        className="peg-file-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handlePegImageUpload(file)
                        }}
                      />
                      <div className="peg-dropzone-icon">
                        <Camera size={21} />
                      </div>
                      <div className="peg-dropzone-text">
                        <strong>Attach design peg or reference photo</strong>
                        <span>Tap to upload or take a photo · PNG, JPG, WEBP</span>
                      </div>
                    </label>
                  ) : (
                    <div className="peg-preview-card">
                      <img src={pegImage} alt="Design peg reference" className="peg-preview-thumb" />
                      <div className="peg-preview-info">
                        <span className="peg-badge">
                          <Check size={12} /> Photo attached
                        </span>
                        <strong className="peg-file-title" title={pegImageName}>
                          {pegImageName || "Design-peg.jpg"}
                        </strong>
                        <label htmlFor="peg-file-replace" className="peg-replace-label">
                          <input
                            id="peg-file-replace"
                            type="file"
                            accept="image/*"
                            className="peg-file-input"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handlePegImageUpload(file)
                            }}
                          />
                          Change photo
                        </label>
                      </div>
                    </div>
                  )}

                  <textarea
                    value={details.note}
                    onChange={(event) => updateDetail("note", event.target.value)}
                    placeholder="Describe requested styling, shape, colors, or notes (e.g. short square, chrome French tip, 3D charms)..."
                    rows={2}
                    className="peg-textarea"
                  />

                  <small className="details-peg-hint">
                    ✨ <em>Prices vary depending on design complexity. Your final quote will be confirmed upon review of your peg.</em>
                  </small>
                </div>

                <div className="booking-summary">
                  <div className="booking-summary-grid">
                    <div className="booking-summary-item">
                      <span>Appointment{selectedServices.length > 1 ? "s" : ""}</span>
                      <strong>{selectedServiceLabel}</strong>
                    </div>
                    <div className="booking-summary-item">
                      <span>When</span>
                      <strong>
                        {selectedDate.day}, {selectedDate.month} {selectedDate.date} · {time}
                      </strong>
                    </div>
                  </div>
                  <div className="booking-summary-total">
                    <span>Estimated Base Total</span>
                    <strong>{selectedPriceDisplay}*</strong>
                    <small>*Starting price. Final quotation confirmed based on design peg.</small>
                  </div>
                </div>

                <div className="booking-actions">
                  <span className="secure-note">No payment required today</span>
                  <button className="booking-primary" type="submit" disabled={!canContinue || submittingBooking}>
                    {submittingBooking ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Confirming...</span>
                      </>
                    ) : (
                      <>Review booking <ArrowRight size={17} /></>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 4: Booking Confirmation */}
          {step === 4 && (
            <div className="booking-success">
              <div className="success-check">
                <Check size={28} />
              </div>
              <p className="booking-kicker">You’re all set</p>
              <h2>Appointment requested</h2>
              <p className="success-copy">
                We’ve sent a confirmation to <strong>{details.email}</strong>. {businessName} will review your requested services &amp; design peg and be in touch soon.
              </p>
              <div className="confirmed-card">
                <div className="confirmed-date">
                  <span>{selectedDate.month}</span>
                  <strong>{selectedDate.date}</strong>
                </div>
                <div>
                  <strong>{selectedServiceLabel}</strong>
                  <span>
                    {selectedDate.day}, {selectedDate.month} {selectedDate.date} · {time}
                  </span>
                  <span>
                    Estimated total: {selectedPriceDisplay} <small style={{ color: "#818b98" }}>(subject to design peg)</small>
                  </span>
                  {pegImage && (
                    <div className="confirmed-peg-thumb">
                      <img src={pegImage} alt="Design peg" />
                      <span>Attached design peg</span>
                    </div>
                  )}
                  <span>
                    {businessName} · {businessLocation}
                  </span>
                </div>
              </div>
              <button
                className="booking-secondary"
                type="button"
                onClick={() => {
                  setStep(1)
                  setServiceIds([])
                  setTime("")
                  removePegImage()
                }}
              >
                Book another appointment
              </button>
              <p className="success-footer">
                <Mail size={15} /> Need to make a change or send your peg photos? Reply to your confirmation email.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Featured Treatments (Dynamic real services) */}
      <section className="booking-discovery" id="services" aria-labelledby="services-title">
        <div className="section-intro">
          <div>
            <p className="booking-eyebrow">A little time for you</p>
            <h2 id="services-title">Treatments people love</h2>
          </div>
          <a href="#choose-service">
            Explore all services <ArrowRight size={15} />
          </a>
        </div>
        <div className="service-gallery">
          {visibleServices.slice(0, 4).map((service, index) => (
            <article className="gallery-card" key={service.id || index}>
              <div className={`gallery-visual visual-${["gloss", "peach", "sage", "lilac"][index % 4]}`}>
                {service.image ? (
                  <img src={service.image} alt={service.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <>
                    {index === 0 && <span className="visual-label">Most booked</span>}
                    <div className="visual-nail-art">
                      <i />
                      <i />
                      <i />
                    </div>
                  </>
                )}
                <button
                  aria-label={`Save ${service.name}`}
                  type="button"
                  onClick={() => showToast(`Saved "${service.name}" to your wishlist!`)}
                >
                  <Heart size={17} />
                </button>
              </div>
              <div className="gallery-card-copy">
                <div>
                  <strong>{service.name}</strong>
                  <span>
                    {service.duration} · {service.price}
                  </span>
                </div>
                <span className="rating">
                  <Star size={13} fill="currentColor" /> {averageRating}
                </span>
              </div>
              <button
                type="button"
                className="gallery-book-btn"
                onClick={() => {
                  if (!serviceIds.includes(service.id)) {
                    setServiceIds([service.id])
                  }
                  setStep(1)
                  document.getElementById("booking-flow")?.scrollIntoView({ behavior: "smooth" })
                }}
              >
                Book this <ArrowRight size={12} />
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* About The Studio (Dynamic real values) */}
      <section className="studio-story" id="about" aria-labelledby="about-title">
        <div className="story-collage">
          <div className="story-main">
            <span>
              mindful beauty
              <br />
              for busy days
            </span>
          </div>
          <div className="story-tile story-small one">
            <Scissors size={23} />
          </div>
          <div className="story-tile story-small two">
            <Sparkles size={23} />
          </div>
        </div>
        <div className="story-copy">
          <p className="booking-eyebrow">The studio</p>
          <h2 id="about-title">A softer way to get ready.</h2>
          <p>
            {businessAbout ||
              `${businessName} is a welcoming studio built around thoughtful details, unrushed appointments, and delivering results you can’t stop admiring.`}
          </p>
          <div className="story-stats">
            <span>
              <strong>{averageRating}</strong>
              <small>guest rating</small>
            </span>
            <span>
              <strong>{visibleServices.length}+</strong>
              <small>curated services</small>
            </span>
            <span>
              <strong>{businessLocation || "Studio"}</strong>
              <small>location</small>
            </span>
          </div>
        </div>
      </section>

      {/* Team Section (Simplified Owner Showcase) */}
      <section className="team-section" id="team" aria-labelledby="team-title">
        <div className="section-intro">
          <div>
            <p className="booking-eyebrow">Meet your artist</p>
            <h2 id="team-title">Good hands, good energy</h2>
          </div>
        </div>
        <div className="team-grid single-artist-grid">
          <article className="team-card team-simplified-card">
            <div className="team-avatar team-simplified-avatar">{ownerInitials}</div>
            <div className="team-simplified-info">
              <strong className="team-simplified-name">{ownerFullName}</strong>
              <span className="team-simplified-role">Owner</span>
            </div>
            <a
              href="#choose-service"
              className="team-book-pill"
              onClick={() => document.getElementById("booking-flow")?.scrollIntoView({ behavior: "smooth" })}
            >
              Book with {ownerFirstName} <ArrowRight size={13} />
            </a>
          </article>
        </div>
      </section>

      {/* Real Reviews Section: Rating Box + Filters + Top 3 Stream + Show All Modal */}
      <section className="reviews-section reviews-section-redesign" id="reviews" aria-labelledby="reviews-title">
        <div className="section-intro">
          <div>
            <p className="booking-eyebrow">Client reviews</p>
            <h2 id="reviews-title">
              Small details.
              <br />
              Big feeling.
            </h2>
          </div>
        </div>

        <div className="reviews-layout-grid">
          {/* Left Column: Overall Score & Breakdown Box */}
          <div className="reviews-summary-card">
            <div className="reviews-overall-score">
              <span className="reviews-big-number">{totalReviews > 0 ? averageRating : "New"}</span>
              <div>
                <div className="reviews-stars-visual">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={18}
                      fill={star <= (totalReviews > 0 ? Math.round(Number(averageRating)) : 5) ? "currentColor" : "none"}
                    />
                  ))}
                </div>
                <span className="reviews-count-caption">
                  {totalReviews > 0 ? `${totalReviews} verified client ${totalReviews === 1 ? "review" : "reviews"}` : "Be the first to leave a review!"}
                </span>
              </div>
            </div>

            {/* Rating breakdown bars */}
            <div className="reviews-breakdown">
              {[5, 4, 3, 2, 1].map((rating) => {
                const count = ratingCounts[rating as keyof typeof ratingCounts] || 0
                const percent = totalReviews > 0 ? (count / totalReviews) * 100 : 0
                return (
                  <div className="review-breakdown-row" key={rating}>
                    <span className="breakdown-label">
                      {rating} <Star size={11} fill="currentColor" />
                    </span>
                    <div className="breakdown-bar-wrap">
                      <div className="breakdown-bar-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="breakdown-count">{count}</span>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              className="write-review-btn"
              onClick={() => setShowReviewModal(true)}
            >
              <Star size={16} /> Write a review
            </button>
          </div>

          {/* Right Column: Filter Pills and Top 3 Reviews Stream */}
          <div className="reviews-stream">
            {totalReviews > 0 && (
              <div className="reviews-filter-bar">
                <button
                  type="button"
                  className={`review-filter-pill ${reviewFilter === "all" ? "active" : ""}`}
                  onClick={() => setReviewFilter("all")}
                >
                  All reviews ({totalReviews})
                </button>
                <button
                  type="button"
                  className={`review-filter-pill ${reviewFilter === "5" ? "active" : ""}`}
                  onClick={() => setReviewFilter("5")}
                >
                  5 Stars ({ratingCounts[5] || 0})
                </button>
                <button
                  type="button"
                  className={`review-filter-pill ${reviewFilter === "4" ? "active" : ""}`}
                  onClick={() => setReviewFilter("4")}
                >
                  4 Stars ({ratingCounts[4] || 0})
                </button>
                <button
                  type="button"
                  className={`review-filter-pill ${reviewFilter === "recent" ? "active" : ""}`}
                  onClick={() => setReviewFilter("recent")}
                >
                  Most recent
                </button>
              </div>
            )}

            {filteredReviews.length ? (
              <>
                {filteredReviews.slice(0, 3).map((review) => {
                  const initials = review.customer_name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                  const formattedDate = new Date(review.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                  return (
                    <article className="review-card-item" key={review.id}>
                      <div className="review-card-header">
                        <div className="review-card-user">
                          <div className="review-user-avatar">{initials}</div>
                          <div className="review-user-info">
                            <strong>{review.customer_name}</strong>
                            <span className="review-date">{formattedDate}</span>
                          </div>
                        </div>
                        <div className="review-card-stars-row">
                          <div style={{ display: "flex", gap: 2, color: "#f59e0b" }}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                size={14}
                                fill={star <= review.rating ? "currentColor" : "none"}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {review.service_name && (
                        <div>
                          <span className="review-service-tag">
                            <Scissors size={12} /> {review.service_name}
                          </span>
                        </div>
                      )}

                      <p className="review-card-text">“{review.comment}”</p>
                    </article>
                  )
                })}

                {/* Button below to show all reviews */}
                <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
                  <button
                    type="button"
                    className="show-all-reviews-btn"
                    onClick={() => setShowAllReviewsModal(true)}
                  >
                    <span>View all reviews ({totalReviews})</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </>
            ) : (
              <div className="reviews-empty-state">
                <Star size={32} style={{ color: "#f59e0b" }} />
                <h3>No reviews yet</h3>
                <p>Have you booked with {businessName}? Share your experience with our artist!</p>
                <button
                  type="button"
                  className="write-review-btn"
                  onClick={() => setShowReviewModal(true)}
                  style={{ width: "auto", padding: "0 22px", margin: "14px auto 0" }}
                >
                  <Star size={16} /> Write the first review
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="booking-footer">
        <span>
          Powered by <strong>bookora</strong>
        </span>
        <a href="#services">Services</a>
        <a href="#team">Artist</a>
        <a href="#reviews">Reviews</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </footer>

      {/* MODAL 1: Customer Auth Modal (Sign in with Google / Email - Bottom sheet on mobile) */}
      {showAuthModal && (
        <CustomerAuthModal
          onClose={() => setShowAuthModal(false)}
          businessName={businessName}
          onSuccess={(user) => {
            setCurrentUser(user)
            setDetails((prev) => ({
              ...prev,
              name: prev.name || String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? ""),
              email: prev.email || user.email || "",
            }))
            setShowAuthModal(false)
            showToast(`Welcome back, ${user.user_metadata?.full_name || user.email}!`)
          }}
        />
      )}

      {/* MODAL 2: Write a Review Modal (Bottom sheet on mobile) */}
      {showReviewModal && (
        <WriteReviewModal
          onClose={() => setShowReviewModal(false)}
          onSubmitReview={handleSubmitReview}
          currentUser={currentUser}
          visibleServices={visibleServices}
          businessName={businessName}
        />
      )}

      {/* MODAL 3: My Bookings Modal */}
      {showMyBookings && (
        <MyBookingsModal
          onClose={() => setShowMyBookings(false)}
          bookings={customerBookings}
          businessName={businessName}
          onBookNew={() => {
            setShowMyBookings(false)
            setStep(1)
            document.getElementById("booking-flow")?.scrollIntoView({ behavior: "smooth" })
          }}
        />
      )}

      {/* MODAL 4: All Reviews Modal (Opens when user clicks "View all reviews") */}
      {showAllReviewsModal && (
        <AllReviewsModal
          onClose={() => setShowAllReviewsModal(false)}
          reviews={reviews}
          averageRating={averageRating}
          totalReviews={totalReviews}
          ratingCounts={ratingCounts}
          onOpenWriteReview={() => {
            setShowAllReviewsModal(false)
            setShowReviewModal(true)
          }}
          businessName={businessName}
        />
      )}
    </main>
  )
}

// ============================================================================
// Subcomponent: Customer Auth Modal (Bottom sheet on mobile)
// ============================================================================
function CustomerAuthModal({
  onClose,
  businessName,
  onSuccess,
}: {
  onClose: () => void
  businessName: string
  onSuccess: (user: User) => void
}) {
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle")
  const [authMethod, setAuthMethod] = useState<"google" | "email" | null>(null)
  const [message, setMessage] = useState("")

  const handleGoogleSignIn = async () => {
    setAuthMethod("google")
    setStatus("loading")
    setMessage("")
    try {
      await signInWithGoogle()
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        if (data.session?.user) {
          onSuccess(data.session.user)
          return
        }
      }
    } catch {
      // Fallback to standard Supabase OAuth redirect if One-Tap unavailable
      if (supabase) {
        try {
          const cleanRedirectUrl = window.location.href.split("#")[0]
          const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: cleanRedirectUrl },
          })
          if (error) {
            setStatus("error")
            setAuthMethod(null)
            setMessage(error.message)
            return
          }
        } catch (oauthErr: any) {
          setStatus("error")
          setAuthMethod(null)
          setMessage(oauthErr?.message || "Google sign-in is currently unavailable.")
        }
      } else {
        setStatus("error")
        setAuthMethod(null)
        setMessage("Google sign-in is currently unavailable.")
      }
    }
  }

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      setStatus("error")
      setAuthMethod(null)
      setMessage("Supabase is not configured.")
      return
    }

    setAuthMethod("email")
    setStatus("loading")
    setMessage("")

    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim() || email.split("@")[0],
          },
        },
      })
      if (error) {
        setStatus("error")
        setAuthMethod(null)
        setMessage(error.message)
      } else if (data.user) {
        onSuccess(data.user)
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) {
        setStatus("error")
        setAuthMethod(null)
        setMessage(error.message)
      } else if (data.user) {
        onSuccess(data.user)
      }
    }
  }

  return (
    <div
      className="customer-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && status !== "loading") onClose()
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget && status !== "loading") e.preventDefault()
      }}
    >
      <div
        className="customer-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="customer-modal-close" type="button" onClick={onClose} disabled={status === "loading"}>
          <X size={16} />
        </button>

        {/* Centered Loading Spinner Overlay */}
        {status === "loading" && (
          <div className="customer-modal-loading-overlay">
            <div className="customer-modal-loading-card">
              <div className="customer-modal-spinner-wrap">
                <Loader2 size={32} className="animate-spin customer-modal-spinner" />
              </div>
              <h3>
                {authMethod === "google"
                  ? "Connecting to Google"
                  : authMode === "signup"
                  ? "Creating your account"
                  : "Signing in"}
              </h3>
              <p>
                {authMethod === "google"
                  ? "Please wait while we connect your Google account..."
                  : "Verifying your details, please wait a moment..."}
              </p>
              <button
                type="button"
                className="customer-modal-loading-cancel"
                onClick={() => {
                  setStatus("idle")
                  setAuthMethod(null)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="customer-modal-header">
          <div className="customer-modal-icon">
            <LockKeyhole size={24} />
          </div>
          <h2 id="auth-modal-title">{authMode === "signin" ? "Sign in to Bookora" : "Create your account"}</h2>
          <p>
            {authMode === "signin"
              ? `Sign in to autofill details and book with ${businessName}`
              : "Register to manage appointments and save your preferred artist"}
          </p>
        </div>

        {/* Google OAuth Button */}
        <button
          type="button"
          className="google-oauth-btn"
          onClick={handleGoogleSignIn}
          disabled={status === "loading"}
        >
          {status === "loading" && authMethod === "google" ? (
            <>
              <Loader2 size={18} className="animate-spin" style={{ color: "#d85b53" }} />
              <span>Connecting to Google...</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <div className="auth-modal-divider">or continue with email</div>

        <form onSubmit={handleEmailAuth} className="review-form-stack">
          {authMode === "signup" && (
            <div className="review-form-field">
              <label htmlFor="auth-fullname">Full name</label>
              <input
                id="auth-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Maria Santos"
                required
                disabled={status === "loading"}
              />
            </div>
          )}

          <div className="review-form-field">
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={status === "loading"}
            />
          </div>

          <div className="review-form-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={status === "loading"}
            />
          </div>

          {status === "error" && (
            <p style={{ color: "#dc2626", fontSize: 12, margin: "2px 0 0" }}>{message}</p>
          )}

          <button
            type="submit"
            className="booking-primary"
            disabled={status === "loading"}
            style={{ width: "100%", height: 44, marginTop: 6 }}
          >
            {status === "loading" && authMethod === "email" ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : authMode === "signin" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <div className="auth-toggle-row">
          {authMode === "signin" ? (
            <>
              Don’t have an account?
              <button
                type="button"
                className="auth-toggle-btn"
                disabled={status === "loading"}
                onClick={() => {
                  setAuthMode("signup")
                  setMessage("")
                }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?
              <button
                type="button"
                className="auth-toggle-btn"
                disabled={status === "loading"}
                onClick={() => {
                  setAuthMode("signin")
                  setMessage("")
                }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Subcomponent: Write a Review Modal (Compact, simple, non-stacked)
// ============================================================================
function WriteReviewModal({
  onClose,
  onSubmitReview,
  currentUser,
  visibleServices,
  businessName,
}: {
  onClose: () => void
  onSubmitReview: (input: { name: string; email: string; rating: number; comment: string; service?: string }) => Promise<void>
  currentUser: User | null
  visibleServices: Service[]
  businessName: string
}) {
  const [rating, setRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [name, setName] = useState(() => (currentUser?.user_metadata?.full_name ? String(currentUser.user_metadata.full_name) : ""))
  const [email, setEmail] = useState(() => currentUser?.email || "")
  const [selectedService, setSelectedService] = useState("")
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const starLabels = {
    1: "1★ Disappointed",
    2: "2★ Needs work",
    3: "3★ Satisfied",
    4: "4★ Very good",
    5: "5★ Exceptional",
  }

  const effectiveRating = hoverRating || rating

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Please provide your name.")
      return
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Please provide a valid email.")
      return
    }
    if (!comment.trim() || comment.trim().length < 5) {
      setError("Please write a short note about your visit.")
      return
    }

    setIsSubmitting(true)
    setError("")
    try {
      await onSubmitReview({
        name,
        email,
        rating,
        comment,
        service: selectedService,
      })
    } catch {
      setError("Failed to submit review. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="customer-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose()
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) e.preventDefault()
      }}
    >
      <div
        className="customer-modal-dialog compact-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="customer-modal-close" type="button" onClick={onClose} disabled={isSubmitting}>
          <X size={16} />
        </button>

        {/* Compact Header */}
        <div className="compact-review-header">
          <div className="compact-review-icon">
            <Star size={18} />
          </div>
          <div>
            <h2 id="review-modal-title">Write a review</h2>
            <p>Share your experience with {businessName}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="compact-form-stack">
          {/* Star Rating Bar: Inline horizontal */}
          <div className="compact-star-row">
            <div className="compact-star-left">
              <span className="compact-star-label">Rating</span>
              <div className="compact-star-btns">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    className={`compact-star-btn ${star <= effectiveRating ? "active" : ""}`}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    aria-label={`${star} star rating`}
                  >
                    <Star
                      size={24}
                      fill={star <= effectiveRating ? "#f59e0b" : "none"}
                      color={star <= effectiveRating ? "#f59e0b" : "#d1d5db"}
                    />
                  </button>
                ))}
              </div>
            </div>
            <span className="compact-star-badge">{starLabels[effectiveRating as keyof typeof starLabels]}</span>
          </div>

          {/* Guest Name & Email: 2-column side-by-side */}
          {!currentUser ? (
            <div className="compact-field-row">
              <div className="compact-input-group">
                <label htmlFor="rev-name">Full name *</label>
                <input
                  id="rev-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  required
                />
              </div>
              <div className="compact-input-group">
                <label htmlFor="rev-email">Email *</label>
                <input
                  id="rev-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>
          ) : (
            <div className="review-user-tag-banner" style={{ padding: "7px 11px", fontSize: 11.5 }}>
              <CheckCircle2 size={14} />
              <span>
                Reviewing as <strong>{name || email}</strong>
              </span>
            </div>
          )}

          {/* Service experienced (Optional, compact dropdown) */}
          <div className="compact-input-group">
            <label htmlFor="rev-service">Service (Optional)</label>
            <select
              id="rev-service"
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
            >
              <option value="">Select a service...</option>
              {visibleServices.map((svc) => (
                <option key={svc.id} value={svc.name}>
                  {svc.name} ({svc.price})
                </option>
              ))}
            </select>
          </div>

          {/* Review comment */}
          <div className="compact-input-group">
            <label htmlFor="rev-comment">Review *</label>
            <textarea
              id="rev-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you love about your appointment?"
              required
            />
          </div>

          {error && <p style={{ color: "#dc2626", fontSize: 12, margin: "2px 0 0" }}>{error}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              className="booking-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ flex: 1, height: 40, margin: 0, fontSize: 12 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="booking-primary"
              disabled={isSubmitting}
              style={{ flex: 1.5, height: 40, fontSize: 12 }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                "Submit Review"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// Subcomponent: All Reviews Modal (Dedicated page/modal for all verified reviews)
// ============================================================================
function AllReviewsModal({
  onClose,
  reviews,
  averageRating,
  totalReviews,
  ratingCounts,
  onOpenWriteReview,
  businessName,
}: {
  onClose: () => void
  reviews: Review[]
  averageRating: string
  totalReviews: number
  ratingCounts: Record<number, number>
  onOpenWriteReview: () => void
  businessName: string
}) {
  const [filter, setFilter] = useState<"all" | "5" | "4" | "3" | "recent">("all")

  const filteredReviews = useMemo(() => {
    const sorted = [...reviews].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    if (filter === "5") return sorted.filter((r) => r.rating === 5)
    if (filter === "4") return sorted.filter((r) => r.rating === 4)
    if (filter === "3") return sorted.filter((r) => r.rating === 3)
    return sorted
  }, [reviews, filter])

  return (
    <div
      className="customer-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault()
      }}
    >
      <div
        className="customer-modal-dialog customer-modal-dialog-wide all-reviews-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="all-reviews-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="customer-modal-close" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="all-reviews-header">
          <div>
            <h2 id="all-reviews-title">Client Reviews</h2>
            <p>{totalReviews} verified ratings for {businessName}</p>
          </div>
          <button
            type="button"
            className="write-review-compact-btn"
            onClick={onOpenWriteReview}
          >
            <Star size={14} /> Write a review
          </button>
        </div>

        {/* Rating Breakdown Banner */}
        <div className="all-reviews-banner">
          <div className="all-reviews-score">
            <span className="all-reviews-number">{averageRating}</span>
            <div>
              <div style={{ display: "flex", gap: 3, color: "#f59e0b" }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={16}
                    fill={s <= Math.round(Number(averageRating)) ? "currentColor" : "none"}
                  />
                ))}
              </div>
              <small>{totalReviews} verified client {totalReviews === 1 ? "review" : "reviews"}</small>
            </div>
          </div>

          <div className="all-reviews-breakdown-compact">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingCounts[star] || 0
              const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0
              return (
                <div key={star} className="breakdown-mini-row">
                  <span>{star}★</span>
                  <div className="breakdown-mini-bar">
                    <div className="breakdown-mini-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <small>{count}</small>
                </div>
              )
            })}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="all-reviews-filter-bar">
          <button
            type="button"
            className={`review-filter-pill ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({totalReviews})
          </button>
          <button
            type="button"
            className={`review-filter-pill ${filter === "5" ? "active" : ""}`}
            onClick={() => setFilter("5")}
          >
            5 Stars ({ratingCounts[5] || 0})
          </button>
          <button
            type="button"
            className={`review-filter-pill ${filter === "4" ? "active" : ""}`}
            onClick={() => setFilter("4")}
          >
            4 Stars ({ratingCounts[4] || 0})
          </button>
          <button
            type="button"
            className={`review-filter-pill ${filter === "recent" ? "active" : ""}`}
            onClick={() => setFilter("recent")}
          >
            Most recent
          </button>
        </div>

        {/* Scrollable list of reviews */}
        <div className="all-reviews-list">
          {filteredReviews.length ? (
            filteredReviews.map((review) => {
              const initials = review.customer_name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()
              const formattedDate = new Date(review.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
              return (
                <article className="all-reviews-item" key={review.id}>
                  <div className="all-reviews-item-head">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="review-avatar-small">{initials}</div>
                      <div>
                        <strong>{review.customer_name}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 2, color: "#f59e0b", justifyContent: "flex-end" }}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={13}
                            fill={s <= review.rating ? "currentColor" : "none"}
                          />
                        ))}
                      </div>
                      <span className="review-date-pill">{formattedDate}</span>
                    </div>
                  </div>

                  {review.service_name && (
                    <span className="review-chip-service" style={{ marginTop: 8 }}>
                      <Scissors size={10} /> {review.service_name}
                    </span>
                  )}

                  <p className="all-reviews-item-text">“{review.comment}”</p>
                </article>
              )
            })
          ) : (
            <div className="all-reviews-empty">
              <p>No reviews match this filter.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Subcomponent: My Bookings Modal
// ============================================================================
function MyBookingsModal({
  onClose,
  bookings,
  businessName,
  onBookNew,
}: {
  onClose: () => void
  bookings: AppointmentRecord[]
  businessName: string
  onBookNew: () => void
}) {
  return (
    <div
      className="customer-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault()
      }}
    >
      <div
        className="customer-modal-dialog customer-modal-dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookings-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="customer-modal-close" type="button" onClick={onClose}>
          <X size={16} />
        </button>

        <div className="customer-modal-header">
          <div className="customer-modal-icon">
            <CalendarDays size={24} />
          </div>
          <h2 id="bookings-modal-title">My Bookings</h2>
          <p>Your upcoming and past appointments at {businessName}</p>
        </div>

        {bookings.length ? (
          <div className="my-bookings-list">
            {bookings.map((booking) => (
              <div className="booking-item-card" key={booking.id}>
                <div className="booking-item-top">
                  <span className={`booking-status-tag ${booking.status === "confirmed" ? "confirmed" : "pending"}`}>
                    <Check size={11} /> {booking.status || "Pending"}
                  </span>
                  <strong style={{ color: "#d85b53", fontSize: 13.5 }}>{booking.total_price}</strong>
                </div>
                <div className="booking-item-services">{booking.service_names}</div>
                <div className="booking-item-meta">
                  <span>
                    <CalendarDays size={13} /> {booking.appointment_date}
                  </span>
                  <span>
                    <Clock3 size={13} /> {booking.appointment_time}
                  </span>
                </div>
                {booking.customer_note && (
                  <p style={{ margin: "4px 0 0", color: "#788697", fontSize: 11.5, fontStyle: "italic" }}>
                    Note: {booking.customer_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="reviews-empty-state">
            <CalendarDays size={32} style={{ color: "#d1d5db" }} />
            <h3>No appointments found</h3>
            <p>You haven’t booked any appointments yet under this account.</p>
            <button
              type="button"
              className="booking-primary"
              onClick={onBookNew}
              style={{ marginTop: 14 }}
            >
              Book an appointment now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
