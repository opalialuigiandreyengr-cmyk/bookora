export function getRootCookieDomain(hostname = typeof window !== "undefined" ? window.location.hostname : ""): string {
  if (!hostname) return ""
  if (hostname.endsWith(".bookoraph.com") || hostname === "bookoraph.com") {
    return ".bookoraph.com"
  }
  if (hostname.endsWith(".bookora.com") || hostname === "bookora.com") {
    return ".bookora.com"
  }
  return ""
}

export function setCrossSubdomainCookie(name: string, value: string, maxAgeSeconds = 600): void {
  if (typeof document === "undefined") return
  const rootDomain = getRootCookieDomain()
  const domainPart = rootDomain ? `domain=${rootDomain}; ` : ""
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; ${domainPart}max-age=${maxAgeSeconds}; SameSite=Lax`
}

export function getCrossSubdomainCookie(name: string): string {
  if (typeof document === "undefined") return ""
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ""
}

export function clearCrossSubdomainCookie(name: string): void {
  if (typeof document === "undefined") return
  const rootDomain = getRootCookieDomain()
  const domainPart = rootDomain ? `domain=${rootDomain}; ` : ""
  document.cookie = `${name}=; path=/; ${domainPart}expires=Thu, 01 Jan 1970 00:00:00 GMT`
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

/**
 * Handles OAuth return bounce if user was redirected to the root domain (e.g. bookoraph.com)
 * instead of the business subdomain (e.g. nails-qo.bookoraph.com).
 * Returns true if redirecting to prevent main App render.
 */
export function handleOAuthSubdomainBounce(): boolean {
  if (typeof window === "undefined") return false

  const hostname = window.location.hostname
  const isRootDomain =
    hostname === "bookoraph.com" ||
    hostname === "www.bookoraph.com" ||
    hostname === "bookora.com" ||
    hostname === "www.bookora.com"

  if (!isRootDomain) return false

  const returnUrl = getCrossSubdomainCookie("bookora_client_return")
  const hasAuthPayload =
    window.location.hash.includes("access_token") ||
    window.location.search.includes("code=") ||
    window.location.search.includes("error=")

  if (returnUrl && hasAuthPayload) {
    clearCrossSubdomainCookie("bookora_client_return")
    try {
      const targetUrl = new URL(returnUrl, window.location.origin)
      const currentUrl = new URL(window.location.href)
      currentUrl.searchParams.forEach((val, key) => {
        targetUrl.searchParams.set(key, val)
      })
      if (window.location.hash) {
        targetUrl.hash = window.location.hash
      }
      const target = targetUrl.toString()
      if (target !== window.location.href) {
        window.location.replace(target)
        return true
      }
    } catch {
      if (returnUrl !== window.location.href) {
        window.location.replace(returnUrl)
        return true
      }
    }
  }

  return false
}
