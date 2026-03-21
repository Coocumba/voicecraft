# VoiceCraft — Market Analysis: Who Can Use This App

## Overview

VoiceCraft is a voice AI receptionist platform built for service businesses where the person doing the work is also the person expected to answer the phone. The platform handles inbound calls, books appointments via Google Calendar, and sends confirmations via SMS or WhatsApp — all without code changes for the business owner.

This document maps the full addressable market: which professions, which countries, and which specific workflows fit the platform as it exists today.

---

## Target Professions

### Already Marketed

The following verticals appear directly on the use-cases page and are explicitly covered by the default agent configuration and example prompts:

- Dental clinics
- Medical practices
- Veterinary clinics
- Hair salons and spas
- Auto repair shops
- Law firms

### Additional Verticals That Work Today

The agent system prompt is generated from a business description entered by the owner during setup. The calendar integration, booking flow, escalation rules, SMS/WhatsApp confirmations, and multi-language support are all generic. None of the following verticals require any code changes.

#### Healthcare

| Business Type | Notes |
|---|---|
| Physiotherapy | Session-based booking, returning patient recognition |
| Chiropractic | High call volume from repeat patients; fits the pattern well |
| Optometry | Appointment + frame pickup scheduling |
| Dermatology | Multiple service types (consultation, procedure); escalation useful |
| Mental health / therapy | Privacy-sensitive; call transcripts stored as plain text — HIPAA consideration |
| Massage therapy | Duration-based booking, stylist/therapist preference handling |
| Fertility clinics | Sensitive calls; escalation rules critical |
| Cosmetic surgery | Consultation booking; complex inquiry escalation |

#### Beauty and Wellness

| Business Type | Notes |
|---|---|
| Nail salons | Short appointments; high booking volume |
| Tattoo studios | Longer consultations; artist preference |
| Barbershops | Walk-in + appointment hybrid; agent can handle availability questions |
| Med spas | Multiple service categories; upsell questions common |
| Tanning salons | Session booking; simple use case |
| Waxing studios | Repeat customers; caller recognition valuable |

#### Professional Services

| Business Type | Notes |
|---|---|
| Accountants | Seasonal call spikes; consultation booking |
| Financial advisors | Regulated; escalation rules important |
| Immigration consultants | Multi-language critical; Hindi, Tamil, Spanish relevant |
| Insurance agents | Inquiry intake + callback scheduling |
| Real estate agents | Property inquiry intake; callback booking |
| Tutoring centers | Session scheduling; recurring appointment patterns |

#### Home Services

| Business Type | Notes |
|---|---|
| Plumbers | Emergency escalation critical; fits urgency rules |
| Electricians | Same as plumbers — emergency vs. routine distinction |
| HVAC | Seasonal volume spikes; service type classification |
| Pest control | Inspection and treatment scheduling |
| Cleaning services | Recurring weekly/biweekly booking |
| Locksmiths | Emergency-first escalation; after-hours handling |
| Landscapers | Seasonal; estimate inquiry intake |

#### Fitness

| Business Type | Notes |
|---|---|
| Personal trainers | Session booking; recurring appointments |
| Yoga and pilates studios | Class-based booking; waitlist handling via escalation |
| Martial arts schools | Trial class booking; enrollment inquiries |
| Dance studios | Class registration; recital inquiry |
| Gym class booking | High-frequency, short calls |

#### Pet Care

| Business Type | Notes |
|---|---|
| Pet grooming | Breed-specific service types; duration-based booking |
| Dog training | Package-based sessions |
| Pet boarding | Date-range booking; escalation for health questions |
| Pet sitting | Short booking window; repeat customers |

#### Education

| Business Type | Notes |
|---|---|
| Music schools | Instrument-specific lesson booking; teacher preference |
| Driving schools | Lesson + test scheduling |
| Language tutors | Session booking; language-switching agent feature directly applicable |
| Coaching academies | Package enrollment; consultation booking |

#### Automotive

| Business Type | Notes |
|---|---|
| Car detailing | Service type and duration booking |
| Tire shops | Service + part availability questions; escalation for complex jobs |
| Body shops | Estimate intake; repair timeline inquiries |
| Car wash booking | High-volume, short calls |

#### Government and Nonprofit

| Business Type | Notes |
|---|---|
| Public clinics | High call volume; multi-language essential |
| Social services | Appointment scheduling; escalation for urgent cases |
| Community centers | Class and facility booking |

### The Common Thread

