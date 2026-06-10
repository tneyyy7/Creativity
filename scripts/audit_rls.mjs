#!/usr/bin/env node
/**
 * RLS regression guard.
 *
 * Asserts a set of database security invariants against the live Postgres schema
 * so the P0 holes fixed on 2026-06-10 (self-grant Pro, self-grant admin, billing
 * PII leak) can never silently come back via a future migration.
 *
 * Runs read-only via the Supabase Management API. Needs two env vars:
 *   SUPABASE_ACCESS_TOKEN  — a personal access token (CI secret)
 *   SUPABASE_PROJECT_REF   — project ref, defaults to the prod ref below
 *
 * Exits 0 if every invariant holds, 1 otherwise. Wire into CI as a gate.
 */

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF || 'mutrphgzoczcitnmpxsm'

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is not set — skipping RLS guard (treated as pass).')
  process.exit(0)
}

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`)
  return res.json()
}

const results = []
const check = (name, pass, detail = '') => results.push({ name, pass, detail })

async function main() {
  // 1. Every base table in public has RLS enabled.
  const noRls = await q(`
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false`)
  check('All public tables have RLS enabled', noRls.length === 0,
    noRls.map(r => r.relname).join(', '))

  // 2. subscriptions: no write grants for anon/authenticated (webhook/service-role only).
  const subWrites = await q(`
    select grantee, privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name='subscriptions'
      and grantee in ('anon','authenticated')
      and privilege_type in ('INSERT','UPDATE','DELETE')`)
  check('subscriptions has no client write grants', subWrites.length === 0,
    subWrites.map(r => `${r.grantee}:${r.privilege_type}`).join(', '))

  // 3. subscriptions: no world-readable SELECT policy (no USING(true)).
  const subPublic = await q(`
    select policyname from pg_policies
    where schemaname='public' and tablename='subscriptions' and cmd='SELECT'
      and (qual is null or btrim(qual)='true')`)
  check('subscriptions has no public-read policy', subPublic.length === 0,
    subPublic.map(r => r.policyname).join(', '))

  // 4. profiles: privileged-column protection trigger is present.
  const trg = await q(`
    select 1 from information_schema.triggers
    where event_object_schema='public' and event_object_table='profiles'
      and trigger_name='trg_protect_privileged_profile_fields'`)
  check('profiles privileged-field trigger present', trg.length >= 1)

  // 5. Sensitive tables must never be world-readable via USING(true).
  const sensitive = ['messages', 'notifications', 'reports', 'boost_balance',
    'post_boosts', 'blocked_users', 'admin_actions']
  const sensPublic = await q(`
    select tablename, policyname from pg_policies
    where schemaname='public' and cmd in ('SELECT','ALL')
      and tablename in (${sensitive.map(t => `'${t}'`).join(',')})
      and (qual is null or btrim(qual)='true')`)
  check('No sensitive table is world-readable', sensPublic.length === 0,
    sensPublic.map(r => `${r.tablename}.${r.policyname}`).join(', '))

  // 6. Privilege-decision helpers (used inside RLS policies) must pin search_path
  //    so a hijacked search_path can't subvert an access check. The wider set of
  //    SECURITY DEFINER functions is a tracked P2 (see migration note) — not gated
  //    here yet because pinning some of them needs per-function testing.
  const privFns = ['is_admin', 'is_user_pro', 'has_role', 'is_group_member', 'is_group_admin']
  const secdef = await q(`
    select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef=true
      and p.proname in (${privFns.map(f => `'${f}'`).join(',')})
      and (p.proconfig is null or not exists (
        select 1 from unnest(p.proconfig) c where c like 'search_path=%'))`)
  check('Privilege-decision funcs pin search_path', secdef.length === 0,
    secdef.map(r => r.proname).join(', '))

  // Report
  let failed = 0
  for (const r of results) {
    const tag = r.pass ? '✅ PASS' : '❌ FAIL'
    if (!r.pass) failed++
    console.log(`${tag}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`)
  }
  console.log(`\n${results.length - failed}/${results.length} invariants hold.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error('RLS guard error:', e.message); process.exit(1) })
