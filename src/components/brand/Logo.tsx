export function Logo({ compact = false }: { compact?: boolean }) {
  return <a href="#top" className={`brand ${compact ? "brand-compact" : ""}`} aria-label="Bookora home"><img className="brand-image" src={compact ? "/assets/bookora-icon.svg" : "/assets/bookora-logo.png"} alt="Bookora" /></a>
}
