// Phase 1.3 — Observability scaffolding.
//
// Both Sentry (error tracking) and PostHog (product analytics) are initialized
// only when their env keys are present, so the app runs identically with no
// keys configured (local dev / forks) — every export below is a safe no-op in
// that case. Add VITE_SENTRY_DSN / VITE_POSTHOG_KEY to enable.

import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

let sentryEnabled = false
let posthogEnabled = false

export function initObservability() {
  if (SENTRY_DSN && !sentryEnabled) {
    try {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,
        // Conservative sampling to keep volume/cost low until tuned.
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
      })
      sentryEnabled = true
    } catch (e) {
      console.error('Sentry init failed:', e)
    }
  }

  if (POSTHOG_KEY && !posthogEnabled) {
    try {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        capture_pageview: true,
        person_profiles: 'identified_only',
      })
      posthogEnabled = true
    } catch (e) {
      console.error('PostHog init failed:', e)
    }
  }
}

// Re-export Sentry's ErrorBoundary so callers don't import Sentry directly.
// When Sentry isn't initialized it simply renders the fallback on errors.
export const ErrorBoundary = Sentry.ErrorBoundary

// --- Product analytics: thin, provider-agnostic wrappers (no-op if disabled) ---

export function track(event, properties) {
  if (posthogEnabled) {
    try { posthog.capture(event, properties) } catch { /* swallow */ }
  }
}

export function identifyUser(userId, traits) {
  if (!userId) return
  if (posthogEnabled) {
    try { posthog.identify(userId, traits) } catch { /* swallow */ }
  }
  if (sentryEnabled) {
    try { Sentry.setUser({ id: userId }) } catch { /* swallow */ }
  }
}

export function resetUser() {
  if (posthogEnabled) {
    try { posthog.reset() } catch { /* swallow */ }
  }
  if (sentryEnabled) {
    try { Sentry.setUser(null) } catch { /* swallow */ }
  }
}

// Manually report a handled error (unhandled ones are captured automatically).
export function captureError(error, context) {
  if (sentryEnabled) {
    try { Sentry.captureException(error, context ? { extra: context } : undefined) } catch { /* swallow */ }
  } else {
    console.error('captureError:', error, context)
  }
}
