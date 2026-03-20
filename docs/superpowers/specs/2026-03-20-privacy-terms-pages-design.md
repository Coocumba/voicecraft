# Privacy Policy & Terms of Service Pages — Design Spec

## Overview

Add two new public pages to VoiceCraft: `/privacy` (Privacy Policy) and `/terms` (Terms of Service). Both follow the existing public page pattern with `PublicHeader` + `PublicFooter`, use the HelpNest editorial design system, and present legal content in a clean, scannable format. Footer updated to include links to both pages.

## Decisions

- **HIPAA approach:** Pattern 1 (Calendly-style) — explicitly disclaim HIPAA compliance, state VoiceCraft is not designed to process PHI, no BAAs offered
- **Jurisdiction:** US-focused with a note for international users
- **Page style:** Single long-scroll prose page (Approach A) — industry standard, matches existing patterns
- **Technical detail level:** Name third-party companies but skip engineering specs (no model names, no algorithm details)
- **No CTA banner** at bottom — these are legal pages, not marketing
- **Component type:** Server Components with `export const metadata` for SEO (no interactivity needed)
- **Session detection:** Use `auth()` server-side to determine ctaHref/signInLabel (same pattern as use-cases page)
- **Legal review:** Content is a working draft — should be reviewed by legal counsel before production deployment

## Visual Design

### Layout Structure

Both pages share identical layout:

```
PublicHeader (sticky, no activePage — legal pages aren't nav items)
  |
Hero (max-w-3xl mx-auto, centered)
  - No badge (legal pages don't need a marketing hook — departure from pricing/use-cases)
  - H1: "Privacy Policy" or "Terms of Service" (font-serif text-4xl sm:text-5xl)
  - Last updated: "Last updated March 20, 2026" (text-muted text-sm)
  |
Table of Contents (max-w-3xl mx-auto)
  - bg-white rounded-2xl border border-border p-6 sm:p-8
  - Numbered anchor links (text-accent hover:underline)
  |
Content Sections (max-w-3xl mx-auto)
  - Each section: id="section-N" scroll-mt-20
  - H2: font-serif text-2xl sm:text-3xl text-ink mb-4
  - Body: text-base text-ink/80 leading-relaxed
  - Lists: bullet points with text-ink/80
  - Sub-headings (H3): font-sans font-semibold text-lg text-ink
  - Tables: simple bordered tables for third-party providers
  - Section spacing: py-8 border-b border-border (except last)
  |
PublicFooter (with Privacy + Terms links added)
```

### Typography

- H1: `font-serif text-4xl sm:text-5xl text-ink leading-tight`
- H2: `font-serif text-2xl sm:text-3xl text-ink`
- H3: `font-sans font-semibold text-lg text-ink`
- Body: `font-sans text-base text-ink/80 leading-relaxed`
- Links in TOC: `text-accent hover:underline`
- Last updated: `text-sm text-muted`

### Spacing

- Container: `max-w-3xl mx-auto px-4 sm:px-6`
- Hero: `pt-16 sm:pt-20 pb-12 sm:pb-16 text-center`
- TOC card: `mb-12`
- Sections: `py-8 border-b border-border` (last section has no border)
- Final section to footer: `pb-16`

### Tables (Provider Table)

No table precedent exists in current pages. Use:
- Container: `w-full text-sm overflow-x-auto`
- Table: `w-full`
- Header row: `bg-cream text-left font-semibold text-ink`
- Header cells: `px-4 py-3 border-b border-border`
- Body cells: `px-4 py-3 border-b border-border text-ink/80`
- Rounded wrapper: `rounded-xl border border-border overflow-hidden`

### SEO Metadata

Both pages export `metadata` for Next.js:
- Privacy: `{ title: "Privacy Policy", description: "How VoiceCraft collects, uses, and protects your information." }`
- Terms: `{ title: "Terms of Service", description: "Terms and conditions for using the VoiceCraft platform." }`

Title template from root layout will produce: "Privacy Policy · VoiceCraft"

### Responsive

