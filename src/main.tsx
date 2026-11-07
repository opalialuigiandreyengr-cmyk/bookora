import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"
import { handleOAuthSubdomainBounce } from "./lib/domain"

if ("serviceWorker" in navigator && window.location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined)
  })
}

const hostname = window.location.hostname
const isRootAppHost =
  hostname === "bookoraph.com" ||
  hostname === "www.bookoraph.com" ||
  hostname === "bookora.com" ||
  hostname === "www.bookora.com" ||
  hostname === "localhost" ||
  hostname.endsWith(".vercel.app")

const isStandalonePwa =
  Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone) ||
  window.matchMedia("(display-mode: standalone)").matches

if (
  isStandalonePwa &&
  isRootAppHost &&
  window.location.pathname === "/" &&
  !window.location.search.includes("slug=")
) {
  window.location.replace(`/app/${window.location.search}${window.location.hash}`)
} else {
  const isBouncing = handleOAuthSubdomainBounce()

  if (!isBouncing) {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  }
}
