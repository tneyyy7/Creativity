import { useState } from 'react'
import { optimizedImageUrl, buildSrcSet, placeholderUrl } from '../utils/imageTransform'

/**
 * Drop-in <img> replacement with image optimization (Phase 4.2):
 *  - rewrites Supabase Storage URLs to the resized "render/image" endpoint
 *  - emits a responsive `srcset` when `sizes`/`srcWidths` are provided
 *  - shows a blurred low-quality placeholder (LQIP) that cross-fades into the
 *    full image once it loads, instead of an empty grey block
 *
 * Resilience: the "render/image" endpoint only works when image
 * transformations are enabled for the Supabase project. When they are not, it
 * answers with a 400 instead of the image — which previously left the picture
 * stuck at opacity-0 (a black box). We now fall back to the original source on
 * error so the image always appears.
 *
 * Layout: by default the image fills a sized parent (`object-*` on an absolute
 * layer). Pass `fit="natural"` to render it inline at the author's own aspect
 * ratio (`w-full h-auto`, no cropping).
 *
 * Any extra props (onClick, draggable, ...) are forwarded to the <img>.
 */
export default function SmartImage({
  src,
  alt = '',
  className = '',
  width,
  quality = 70,
  resize = 'cover',
  srcWidths,
  sizes,
  loading = 'lazy',
  decoding = 'async',
  fit = 'cover',
  ...rest
}) {
  const [loaded, setLoaded] = useState(false)
  // `errored` flips once the optimized URL fails so we retry with the original.
  const [errored, setErrored] = useState(false)
  const [lqipFailed, setLqipFailed] = useState(false)

  const optimized = optimizedImageUrl(src, { width, quality, resize })
  const srcSet = srcWidths ? buildSrcSet(src, srcWidths, { quality, resize }) : undefined
  const lqip = placeholderUrl(src)
  const isPlaceholderDistinct = lqip !== src && !lqipFailed && !loaded

  // On the first error, retry with the raw original URL. If that also fails,
  // reveal it anyway so we never leave an invisible (black) box behind.
  const displaySrc = errored ? src : optimized
  const displaySrcSet = errored ? undefined : srcSet
  const handleError = () => {
    if (!errored) setErrored(true)
    else setLoaded(true)
  }

  const natural = fit === 'natural'

  const placeholder = isPlaceholderDistinct && (
    <img
      src={lqip}
      alt=""
      aria-hidden="true"
      onError={() => setLqipFailed(true)}
      className={`absolute inset-0 w-full h-full object-cover scale-110 blur-xl transition-opacity duration-500 ${
        loaded ? 'opacity-0' : 'opacity-100'
      }`}
      draggable={false}
    />
  )

  if (natural) {
    return (
      <span className="relative block">
        {placeholder}
        <img
          src={displaySrc}
          srcSet={displaySrcSet}
          sizes={sizes}
          alt={alt}
          loading={loading}
          decoding={decoding}
          onLoad={() => setLoaded(true)}
          onError={handleError}
          className={`${className} block w-full h-auto transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          {...rest}
        />
      </span>
    )
  }

  return (
    <span className="absolute inset-0 block overflow-hidden">
      {placeholder}
      <img
        src={displaySrc}
        srcSet={displaySrcSet}
        sizes={sizes}
        alt={alt}
        loading={loading}
        decoding={decoding}
        onLoad={() => setLoaded(true)}
        onError={handleError}
        className={`${className} transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        {...rest}
      />
    </span>
  )
}
