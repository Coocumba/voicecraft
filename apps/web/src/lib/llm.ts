/**
 * Unified LLM client for the builder chat.
 *
 * Supports Anthropic (Claude) and OpenAI (GPT) providers.
 * Switch via LLM_PROVIDER env var: "anthropic" (default) or "openai".
 *
 * Both providers expose the same interface so the builder routes
 * don't need to know which one is active.
 */

import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"

interface LLMMessage {
  role: "user" | "assistant"
  content: string
}

interface LLMResponse {
  content: string
}

interface ChatOptions {
  system: string
  messages: LLMMessage[]
  maxTokens?: number
}

const provider = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase()

// Models — configurable via env vars with sensible defaults
const ANTHROPIC_MODEL = process.env.LLM_MODEL ?? "claude-sonnet-4-20250514"
const OPENAI_MODEL = process.env.LLM_MODEL ?? "gpt-4o"

let anthropicClient: Anthropic | undefined
let openaiClient: OpenAI | undefined

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic()
  }
  return anthropicClient
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI()
  }
  return openaiClient
}

/**
 * Send a chat completion request to the configured LLM provider.
 */
export async function chatCompletion(opts: ChatOptions): Promise<LLMResponse> {
  const maxTokens = opts.maxTokens ?? 1024

  if (provider === "openai") {
    const client = getOpenAIClient()
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("Unexpected empty response from OpenAI")
    }
    return { content }
  }

  // Default: Anthropic
  const client = getAnthropicClient()
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system: opts.system,
    messages: opts.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  })

  const block = response.content[0]
  if (!block || block.type !== "text") {
    throw new Error("Unexpected response type from Anthropic")
  }
  return { content: block.text }
}
