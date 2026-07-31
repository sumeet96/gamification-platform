import { redirect } from 'next/navigation'

// `/` is no longer its own dashboard — package D1 moved the real one to
// app/dashboard/page.tsx (the professor's "dashboard is the spine, quiz is one
// tile" instruction). This route's only job now is to land here on the single
// implementation instead of duplicating it. proxy.ts still gates unauthenticated
// requests before they ever reach this redirect.
export default function Home() {
  redirect('/dashboard')
}
