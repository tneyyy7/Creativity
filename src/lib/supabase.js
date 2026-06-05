// Backward-compatible barrel. The former 2800-line monolith was split into
// domain modules under ./api/ (Phase 4.1). All previous imports from
// '../lib/supabase' keep working unchanged via these re-exports.
export * from './api/paintings'
export * from './api/core'
export * from './api/profile'
export * from './api/social'
export * from './api/chat'
export * from './api/engagement'
export * from './api/feed'
export * from './api/moderation'
export * from './api/collections'
export * from './api/stories'
export * from './api/subscription'
export * from './api/adminLogs'
export * from './api/adminUsers'
export * from './api/adminBilling'
