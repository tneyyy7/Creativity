import { Plus, ArrowUpRight, Star, BadgeCheck } from 'lucide-react'
import { useTranslation, Trans } from 'react-i18next'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function Dashboard({ nickname, isVerified }) {
  const { t } = useTranslation()
  const [counts, setCounts] = useState({ total: 0, inspiration: 0 })
  const [quoteIdx, setQuoteIdx] = useState(1)

  useEffect(() => {
    const fetchCounts = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { count: paintingCount, error: pError } = await supabase
        .from('paintings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      
      const { count: aiCount, error: aiError } = await supabase
        .from('paintings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_ai_generated', true)
      
      const { count: finishedCount, error: fError } = await supabase
        .from('paintings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_finished', true)
      
      if (!pError) setCounts(prev => ({ ...prev, total: paintingCount || 0 }))
      if (!aiError) setCounts(prev => ({ ...prev, inspiration: aiCount || 0 }))
      if (!fError) setCounts(prev => ({ ...prev, finished: finishedCount || 0 }))
    }
    fetchCounts()

    const interval = setInterval(() => {
      setQuoteIdx(prev => (prev === 10 ? 1 : prev + 1))
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const stats = [
    { label: t('total_projects'), value: (counts.total || 0).toString(), change: '+1', trend: 'up', color: 'bg-purple-600' },
    { label: t('creative_spark'), value: (counts.inspiration || 0).toString(), change: 'AI Art', trend: 'up', color: 'bg-white/5' },
    { label: t('completed'), value: (counts.finished || 0).toString(), change: 'Stable', trend: 'up', color: 'bg-white/5' },
  ]

  return (
    <div className="space-y-8 md:space-y-12 pb-12 animate-in fade-in duration-1000">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-3 leading-tight">
             <Trans i18nKey="welcome_back" values={{ name: nickname }}>
               Welcome Back, <span className="notranslate inline-flex items-center gap-2 align-middle" translate="no">
                 {nickname}
                 {isVerified && <BadgeCheck className="w-6 h-6 md:w-8 md:h-8 text-purple-400 fill-purple-400/20" />}
               </span>!
             </Trans>
          </h1>
          <p className="text-gray-500 text-sm sm:text-base md:text-lg font-medium">{t('subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {stats.map((stat, i) => (
          <div key={i} className={`glass-card p-6 md:p-8 group relative overflow-hidden transition-all duration-500 hover:-translate-y-2 ${stat.color === 'bg-purple-600' ? 'bg-purple-600/10 border-purple-500/30' : 'border-white/5'}`}>
            <div className="flex justify-between items-start mb-4 md:mb-6">
              <h3 className="text-base md:text-lg font-bold text-white tracking-tight">{stat.label}</h3>
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-3 md:mb-4 tracking-tighter">{stat.value}</h2>
            <div className="flex items-center gap-2">
               <div className="px-2 py-0.5 bg-purple-500/10 rounded-md border border-purple-500/20 text-[9px] md:text-[10px] font-black text-purple-500 uppercase">
                 {stat.change}
               </div>
               <p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest">{t('recent_activity')}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="glass-card p-6 sm:p-8 md:p-10 relative overflow-hidden flex flex-col justify-center border-purple-500/10 min-h-[250px] md:min-h-[300px]">
            <div className="absolute top-0 right-0 p-6 md:p-10 opacity-5">
              <Star className="w-32 h-32 md:w-48 md:h-48 rotate-12 text-white" />
            </div>
            <p className="text-[10px] md:text-[11px] font-black text-purple-500 uppercase tracking-[0.3em] mb-4 md:mb-6">{t('quote_of_the_day')}</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white italic mb-6 md:mb-10 leading-[1.3] text-balance">
              {t(`dashboard_quote_${quoteIdx}`)}
            </h2>
            <div className="flex items-center gap-4">
              <div className="w-8 md:w-12 h-1 bg-purple-600 rounded-full"></div>
              <p className="text-lg md:text-xl font-black text-gray-400">— {t(`dashboard_quote_author_${quoteIdx}`)}</p>
            </div>
        </div>
      </div>
    </div>
  )
}
