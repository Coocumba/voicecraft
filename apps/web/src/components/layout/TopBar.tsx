'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { cn } from '@/lib/utils'

interface TopBarProps {
  userName?: string | null
  userEmail?: string | null
  /** Unread message count pre-fetched by the server on initial render. */
  initialUnreadCount?: number
}

const services = [
  { label: 'Voice Agents', href: '/voice-agents', available: true },
  { label: 'Calls', href: '/calls', available: true },
  { label: 'Messages', href: '/messages', available: true },
  { label: 'Appointments', href: '/appointments', available: true },
  { label: 'Contacts', href: '/contacts', available: true },
  { label: 'Chat Widget', href: '#', available: false },
]

function HamburgerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function TopBar({ userName, userEmail, initialUnreadCount = 0 }: TopBarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)

  // Keep the badge fresh with a background poll every 60 s.
  // We deliberately skip the initial fetch because the server already
  // provided the count via `initialUnreadCount`.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      fetch('/api/messages?countOnly=true')
        .then(res => res.json())
        .then(data => setUnreadCount((data as { needsReplyCount?: number }).needsReplyCount ?? 0))
        .catch(() => {})
    }

    const intervalId = setInterval(refresh, 60_000)
    return () => clearInterval(intervalId)
  }, [])

  function isServiceActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const initials = userName
    ? userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : userEmail?.[0]?.toUpperCase() ?? '?'

  return (
    <>
      <header className="bg-white border-b border-border h-14 flex items-center px-4 sm:px-6 gap-4 sticky top-0 z-30">
        {/* Logo */}
        <Link href="/home" className="font-serif text-lg text-ink flex-shrink-0 mr-2">
          VoiceCraft
        </Link>

        {/* Desktop service nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1" aria-label="Services">
          {services.map(({ label, href, available }) => {
            if (!available) {
              return (
                <span
                  key={label}
                  className="px-3 py-1.5 rounded-lg text-sm text-muted opacity-50 cursor-not-allowed select-none"
                  aria-disabled="true"
                >
                  {label}
                  <span className="ml-1.5 text-xs bg-muted/15 px-1.5 py-0.5 rounded-full">Soon</span>
                </span>
              )
            }
            const isCurrent = isServiceActive(href)
            return (
              <Link
                key={label}
                href={href}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  isCurrent
                    ? 'text-accent bg-accent/5'
                    : 'text-muted hover:text-ink hover:bg-cream'
                )}
                aria-current={isCurrent ? 'page' : undefined}
              >
                {label}
                {label === 'Messages' && unreadCount > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {unreadCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="flex-1 md:flex-none" />

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className={cn(
              'hidden sm:flex items-center px-3 py-1.5 rounded-lg text-sm transition-colors',
              pathname.startsWith('/settings')
                ? 'text-accent bg-accent/5'
                : 'text-muted hover:text-ink hover:bg-cream'
            )}
          >
            Settings
          </Link>

          {/* User avatar + dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="w-8 h-8 rounded-full bg-accent/10 text-accent text-sm font-medium flex items-center justify-center hover:bg-accent/20 transition-colors"
              aria-label="User menu"
              aria-expanded={userMenuOpen}
            >
              {initials}
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setUserMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-10 z-20 bg-white rounded-xl border border-border shadow-sm min-w-[180px] p-2">
                  <div className="px-3 py-2 mb-1">
                    {userName && <p className="text-sm font-medium text-ink truncate">{userName}</p>}
                    {userEmail && <p className="text-xs text-muted truncate">{userEmail}</p>}
                  </div>
                  <div className="border-t border-border pt-1">
                    <SignOutButton variant="light" />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-muted hover:text-ink transition-colors p-1"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-20 bg-ink/20"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="md:hidden fixed top-14 left-0 right-0 z-30 bg-white border-b border-border shadow-sm p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-1">
            {services.map(({ label, href, available }) => {
              if (!available) {
                return (
                  <span key={label} className="flex items-center justify-between px-3 py-2 text-sm text-muted opacity-50">
                    {label}
                    <span className="text-xs">Soon</span>
                  </span>
                )
              }
              return (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isServiceActive(href)
                      ? 'text-accent bg-accent/5'
                      : 'text-muted hover:text-ink hover:bg-cream'
                  )}
                >
                  {label}
                  {label === 'Messages' && unreadCount > 0 && (
                    <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                      {unreadCount}
                    </span>
                  )}
                </Link>
              )
            })}
            <Link
              href="/settings"
              onClick={() => setMobileOpen(false)}
              className="flex items-center px-3 py-2 rounded-lg text-sm text-muted hover:text-ink hover:bg-cream transition-colors"
            >
              Settings
            </Link>
          </div>
        </>
      )}
    </>
  )
}
