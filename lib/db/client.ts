import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// Server-only Neon client. Returns null when DATABASE_URL isn't set, so the app
// runs fully without a database (events no-op, questions fall back to the seed bank).
// Use the POOLED connection string from Neon for burst load (a live classroom).

let cached: NeonQueryFunction<false, false> | null | undefined

export function getSql() {
  if (cached !== undefined) return cached
  const url = process.env.DATABASE_URL
  cached = url ? neon(url) : null
  return cached
}
