// The header shared by both pages.
import Link from "next/link";

const TABS = [
  { href: "/", label: "Prices" },
  { href: "/plan", label: "Plan a purchase" },
] as const;

/** The site header: brand, the two page tabs (current one marked) and optional page controls. */
export function SiteHeader({ current, children }: { current: "/" | "/plan"; children?: React.ReactNode }) {
  return (
    <header className="top">
      <div className="wrap top-inner">
        <div className="top-left">
          <span className="brand">Construction material prices</span>
          <nav aria-label="Main" className="tabs">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className="tab" aria-current={t.href === current ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        {children}
      </div>
    </header>
  );
}
