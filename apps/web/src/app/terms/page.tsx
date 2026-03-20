import Link from "next/link"
import { auth } from "@/auth"
import { PublicHeader } from "@/components/layout/PublicHeader"
import { PublicFooter } from "@/components/layout/PublicFooter"
import { LegalPageLayout } from "@/components/layout/LegalSidebar"

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

      {/* Sidebar + Content layout */}
      <LegalPageLayout sections={sections}>

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

      </LegalPageLayout>

      <PublicFooter />
    </div>
  )
}
