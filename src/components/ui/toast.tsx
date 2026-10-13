import { useEffect, useState } from "react"
import { CheckCircle2, X } from "lucide-react"

type ToastEvent = { message: string; tone?: "success" | "error" }
const toastListeners = new Set<(event: ToastEvent) => void>()

export function showToast(message: string, tone: ToastEvent["tone"] = "success") {
  toastListeners.forEach((listener) => listener({ message, tone }))
}

export function ToastViewport() {
  const [toast, setToast] = useState<(ToastEvent & { id: number }) | null>(null)
  useEffect(() => {
    const listener = (event: ToastEvent) => {
      const id = Date.now()
      setToast({ ...event, id })
      window.setTimeout(() => setToast((current) => current?.id === id ? null : current), 3200)
    }
    toastListeners.add(listener)
    return () => { toastListeners.delete(listener) }
  }, [])
  if (!toast) return null
  return <div className={`bookora-toast ${toast.tone === "error" ? "error" : ""}`} role="status"><CheckCircle2 /><span>{toast.message}</span><button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><X /></button></div>
}