Every business listed above shares one characteristic: **the person who delivers the service is also the person expected to answer the phone**. A solo physiotherapist treating a patient cannot pick up a new call. A plumber under a sink cannot pause to book the next job. VoiceCraft fills exactly this gap without requiring the business to hire a receptionist.

---

## Target Countries

### Works Well Today

These countries are supported by the current Twilio integration, Deepgram language models, and the existing billing and calendar infrastructure.

| Country | Phone Numbers | SMS | WhatsApp | Notes |
|---|---|---|---|---|
| USA | Twilio US numbers | Yes | Requires Meta approval | Primary market; all integrations tested |
| Canada | Twilio CA numbers | Yes | Requires Meta approval | English + French both handled by language-switching |
| UK | Twilio UK numbers | Yes | Requires Meta approval | English; strong SMB density |
| Australia | Twilio AU numbers | Yes | Requires Meta approval | English; similar SMB profile to UK |
| India | Twilio IN numbers | Yes | Requires Meta approval | English + Hindi + Tamil explicitly handled in `prompts.py` |

India is the most notable entry in this tier. The prompt system includes explicit Tamil language recognition instructions (distinct from Hindi), and Deepgram Nova-3 covers both languages. India has a very large SMB market across all the verticals listed above, but the current USD pricing creates affordability friction — covered in the companion pricing analysis document.

### Would Work With Minor Configuration

These countries require only environment-level changes (Twilio number provisioning in the relevant region, Deepgram language code in the agent config). No code changes are needed.

| Region | Countries | Language Notes |
|---|---|---|
| UAE / Gulf | UAE, Saudi Arabia, Kuwait | Arabic STT available in Deepgram Nova-3 |
| Western Europe | Germany, France, Spain, Italy | Deepgram covers all four; Twilio EU numbers available |
| Latin America | Mexico, Colombia, Argentina | Spanish; Twilio LATAM numbers available |
| Brazil | Brazil | Portuguese; Deepgram supports pt-BR |
| Southeast Asia | Philippines, Singapore, Malaysia | English is the primary business language in all three |

### Country-Level Constraints

| Constraint | Detail |
|---|---|
| WhatsApp approval | Meta requires a business verification process per number. Approval typically takes 1–2 weeks. This applies to every country. |
| Twilio availability | Twilio does not offer local numbers in every country. Toll-free and non-local numbers are available more broadly but may reduce answer rates. |
| Deepgram language coverage | Nova-3 covers approximately 35 languages. Niche languages and regional dialects may have lower transcription accuracy. |
| Data residency | Healthcare businesses in EU (GDPR), Canada (PIPEDA), and Australia have data residency requirements. Call transcripts are stored as plain text in PostgreSQL — no encryption at rest by default, no data residency controls currently implemented. |
| Pricing currency | Plans are priced in USD. This is affordable in the US, UK, and UAE markets. It creates affordability friction in India and Latin America where equivalent local pricing would be significantly lower. |

---

## Specific Use Cases

### 1. Dental Clinic — Inbound Booking During Treatment

**Scenario:** A patient calls Riverside Dental at 2:30 PM on a Tuesday. Both dentists are with patients. The front desk phone rings unanswered.

**How VoiceCraft handles it:** The agent answers immediately, greets the caller by name if they are a returning patient (caller ID matched against the Contacts table), checks Google Calendar for available slots using the `check_availability` tool, confirms the booking with `book_appointment`, and sends a WhatsApp confirmation message. The agent then asks if there is anything else and ends the call.

**Key capabilities used:** Returning patient recognition, real-time calendar check, WhatsApp confirmation, call transcript logged to the dashboard.

**What the dentist sees:** A new appointment on their Google Calendar, a call record with transcript in the dashboard, and a booked appointment in the Appointments tab.

---

### 2. Law Firm Intake — After-Hours Call

**Scenario:** A potential client calls a personal injury firm at 8:45 PM with an urgent question about a recent accident. The office is closed.

**How VoiceCraft handles it:** The agent answers professionally, collects the caller's name and the nature of their inquiry, and follows the escalation rules configured by the firm. If the firm has configured urgent escalation (e.g., "if the caller mentions an accident in the last 24 hours, escalate immediately"), the agent informs the caller that an attorney will call back and offers to book a consultation for the next morning. A note is logged in the call transcript. The Appointments tab shows the consultation request.

**Key capabilities used:** After-hours call handling (agent is always active while deployed), escalation rules from agent config, intake collection, consultation booking.

