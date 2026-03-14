import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getAIResponse } from '../lib/ai'

export function Chat() {
  const { t, i18n } = useTranslation()
  const [messages, setMessages] = useState([
    { role: 'assistant', content: t('chat_initial') }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await getAIResponse(input, i18n.language)
      const botMessage = { role: 'assistant', content: response }
      setMessages(prev => [...prev, botMessage])
    } catch (error) {
       setMessages(prev => [...prev, { role: 'assistant', content: "I'm having a bit of a creative block. Check your API key!" }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto space-y-4 md:space-y-6 pt-2 md:pt-4">
      <div className="flex items-center justify-between mb-2 md:mb-4 px-2">
        <div className="flex items-center gap-3 md:gap-4">
           <div className="w-10 h-10 md:w-14 md:h-14 bg-purple-600/10 rounded-[1rem] md:rounded-2xl flex items-center justify-center border border-purple-500/20">
              <Bot className="text-purple-500 w-6 h-6 md:w-8 md:h-8" />
           </div>
           <div>
              <h1 className="text-xl md:text-3xl font-black text-white">{t('chat')}</h1>
              <p className="text-gray-500 font-bold uppercase tracking-widest text-[9px] md:text-[11px] flex items-center gap-2">
                <span className="w-1.5 h-1.5 md:w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                Online & Multi-lingual
              </p>
           </div>
        </div>
      </div>

      <div className="flex-1 glass-card p-4 md:p-10 overflow-y-auto space-y-6 md:space-y-8 scroll-smooth min-h-0 border-white/[0.04] rounded-2xl md:rounded-[2.5rem]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
            <div className={`flex gap-3 md:gap-5 max-w-[90%] md:max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex-shrink-0 flex items-center justify-center shadow-lg border ${
                msg.role === 'user' 
                  ? 'bg-purple-600 border-purple-400 text-white' 
                  : 'bg-white/5 border-white/5 text-purple-500'
              }`}>
                {msg.role === 'user' ? <User className="w-4 h-4 md:w-5 md:h-5" /> : <Bot className="w-4 h-4 md:w-5 md:h-5" />}
              </div>
              <div className={`p-4 md:p-6 rounded-2xl md:rounded-[2rem] text-sm md:text-[15px] font-medium shadow-2xl ${
                msg.role === 'user' 
                  ? 'bg-purple-600/10 text-white rounded-tr-none border border-purple-500/20' 
                  : 'bg-white/[0.03] text-gray-200 rounded-tl-none border border-white/5'
              }`}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-5">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 text-purple-500 text-xs md:text-sm">
                <Bot className="w-5 h-5" />
              </div>
              <div className="bg-white/5 p-4 md:p-6 rounded-2xl md:rounded-[2rem] rounded-tl-none border border-white/5 flex gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative pb-4 md:pb-6 px-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={t('vision_placeholder')}
          className="w-full h-16 md:h-20 pl-6 md:pl-10 pr-20 md:pr-24 bg-white/[0.03] border border-white/5 rounded-2xl md:rounded-[2.5rem] focus:outline-none focus:ring-8 focus:ring-purple-500/5 focus:border-purple-500/30 transition-all text-white text-base md:text-lg font-medium placeholder:text-gray-700 shadow-2xl"
        />
        <button 
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="absolute right-4 md:right-5 top-2.5 md:top-3 w-11 h-11 md:w-14 md:h-14 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-xl md:rounded-[2rem] flex items-center justify-center transition-all transform hover:scale-105 active:scale-90 shadow-xl shadow-purple-900/40"
        >
          <Send className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>
    </div>
  )
}
