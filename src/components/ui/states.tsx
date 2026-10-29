import type { ReactNode } from "react"
import { AlertCircle, CheckCircle2, Info, LoaderCircle } from "lucide-react"

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="bookora-state bookora-loading-state" role="status"><LoaderCircle className="bookora-state-spinner" size={20} aria-hidden="true" /><span>{label}</span></div>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="bookora-state bookora-empty-state"><Info size={20} aria-hidden="true" /><strong>{title}</strong>{description && <span>{description}</span>}{action}</div>
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  return <div className="bookora-state bookora-error-state" role="alert"><AlertCircle size={20} aria-hidden="true" /><strong>{message}</strong>{action}</div>
}

export function PermissionDeniedState({ message = "You do not have permission to view this workspace." }: { message?: string }) {
  return <div className="bookora-state bookora-permission-state" role="alert"><AlertCircle size={20} aria-hidden="true" /><strong>Access restricted</strong><span>{message}</span></div>
}

export function SuccessState({ children }: { children: ReactNode }) {
  return <div className="bookora-state bookora-success-state" role="status"><CheckCircle2 size={20} aria-hidden="true" /><span>{children}</span></div>
}

export function ConfirmationState({ title, description }: { title: string; description?: string }) {
  return <div className="bookora-state bookora-confirmation-state" role="status"><CheckCircle2 size={20} aria-hidden="true" /><strong>{title}</strong>{description && <span>{description}</span>}</div>
}
