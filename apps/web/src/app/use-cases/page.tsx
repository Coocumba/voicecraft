import Link from "next/link"
import { auth } from "@/auth"
import { PublicHeader } from "@/components/layout/PublicHeader"
import { PublicFooter } from "@/components/layout/PublicFooter"

export const metadata = { title: "Use Cases" }

const useCases = [
  {
    industry: "Dental Clinics",
    description:
      "Never lose a patient to a missed call again. Your AI receptionist answers while you're with patients, books cleanings and checkups, and sends appointment confirmations — all without interrupting your work.",
    capabilities: [
      "Book cleanings, fillings, crowns, and extractions",
      "Check calendar availability in real time",
      "Greet returning patients by name",
      "Send WhatsApp or SMS confirmations after booking",
    ],
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
      </svg>
    ),
  },
  {
    industry: "Medical Practices",
    description:
      "Doctors, physiotherapists, and specialists — your front desk is overwhelmed. VoiceCraft handles routine calls so your staff can focus on patients who are already in the clinic.",
    capabilities: [
      "Schedule consultations and follow-ups",
      "Answer common questions about services and hours",
      "Recognize returning patients from caller ID",
      "Escalate urgent calls to your team immediately",
    ],
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
      </svg>
    ),
  },
  {
    industry: "Veterinary Clinics",
    description:
      "Pet owners call when they're worried — and they expect someone to answer. VoiceCraft picks up every call, books wellness visits and vaccinations, and makes sure urgent cases get escalated fast.",
    capabilities: [
      "Book vaccinations, checkups, and grooming",
      "Triage urgent calls and escalate emergencies",
      "Send appointment reminders via WhatsApp",
      "Handle after-hours calls with care",
    ],
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
      </svg>
    ),
  },
  {
    industry: "Hair Salons & Spas",
    description:
      "Your stylists are mid-cut when the phone rings. VoiceCraft answers, checks your availability, and books the appointment — so you never have to put down the scissors.",
    capabilities: [
      "Book haircuts, color, treatments, and spa services",
      "Handle walk-in availability questions",
      "Speak in the client's preferred language",
      "Confirm bookings with an automatic text message",
    ],
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m7.848 8.25 1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.043l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664" />
      </svg>
    ),
  },
  {
    industry: "Auto Repair Shops",
    description:
      "Your mechanics are under the hood. Your service advisor is juggling customers. VoiceCraft handles the phone — scheduling oil changes, tire rotations, and diagnostic appointments without anyone stepping away.",
    capabilities: [
      "Book service appointments by type and duration",
      "Answer questions about services and pricing",
      "Send confirmation texts with appointment details",
      "Take messages for complex repair inquiries",
    ],
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
      </svg>
    ),
  },
  {
    industry: "Law Firms",
    description:
      "First impressions matter in legal. VoiceCraft answers intake calls professionally, collects basic case information, and schedules consultations — so potential clients never get sent to voicemail.",
    capabilities: [
      "Schedule initial consultations and follow-ups",
      "Collect caller name and nature of inquiry",
      "Escalate urgent matters to an attorney immediately",
      "Handle calls in multiple languages",
    ],
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
      </svg>
    ),
  },
]

export default async function UseCasesPage() {
  const session = await auth()
  const ctaHref = session ? "/home" : "/login"
  const ctaLabel = session ? "Go to Dashboard" : "Get started"
  const signInLabel = session ? "Dashboard" : "Sign in"

  return (
    <div className="min-h-screen">
      <PublicHeader ctaHref={ctaHref} signInLabel={signInLabel} activePage="use-cases" />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-12 sm:pb-16 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-accent bg-accent/8 border border-accent/20 px-3 py-1.5 rounded-full mb-6 sm:mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          Works for any service business
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl text-ink leading-tight mb-5 sm:mb-6">
          Built for businesses that
          <br className="hidden sm:inline" />
          {" "}run on phone calls
        </h1>
        <p className="text-base sm:text-lg text-muted max-w-xl mx-auto leading-relaxed">
          From dental clinics to law firms — if your business takes appointments
          and your team can&apos;t always answer the phone, VoiceCraft is for you.
        </p>
      </section>

      {/* Use cases grid */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {useCases.map((uc) => (
            <div
              key={uc.industry}
              className="bg-white rounded-2xl border border-border p-6 sm:p-8 hover:border-accent/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-accent/8 flex items-center justify-center text-accent flex-shrink-0">
                  {uc.icon}
                </div>
                <h2 className="font-serif text-xl text-ink">{uc.industry}</h2>
              </div>
              <p className="text-sm text-muted leading-relaxed mb-5">
                {uc.description}
              </p>
              <ul className="space-y-2">
                {uc.capabilities.map((cap) => (
                  <li key={cap} className="flex items-start gap-2 text-sm text-ink">
                    <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {cap}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom message */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-10 sm:pb-12">
        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            Don&apos;t see your industry?
          </p>
          <p className="text-sm text-muted leading-relaxed max-w-lg mx-auto">
            VoiceCraft works for any business that takes phone calls and books appointments.
            Describe your business to the AI builder and it will create an agent tailored to your needs.
          </p>
        </div>
      </section>

      {/* CTA banner */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="bg-ink rounded-2xl px-6 py-10 sm:px-8 sm:py-14 md:px-10 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl text-white mb-4">
            Ready to stop missing calls?
          </h2>
          <p className="text-white/60 text-sm mb-8 max-w-md mx-auto leading-relaxed">
            Set up your AI receptionist in minutes. No technical knowledge required.
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
