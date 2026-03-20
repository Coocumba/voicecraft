import Link from "next/link"

export function PublicFooter() {
  return (
    <footer className="max-w-5xl mx-auto px-4 sm:px-6 py-10 border-t border-border">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-8 sm:gap-4">
        {/* Brand */}
        <div className="flex flex-col gap-1">
          <span className="font-serif text-ink">VoiceCraft</span>
          <span className="text-xs text-muted">
            &copy; {new Date().getFullYear()} All rights reserved
          </span>
        </div>

        {/* Link groups */}
        <div className="flex flex-wrap gap-x-12 gap-y-6 text-sm text-muted">
          {/* Product */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-ink/50">
              Product
            </span>
            <Link href="/#features" className="hover:text-ink transition-colors">
              Features
            </Link>
            <Link href="/use-cases" className="hover:text-ink transition-colors">
              Use Cases
            </Link>
            <Link href="/pricing" className="hover:text-ink transition-colors">
              Pricing
            </Link>
          </div>

          {/* Account */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-ink/50">
              Account
            </span>
            <Link href="/login" className="hover:text-ink transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-ink transition-colors">
              Sign up
            </Link>
          </div>

          {/* Legal */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-ink/50">
              Legal
            </span>
            <Link href="/privacy" className="hover:text-ink transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
