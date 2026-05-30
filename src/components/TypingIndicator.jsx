import React from 'react'
import { Bot } from 'lucide-react'

export default function TypingIndicator() {
  return (
    <div className="flex gap-5">
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 text-purple-500">
        <Bot className="w-5 h-5" />
      </div>
      <div className="bg-white/5 p-4 md:p-6 rounded-2xl md:rounded-[2rem] rounded-tl-none border border-white/5 flex gap-2">
        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      </div>
    </div>
  )
}
