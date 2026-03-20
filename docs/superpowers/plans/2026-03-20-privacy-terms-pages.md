# Privacy Policy & Terms of Service Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/privacy` and `/terms` public pages with legally-appropriate content tailored to VoiceCraft's actual data handling, and update the footer to link to them.

**Architecture:** Two static Server Component pages following the existing public page pattern (PublicHeader + prose content + PublicFooter). No new dependencies. No client-side interactivity. Footer gets two additional links.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Server Components

**Spec:** `docs/superpowers/specs/2026-03-20-privacy-terms-pages-design.md`

---

### Task 1: Update PublicFooter with Privacy and Terms links

**Files:**
- Modify: `apps/web/src/components/layout/PublicFooter.tsx:12-27`

- [ ] **Step 1: Add Privacy and Terms links to the footer**

Add two new links after the "Sign in" link, each preceded by a middot separator. Match the existing link styling exactly.

```tsx
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
```

- [ ] **Step 2: Verify the footer renders correctly**

Run: `cd /Users/sharan/Workplace/Git/voicecraft && pnpm --filter @voicecraft/web build`
Expected: Build succeeds (links point to routes that don't exist yet — that's fine, Next.js doesn't validate Link hrefs at build time).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/PublicFooter.tsx
git commit -m "feat: add privacy and terms links to public footer"
```

---

### Task 2: Create the Privacy Policy page

**Files:**
- Create: `apps/web/src/app/privacy/page.tsx`

**Reference:** Follow the Server Component pattern from `apps/web/src/app/use-cases/page.tsx` — import `auth`, `PublicHeader`, `PublicFooter`, export `metadata`, async default function with session detection.

- [ ] **Step 1: Create the privacy page file**

Create `apps/web/src/app/privacy/page.tsx` with this structure:

```tsx
import Link from "next/link"
import { auth } from "@/auth"
import { PublicHeader } from "@/components/layout/PublicHeader"
import { PublicFooter } from "@/components/layout/PublicFooter"

export const metadata = {
  title: "Privacy Policy",
  description: "How VoiceCraft collects, uses, and protects your information.",
}

const sections = [
  { id: "introduction", title: "Introduction" },
  { id: "information-we-collect", title: "Information We Collect" },
  { id: "how-we-use", title: "How We Use Your Information" },
  { id: "ai-processing", title: "AI and Automated Processing" },
  { id: "voice-calls", title: "Voice Calls and Call Recording" },
  { id: "third-parties", title: "Third-Party Service Providers" },
  { id: "cookies", title: "Cookies" },
  { id: "data-retention", title: "Data Retention" },
  { id: "data-security", title: "Data Security" },
  { id: "healthcare", title: "Healthcare Disclaimer" },
  { id: "california", title: "California Residents (CCPA/CPRA)" },
  { id: "your-rights", title: "Your Rights" },
  { id: "children", title: "Children's Privacy" },
  { id: "international", title: "International Users" },
  { id: "changes", title: "Changes to This Policy" },
  { id: "contact", title: "Contact Us" },
]

export default async function PrivacyPage() {
  const session = await auth()
  const ctaHref = session ? "/dashboard" : "/login"
  const signInLabel = session ? "Dashboard" : "Sign in"

  return (
    <div className="min-h-screen">
      <PublicHeader ctaHref={ctaHref} signInLabel={signInLabel} />

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-12 sm:pb-16 text-center">
        <h1 className="font-serif text-4xl sm:text-5xl text-ink leading-tight mb-4">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted">Last updated March 20, 2026</p>
      </section>

      {/* Table of Contents */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 mb-12">
        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8">
          <h2 className="font-serif text-lg text-ink mb-4">Table of Contents</h2>
          <ol className="space-y-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-sm text-accent hover:underline"
                >
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">

        {/* 1. Introduction */}
        <section id="introduction" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">1. Introduction</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              VoiceCraft (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the VoiceCraft platform, a voice AI service that helps businesses manage phone calls, book appointments, and communicate with customers.
            </p>
            <p>
              This Privacy Policy describes how we collect, use, share, and protect your information when you use our website and services. It applies to all users of the VoiceCraft platform, including business owners who create accounts and the callers who interact with AI-powered voice agents.
            </p>
          </div>
        </section>

        {/* 2. Information We Collect */}
        <section id="information-we-collect" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">2. Information We Collect</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>We collect the following categories of information:</p>

            <h3 className="font-sans font-semibold text-lg text-ink">Account Information</h3>
            <p>Name, email address, and password (securely hashed — we never store your password in plain text).</p>

            <h3 className="font-sans font-semibold text-lg text-ink">Business Information</h3>
            <p>Business name, operating hours, services offered, agent configuration, greeting preferences, and tone settings that you provide when setting up your AI voice agent.</p>

            <h3 className="font-sans font-semibold text-lg text-ink">Call Data</h3>
            <p>Caller phone numbers, call duration, call outcome (completed, missed, or escalated), call transcripts, and call summaries.</p>

            <h3 className="font-sans font-semibold text-lg text-ink">Appointment Data</h3>
            <p>Client names, phone numbers, scheduled appointment times, and the type of service booked.</p>

            <h3 className="font-sans font-semibold text-lg text-ink">Contact Data</h3>
            <p>Phone numbers, names, email addresses, and any notes you add to your contacts. We also track call frequency and last contact date to help you manage your client relationships.</p>

            <h3 className="font-sans font-semibold text-lg text-ink">Message Data</h3>
            <p>WhatsApp message content and conversation history between your AI agent (or you) and your customers.</p>

            <h3 className="font-sans font-semibold text-lg text-ink">Builder Data</h3>
            <p>Conversations you have with our AI builder tool when setting up or configuring your voice agent.</p>

            <h3 className="font-sans font-semibold text-lg text-ink">Technical Data</h3>
            <p>IP address, browser type, and device information collected automatically when you use our website.</p>
          </div>
        </section>

        {/* 3. How We Use Your Information */}
        <section id="how-we-use" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">3. How We Use Your Information</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Operate and deliver the VoiceCraft service</li>
              <li>Power your AI voice agent to handle calls and book appointments</li>
              <li>Process and route phone calls and WhatsApp messages</li>
              <li>Sync appointments with your connected calendar</li>
              <li>Send transactional emails such as account verification and password resets</li>
              <li>Improve and maintain the security of our service</li>
              <li>Comply with legal obligations</li>
            </ul>
          </div>
        </section>

        {/* 4. AI and Automated Processing */}
        <section id="ai-processing" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">4. AI and Automated Processing</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              VoiceCraft uses artificial intelligence to power voice agents, process conversations, and generate agent configurations. Your business information and call conversations are processed by third-party AI providers to deliver these features.
            </p>
            <p>
              We do not use your data to train AI models. Your information is used solely to provide the service to you.
            </p>
            <p>
              AI-generated responses and configurations may not always be accurate. You are responsible for reviewing your agent&apos;s setup before deploying it to handle live calls.
            </p>
          </div>
        </section>

        {/* 5. Voice Calls and Call Recording */}
        <section id="voice-calls" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">5. Voice Calls and Call Recording</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              Inbound calls to your VoiceCraft phone number are handled by an AI voice agent. Call audio is processed in real-time for speech recognition and response generation. Callers interact with an AI assistant, not a human.
            </p>
            <p>
              Call transcripts and summaries may be stored to provide you with call history and analytics.
            </p>
            <p>
              You are responsible for complying with applicable call recording and consent laws in your jurisdiction. Some US states require the consent of all parties to a call before it may be recorded or monitored.
            </p>
          </div>
        </section>

        {/* 6. Third-Party Service Providers */}
        <section id="third-parties" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">6. Third-Party Service Providers</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>We share data with the following providers to operate the service:</p>

            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream text-left">
                    <th className="px-4 py-3 border-b border-border font-semibold text-ink">Provider</th>
                    <th className="px-4 py-3 border-b border-border font-semibold text-ink">What They Receive</th>
                    <th className="px-4 py-3 border-b border-border font-semibold text-ink">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-ink/80">
                  <tr>
                    <td className="px-4 py-3 border-b border-border">Anthropic</td>
                    <td className="px-4 py-3 border-b border-border">Business descriptions, builder conversations</td>
                    <td className="px-4 py-3 border-b border-border">AI agent configuration</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border-b border-border">Google</td>
                    <td className="px-4 py-3 border-b border-border">Call conversations, calendar events</td>
                    <td className="px-4 py-3 border-b border-border">Voice AI processing, calendar sync</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border-b border-border">Microsoft</td>
                    <td className="px-4 py-3 border-b border-border">Calendar events</td>
                    <td className="px-4 py-3 border-b border-border">Calendar sync (Outlook)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border-b border-border">Deepgram</td>
                    <td className="px-4 py-3 border-b border-border">Call audio streams</td>
                    <td className="px-4 py-3 border-b border-border">Speech recognition</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border-b border-border">ElevenLabs / OpenAI</td>
                    <td className="px-4 py-3 border-b border-border">Text responses</td>
                    <td className="px-4 py-3 border-b border-border">Voice synthesis</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border-b border-border">Twilio / Meta</td>
                    <td className="px-4 py-3 border-b border-border">Phone numbers, messages, appointment details</td>
                    <td className="px-4 py-3 border-b border-border">Phone calls, WhatsApp messaging</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 border-b border-border">LiveKit</td>
                    <td className="px-4 py-3 border-b border-border">Call audio streams, room metadata</td>
                    <td className="px-4 py-3 border-b border-border">Real-time voice infrastructure</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Resend</td>
                    <td className="px-4 py-3">Email addresses</td>
                    <td className="px-4 py-3">Transactional emails</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p>Each provider processes data under their own privacy policies and terms of service.</p>
          </div>
        </section>

        {/* 7. Cookies */}
        <section id="cookies" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">7. Cookies</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>We use only essential cookies required for the service to function:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Session cookie:</strong> Keeps you signed in to your account. This cookie is httpOnly and secure.</li>
              <li><strong>OAuth state cookie:</strong> A temporary cookie used during calendar connection that expires after 10 minutes.</li>
            </ul>
            <p>We do not use analytics cookies, tracking pixels, or advertising cookies.</p>
          </div>
        </section>

        {/* 8. Data Retention */}
        <section id="data-retention" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">8. Data Retention</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>Account data is retained for as long as your account is active.</p>
            <p>Call records, appointments, contacts, and messages are retained to provide you with ongoing service, history, and analytics.</p>
            <p>You may request deletion of your data at any time (see <a href="#your-rights" className="text-accent hover:underline">Your Rights</a>).</p>
            <p>Verification and password reset tokens expire automatically and are deleted after use.</p>
          </div>
        </section>

        {/* 9. Data Security */}
        <section id="data-security" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">9. Data Security</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>We take reasonable measures to protect your information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>All data is encrypted in transit between your browser and our servers</li>
              <li>Passwords are securely hashed and never stored in plain text</li>
              <li>Webhook communications are verified using cryptographic signatures</li>
              <li>We implement access controls to protect your data</li>
            </ul>
            <p>No system is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.</p>
          </div>
        </section>

        {/* 10. Healthcare Disclaimer */}
        <section id="healthcare" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">10. Healthcare Disclaimer</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              VoiceCraft is <strong>not designed</strong> to collect, store, or process Protected Health Information (PHI) as defined under the Health Insurance Portability and Accountability Act (HIPAA).
            </p>
            <p>
              You must not use VoiceCraft to transmit, store, or process PHI or any information subject to HIPAA.
            </p>
            <p>
              VoiceCraft does not enter into Business Associate Agreements (BAAs).
            </p>
            <p>
              The service handles operational business data such as appointment scheduling and call routing — it is not a medical or clinical tool. If you operate in a HIPAA-regulated environment, you are responsible for ensuring your use of VoiceCraft complies with applicable regulations.
            </p>
          </div>
        </section>

        {/* 11. California Residents */}
        <section id="california" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">11. California Residents (CCPA/CPRA)</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>If you are a California resident, you have additional rights under the California Consumer Privacy Act:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Right to know:</strong> You may request the categories and specific pieces of personal information we have collected about you.</li>
              <li><strong>Right to delete:</strong> You may request deletion of your personal information.</li>
              <li><strong>Right to opt-out:</strong> We do not sell or share your personal information for cross-context behavioral advertising.</li>
              <li><strong>Non-discrimination:</strong> We will not discriminate against you for exercising your privacy rights.</li>
            </ul>
            <p>To exercise these rights, contact us at the email listed in the <a href="#contact" className="text-accent hover:underline">Contact Us</a> section below.</p>
          </div>
        </section>

        {/* 12. Your Rights */}
        <section id="your-rights" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">12. Your Rights</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate data</li>
              <li><strong>Deletion:</strong> Request deletion of your data and account</li>
              <li><strong>Export:</strong> Request a portable copy of your data</li>
            </ul>
            <p>Contact us at the email below to exercise these rights. We will respond within 30 days.</p>
          </div>
        </section>

        {/* 13. Children's Privacy */}
        <section id="children" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">13. Children&apos;s Privacy</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>VoiceCraft is a business tool and is not directed at individuals under 18. We do not knowingly collect personal information from children.</p>
          </div>
        </section>

        {/* 14. International Users */}
        <section id="international" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">14. International Users</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>VoiceCraft is operated from the United States. Your data is processed and stored in the United States.</p>
            <p>By using the service, you consent to the transfer and processing of your data in the United States.</p>
          </div>
        </section>

        {/* 15. Changes to This Policy */}
        <section id="changes" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">15. Changes to This Policy</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>We may update this policy from time to time. Material changes will be communicated via email to your registered address.</p>
            <p>The &ldquo;Last updated&rdquo; date at the top of this page will reflect the most recent revision. Continued use of the service after changes constitutes acceptance.</p>
          </div>
        </section>

        {/* 16. Contact Us */}
        <section id="contact" className="scroll-mt-20 py-8">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">16. Contact Us</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>For privacy questions or to exercise your rights, contact us at:</p>
            <p><a href="mailto:privacy@voicecraft.dev" className="text-accent hover:underline">privacy@voicecraft.dev</a></p>
          </div>
        </section>

      </div>

      <PublicFooter />
    </div>
  )
}
```

- [ ] **Step 2: Verify the page builds**

Run: `cd /Users/sharan/Workplace/Git/voicecraft && pnpm --filter @voicecraft/web build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/privacy/page.tsx
git commit -m "feat: add privacy policy page"
```

---

### Task 3: Create the Terms of Service page

**Files:**
- Create: `apps/web/src/app/terms/page.tsx`

**Reference:** Same Server Component pattern as privacy page. Different content, same layout structure.

- [ ] **Step 1: Create the terms page file**

Create `apps/web/src/app/terms/page.tsx` with this structure:

```tsx
import Link from "next/link"
import { auth } from "@/auth"
import { PublicHeader } from "@/components/layout/PublicHeader"
import { PublicFooter } from "@/components/layout/PublicFooter"

export const metadata = {
  title: "Terms of Service",
  description: "Terms and conditions for using the VoiceCraft platform.",
}

const sections = [
  { id: "acceptance", title: "Introduction & Acceptance" },
  { id: "service", title: "Description of Service" },
  { id: "account", title: "Account Responsibilities" },
  { id: "billing", title: "Subscription & Billing" },
  { id: "acceptable-use", title: "Acceptable Use" },
  { id: "ai-content", title: "AI-Generated Content" },
  { id: "your-data", title: "Your Content & Data" },
  { id: "healthcare", title: "Healthcare Disclaimer" },
  { id: "third-party", title: "Third-Party Services" },
  { id: "ip", title: "Intellectual Property" },
  { id: "warranty", title: "Warranty Disclaimer" },
  { id: "liability", title: "Limitation of Liability" },
  { id: "indemnification", title: "Indemnification" },
  { id: "termination", title: "Termination" },
  { id: "governing-law", title: "Governing Law" },
  { id: "severability", title: "Severability" },
  { id: "changes", title: "Changes to These Terms" },
  { id: "contact", title: "Contact Us" },
]

export default async function TermsPage() {
  const session = await auth()
  const ctaHref = session ? "/dashboard" : "/login"
  const signInLabel = session ? "Dashboard" : "Sign in"

  return (
    <div className="min-h-screen">
      <PublicHeader ctaHref={ctaHref} signInLabel={signInLabel} />

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-12 sm:pb-16 text-center">
        <h1 className="font-serif text-4xl sm:text-5xl text-ink leading-tight mb-4">
          Terms of Service
        </h1>
        <p className="text-sm text-muted">Last updated March 20, 2026</p>
      </section>

      {/* Table of Contents */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 mb-12">
        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8">
          <h2 className="font-serif text-lg text-ink mb-4">Table of Contents</h2>
          <ol className="space-y-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-sm text-accent hover:underline"
                >
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">

        {/* 1. Introduction & Acceptance */}
        <section id="acceptance" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">1. Introduction & Acceptance</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              By accessing or using VoiceCraft, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the service.
            </p>
            <p>
              You must be at least 18 years old to use VoiceCraft. By creating an account, you represent that you have the authority to bind the business entity you register on behalf of.
            </p>
          </div>
        </section>

        {/* 2. Description of Service */}
        <section id="service" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">2. Description of Service</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              VoiceCraft is a voice AI platform that creates and manages AI-powered phone agents for businesses. Features include AI voice agents that handle inbound calls, appointment booking, WhatsApp messaging, calendar integration, and contact management.
            </p>
            <p>
              We may modify, suspend, or discontinue features at any time with reasonable notice.
            </p>
          </div>
        </section>

        {/* 3. Account Responsibilities */}
        <section id="account" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">3. Account Responsibilities</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>You are responsible for:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Maintaining the security of your account credentials</li>
              <li>All activity that occurs under your account</li>
              <li>Providing accurate and complete business information for your agent configuration</li>
              <li>Promptly notifying us of any unauthorized access to your account</li>
            </ul>
          </div>
        </section>

        {/* 4. Subscription & Billing */}
        <section id="billing" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">4. Subscription & Billing</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>VoiceCraft offers subscription plans as described on our <Link href="/pricing" className="text-accent hover:underline">pricing page</Link>.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Subscriptions renew automatically unless cancelled before the renewal date</li>
              <li>You authorize us to charge your payment method for recurring fees</li>
              <li>Refunds are handled on a case-by-case basis — contact support for requests</li>
              <li>We may change pricing with 30 days&apos; notice before your next billing cycle</li>
            </ul>
          </div>
        </section>

        {/* 5. Acceptable Use */}
        <section id="acceptable-use" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">5. Acceptable Use</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use VoiceCraft for any illegal purpose</li>
              <li>Transmit spam, unsolicited messages, or abusive content via calls or WhatsApp</li>
              <li>Impersonate any person or entity through your AI agent</li>
              <li>Use the service to make automated calls in violation of the Telephone Consumer Protection Act (TCPA) or applicable telemarketing laws</li>
              <li>Attempt to reverse-engineer, decompile, or access the source code of VoiceCraft</li>
              <li>Interfere with or disrupt the service or its infrastructure</li>
              <li>Use VoiceCraft to collect or process Protected Health Information (PHI)</li>
              <li>Exceed reasonable usage limits or abuse API endpoints</li>
            </ul>
          </div>
        </section>

        {/* 6. AI-Generated Content */}
        <section id="ai-content" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">6. AI-Generated Content</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              Agent configurations, call responses, and appointment bookings are generated by artificial intelligence. AI outputs may contain errors, inaccuracies, or inappropriate responses.
            </p>
            <p>
              You are responsible for reviewing and testing your agent&apos;s configuration before deploying it to handle live calls. VoiceCraft does not guarantee the accuracy, completeness, or appropriateness of AI-generated content.
            </p>
            <p>
              You assume full responsibility for your agent&apos;s interactions with callers.
            </p>
          </div>
        </section>

        {/* 7. Your Content & Data */}
        <section id="your-data" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">7. Your Content & Data</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              You retain ownership of all data you submit to VoiceCraft, including your business information, contacts, and content.
            </p>
            <p>
              You grant us a limited license to process your data solely for the purpose of delivering the service. This license terminates when you delete your data or close your account.
            </p>
            <p>
              See our <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link> for details on how we handle your data.
            </p>
          </div>
        </section>

        {/* 8. Healthcare Disclaimer */}
        <section id="healthcare" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">8. Healthcare Disclaimer</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              VoiceCraft is <strong>not</strong> a medical or healthcare service. The platform is not designed to process Protected Health Information (PHI) as defined under HIPAA.
            </p>
            <p>
              You must not use VoiceCraft to collect, store, or transmit PHI. VoiceCraft does not offer Business Associate Agreements (BAAs).
            </p>
            <p>
              You are solely responsible for ensuring your use of the service complies with healthcare regulations applicable to your business.
            </p>
          </div>
        </section>

        {/* 9. Third-Party Services */}
        <section id="third-party" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">9. Third-Party Services</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              VoiceCraft integrates with third-party services including Twilio, Google Calendar, Microsoft Outlook, WhatsApp, and others. Your use of these integrations is subject to the respective third-party terms and policies.
            </p>
            <p>
              We are not responsible for the availability, accuracy, or conduct of third-party services. We may add, modify, or remove integrations at any time.
            </p>
          </div>
        </section>

        {/* 10. Intellectual Property */}
        <section id="ip" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">10. Intellectual Property</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              The VoiceCraft platform, brand, technology, and documentation are our property or licensed to us. Your business data, contacts, and content remain your property.
            </p>
            <p>
              Nothing in these terms transfers ownership of either party&apos;s intellectual property to the other.
            </p>
          </div>
        </section>

        {/* 11. Warranty Disclaimer */}
        <section id="warranty" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">11. Warranty Disclaimer</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              VoiceCraft is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, whether express or implied.
            </p>
            <p>
              We do not warrant that the service will be uninterrupted, error-free, or secure. We do not warrant the accuracy of AI-generated responses or configurations.
            </p>
            <p>
              We disclaim all implied warranties including merchantability, fitness for a particular purpose, and non-infringement, to the maximum extent permitted by law.
            </p>
          </div>
        </section>

        {/* 12. Limitation of Liability */}
        <section id="liability" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">12. Limitation of Liability</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              To the maximum extent permitted by law, our total liability to you for any claims arising from or related to the service is limited to the fees you paid to VoiceCraft in the 12 months preceding the claim.
            </p>
            <p>
              We are not liable for any indirect, incidental, consequential, or punitive damages, including but not limited to lost revenue, missed appointments, or damages arising from AI agent behavior.
            </p>
          </div>
        </section>

        {/* 13. Indemnification */}
        <section id="indemnification" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">13. Indemnification</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              You agree to indemnify and hold VoiceCraft harmless from any claims, damages, losses, or expenses (including reasonable legal fees) arising from your use of the service, your agent&apos;s interactions with callers, your violation of these terms, or your violation of any applicable law.
            </p>
            <p>
              This includes claims arising from the content or behavior of AI agents you configure and deploy.
            </p>
          </div>
        </section>

        {/* 14. Termination */}
        <section id="termination" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">14. Termination</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              You may cancel your account at any time through your dashboard or by contacting support.
            </p>
            <p>
              We may terminate or suspend your account for violation of these terms, with notice where practicable. Upon termination, access is revoked immediately. Your data is retained for 30 days to allow retrieval, then permanently deleted.
            </p>
            <p>
              Sections that by nature should survive termination — including liability, intellectual property, indemnification, and disclaimers — will survive.
            </p>
          </div>
        </section>

        {/* 15. Governing Law */}
        <section id="governing-law" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">15. Governing Law</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              These terms are governed by the laws of the State of Delaware, United States. Any disputes arising from these terms will be resolved in the courts of Delaware.
            </p>
            <p>
              You agree to attempt good-faith resolution before pursuing legal action.
            </p>
          </div>
        </section>

        {/* 16. Severability */}
        <section id="severability" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">16. Severability</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              If any provision of these terms is found to be unenforceable or invalid, the remaining provisions will continue in full force and effect.
            </p>
          </div>
        </section>

        {/* 17. Changes to These Terms */}
        <section id="changes" className="scroll-mt-20 py-8 border-b border-border">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">17. Changes to These Terms</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>
              We may update these terms from time to time. Material changes will be communicated via email at least 30 days before taking effect.
            </p>
            <p>
              The &ldquo;Last updated&rdquo; date at the top of this page reflects the most recent revision. Continued use of the service after changes take effect constitutes acceptance.
            </p>
          </div>
        </section>

        {/* 18. Contact Us */}
        <section id="contact" className="scroll-mt-20 py-8">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-4">18. Contact Us</h2>
          <div className="space-y-4 text-base text-ink/80 leading-relaxed">
            <p>For questions about these terms, contact us at:</p>
            <p><a href="mailto:legal@voicecraft.dev" className="text-accent hover:underline">legal@voicecraft.dev</a></p>
          </div>
        </section>

      </div>

      <PublicFooter />
    </div>
  )
}
```

- [ ] **Step 2: Verify the page builds**

Run: `cd /Users/sharan/Workplace/Git/voicecraft && pnpm --filter @voicecraft/web build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/terms/page.tsx
git commit -m "feat: add terms of service page"
```

---

### Task 4: Final build verification and visual check

**Files:**
- None (verification only)

- [ ] **Step 1: Run full build**

Run: `cd /Users/sharan/Workplace/Git/voicecraft && pnpm --filter @voicecraft/web build`
Expected: Build succeeds, all three files (footer + 2 pages) compiled without errors.

- [ ] **Step 2: Run type-check**

Run: `cd /Users/sharan/Workplace/Git/voicecraft && pnpm type-check`
Expected: No TypeScript errors.

- [ ] **Step 3: Run lint**

Run: `cd /Users/sharan/Workplace/Git/voicecraft && pnpm lint`
Expected: No lint errors in the new files.
