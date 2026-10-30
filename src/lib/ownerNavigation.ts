import {
  BarChart3,
  PlugZap,
  PackageOpen,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  Ban,
  Gift,
  CreditCard,
  Home,
  Bell,
  Link2,
  Settings2,
  Scissors,
  Users,
  type LucideIcon,
} from "lucide-react"

export type OwnerRouteKey =
  | "Overview"
  | "Calendar"
  | "Appointments"
  | "Clients"
  | "Services"
  | "Staff"
  | "Payments"
  | "Reports"
  | "Settings"
  | "Notifications"
  | "Integrations"
  | "Webhooks"
  | "Packages"
  | "Advanced Scheduling"
  | "Block Time"
  | "Memberships"

export type OwnerRoute = {
  key: OwnerRouteKey
  label: string
  path: string
  icon: LucideIcon
  status?: "ready" | "building"
}

export const ownerRoutes: OwnerRoute[] = [
  { key: "Overview", label: "Overview", path: "/dashboard", icon: Home, status: "ready" },
  { key: "Calendar", label: "Calendar", path: "/calendar", icon: CalendarDays, status: "ready" },
  { key: "Appointments", label: "Appointments", path: "/appointments", icon: CalendarRange, status: "ready" },
  { key: "Clients", label: "Clients", path: "/clients", icon: Users, status: "ready" },
  { key: "Services", label: "Services", path: "/services", icon: Scissors, status: "ready" },
  { key: "Staff", label: "Staff", path: "/staff", icon: Users, status: "building" },
  { key: "Payments", label: "Payments", path: "/payments", icon: CreditCard, status: "ready" },
  { key: "Reports", label: "Reports", path: "/reports", icon: BarChart3, status: "building" },
  { key: "Settings", label: "Settings", path: "/settings", icon: Settings2, status: "ready" },
  { key: "Notifications", label: "Notifications", path: "/notifications", icon: Bell, status: "ready" },
  { key: "Integrations", label: "Integrations", path: "/integrations", icon: PlugZap, status: "building" },
  { key: "Webhooks", label: "Webhooks", path: "/integrations/webhooks", icon: Link2, status: "ready" },
  { key: "Packages", label: "Packages", path: "/packages", icon: PackageOpen, status: "ready" },
  { key: "Advanced Scheduling", label: "Advanced Scheduling", path: "/advanced-scheduling", icon: CalendarClock, status: "ready" },
  { key: "Block Time", label: "Block Time", path: "/block-time", icon: Ban, status: "ready" },
  { key: "Memberships", label: "Memberships", path: "/memberships", icon: Gift, status: "ready" },
]

// First release navigation for one salon owner using a phone. Advanced routes remain
// available for later expansion but do not compete with the daily solo workflow.
export const soloOwnerRoutes = ownerRoutes.filter((route) => [
  "Overview",
  "Calendar",
  "Clients",
  "Services",
  "Payments",
  "Settings",
].includes(route.key))

export const ownerRouteByPath = new Map(ownerRoutes.map((route) => [route.path, route]))

export function getOwnerRoute(pathname: string): OwnerRoute {
  return ownerRouteByPath.get(pathname) ?? ownerRoutes[0]
}

export function getOwnerRouteByKey(key: string): OwnerRoute {
  return ownerRoutes.find((route) => route.key === key) ?? ownerRoutes[0]
}

export function isOwnerRoute(pathname: string): boolean {
  return ownerRouteByPath.has(pathname)
}