- Single column at all breakpoints (prose pages don't need grid)
- `sm:` breakpoints for font size scaling and padding (consistent with existing pages)

## Footer Changes

Add Privacy and Terms links to `PublicFooter.tsx`:

```
Features · Use Cases · Pricing · Sign in · Privacy · Terms
```

Same `text-muted hover:text-ink transition-colors` styling with `·` separators.

## Privacy Policy Content

### Sections

**1. Introduction**
- VoiceCraft ("we", "us", "our") operates the VoiceCraft platform
- This policy describes how we collect, use, and protect your information
- Applies to all users of the VoiceCraft website and services

**2. Information We Collect**
- *Account information:* name, email address, password (securely hashed)
- *Business information:* business name, hours, services, agent configuration, greeting and tone preferences
- *Call data:* caller phone numbers, call duration, call outcome, transcripts, summaries
- *Appointment data:* patient/client names, phone numbers, scheduled times, service type
- *Contact data:* phone numbers, names, email addresses, notes
- *Message data:* WhatsApp message content, conversation history
- *Builder data:* conversations with our AI builder used to set up your agent
- *Technical data:* IP address, browser type, device information

**3. How We Use Your Information**
- Operate and deliver the VoiceCraft service
- Power your AI voice agent to handle calls and book appointments
- Process and route phone calls and WhatsApp messages
- Sync appointments with your connected calendar
- Send transactional emails (verification, password reset)
- Improve and maintain the security of our service
- Comply with legal obligations

**4. AI and Automated Processing**
- VoiceCraft uses artificial intelligence to power voice agents, process conversations, and generate agent configurations
- Your business information and call conversations are processed by third-party AI providers to deliver these features
- We do not use your data to train AI models
- AI-generated responses and configurations may not always be accurate — you are responsible for reviewing your agent's setup

**5. Voice Calls and Call Recording**
- Inbound calls to your VoiceCraft number are handled by an AI voice agent
- Call audio is processed in real-time for speech recognition and response generation
- Call transcripts and summaries may be stored to provide call history and analytics
- Callers interact with an AI assistant, not a human
- You are responsible for complying with applicable call recording and consent laws in your jurisdiction (some US states require all-party consent for call recording)

**6. Third-Party Service Providers**
We share data with the following providers to operate the service:

| Provider | What They Receive | Purpose |
|----------|-------------------|---------|
| Anthropic | Business descriptions, builder conversations | AI agent configuration |
| Google | Call conversations, calendar events | Voice AI processing, calendar sync |
| Microsoft | Calendar events | Calendar sync (Outlook) |
| Deepgram | Call audio streams | Speech recognition |
| ElevenLabs / OpenAI | Text responses | Voice synthesis |
| Twilio / Meta | Phone numbers, messages, appointment details | Phone calls, WhatsApp messaging |
| LiveKit | Call audio streams, room metadata | Real-time voice infrastructure |
| Resend | Email addresses | Transactional emails |

Each provider processes data under their own privacy policies and terms.

**7. Cookies**
- We use only essential cookies required for the service to function
- *Session cookie:* keeps you signed in (httpOnly, secure)
- *OAuth state cookie:* temporary, used during calendar connection (expires in 10 minutes)
- We do not use analytics cookies, tracking pixels, or advertising cookies

**8. Data Retention**
- Account data is retained while your account is active
- Call records, appointments, and contacts are retained for service operation
- You may request deletion of your data at any time (see Your Rights)
- Verification and password reset tokens expire automatically

**9. Data Security**
- All data is encrypted in transit between your browser and our servers
- Passwords are securely hashed and never stored in plain text
- Webhook communications are verified using cryptographic signatures
- We implement access controls to protect your data
- No system is 100% secure — we cannot guarantee absolute security

**10. Healthcare Disclaimer**
- VoiceCraft is not designed to collect, store, or process Protected Health Information (PHI) as defined under HIPAA
- You must not use VoiceCraft to transmit, store, or process PHI or any information subject to HIPAA
- VoiceCraft does not enter into Business Associate Agreements (BAAs)
- The service handles operational business data such as appointment scheduling and call routing — it is not a medical or clinical tool
- If you operate in a HIPAA-regulated environment, you are responsible for ensuring your use of VoiceCraft complies with applicable regulations

**11. California Residents (CCPA/CPRA)**
- If you are a California resident, you have additional rights under the California Consumer Privacy Act
- *Right to know:* you may request the categories and specific pieces of personal information we have collected
- *Right to delete:* you may request deletion of your personal information
- *Right to opt-out:* we do not sell or share your personal information for cross-context behavioral advertising
- *Non-discrimination:* we will not discriminate against you for exercising your privacy rights
- To exercise these rights, contact us at the email below

**12. Your Rights**
- *Access:* request a copy of the personal data we hold about you
- *Correction:* request correction of inaccurate data
- *Deletion:* request deletion of your data and account
- *Export:* request a portable copy of your data
- Contact us at the email below to exercise these rights — we respond within 30 days

**13. Children's Privacy**
- VoiceCraft is a business tool and is not directed at individuals under 18
- We do not knowingly collect data from children

**14. International Users**
- VoiceCraft is operated from the United States
- Your data is processed and stored in the United States
- By using the service, you consent to the transfer and processing of your data in the United States

**15. Changes to This Policy**
- We may update this policy from time to time
- Material changes will be communicated via email to your registered address
- The "Last updated" date at the top will reflect the most recent revision
- Continued use of the service after changes constitutes acceptance

**16. Contact Us**
- For privacy questions or to exercise your rights: privacy@voicecraft.dev

## Terms of Service Content

### Sections

**1. Introduction & Acceptance**
- By accessing or using VoiceCraft, you agree to these Terms of Service
- If you do not agree, do not use the service
- You must be at least 18 years old to use VoiceCraft
- You represent that you have authority to bind the business entity you register

**2. Description of Service**
- VoiceCraft is a voice AI platform that creates and manages AI-powered phone agents for businesses
- Features include: AI voice agent handling inbound calls, appointment booking, WhatsApp messaging, calendar integration, and contact management
- We may modify, suspend, or discontinue features with reasonable notice

**3. Account Responsibilities**
- You are responsible for maintaining the security of your account credentials
- You are responsible for all activity under your account
- You must provide accurate and complete business information for your agent configuration
- You must promptly notify us of any unauthorized access to your account

**4. Subscription & Billing**
- VoiceCraft offers subscription plans as described on our pricing page
- Subscriptions renew automatically unless cancelled before the renewal date
- You authorize us to charge your payment method for recurring fees
- Refunds are handled on a case-by-case basis — contact support for requests
- We may change pricing with 30 days' notice before your next billing cycle

**5. Acceptable Use**
You agree not to:
- Use VoiceCraft for any illegal purpose
- Transmit spam, unsolicited messages, or abusive content via calls or WhatsApp
- Impersonate any person or entity through your AI agent
- Use the service to make automated calls in violation of TCPA or applicable telemarketing laws
- Attempt to reverse-engineer, decompile, or access the source code of VoiceCraft
- Interfere with or disrupt the service or its infrastructure
- Use VoiceCraft to collect or process Protected Health Information (PHI)
- Exceed reasonable usage limits or abuse API endpoints

**6. AI-Generated Content**
- Agent configurations, call responses, and appointment bookings are generated by artificial intelligence
- AI outputs may contain errors, inaccuracies, or inappropriate responses
- You are responsible for reviewing and testing your agent's configuration before deploying it to handle live calls
- VoiceCraft does not guarantee the accuracy, completeness, or appropriateness of AI-generated content
- You assume full responsibility for your agent's interactions with callers

**7. Your Content & Data**
- You retain ownership of all data you submit to VoiceCraft (business information, contacts, etc.)
- You grant us a limited license to process your data solely for the purpose of delivering the service
- This license terminates when you delete your data or close your account
- See our Privacy Policy for details on how we handle your data

**8. Healthcare Disclaimer**
- VoiceCraft is not a medical or healthcare service
- The platform is not designed to process Protected Health Information as defined under HIPAA
- You must not use VoiceCraft to collect, store, or transmit PHI
- VoiceCraft does not offer Business Associate Agreements
- You are solely responsible for ensuring your use of the service complies with healthcare regulations applicable to your business

**9. Third-Party Services**
- VoiceCraft integrates with third-party services including Twilio, Google Calendar, Microsoft Outlook, WhatsApp, and others
- Your use of these integrations is subject to the respective third-party terms and policies
- We are not responsible for the availability, accuracy, or conduct of third-party services
- We may add, modify, or remove integrations at any time

**10. Intellectual Property**
- The VoiceCraft platform, brand, technology, and documentation are our property or licensed to us
- Your business data, contacts, and content remain your property
- Nothing in these terms transfers ownership of either party's intellectual property to the other

**11. Warranty Disclaimer**
- VoiceCraft is provided "as is" and "as available" without warranties of any kind
- We do not warrant that the service will be uninterrupted, error-free, or secure
- We do not warrant the accuracy of AI-generated responses or configurations
- We disclaim all implied warranties including merchantability, fitness for a particular purpose, and non-infringement

**12. Limitation of Liability**
- Our total liability to you is limited to the fees you paid in the 12 months preceding the claim
- We are not liable for indirect, incidental, consequential, or punitive damages
- This includes but is not limited to lost revenue, missed appointments, or damages arising from AI agent behavior
- These limitations apply to the maximum extent permitted by law

**13. Indemnification**
- You agree to indemnify and hold VoiceCraft harmless from claims, damages, or expenses arising from: your use of the service, your agent's interactions with callers, your violation of these terms, or your violation of any applicable law
- This includes claims arising from the content or behavior of AI agents you configure and deploy

**14. Termination**
- You may cancel your account at any time through your dashboard or by contacting support
- We may terminate or suspend your account for violation of these terms, with notice where practicable
- Upon termination: access is revoked immediately, your data is retained for 30 days for retrieval, then permanently deleted
- Sections that by nature should survive termination (liability, IP, disclaimers) will survive

**15. Governing Law**
- These terms are governed by the laws of the State of Delaware, United States
- Disputes will be resolved in the courts of Delaware
- You agree to attempt good-faith resolution before pursuing legal action

**16. Severability**
- If any provision of these terms is found to be unenforceable, the remaining provisions remain in full effect

**17. Changes to These Terms**
- We may update these terms from time to time
- Material changes will be communicated via email at least 30 days before taking effect
- The "Last updated" date at the top reflects the most recent revision
- Continued use after changes take effect constitutes acceptance

**18. Contact Us**
- For questions about these terms: legal@voicecraft.dev

## Files to Create / Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/app/privacy/page.tsx` | Privacy Policy page |
| Create | `src/app/terms/page.tsx` | Terms of Service page |
| Modify | `src/components/layout/PublicFooter.tsx` | Add Privacy + Terms links |

## Out of Scope

- Cookie consent banner (no tracking cookies exist)
- GDPR-specific data subject request form
- PDF download option
- Version history / changelog of policy changes
- Signup flow clickwrap ("By creating an account, you agree to...") — separate task
