import Link from "next/link"
import { auth } from "@/auth"
import { PublicHeader } from "@/components/layout/PublicHeader"
import { PublicFooter } from "@/components/layout/PublicFooter"

const features = [
  {
    title: "24/7 Availability",
    description:
      "Your AI agent answers every call, day or night, weekends and holidays. No voicemail, no missed opportunities.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Appointment Booking",
    description:
      "Checks your calendar, finds open slots, and books appointments — all within the phone conversation.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "Connected to Your Calendar",
    description:
      "Link your Google or Microsoft calendar. Booked appointments show up automatically — no double-booking, no manual entry.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  {
    title: "Knows Your Callers",
    description:
      "Returning callers are recognized and greeted by name. Your agent remembers who they are and why they last called.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: "Your Own Phone Number",
    description:
      "Get a dedicated business phone number for your agent in one click. No technical setup needed.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  {
    title: "Call History & Contacts",
    description:
      "Every call is logged with who called, how long they spoke, and what happened. Your caller list builds itself.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "WhatsApp Confirmations",
    description:
      "After booking, your agent sends the caller a confirmation on WhatsApp. Appointment reminders are sent automatically too.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    title: "Speaks Your Language",
    description:
      "Your agent can speak and understand multiple languages. If a caller switches languages, the agent follows naturally.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
      </svg>
    ),
  },
  {
    title: "Conversation Transcripts",
    description:
      "Read what your agent and callers said in every call. Review conversations anytime from your dashboard.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
]

export default async function LandingPage() {
  const session = await auth()
  const ctaHref = session ? "/voice-agents" : "/login"
  const ctaLabel = session ? "Go to Dashboard" : "Get started"
  const signInLabel = session ? "Dashboard" : "Sign in"

  return (
    <div className="min-h-screen">
      <PublicHeader ctaHref={ctaHref} signInLabel={signInLabel} activePage="features" />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-12 sm:pb-16 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-accent bg-accent/8 border border-accent/20 px-3 py-1.5 rounded-full mb-6 sm:mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          AI-powered · For small businesses · Set up in minutes
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl text-ink leading-tight mb-5 sm:mb-6">
          Your AI receptionist that
          <br className="hidden sm:inline" />
          {" "}never misses a call
        </h1>
        <p className="text-base sm:text-lg text-muted max-w-xl mx-auto mb-8 sm:mb-10 leading-relaxed">
          VoiceCraft answers your business phone 24/7 — books appointments,
          answers questions, and recognizes returning callers. Your customers
          talk to a friendly voice, not a robot.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={ctaHref}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/90 transition-colors"
          >
            {ctaLabel} →
          </Link>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-sm text-ink border border-border rounded-xl hover:bg-white transition-colors"
          >
            See how it works →
          </a>
        </div>
      </section>

      {/* The problem */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">
            Why VoiceCraft exists
          </p>
          <blockquote className="font-serif text-lg sm:text-xl md:text-2xl text-ink leading-relaxed mb-6">
            &ldquo;I&apos;m with a patient. The phone rings. I can&apos;t answer.
            The caller hangs up and books with someone else. By the time I check
            the missed call, they&apos;re gone.&rdquo;
          </blockquote>
          <p className="text-muted text-sm leading-relaxed mb-4">
            Dentists, salon owners, clinic managers — they all face the same
            problem. You can&apos;t answer the phone when you&apos;re doing the work
            your business exists to do.
          </p>
          <p className="text-muted text-sm leading-relaxed">
            Hiring a full-time receptionist is expensive. Voicemail doesn&apos;t
            book appointments. VoiceCraft gives you an AI agent that handles
            calls the way a great receptionist would.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-3">
            What your AI receptionist can do
          </h2>
          <p className="text-muted text-sm sm:text-base">Built for real businesses, not demos.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-xl border border-border p-5"
            >
              <div className="w-9 h-9 rounded-lg bg-accent/8 flex items-center justify-center text-accent mb-3">
                {f.icon}
              </div>
              <h3 className="font-medium text-ink text-sm mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="text-center mb-6 sm:mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            How it works
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-3">
            Three steps to a working phone agent
          </h2>
          <p className="text-muted text-sm">
            No technical knowledge required.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="p-6 sm:p-8 md:p-10">
            <div className="space-y-8 sm:space-y-10">
              {[
                {
                  step: "1",
                  title: "Describe your business",
                  description:
                    "Chat with our AI builder about your services, hours, and how you'd like calls handled. It takes about two minutes.",
                },
                {
                  step: "2",
                  title: "Get your phone number",
                  description:
                    "We provision a dedicated phone number for your agent instantly. One click — no accounts to create, no configuration.",
                },
                {
                  step: "3",
                  title: "Start taking calls",
                  description:
                    "Share your new number or forward your existing business line. Your AI receptionist answers calls and books appointments.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-4 sm:gap-5">
                  <div className="w-9 h-9 rounded-full bg-accent/8 border border-accent/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-accent">{item.step}</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-ink text-sm mb-1.5">{item.title}</h3>
                    <p className="text-sm text-muted leading-relaxed">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="bg-ink rounded-2xl px-6 py-10 sm:px-8 sm:py-14 md:px-10 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl text-white mb-4">
            Stop missing calls today
          </h2>
          <p className="text-white/60 text-sm mb-8 max-w-md mx-auto leading-relaxed">
            Set up your AI receptionist in minutes. Describe your business,
            get a phone number, and start taking calls.
          </p>
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-ink text-sm font-medium rounded-xl hover:bg-white/90 transition-colors"
          >
            {ctaLabel} →
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
