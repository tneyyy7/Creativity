import { MENTION_REGEX } from '../lib/mentions'

// Renders text with @nicknames as clickable links. `onMention` receives the
// handle (without @); the parent resolves it to a profile and navigates.
export function MentionText({ text, onMention, className }) {
  if (!text) return null
  if (!onMention) return <span className={className}>{text}</span>

  const nodes = []
  const re = new RegExp(MENTION_REGEX.source, 'g')
  let last = 0
  let m
  let key = 0
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const handle = m[1]
    nodes.push(
      <button
        key={key++}
        type="button"
        onClick={(e) => { e.stopPropagation(); onMention(handle) }}
        className="text-purple-400 hover:text-purple-300 hover:underline font-semibold"
      >
        @{handle}
      </button>
    )
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))

  return <span className={className}>{nodes}</span>
}
