// Shared @mention parsing for comments and post descriptions (Sprint 1.3).
// Nicknames are [A-Za-z0-9_] (see nicknameStyle.js); the regex captures the
// handle without the leading @.
export const MENTION_REGEX = /@([A-Za-z0-9_]+)/g

// Return the unique lowercase handles mentioned in a string.
export function extractMentions(text) {
  if (!text) return []
  const out = new Set()
  let m
  const re = new RegExp(MENTION_REGEX.source, 'g')
  while ((m = re.exec(text))) out.add(m[1].toLowerCase())
  return [...out]
}

// Find the @handle the caret is currently typing, for autocomplete.
// Returns { query, start } when the text immediately before `caret` is an
// unfinished @token (e.g. "...nice @an|"), or null otherwise.
export function getActiveMention(text, caret) {
  if (text == null) return null
  const upto = text.slice(0, caret)
  const m = upto.match(/(?:^|\s)@([A-Za-z0-9_]*)$/)
  if (!m) return null
  return { query: m[1], start: caret - m[1].length - 1 }
}
