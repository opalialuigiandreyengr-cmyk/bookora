import { useEffect, useRef, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

export type OwnerStatusTone = "neutral" | "info" | "success" | "warning" | "danger"

export function OwnerStatusBadge({ label, tone = "neutral" }: { label: string; tone?: OwnerStatusTone }) {
  return <span className={`owner-status-badge owner-status-${tone}`}>{label}</span>
}

export function OwnerFilterBar({ children, onClear, clearLabel = "Clear filters" }: { children: ReactNode; onClear?: () => void; clearLabel?: string }) {
  return <div className="owner-filter-bar"><div className="owner-filter-controls">{children}</div>{onClear && <button className="owner-filter-clear" type="button" onClick={onClear}><X size={14} aria-hidden="true" />{clearLabel}</button>}</div>
}

export type OwnerTableColumn<T> = { key: string; label: string; render: (row: T) => ReactNode; headerClassName?: string }

export function OwnerDataTable<T extends { id: string }>({ rows, columns, empty }: { rows: T[]; columns: OwnerTableColumn<T>[]; empty?: ReactNode }) {
  if (!rows.length && empty) return <>{empty}</>
  return <div className="owner-data-table-wrap"><table className="owner-data-table"><thead><tr>{columns.map((column) => <th className={column.headerClassName} key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>
}

export function OwnerDrawer({ open, title, children, onClose, labelledBy }: { open: boolean; title: string; children: ReactNode; onClose: () => void; labelledBy?: string }) {
  const drawerRef = useRef<HTMLElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const drawer = drawerRef.current
    const focusable = () => Array.from(drawer?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])") || []).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true")
    focusable()[0]?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== "Tab") return
      const elements = focusable()
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => { document.removeEventListener("keydown", handleKeyDown); returnFocusRef.current?.focus(); returnFocusRef.current = null }
  }, [open])
  if (!open) return null
  const headingId = labelledBy || "owner-drawer-title"
  return <div className="owner-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside ref={drawerRef} className="owner-drawer" role="dialog" aria-modal="true" aria-labelledby={headingId}><header><h2 id={headingId}>{title}</h2><button type="button" aria-label="Close panel" onClick={onClose}><X size={18} aria-hidden="true" /></button></header><div className="owner-drawer-content">{children}</div></aside></div>
}

export function OwnerPagination({ page, pageCount, onPageChange }: { page: number; pageCount: number; onPageChange: (page: number) => void }) {
  if (pageCount <= 1) return null
  return <nav className="owner-pagination" aria-label="Pagination"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={15} aria-hidden="true" /></button><span>Page {page} of {pageCount}</span><button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} aria-hidden="true" /></button></nav>
}
