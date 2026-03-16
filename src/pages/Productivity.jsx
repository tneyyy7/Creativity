import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { TrendingUp, Award, Calendar, Zap, Sparkles, Image as ImageIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

export function Productivity() {
  const { t } = useTranslation()
  const [view, setView] = useState('weekly')
  const [counts, setCounts] = useState({ total: 0, inspiration: 0 })

  useEffect(() => {
    const fetchCounts = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { count: paintingCount } = await supabase
        .from('paintings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_finished', true)
      
      const { count: aiCount } = await supabase
        .from('paintings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_ai_generated', true)
        .eq('is_finished', true)
      
      setCounts({
        total: paintingCount || 0,
        inspiration: aiCount || 0
      })
    }
    fetchCounts()
  }, [])

  const [chartData, setChartData] = useState([])

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('paintings')
          .select('created_at')
          .eq('user_id', user.id)
          .eq('is_finished', true)
        
        if (error) throw error

        const daysToShow = view === 'weekly' ? 7 : 30
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const now = new Date()
        
        const historyData = Array.from({ length: daysToShow }, (_, i) => {
          const d = new Date(now)
          d.setDate(now.getDate() - (daysToShow - 1 - i))
          const dateStr = d.toISOString().split('T')[0]
          return {
            dateStr,
            name: view === 'weekly' ? days[d.getDay()] : d.getDate().toString(), 
            uploads: 0
          }
        })

        data.forEach(p => {
          const pDate = p.created_at.split('T')[0]
          const dayEntry = historyData.find(d => d.dateStr === pDate)
          if (dayEntry) dayEntry.uploads += 1
        })

        setChartData(historyData)
      } catch (err) {
        console.error("Error fetching history:", err)
      }
    }
    fetchHistory()
  }, [view])

  const data = chartData.length > 0 ? chartData : [
    { name: t('monday'), uploads: 0 },
    { name: t('tuesday'), uploads: 0 },
    { name: t('wednesday'), uploads: 0 },
    { name: t('thursday'), uploads: 0 },
    { name: t('friday'), uploads: 0 },
    { name: t('saturday'), uploads: 0 },
    { name: t('sunday'), uploads: 0 },
  ]

  return (
    <div className="space-y-8 md:space-y-12 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-3">{t('productivity')}</h1>
          <p className="text-gray-500 text-sm sm:text-base md:text-lg font-medium">{t('productivity_subtitle')}</p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 self-start lg:self-auto">
          <button 
            onClick={() => setView('weekly')}
            className={`px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all ${view === 'weekly' ? 'bg-purple-600 text-white shadow-xl' : 'text-gray-500 hover:text-white'}`}
          >
            {t('weekly')}
          </button>
          <button 
            onClick={() => setView('monthly')}
            className={`px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all ${view === 'monthly' ? 'bg-purple-600 text-white shadow-xl' : 'text-gray-500 hover:text-white'}`}
          >
            {t('monthly')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:gap-10">
        <div className="space-y-6 md:space-y-10">
           <div className="glass-card p-6 md:p-10 border-white/5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 md:mb-12">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-600/10 rounded-2xl flex items-center justify-center border border-purple-500/20">
                      <TrendingUp className="text-purple-500 w-5 h-5 md:w-6 md:h-6" />
                   </div>
                   <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">{t('activity_analysis')}</h3>
                </div>
                <div className="flex items-center gap-6 md:gap-8">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(147,51,234,0.5)]"></div>
                    <span className="text-[10px] md:text-xs font-black text-gray-400 uppercase tracking-widest">{t('works')}</span>
                  </div>
                </div>
              </div>
              
              <div className="h-[250px] sm:h-[350px] md:h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <defs>
                      <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#9333ea" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#9333ea" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="5 5" stroke="#ffffff05" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#ffffff20" 
                      fontSize={11} 
                      fontWeight="bold"
                      tickLine={false} 
                      axisLine={false}
                      dy={20}
                    />
                    <YAxis 
                      stroke="#ffffff20" 
                      fontSize={11} 
                      fontWeight="bold"
                      tickLine={false} 
                      axisLine={false}
                      dx={-20}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0c0b11', border: '1px solid #ffffff10', borderRadius: '1.5rem', padding: '1.5rem', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
                      itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                      cursor={{ stroke: '#9333ea20', strokeWidth: 2 }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="uploads" 
                      stroke="#9333ea" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorUploads)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
           </div>

            <div className="grid grid-cols-1 gap-6 md:gap-8">
               <div className="glass-card p-6 md:p-10 flex items-center gap-6 md:gap-8 group border-white/5">
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-purple-600 rounded-2xl md:rounded-[2rem] flex items-center justify-center shadow-2xl shadow-purple-900/40 transform group-hover:scale-110 transition-transform">
                     <ImageIcon className="text-white w-8 h-8 md:w-10 md:h-10" />
                  </div>
                  <div>
                     <h4 className="text-3xl md:text-4xl font-black text-white tracking-tighter mb-1">{counts.total}</h4>
                     <p className="text-[10px] md:text-xs font-black text-purple-500 uppercase tracking-widest">{t('total_masterpieces')}</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  )
}
