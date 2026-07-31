// One provider-agnostic client for document-grounded, schema-constrained generation.
//
// CLAUDE.md requires all LLM calls to go through a single adapter with a fallback chain. That rule
// earned itself on 31 Jul 2026, when Gemini prepayment credits ran out mid-session and every
// generation path died with a 429. Switching providers is now a flag, not a rewrite.
//
// Both providers here read a PDF natively, rendering pages as images. That matters because these
// decks average ~62 characters of extractable text per page with the real content baked into
// images (docs/architecture/generator-spec.md).
//
// Student data must never reach a Chinese-hosted endpoint (CLAUDE.md). Nothing here is student
// data — course material only — but the rule is why this file has an explicit provider list rather
// than a generic base-URL knob.

import { readFileSync } from 'node:fs'

/** Load .env.local into process.env without a dependency. Existing env wins.
 *  Resolved from THIS file's location, not the caller's — callers live at different depths under
 *  scripts/, and a caller-relative path silently found nothing and reported a missing variable. */
export function loadEnv() {
  try {
    const txt = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* rely on shell env */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Retry 429/5xx with exponential backoff. A 4xx that is not 429 is a bug in our request — fail
 *  fast rather than hammer the endpoint. */
async function withRetry(label, fn, attempts = 6) {
  for (let i = 0; ; i++) {
    const res = await fn()
    if (res.ok) return res
    const body = await res.text()
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || i >= attempts) {
      throw new Error(`${label} ${res.status}: ${body.slice(0, 300)}`)
    }
    await sleep(Math.min(60000, 2000 * 2 ** i))
  }
}

/** Gemini wants uppercase type names and rejects `additionalProperties`; OpenAI strict mode
 *  requires it. Author schemas once in OpenAI form and translate here. */
function toGeminiSchema(node) {
  if (Array.isArray(node)) return node.map(toGeminiSchema)
  if (!node || typeof node !== 'object') return node
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    if (k === 'additionalProperties') continue
    if (k === 'type' && typeof v === 'string') { out.type = v.toUpperCase(); continue }
    out[k] = toGeminiSchema(v)
  }
  return out
}

const PROVIDERS = {
  openai: {
    defaultModel: 'gpt-4.1-mini',
    keyVar: 'OPENAI_API_KEY',
    async uploadPdf(path, key) {
      const fd = new FormData()
      fd.append('purpose', 'user_data')
      fd.append('file', new Blob([readFileSync(path)], { type: 'application/pdf' }), 'source.pdf')
      const res = await withRetry('OpenAI upload', () => fetch('https://api.openai.com/v1/files', {
        method: 'POST', headers: { authorization: `Bearer ${key}` }, body: fd,
      }))
      return (await res.json()).id
    },
    async deleteFile(ref, key) {
      await fetch(`https://api.openai.com/v1/files/${ref}`, { method: 'DELETE', headers: { authorization: `Bearer ${key}` } })
    },
    async generateJSON({ ref, prompt, schema, model, key, temperature }) {
      const res = await withRetry('OpenAI', () => fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature,
          input: [{ role: 'user', content: [{ type: 'input_file', file_id: ref }, { type: 'input_text', text: prompt }] }],
          text: { format: { type: 'json_schema', name: 'result', strict: true, schema } },
        }),
      }))
      const data = await res.json()
      const text = (data.output ?? []).flatMap((o) => o.content ?? [])
        .filter((c) => c.type === 'output_text').map((c) => c.text).join('')
      if (!text) throw new Error(`OpenAI returned no text (status ${data.status ?? 'ok'})`)
      return { data: JSON.parse(text), usage: { in: data.usage?.input_tokens, out: data.usage?.output_tokens } }
    },
  },

  gemini: {
    defaultModel: process.env.GEMINI_MODEL,
    keyVar: 'GEMINI_API_KEY',
    // Inline base64 rather than the Files API: one deck is a few MB, well inside the request
    // limit, and it removes a 48-hour file lifetime from the failure surface.
    async uploadPdf(path) { return readFileSync(path).toString('base64') },
    async deleteFile() { /* nothing uploaded */ },
    async generateJSON({ ref, prompt, schema, model, key, temperature }) {
      const res = await withRetry('Gemini', () => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ inline_data: { mime_type: 'application/pdf', data: ref } }, { text: prompt }] }],
            generationConfig: {
              temperature,
              responseMimeType: 'application/json',
              responseSchema: toGeminiSchema(schema),
            },
          }),
        }))
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error('Gemini returned no text')
      return { data: JSON.parse(text), usage: { in: data.usageMetadata?.promptTokenCount, out: data.usageMetadata?.candidatesTokenCount } }
    },
  },
}

/**
 * @param {'openai'|'gemini'} provider
 * @param {{model?: string, temperature?: number}} opts
 */
export function createClient(provider, { model, temperature = 0.7 } = {}) {
  const spec = PROVIDERS[provider]
  if (!spec) throw new Error(`Unknown provider "${provider}". Known: ${Object.keys(PROVIDERS).join(', ')}`)
  const key = process.env[spec.keyVar]
  if (!key) throw new Error(`Missing ${spec.keyVar} — set it in .env.local or the shell.`)
  const resolved = model || spec.defaultModel
  // CLAUDE.md: the model is configuration, never a script-edit. gemini-2.0-flash was shut down on
  // 1 Jun 2026 and the old stub still fell back to it, so a missing model must be a hard error.
  if (!resolved) throw new Error(`No model for "${provider}". Set GEMINI_MODEL in .env.local or pass --model.`)

  return {
    provider,
    model: resolved,
    uploadPdf: (path) => spec.uploadPdf(path, key),
    deleteFile: (ref) => spec.deleteFile(ref, key),
    generateJSON: ({ ref, prompt, schema }) =>
      spec.generateJSON({ ref, prompt, schema, model: resolved, key, temperature }),
  }
}
