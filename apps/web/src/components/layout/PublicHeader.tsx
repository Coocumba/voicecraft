import Link from "next/link"

interface PublicHeaderProps {
  ctaHref: string
  signInLabel: string
  activePage?: "features" | "use-cases" | "pricing"
}

export function PublicHeader({ ctaHref, signInLabel, activePage }: PublicHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-cream">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-serif text-lg text-ink flex-shrink-0">
          VoiceCraft
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/#features"
            className={`hidden sm:inline-flex text-sm px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${
              activePage === "features"
                ? "text-ink font-medium"
                : "text-muted hover:text-ink"
            }`}
          >
            Features
          </Link>
          <Link
            href="/use-cases"
            className={`hidden sm:inline-flex text-sm px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${
              activePage === "use-cases"
                ? "text-ink font-medium"
                : "text-muted hover:text-ink"
            }`}
          >
            Use Cases
          </Link>
          {/* Pricing visible on mobile — high priority for conversion */}
          <Link
            href="/pricing"
            className={`text-sm px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${
              activePage === "pricing"
                ? "text-ink font-medium"
                : "text-muted hover:text-ink"
            }`}
          >
            Pricing
          </Link>
          <Link
            href={ctaHref}
            className="hidden sm:inline-flex text-sm text-muted hover:text-ink px-3 py-1.5 rounded-lg transition-colors"
          >
            {signInLabel}
          </Link>
          <Link
            href={ctaHref}
            className="text-sm bg-accent text-white px-4 py-1.5 rounded-lg hover:bg-accent/90 transition-colors ml-1"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  )
}
