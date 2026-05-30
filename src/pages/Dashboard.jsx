import { useState, useEffect } from 'react'
import { Plus, ArrowUpRight, Star, BadgeCheck, TrendingUp, Eye, Heart, BarChart2, Calendar, Gem, Lock } from 'lucide-react'
import { useTranslation, Trans } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  BarChart, 
  Bar,
  Cell
} from 'recharts'

export function Dashboard({ nickname, isVerified, isPro, onNavigate, onOpenPost, isViewerOpen }) {
  const { t } = useTranslation()
  const [counts, setCounts] = useState({ total: 0, finished: 0, drafts: 0 })
  const [quoteIdx, setQuoteIdx] = useState(1)
  
  // Pro Analytics States
  const [proStats, setProStats] = useState({
    totalViews: 0,
    totalLikes: 0,
    topPaintings: [],
    weeklyViews: [],
    weeklyLikes: []
  })
  const [loadingPro, setLoadingPro] = useState(false)

  useEffect(() => {
    const fetchCounts = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { count: finishedCount, error: fError } = await supabase
        .from('paintings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_finished', true)
      
      const { count: totalDrafts, error: pError } = await supabase
        .from('paintings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      
      if (!fError) setCounts(prev => ({ ...prev, finished: finishedCount || 0, total: finishedCount || 0 }))
      if (!pError) setCounts(prev => ({ ...prev, drafts: (totalDrafts || 0) - (finishedCount || 0) }))
    }

    fetchCounts()

    const interval = setInterval(() => {
      setQuoteIdx(prev => (prev === 25 ? 1 : prev + 1))
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchProStats = async () => {
      try {
        setLoadingPro(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: paintings } = await supabase
          .from('paintings')
          .select('id, title, views_count, likes_count, image_url')
          .eq('user_id', user.id)
          .eq('is_finished', true)

        if (paintings && paintings.length > 0) {
          const views = paintings.reduce((sum, p) => sum + (p.views_count || 0), 0)
          const likes = paintings.reduce((sum, p) => sum + (p.likes_count || 0), 0)
          
          const sorted = [...paintings]
            .sort((a, b) => ((b.likes_count || 0) + (b.views_count || 0)) - ((a.likes_count || 0) + (a.views_count || 0)))
            .slice(0, 3)

          const paintingIds = paintings.map(p => p.id)

          // Находим начало текущей недели (понедельник 00:00:00)
          const now = new Date()
          const currentDay = now.getDay() // 0 - Вс, 1 - Пн, ...
          const diffToMon = currentDay === 0 ? 6 : currentDay - 1
          const startOfWeek = new Date(now)
          startOfWeek.setDate(now.getDate() - diffToMon)
          startOfWeek.setHours(0, 0, 0, 0)

          // Параллельно запрашиваем реальные лайки и просмотры
          const [likesRes, viewsRes] = await Promise.all([
            supabase
              .from('post_likes')
              .select('created_at')
              .in('painting_id', paintingIds)
              .gte('created_at', startOfWeek.toISOString()),
            supabase
              .from('painting_views')
              .select('created_at')
              .in('painting_id', paintingIds)
              .gte('created_at', startOfWeek.toISOString())
          ])

          // dayMapping: JS getDay() (0=Sun) -> 0-6 index (Mon=0 .. Sun=6)
          const dayMapping = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 }

          const viewsMap = [0, 0, 0, 0, 0, 0, 0]
          const likesMap = [0, 0, 0, 0, 0, 0, 0]

          if (likesRes.data) {
            likesRes.data.forEach(like => {
              const d = new Date(like.created_at)
              likesMap[dayMapping[d.getDay()]]++
            })
          }

          if (viewsRes.data) {
            viewsRes.data.forEach(view => {
              const d = new Date(view.created_at)
              viewsMap[dayMapping[d.getDay()]]++
            })
          }

          const weeklyViews = [0,1,2,3,4,5,6].map(d => ({ name: d, views: viewsMap[d] }))
          const weeklyLikes = [0,1,2,3,4,5,6].map(d => ({ name: d, likes: likesMap[d] }))

          setProStats({
            totalViews: views,
            totalLikes: likes,
            topPaintings: sorted,
            weeklyViews,
            weeklyLikes
          })
        } else {
          setProStats({
            totalViews: 0,
            totalLikes: 0,
            topPaintings: [],
            weeklyViews: [0,1,2,3,4,5,6].map(d => ({ name: d, views: 0 })),
            weeklyLikes: [0,1,2,3,4,5,6].map(d => ({ name: d, likes: 0 }))
          })
        }
      } catch (err) {
        console.error('Error fetching pro stats:', err)
      } finally {
        setLoadingPro(false)
      }
    }

    if (isPro && !isViewerOpen) {
      fetchProStats()
    }
  }, [isPro, isViewerOpen])

  // Static mock data for blurred free users preview
  const dummyWeeklyViews = [
    { name: 0, views: 40 },
    { name: 1, views: 82 },
    { name: 2, views: 56 },
    { name: 3, views: 95 },
    { name: 4, views: 120 },
    { name: 5, views: 90 },
    { name: 6, views: 140 }
  ]

  const dummyWeeklyLikes = [
    { name: 0, likes: 12 },
    { name: 1, likes: 25 },
    { name: 2, likes: 18 },
    { name: 3, likes: 32 },
    { name: 4, likes: 45 },
    { name: 5, likes: 28 },
    { name: 6, likes: 50 }
  ]

  const DAY_KEYS = ['day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_sun']

  // Setup stats list
  const stats = [
    { id: 'works', label: t('total_projects'), value: (counts.total || 0).toString(), change: '+1', trend: 'up', color: 'bg-purple-600', showArrow: true, link: 'gallery' },
    { id: 'finished', label: t('completed'), value: (counts.finished || 0).toString(), change: 'Stable', trend: 'up', color: 'bg-white/5', showArrow: false },
  ]

  if (isPro) {
    stats.push(
      { id: 'views', label: t('views'), value: proStats.totalViews.toString(), change: 'Pro', trend: 'up', color: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400', icon: Eye },
      { id: 'likes', label: t('likes'), value: proStats.totalLikes.toString(), change: 'Pro', trend: 'up', color: 'bg-rose-500/10 border-rose-500/30 text-rose-400', icon: Heart }
    )
  }

  const handleUpgradeClick = () => {
    onNavigate?.('subscription')
  }

  return (
    <div className="space-y-8 md:space-y-12 pb-12 animate-in fade-in duration-1000">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-3 flex items-center gap-3 leading-none">
             <Trans i18nKey="welcome_back" values={{ name: nickname }}>
               Welcome Back, <span className="notranslate inline-flex items-baseline gap-2" translate="no">
                 {nickname}
                 {isVerified && <BadgeCheck className="w-5 h-5 md:w-7 md:h-7 text-purple-400 fill-purple-400/20 translate-y-0.5" />}
               </span>!
             </Trans>
             {isPro && (
               <span className="inline-flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded-full text-xs font-black text-cyan-400 tracking-wider uppercase animate-pulse">
                 <Gem className="w-3.5 h-3.5" /> Pro
               </span>
             )}
          </h1>
          <p className="text-gray-500 text-sm sm:text-base md:text-lg font-medium">{t('subtitle')}</p>
        </div>
      </div>

      {/* Grid of stats */}
      <div className={`grid grid-cols-1 ${isPro ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-2'} gap-6 md:gap-8`}>
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <div 
              key={i} 
              className={`glass-card p-6 md:p-8 group relative overflow-hidden transition-all duration-500 hover:-translate-y-2 ${
                stat.color.includes('bg-purple') 
                  ? 'bg-purple-600/10 border-purple-500/30' 
                  : stat.color.includes('bg-cyan')
                    ? 'bg-cyan-500/5 border-cyan-500/25'
                    : stat.color.includes('bg-rose')
                      ? 'bg-rose-500/5 border-rose-500/25'
                      : 'border-white/5'
              }`}
            >
              <div className="flex justify-between items-start mb-4 md:mb-6">
                <h3 className="text-base md:text-lg font-bold text-white tracking-tight">{stat.label}</h3>
                {stat.showArrow ? (
                  <button 
                    onClick={() => stat.link && onNavigate?.(stat.link)}
                    className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:bg-purple-600 hover:text-white transition-all active:scale-95 z-10"
                  >
                    <ArrowUpRight className="w-5 h-5" />
                  </button>
                ) : Icon ? (
                  <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 text-gray-400">
                    <Icon className="w-5 h-5" />
                  </div>
                ) : null}
              </div>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-3 md:mb-4 tracking-tighter">{stat.value}</h2>
              <div className="flex items-center gap-2">
                 <div className={`px-2 py-0.5 rounded-md border text-[9px] md:text-[10px] font-black uppercase ${
                   stat.change === 'Pro'
                     ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                     : 'bg-purple-500/10 border-purple-500/20 text-purple-500'
                 }`}>
                   {stat.change}
                 </div>
                 <p className="text-[10px] md:text-xs font-bold text-gray-500 uppercase tracking-widest">{t('recent_activity')}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pro Analytics Panel */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-purple-500" /> {t('pro_analytics')}
          </h2>
          {!isPro && (
            <span className="text-xs font-bold text-gray-500 flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
              <Lock className="w-3.5 h-3.5 text-amber-500" /> {t('locked')}
            </span>
          )}
        </div>

        <div className="relative">
          {/* Locked Overlay for Free Users */}
          {!isPro && (
            <div className="absolute inset-0 bg-[#0c0c0e]/40 backdrop-blur-md rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center p-6 sm:p-8 z-20 space-y-4">
              <div className="w-16 h-16 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl flex items-center justify-center text-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.15)] animate-bounce">
                <Gem className="w-8 h-8" />
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="text-xl md:text-2xl font-black text-white leading-tight">{t('unlock_analytics_title')}</h3>
                <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
                  {t('unlock_analytics_desc')}
                </p>
              </div>
              <button
                onClick={handleUpgradeClick}
                className="bg-cyan-500 hover:bg-cyan-400 text-neutral-900 font-black px-6 py-3 rounded-xl transition-all shadow-[0_4px_20px_rgba(34,211,238,0.25)] flex items-center gap-2 text-sm active:scale-95"
              >
                <Gem className="w-4 h-4" /> {t('upgrade_to_pro_btn')}
              </button>
            </div>
          )}

          {/* Charts Grid */}
          <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 ${!isPro ? 'blur-md select-none pointer-events-none' : ''}`}>
            {/* Views Chart Left */}
            <div className="lg:col-span-7 glass-card p-6 md:p-8 border-white/5 flex flex-col space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-400" /> {t('profile_views_chart')}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{t('last_7_days')}</p>
              </div>

              <div className="h-64 sm:h-80 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={isPro ? proStats.weeklyViews : dummyWeeklyViews} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" stroke="#52525b" fontSize={11} fontWeight="bold" axisLine={false} tickLine={false} tickFormatter={(v) => t(DAY_KEYS[v])} />
                    <YAxis
                      stroke="#52525b"
                      fontSize={11}
                      fontWeight="bold"
                      axisLine={false}
                      tickLine={false}
                      domain={[0, dataMax => Math.max(4, Math.ceil(dataMax * 1.2))]}
                      tickCount={5}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px' }}
                      labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                      itemStyle={{ color: '#22d3ee', fontWeight: 'bold' }}
                      labelFormatter={(v) => t(DAY_KEYS[v])}
                    />
                    <Area type="monotone" dataKey="views" stroke="#22d3ee" strokeWidth={3} fillOpacity={1} fill="url(#colorViews)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Likes Chart Right */}
            <div className="lg:col-span-5 glass-card p-6 md:p-8 border-white/5 flex flex-col space-y-6">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Heart className="w-5 h-5 text-rose-500 fill-rose-500/10" /> {t('likes_dynamics')}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{t('weekly_activity')}</p>
              </div>

              <div className="h-64 sm:h-80 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={isPro ? proStats.weeklyLikes : dummyWeeklyLikes} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#52525b" fontSize={11} fontWeight="bold" axisLine={false} tickLine={false} tickFormatter={(v) => t(DAY_KEYS[v])} />
                    <YAxis 
                      stroke="#52525b" 
                      fontSize={11} 
                      fontWeight="bold" 
                      axisLine={false} 
                      tickLine={false} 
                      domain={[0, dataMax => Math.max(4, Math.ceil(dataMax * 1.2))]}
                      tickCount={5}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px' }}
                      labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                      itemStyle={{ color: '#f43f5e', fontWeight: 'bold' }}
                      labelFormatter={(v) => t(DAY_KEYS[v])}
                    />
                    <Bar dataKey="likes" radius={[6, 6, 0, 0]}>
                      {(isPro ? proStats.weeklyLikes : dummyWeeklyLikes).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#f43f5e' : '#fda4af'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Top Artworks List - Pro Only */}
        {isPro && proStats.topPaintings.length > 0 && (
          <div className="glass-card p-6 md:p-8 border-white/5 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500/10" /> {t('top_artworks')}
              </h3>
              <p className="text-xs text-gray-500 mt-1">{t('top_artworks_desc')}</p>
            </div>

            <div className="divide-y divide-white/5">
              {proStats.topPaintings.map((painting, idx) => (
                <div 
                  key={painting.id} 
                  onClick={() => onOpenPost?.(painting.id, painting, proStats.topPaintings, idx)}
                  className="py-4 flex items-center justify-between gap-4 first:pt-0 last:pb-0 cursor-pointer hover:bg-white/5 px-2 rounded-xl transition-all"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-sm font-black text-gray-600 select-none">#0{idx + 1}</span>
                    {painting.image_url && (
                      <img src={painting.image_url} alt="" className="w-12 h-12 object-cover rounded-lg border border-white/10 flex-shrink-0" />
                    )}
                    <span className="text-sm font-bold text-white truncate">{painting.title || 'Untitled Work'}</span>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-gray-400 font-bold">
                    <span className="flex items-center gap-1.5"><Eye className="w-4 h-4 text-cyan-400" /> {painting.views_count || 0}</span>
                    <span className="flex items-center gap-1.5"><Heart className="w-4 h-4 text-rose-500 fill-rose-500/10" /> {painting.likes_count || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quote of the Day Panel */}
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
