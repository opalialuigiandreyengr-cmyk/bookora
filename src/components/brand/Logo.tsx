export function Logo({ compact = false }: { compact?: boolean }) {
  return <a href="#top" className="brand" aria-label="Bookora home"><span className="brand-mark" aria-hidden="true"><span>B</span></span>{!compact && <span className="brand-name">Book<span>ora</span></span>}</a>
}
