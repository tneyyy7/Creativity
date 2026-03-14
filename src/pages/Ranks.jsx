import { useState, useEffect } from 'react'
import { Award, Star, Flame, Trophy, ShieldHalf, Medal, Zap, Crown, Sparkles, Rocket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

export function Ranks() {
  const { t } = useTranslation()
  const [workCount, setWorkCount] = useState(0)
  
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { count, error } = await supabase
          .from('paintings')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_finished', true)
        if (error) throw error
        setWorkCount(count || 0)
      } catch (err) {
        console.error("Error fetching count for ranks:", err)
      }
    }
    fetchCount()
  }, [])

  const rankThresholds = [
    { id: 1, limit: 5 },
    { id: 2, limit: 15 },
    { id: 3, limit: 30 },
    { id: 4, limit: 50 },
    { id: 5, limit: 75 },
    { id: 6, limit: 100 },
    { id: 7, limit: 125 },
    { id: 8, limit: 150 },
    { id: 9, limit: 175 },
    { id: 10, limit: 200 },
  ]

  const ranks = [
    { id: 1, name: t('rank_name_1'), icon: Star, color: 'text-gray-400' },
    { id: 2, name: t('rank_name_2'), icon: Flame, color: 'text-orange-400' },
    { id: 3, name: t('rank_name_3'), icon: ShieldHalf, color: 'text-blue-400' },
    { id: 4, name: t('rank_name_4'), icon: Trophy, color: 'text-purple-400' },
    { id: 5, name: t('rank_name_5'), icon: Award, color: 'text-emerald-400' },
    { id: 6, name: t('rank_name_6'), icon: Medal, color: 'text-yellow-400' },
    { id: 7, name: t('rank_name_7'), icon: Zap, color: 'text-indigo-400' },
    { id: 8, name: t('rank_name_8'), icon: Crown, color: 'text-fuchsia-400' },
    { id: 9, name: t('rank_name_9'), icon: Sparkles, color: 'text-amber-400' },
    { id: 10, name: t('rank_name_10'), icon: Rocket, color: 'text-rose-400' },
  ].map((r, index) => {
    const currLimit = rankThresholds[index].limit
    const prevLimit = index === 0 ? 0 : rankThresholds[index - 1].limit
    
    let status = 'Locked'
    let progress = 0

    if (workCount >= currLimit) {
      status = 'Completed'
      progress = 100
    } else if (workCount >= prevLimit) {
      status = 'Active'
      progress = Math.min(100, ((workCount - prevLimit) / (currLimit - prevLimit)) * 100)
    }

    return { ...r, status, progress, limit: currLimit }
  })

  return (
    <div className="max-w-4xl mx-auto space-y-8 md:space-y-12 pb-12 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-3">{t('ranks_title')}</h1>
        <p className="text-gray-500 text-sm sm:text-base md:text-lg font-medium">{t('ranks_subtitle')}</p>
      </div>

      <div className="space-y-4 md:space-y-6">
        {ranks.map((rank) => (
          <div key={rank.id} className={`glass-card p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6 md:gap-8 border-white/5 ${rank.status === 'Locked' ? 'opacity-40 grayscale' : ''}`}>
            <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 flex-shrink-0 ${rank.color}`}>
              <rank.icon className="w-8 h-8 md:w-10 md:h-10" />
            </div>
            <div className="flex-1 w-full">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2 mb-4">
                <div>
                  <p className="text-[10px] md:text-[11px] font-black text-purple-500 uppercase tracking-widest mb-1">{t('rank')} {rank.id}</p>
                  <h3 className="text-xl md:text-2xl font-black text-white">{rank.name}</h3>
                </div>
                <span className="text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest">
                  {rank.status === 'Completed' ? t('mastered') : rank.status === 'Active' ? `${workCount}/${rank.limit} ${t('works_to_milestone')}` : t('locked')}
                </span>
              </div>
              <div className="w-full h-2.5 md:h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                <div 
                  className={`h-full transition-all duration-1000 ${rank.status === 'Completed' ? 'bg-emerald-500' : 'bg-gradient-to-r from-purple-600 to-indigo-500'}`}
                  style={{ width: `${rank.progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
