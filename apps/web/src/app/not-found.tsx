import Link from "next/link"

export default function NotFound() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <div className="w-full max-w-sm px-6 text-center">
        <p className="text-sm font-medium text-accent mb-3 uppercase tracking-wide">
          404
        </p>
        <h1 className="font-serif text-3xl text-ink mb-2">
          Page not found
        </h1>
        <p className="text-muted text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="bg-ink text-cream px-4 py-2 rounded-lg text-sm hover:bg-ink/90 transition-colors font-medium inline-block"
        >
          Go home
        </Link>
      </div>
    </main>
  )
}
