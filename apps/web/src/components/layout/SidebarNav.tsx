'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Section {
  id: string
  title: string
}

export function SidebarNav({ sections }: { sections: Section[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '')
  const visibleIds = useRef(new Set<string>())

  // Stabilize dependency — only re-run if the actual ids change
  const sectionIds = useMemo(
    () => sections.map((s) => s.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(sections.map((s) => s.id))],
  )

  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[]

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleIds.current.add(entry.target.id)
          } else {
            visibleIds.current.delete(entry.target.id)
          }
        }

        // Pick the first visible section in document order
        const first = sectionIds.find((id) => visibleIds.current.has(id))
        if (first) setActiveId(first)
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    )

    for (const el of elements) observer.observe(el)
    return () => {
      observer.disconnect()
      visibleIds.current.clear()
    }
  }, [sectionIds])

  return (
    <nav className="sticky top-20">
      <h2 className="font-serif text-sm text-ink mb-3">On this page</h2>
      <ol className="space-y-1.5">
        {sections.map((s, i) => {
          const isActive = activeId === s.id
          return (
            <li
              key={s.id}
              className={cn(
                'border-l-2 pl-4',
                isActive ? 'border-accent' : 'border-border',
              )}
            >
              <a
                href={`#${s.id}`}
                className={cn(
                  'text-[13px] transition-colors leading-snug block',
                  isActive ? 'text-ink font-medium' : 'text-muted hover:text-ink',
                )}
              >
                {i + 1}. {s.title}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
