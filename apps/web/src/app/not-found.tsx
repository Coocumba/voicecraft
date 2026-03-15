import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-accent mb-3 uppercase tracking-widest">
          404
        </p>
        <h1 className="font-serif text-4xl font-medium text-ink mb-4">
          Page not found
        </h1>
        <p className="text-muted mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded bg-ink px-5 py-2.5 text-sm font-medium text-cream hover:opacity-90 transition-opacity"
        >
          Go home
        </Link>
      </div>
    </main>
  )
}
