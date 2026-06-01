import { useTranslation } from 'react-i18next'
import { TrendingUp, Heart } from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from 'recharts'

// Static mock data shown (blurred) to free users as a teaser.
const dummyWeeklyViews = [
  { name: 0, views: 40 }, { name: 1, views: 82 }, { name: 2, views: 56 },
  { name: 3, views: 95 }, { name: 4, views: 120 }, { name: 5, views: 90 }, { name: 6, views: 140 },
]
const dummyWeeklyLikes = [
  { name: 0, likes: 12 }, { name: 1, likes: 25 }, { name: 2, likes: 18 },
  { name: 3, likes: 32 }, { name: 4, likes: 45 }, { name: 5, likes: 28 }, { name: 6, likes: 50 },
]
const DAY_KEYS = ['day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_sun']

// recharts is heavy (~150 kB gzip). Splitting the analytics charts into this
// lazy-loaded chunk keeps the library off the Dashboard's critical render path.
export default function DashboardCharts({ isPro, proStats }) {
  const { t } = useTranslation()

  return (
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
  )
}
