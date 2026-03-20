import Link from "next/link"

export function PublicFooter() {
  return (
    <footer className="max-w-5xl mx-auto px-4 sm:px-6 py-10 border-t border-border">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
        <div className="flex items-center flex-wrap justify-center sm:justify-start gap-x-3 gap-y-1">
          <span className="font-serif text-ink">VoiceCraft</span>
          <span className="text-border hidden sm:inline">&middot;</span>
          <span>&copy; {new Date().getFullYear()} All rights reserved</span>
        </div>
        <div className="flex items-center flex-wrap justify-center gap-x-3 gap-y-1">
          <Link href="/#features" className="hover:text-ink transition-colors">
            Features
          </Link>
          <span className="text-border hidden sm:inline">&middot;</span>
          <Link href="/use-cases" className="hover:text-ink transition-colors">
            Use Cases
          </Link>
          <span className="text-border hidden sm:inline">&middot;</span>
          <Link href="/pricing" className="hover:text-ink transition-colors">
            Pricing
          </Link>
          <span className="text-border hidden sm:inline">&middot;</span>
          <Link href="/login" className="hover:text-ink transition-colors">
            Sign in
          </Link>
          <span className="text-border hidden sm:inline">&middot;</span>
          <Link href="/privacy" className="hover:text-ink transition-colors">
            Privacy
          </Link>
          <span className="text-border hidden sm:inline">&middot;</span>
          <Link href="/terms" className="hover:text-ink transition-colors">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  )
}
