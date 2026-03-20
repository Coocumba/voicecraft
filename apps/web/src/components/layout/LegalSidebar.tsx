interface Section {
  id: string
  title: string
}

interface LegalPageLayoutProps {
  sections: Section[]
  children: React.ReactNode
}

export function LegalPageLayout({ sections, children }: LegalPageLayoutProps) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
      {/* Mobile TOC — card above content, hidden on desktop */}
      <div className="lg:hidden mb-12">
        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8">
          <h2 className="font-serif text-lg text-ink mb-4">Table of Contents</h2>
          <ol className="space-y-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-sm text-accent hover:underline">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Desktop: sidebar + content side by side */}
      <div className="lg:flex lg:gap-10">
        {/* Sticky sidebar — hidden on mobile, visible on lg+ */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <nav className="sticky top-20">
            <h2 className="font-serif text-sm text-ink mb-3">On this page</h2>
            <ol className="space-y-1.5 border-l border-border pl-4">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-[13px] text-muted hover:text-ink transition-colors leading-snug block"
                  >
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        {/* Content area */}
        <div className="flex-1 min-w-0 max-w-3xl">
          {children}
        </div>
      </div>
    </div>
  )
}
