"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";

export default function PricingPage() {
  const { data: session } = useSession();
  const ctaHref = session ? "/home" : "/login";
  const ctaLabel = session ? "Go to Dashboard" : "Get started";
  const signInLabel = session ? "Dashboard" : "Sign in";

  const [annual, setAnnual] = useState(false);

  const plans = [
    {
      name: "Starter",
      description: "For solo practitioners getting started with AI reception.",
      monthly: 49,
      annual: 39,
      minutes: "500",
      calls: "~150 calls",
      overage: "$0.05",
      agents: "1",
      highlight: false,
    },
    {
      name: "Growth",
      description: "For growing practices that handle more volume.",
      monthly: 99,
      annual: 84,
      minutes: "1,500",
      calls: "~450 calls",
      overage: "$0.04",
      agents: "3",
      highlight: true,
    },
    {
      name: "Professional",
      description: "For busy multi-location or high-volume businesses.",
      monthly: 249,
      annual: 209,
      minutes: "5,000",
      calls: "~1,500 calls",
      overage: "$0.03",
      agents: "10",
      highlight: false,
    },
  ];

  const faqs = [
    {
      question: "What happens when I exceed my included minutes?",
      answer:
        "You're never cut off. Calls continue as normal and overage minutes are billed at your plan's per-minute rate at the end of the billing cycle. You can monitor your usage anytime from the dashboard.",
    },
    {
      question: "Can I change plans later?",
      answer:
        "Yes, you can upgrade or downgrade at any time. When you upgrade, the new plan takes effect immediately and you're credited for the unused portion of your current plan. Downgrades take effect at the next billing cycle.",
    },
    {
      question: "What counts as a minute?",
      answer:
        "Minutes are counted from when your AI agent picks up the call to when it ends. If a call lasts 2 minutes and 30 seconds, that's rounded up to 3 minutes. Missed or unanswered calls don't count.",
    },
    {
      question: "Do all plans include every feature?",
      answer:
        "Yes. Every plan includes all features — appointment booking, calendar integration, caller recognition, WhatsApp confirmations, multi-language support, and call transcripts. The only differences are minutes, agents, and overage rates.",
    },
    {
      question: "How does the 14-day free trial work?",
      answer:
        "Every plan starts with a 14-day free trial. You get full access to all features with 60 included minutes. No credit card required to start. If you don't choose a plan before the trial ends, your agent is paused until you subscribe.",
    },
  ];

  return (
    <div className="min-h-screen">
      <PublicHeader
        ctaHref={ctaHref}
        signInLabel={signInLabel}
        activePage="pricing"
      />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-12 sm:pb-16 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-accent bg-accent/8 border border-accent/20 px-3 py-1.5 rounded-full mb-6 sm:mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          14-day free trial on every plan
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl text-ink leading-tight mb-5 sm:mb-6">
          Simple pricing.
          <br className="hidden sm:inline" /> No hidden fees.
        </h1>
        <p className="text-base sm:text-lg text-muted max-w-xl mx-auto leading-relaxed">
          Every plan includes all features. Pick the one that matches your call
          volume.
        </p>
        <p className="text-xs text-muted mt-2">
          Prices shown in USD. Local currency applied at checkout.
        </p>
      </section>

      {/* Billing toggle */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-8 sm:pb-10">
        <div className="flex items-center justify-center gap-3">
          <span
            className={`text-sm ${!annual ? "text-ink font-medium" : "text-muted"}`}
          >
            Monthly
          </span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              annual ? "bg-accent" : "bg-border"
            }`}
            aria-label="Toggle annual billing"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                annual ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span
            className={`text-sm ${annual ? "text-ink font-medium" : "text-muted"}`}
          >
            Annual
          </span>
          <span className="text-xs font-medium text-accent bg-accent/8 border border-accent/20 px-2 py-0.5 rounded-full">
            Save 20%
          </span>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`bg-white rounded-2xl border p-6 sm:p-8 flex flex-col ${
                plan.highlight
                  ? "border-accent ring-2 ring-accent relative"
                  : "border-border"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-xs font-medium text-white bg-accent px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="mb-5">
                <h3 className="font-serif text-xl text-ink mb-1">
                  {plan.name}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {plan.description}
                </p>
              </div>
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-serif text-4xl text-ink">
                    ${annual ? plan.annual : plan.monthly}
                  </span>
                  <span className="text-sm text-muted">/mo</span>
                </div>
                {annual && (
                  <p className="text-xs text-muted mt-1">
                    Billed annually (${plan.annual * 12}/yr)
                  </p>
                )}
              </div>
              <Link
                href={ctaHref}
                className={`w-full inline-flex items-center justify-center px-6 py-3 text-sm font-medium rounded-xl transition-colors mb-6 ${
                  plan.highlight
                    ? "bg-accent text-white hover:bg-accent/90"
                    : "bg-ink text-white hover:bg-ink/90"
                }`}
              >
                {ctaLabel} →
              </Link>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 text-accent flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-ink">
                    <strong>{plan.minutes}</strong> minutes/mo{" "}
                    <span className="text-muted">({plan.calls})</span>
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 text-accent flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-ink">
                    <strong>{plan.agents}</strong> voice{" "}
                    {Number(plan.agents) === 1 ? "agent" : "agents"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 text-accent flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-ink">{plan.overage}/min overage</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 text-accent flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-ink">Extra agents: contact us</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 text-accent flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-ink">All features included</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 text-accent flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-ink">14-day free trial</span>
                </li>
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Enterprise banner */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
        <div className="bg-white rounded-2xl border border-border p-6 sm:p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            Enterprise
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-3">
            Need more?
          </h2>
          <p className="text-sm text-muted leading-relaxed max-w-lg mx-auto mb-6">
            Unlimited agents, custom integrations, dedicated support, and volume
            pricing. Let&apos;s build something that fits your organization.
          </p>
          <a
            href="mailto:sales@voicecraft.ai"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm text-ink border border-border rounded-xl hover:bg-cream transition-colors"
          >
            Talk to us →
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-3">
            Common questions
          </h2>
        </div>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <div
              key={faq.question}
              className="bg-white rounded-xl border border-border p-5 sm:p-6"
            >
              <h3 className="font-medium text-ink text-sm mb-2">
                {faq.question}
              </h3>
              <p className="text-sm text-muted leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="bg-ink rounded-2xl px-6 py-10 sm:px-8 sm:py-14 md:px-10 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl text-white mb-4">
            Start your free trial today
          </h2>
          <p className="text-white/60 text-sm mb-8 max-w-md mx-auto leading-relaxed">
            14 days free. All features included. No credit card required.
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
  );
}
