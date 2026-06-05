// Static Tailwind class maps for the per-conversation chat themes (Pro feature).
// Extracted from Messages.jsx (Phase 4.1) so the object is defined once at module
// load instead of being re-created on every render.
export const CHAT_THEME_STYLES = {
  default: {
    bg: 'bg-transparent',
    myBubble: 'bg-purple-600 text-white',
    theirBubble: 'bg-white/10 text-gray-200 border border-white/5'
  },
  dark_space: {
    bg: 'bg-gradient-to-b from-[#0a051b] via-[#040209] to-[#0b031d]',
    myBubble: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-500/30',
    theirBubble: 'bg-slate-900/80 text-slate-100 border border-indigo-500/20'
  },
  cyberpunk: {
    bg: 'bg-[#050508] bg-[radial-gradient(#1e1b4b_1px,transparent_1px)] [background-size:16px_16px]',
    myBubble: 'bg-yellow-500 text-black font-black border-2 border-cyan-400 shadow-[0_0_15px_rgba(234,179,8,0.4)]',
    theirBubble: 'bg-[#0f0e17] text-cyan-400 border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
  },
  rose_gold: {
    bg: 'bg-gradient-to-br from-[#1c1216] via-[#10090c] to-[#25151c]',
    myBubble: 'bg-rose-400/95 text-neutral-950 font-bold border border-rose-300 shadow-[0_0_15px_rgba(251,113,133,0.25)]',
    theirBubble: 'bg-[#1c1216]/90 text-rose-300 border border-rose-900/30'
  },
  sunset_glow: {
    bg: 'bg-gradient-to-tr from-[#1a0c18] via-[#09050d] to-[#2b0e12]',
    myBubble: 'bg-gradient-to-r from-amber-500 to-rose-500 text-white border border-rose-400/20 shadow-[0_0_15px_rgba(244,63,94,0.3)]',
    theirBubble: 'bg-neutral-900/90 text-orange-200 border border-orange-500/10'
  }
}