**Limitation:** The platform cannot initiate an outbound call to the attorney. Escalation is handled by logging and notification — the attorney must check the dashboard or be notified by a separate system.

---

### 3. Hair Salon — Mid-Service Booking in Spanish

**Scenario:** A stylist at a bilingual salon in Miami is mid-cut when a caller rings asking to book a cut and full-color service. The caller starts in English but switches to Spanish partway through.

**How VoiceCraft handles it:** The agent starts in the salon's configured default language (English). When the caller switches to Spanish, the agent detects the language change and switches immediately — no confirmation asked, per the language-switching instruction in the system prompt. The agent checks availability for the combined service duration, confirms the appointment, and sends an SMS confirmation in the same language the caller used.

**Key capabilities used:** Multi-language mid-call switching (explicitly implemented in `prompts.py`), multi-service booking, SMS confirmation.

**Note:** The Deepgram STT language is set at session start based on the agent's configured default language. Mid-call language switching is handled at the LLM response level — Deepgram continues transcribing in the original language configuration, but the LLM adapts its output language. For best accuracy in mixed-language environments, consider configuring Deepgram's automatic language detection if available in Nova-3.

---

### 4. Auto Repair Shop — Routine vs. Complex Inquiry Routing

**Scenario:** A customer calls to book an oil change. A second caller rings about a transmission noise they noticed last week.

**How VoiceCraft handles it:** For the oil change caller, the agent books the 30-minute slot directly using the configured service duration. For the transmission inquiry, the agent collects the caller's name, vehicle details, and description, then follows the escalation rule configured by the shop owner (e.g., "if the caller describes a mechanical noise or complex repair, take a message and let them know the service advisor will call back"). The call transcript captures the full vehicle description.

**Key capabilities used:** Service-type classification, duration-based scheduling, escalation rules, call transcript for service advisor follow-up.

---

### 5. Veterinary Clinic After Hours — Emergency vs. Routine

**Scenario:** At 11 PM, two calls come in: one pet owner whose dog is vomiting and lethargic, and another whose cat needs its annual vaccination booked.

**How VoiceCraft handles it:** For the emergency call, the escalation rule (e.g., "if the caller describes symptoms like vomiting, lethargy, difficulty breathing, or bleeding, advise them to call the nearest emergency animal hospital immediately and provide the number if configured") fires before any booking attempt. The agent prioritizes the safety instruction and ends the call appropriately. For the vaccination caller, the agent books the appointment for the next available morning slot and sends a confirmation.

**Key capabilities used:** Symptom-based escalation rules, after-hours handling, standard booking flow.

**Important distinction:** The agent will not diagnose or give medical advice. Escalation rules should be written to direct callers to appropriate emergency resources, not to provide clinical guidance.

---

## Platform Limitations

Understanding what the platform cannot do is as important as knowing what it can.

| Limitation | Detail |
|---|---|
| Default fallback prompt is dental-specific | If the agent configuration fails to load (API timeout, missing agent ID), the system falls back to a generic dental receptionist persona. Businesses in other verticals will present incorrectly to callers during this edge case. |
| Inbound calls only | The agent cannot initiate outbound calls. Escalation means logging and notifying — it does not mean calling the business owner or emergency contact. |
| One phone number per agent | Each agent is assigned a single Twilio number. A business with multiple locations or departments would need multiple agents. |
| WhatsApp requires Meta approval | WhatsApp Business messaging requires Meta's approval process for each Twilio number. This takes 1–2 weeks and is not instant. Until approved, only SMS confirmations are available. |
| Calendar integration: primary calendar only | The Google Calendar integration connects to the primary calendar of the authenticated account. Secondary calendars, resource calendars (rooms, equipment), and shared calendars are not supported. |
| Single cancellation per WhatsApp action | The WhatsApp bot's action parser supports one booking or cancellation action per message response. Complex multi-step transactions (e.g., cancel one appointment and rebook a different time in the same message) require multiple exchanges. |
| Call transcripts stored as plain text | Transcripts are stored as unencrypted text in the `Call` table (`transcript String? @db.Text`). For healthcare businesses subject to HIPAA (US), PIPEDA (Canada), or similar frameworks, this requires review. No audit log, access control per transcript, or at-rest encryption is currently implemented. |
| Starter plan: 1 agent | Businesses with multiple locations or departments that need independent agents must upgrade to Growth (3 agents) or Professional (10 agents). |
| No outbound reminder calls | Appointment reminders are sent via WhatsApp or SMS. There is no automated outbound voice call reminder capability. |
