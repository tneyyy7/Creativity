import { useState } from 'react'
import { Sparkles, Download, RefreshCw, Palette, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { generateImage } from '../lib/ai'
import { supabase, savePaintingMetadata } from '../lib/supabase'

export function ImageGen() {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [image, setImage] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return
    setIsGenerating(true)
    try {
      const url = await generateImage(prompt)
      setImage(url)
    } catch (error) {
       console.error("Gen Error:", error)
       alert("Error generating image: " + error.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveToGallery = async () => {
    if (!image) return
    console.log("Saving image:", image)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from('paintings')
        .insert({
          user_id: user.id,
          title: prompt.substring(0, 30) || 'AI Masterpiece',
          image_url: image,
          description: prompt,
          category: 'AI Reference',
          is_ai_generated: true,
          is_finished: false
        })
      
      if (error) {
        console.error("Save Error (Supabase):", error)
        throw error
      }
      alert("Saved to your Gallery!")
    } catch (err) {
      console.error("Save Error:", err)
      alert("Failed to save: " + err.message)
    }
  }

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 md:mb-10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tighter mb-2">{t('images')}</h1>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] md:text-[11px]">Generate references for your vision</p>
        </div>
        <div className="p-[2px] rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-400 self-start sm:self-auto">
           <div className="px-4 md:px-6 py-2 md:py-3 bg-[#0c0b11] rounded-[14px] flex items-center gap-3">
              <Sparkles className="text-purple-500 w-4 h-4 md:w-5 md:h-5" />
              <span className="text-white font-bold text-xs md:text-sm">Free Unlimited</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 md:gap-10 flex-1 min-h-0">
        <div className="lg:col-span-2 space-y-6 md:space-y-8 flex flex-col">
          <div className="glass-card p-6 md:p-10 space-y-6 md:space-y-8 flex-1 border-white/5">
             <div className="space-y-4">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em]">{t('vision_placeholder')}</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your artistic idea in detail..."
                  className="w-full h-48 p-6 bg-white/[0.02] border border-white/5 rounded-3xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white text-lg font-medium resize-none placeholder:text-gray-800"
                />
             </div>

             <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-6 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white font-black rounded-3xl transition-all transform hover:-translate-y-1 active:scale-95 shadow-2xl shadow-purple-900/40 flex items-center justify-center gap-4 text-lg"
            >
              {isGenerating ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
              {isGenerating ? "Mixing Palette..." : t('ignite')}
            </button>

            <div className="pt-4 border-t border-white/5">
               <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-6">Trending Styles</p>
               <div className="flex flex-wrap gap-2">
                {['Impressionism', 'Cyberpunk', 'Art Nouveau', 'Minimalist', 'Vaporwave', 'Abstract'].map(s => (
                  <button 
                    key={s} 
                    onClick={() => setPrompt(s)}
                    className="px-4 py-2 bg-white/5 border border-white/5 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:border-purple-500/50 transition-all"
                  >
                    {s}
                  </button>
                ))}
               </div>
            </div>
            <div className="mt-8 p-6 bg-purple-600/5 border border-purple-500/10 rounded-3xl flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                  <Palette className="w-6 h-6 text-purple-500" />
               </div>
               <p className="text-sm font-medium text-purple-100/60 leading-tight">
                 {t('composition_guide_hint')}
               </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 glass-card relative flex items-center justify-center overflow-hidden bg-black/40 group border-white/5">
          {image ? (
            <>
              <img 
                src={image} 
                alt="AI starter" 
                className={`w-full h-full object-cover transition-all duration-1000 ${isGenerating ? 'opacity-30 blur-2xl scale-125' : 'opacity-100 blur-0 scale-100'}`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-10">
                 <div className="flex gap-4">
                    <button 
                      onClick={handleSaveToGallery}
                      className="flex-1 py-4 bg-purple-600 text-white font-black rounded-2xl hover:bg-purple-500 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2"
                    >
                       <Download className="w-5 h-5" /> Save to Gallery
                    </button>
                    <button onClick={handleGenerate} className="w-16 h-16 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl text-white flex items-center justify-center hover:bg-white/20 transition-all">
                       <RefreshCw className="w-6 h-6" />
                    </button>
                 </div>
              </div>
            </>
          ) : (
            <div className="text-center max-w-sm">
                <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 border border-white/5 border-dashed">
                   <Wand2 className="w-10 h-10 text-gray-800" />
                </div>
                <h3 className="text-2xl font-black text-white mb-3">Vision Awaits</h3>
                <p className="text-gray-600 font-medium leading-relaxed">Enter a prompt and choose a style to generate your first starter reference.</p>
            </div>
          )}

          {isGenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
               <div className="relative">
                  <div className="w-20 h-20 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                  <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-500 w-8 h-8 animate-pulse" />
               </div>
               <p className="text-purple-500 font-black text-sm uppercase tracking-[0.4em] animate-pulse">Masterpiece Loading</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
