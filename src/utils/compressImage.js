// Canvas-based client-side image compression.
// Reduces file size before upload to cut Supabase Storage egress.
// Skips video/GIF and files already under the size threshold.

const SKIP_TYPES = ['image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
const SKIP_THRESHOLD_BYTES = 150 * 1024 // don't bother compressing files < 150 KB

/**
 * @param {File|Blob} file
 * @param {object}    opts
 * @param {number}    [opts.maxPx=1920]   max dimension (width or height)
 * @param {number}    [opts.quality=0.80] JPEG quality 0..1
 * @param {string}    [opts.outputType='image/jpeg']
 * @returns {Promise<File>}
 */
export async function compressImage(file, opts = {}) {
  const { maxPx = 1920, quality = 0.80, outputType = 'image/jpeg' } = opts

  if (SKIP_TYPES.includes(file.type)) return file
  if (!file.type.startsWith('image/')) return file
  if (file.size < SKIP_THRESHOLD_BYTES) return file

  const bitmap = await createImageBitmap(file)
  const { width: origW, height: origH } = bitmap

  let w = origW
  let h = origH
  if (origW > maxPx || origH > maxPx) {
    const ratio = Math.min(maxPx / origW, maxPx / origH)
    w = Math.round(origW * ratio)
    h = Math.round(origH * ratio)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('canvas.toBlob returned null')); return }
        const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg'
        resolve(new File([blob], name, { type: outputType }))
      },
      outputType,
      quality
    )
  })
}
