/**
 * Batch-compress all existing images in Supabase Storage.
 *
 * Rewrites files in-place (same path, upsert) so public URLs never change.
 * Run once; safe to re-run (already-small files are skipped).
 *
 * Requirements:
 *   SUPABASE_SERVICE_KEY must be set in .env (not the anon key)
 *
 * Usage:
 *   node scripts/compress_storage.mjs          # dry-run (no writes)
 *   node scripts/compress_storage.mjs --apply  # actually compress & re-upload
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const DRY_RUN = !process.argv.includes('--apply')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Set VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
})

// Buckets and their max dimension
const BUCKETS = [
  { name: 'paintings', maxPx: 1920, quality: 80 },
  { name: 'avatars',   maxPx: 400,  quality: 85 },
]

const SKIP_BYTES   = 100 * 1024        // skip if already < 100 KB
const SKIP_EXTS    = new Set(['.gif', '.mp4', '.webm', '.mov', '.svg'])
const IMAGE_EXTS   = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'])

// ─── helpers ──────────────────────────────────────────────────────────────────

async function listAllFiles(bucket) {
  const files = []
  const walk = async (prefix) => {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset: 0,
    })
    if (error) throw error
    for (const item of data || []) {
      if (!item.id) {
        // folder
        await walk(prefix ? `${prefix}/${item.name}` : item.name)
      } else {
        files.push(prefix ? `${prefix}/${item.name}` : item.name)
      }
    }
  }
  await walk('')
  return files
}

function ext(path) {
  const m = path.match(/(\.[^.]+)$/)
  return m ? m[1].toLowerCase() : ''
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

// ─── main ─────────────────────────────────────────────────────────────────────

let totalBefore = 0, totalAfter = 0, processed = 0, skipped = 0, errors = 0

for (const { name: bucket, maxPx, quality } of BUCKETS) {
  console.log(`\n─── bucket: ${bucket} (maxPx=${maxPx}, quality=${quality}) ───`)

  let files
  try {
    files = await listAllFiles(bucket)
  } catch (e) {
    console.error(`  Failed to list bucket: ${e.message}`)
    continue
  }

  console.log(`  ${files.length} file(s) found`)

  for (const path of files) {
    const e = ext(path)
    if (SKIP_EXTS.has(e) || !IMAGE_EXTS.has(e)) {
      skipped++
      continue
    }

    // Download
    const { data: blob, error: dlErr } = await supabase.storage
      .from(bucket)
      .download(path)

    if (dlErr || !blob) {
      console.error(`  SKIP (download failed) ${path}: ${dlErr?.message}`)
      errors++
      continue
    }

    const originalBytes = blob.size
    if (originalBytes < SKIP_BYTES) {
      skipped++
      continue
    }

    // Compress
    let compressedBuffer
    try {
      const arrayBuf = await blob.arrayBuffer()
      const buf = Buffer.from(arrayBuf)

      compressedBuffer = await sharp(buf)
        .rotate()                            // honour EXIF orientation
        .resize(maxPx, maxPx, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
    } catch (err) {
      console.error(`  SKIP (compress failed) ${path}: ${err.message}`)
      errors++
      continue
    }

    const compressedBytes = compressedBuffer.length
    const saving = originalBytes - compressedBytes
    const pct = ((saving / originalBytes) * 100).toFixed(0)

    totalBefore += originalBytes
    totalAfter  += compressedBytes
    processed++

    const tag = saving > 0 ? `  ✓` : `  ~`
    console.log(`${tag} ${path}  ${fmtBytes(originalBytes)} → ${fmtBytes(compressedBytes)} (${pct > 0 ? '-' : '+'}${Math.abs(pct)}%)`)

    if (!DRY_RUN && saving > 0) {
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, compressedBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        })
      if (upErr) {
        console.error(`    UPLOAD FAILED: ${upErr.message}`)
        errors++
      }
    }
  }
}

// ─── summary ──────────────────────────────────────────────────────────────────

const saved = totalBefore - totalAfter
const savedPct = totalBefore ? ((saved / totalBefore) * 100).toFixed(1) : 0

console.log(`
─── Summary ─────────────────────────────────────
  Mode:       ${DRY_RUN ? 'DRY RUN (no changes written)' : 'APPLIED'}
  Processed:  ${processed} files
  Skipped:    ${skipped} files (too small / non-image / GIF)
  Errors:     ${errors}
  Before:     ${fmtBytes(totalBefore)}
  After:      ${fmtBytes(totalAfter)}
  Saved:      ${fmtBytes(saved)} (${savedPct}%)
─────────────────────────────────────────────────
${DRY_RUN ? '\nRe-run with --apply to write changes.' : ''}
`)
