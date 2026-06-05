import React, { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchDashboardStats } from '../../lib/api/adminStats'
import { Users, TrendingUp, AlertTriangle, Image as ImageIcon, Activity, DollarSign, XCircle, RefreshCw } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function Dashboard() {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const loadStats = useCallback(async (force = false) => {
    try {
      if (force) setRefreshing(true)
      else setLoading(true)
      setError(null)
      const data = await fetchDashboardStats({ force })
      setStats(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        <Activity className="w-8 h-8 animate-spin text-white/50" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400">
        <p className="font-medium">{t('admin_dash_error')}</p>
        <p className="text-sm opacity-80">{error}</p>
      </div>
    )
  }

  if (!stats) return null

  const mrr = Number(stats.mrr || 0)

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={() => loadStats(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 border border-white/10 transition-all disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {t('admin_dash_refresh')}
        </button>
      </div>

      {/* Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1a1924]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-400 text-sm">{t('admin_dash_total_users')}</p>
              <h3 className="text-2xl font-bold text-white mt-1">{stats.total_users}</h3>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs">
            <span className="text-green-400 font-medium">+{stats.new_users_7d}</span>
            <span className="text-gray-500 ml-2">{t('admin_dash_last_7d')}</span>
          </div>
        </div>

        <div className="bg-[#1a1924]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-400 text-sm">{t('admin_dash_active_subs')}</p>
              <h3 className="text-2xl font-bold text-white mt-1">{stats.active_subs}</h3>
            </div>
            <div className="p-2 bg-green-500/10 rounded-xl text-green-400">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs">
            <DollarSign className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-400 font-medium ml-0.5">${mrr.toFixed(2)}</span>
            <span className="text-gray-500 ml-2">{t('admin_dash_mrr')}</span>
          </div>
        </div>

        <div className="bg-[#1a1924]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-400 text-sm">{t('admin_dash_pending_reports')}</p>
              <h3 className="text-2xl font-bold text-white mt-1">{stats.pending_reports}</h3>
            </div>
            <div className={`p-2 rounded-xl ${stats.pending_reports > 0 ? 'bg-red-500/10 text-red-400' : 'bg-gray-500/10 text-gray-400'}`}>
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs">
            <span className={stats.pending_reports > 0 ? 'text-red-400 font-medium' : 'text-gray-500'}>
              {stats.pending_reports > 0 ? t('admin_dash_requires_attention') : t('admin_dash_all_clear')}
            </span>
          </div>
        </div>

        <div className="bg-[#1a1924]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-400 text-sm">{t('admin_dash_total_content')}</p>
              <h3 className="text-2xl font-bold text-white mt-1">{stats.total_posts}</h3>
            </div>
            <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400">
              <ImageIcon size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs">
            <span className="text-purple-400 font-medium">+{stats.new_posts_24h}</span>
            <span className="text-gray-500 ml-2">{t('admin_dash_last_24h')}</span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Registrations Chart */}
        <div className="bg-[#1a1924]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
          <h4 className="text-sm font-medium text-gray-400 mb-4">{t('admin_dash_registrations_7d')}</h4>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.chart_registrations}>
                <defs>
                  <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="date" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1924', border: '1px solid #ffffff10', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#3b82f6' }}
                />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorReg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Content Chart */}
        <div className="bg-[#1a1924]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5">
          <h4 className="text-sm font-medium text-gray-400 mb-4">{t('admin_dash_content_7d')}</h4>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.chart_posts}>
                <defs>
                  <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="date" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1924', border: '1px solid #ffffff10', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#a855f7' }}
                />
                <Area type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorPosts)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Lists Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Pending Reports */}
        <div className="bg-[#1a1924]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 overflow-hidden flex flex-col">
          <h4 className="text-sm font-medium text-gray-400 mb-4">{t('admin_dash_recent_reports')}</h4>
          <div className="flex-1 overflow-y-auto pr-2">
            {stats.recent_reports?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_reports.map((report) => (
                  <div key={report.id} className="p-3 bg-white/5 rounded-xl text-sm flex justify-between items-start">
                    <div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400 font-medium mb-2 inline-block">
                        {report.reason}
                      </span>
                      <p className="text-gray-300">
                        {t('admin_dash_target')}: <span className="text-white font-medium">{report.target_type}</span>
                      </p>
                      <p className="text-gray-500 text-xs mt-1">
                        {t('admin_dash_by')}: {report.reporter_name || 'Unknown'}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(report.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500">
                {t('admin_dash_no_pending_reports')}
              </div>
            )}
          </div>
        </div>

        {/* Recent Admin Actions */}
        <div className="bg-[#1a1924]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 overflow-hidden flex flex-col">
          <h4 className="text-sm font-medium text-gray-400 mb-4">{t('admin_dash_recent_actions')}</h4>
          <div className="flex-1 overflow-y-auto pr-2">
            {stats.recent_actions?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_actions.map((action) => (
                  <div key={action.id} className="p-3 bg-white/5 rounded-xl text-sm flex justify-between items-start">
                    <div>
                      <p className="text-gray-300">
                        <span className="text-white font-medium">{action.admin_name || 'Admin'}</span> · <span className="text-blue-400">{action.action}</span>
                      </p>
                      <p className="text-gray-500 text-xs mt-1">
                        {t('admin_dash_target')}: {action.target_type}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(action.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500">
                {t('admin_dash_no_recent_actions')}
              </div>
            )}
          </div>
        </div>

        {/* Recent Subscription Cancellations */}
        <div className="bg-[#1a1924]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-5 overflow-hidden flex flex-col">
          <h4 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-amber-400" />
            {t('admin_dash_recent_cancellations')}
          </h4>
          <div className="flex-1 overflow-y-auto pr-2">
            {stats.recent_cancellations?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_cancellations.map((sub) => (
                  <div key={sub.id} className="p-3 bg-white/5 rounded-xl text-sm flex justify-between items-start">
                    <div>
                      <p className="text-gray-300">
                        <span className="text-white font-medium">{sub.user_name || 'Unknown'}</span>
                      </p>
                      <p className="text-amber-400/80 text-xs mt-1">{sub.plan}</p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {sub.updated_at ? new Date(sub.updated_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500">
                {t('admin_dash_no_cancellations')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
