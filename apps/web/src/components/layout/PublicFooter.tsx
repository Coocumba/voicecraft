import Link from "next/link"

export function PublicFooter() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Links row */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted mb-6">
          <Link href="/#features" className="hover:text-ink transition-colors">Features</Link>
          <Link href="/use-cases" className="hover:text-ink transition-colors">Use Cases</Link>
          <Link href="/pricing" className="hover:text-ink transition-colors">Pricing</Link>
          <Link href="/login" className="hover:text-ink transition-colors">Sign in</Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
        </div>

        {/* Brand + copyright */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted">
          <span className="font-serif text-sm text-ink">VoiceCraft</span>
          <span className="text-border">&middot;</span>
          <span>&copy; {new Date().getFullYear()} All rights reserved</span>
        </div>
      </div>
    </footer>
  )
}
