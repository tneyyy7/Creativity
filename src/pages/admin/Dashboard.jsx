import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchDashboardStats } from '../../lib/api/adminStats'
import { Users, TrendingUp, AlertTriangle, Image as ImageIcon, Activity, DollarSign, XCircle, RefreshCw, ChevronRight } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// Роль-иерархия — должна совпадать с AdminLayout. Финансовые данные (MRR,
// подписки, отмены) видны только admin+; модератор их не видит, так как вкладку
// Subscriptions ему открыть нельзя.
const ROLE_RANK = { moderator: 1, admin: 2, superadmin: 3 }

export function Dashboard({ adminRole = 'superadmin', onNavigate }) {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const canSeeFinancials = (ROLE_RANK[adminRole] || 0) >= ROLE_RANK.admin
  // Куда можно перейти из хаба (null = вкладка недоступна этой роли → карточка
  // остаётся информационной, без перехода).
  const navTo = (tab, minRole) =>
    onNavigate && (ROLE_RANK[adminRole] || 0) >= ROLE_RANK[minRole]
      ? () => onNavigate(tab)
      : undefined

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
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/[0.04] border border-white/10 hover:bg-white/10 transition-all disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {t('admin_dash_refresh')}
        </button>
      </div>

      {/* KPI cards — каждая ведёт в соответствующую вкладку (если доступна роли) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          iconClass="bg-blue-500/10 text-blue-400"
          label={t('admin_dash_total_users')}
          value={stats.total_users}
          onClick={navTo('users', 'admin')}
          footer={
            <>
              <span className="text-green-400 font-medium">+{stats.new_users_7d}</span>
              <span className="text-gray-500 ml-2">{t('admin_dash_last_7d')}</span>
            </>
          }
        />

        {canSeeFinancials && (
          <KpiCard
            icon={TrendingUp}
            iconClass="bg-green-500/10 text-green-400"
            label={t('admin_dash_active_subs')}
            value={stats.active_subs}
            onClick={navTo('subscriptions', 'admin')}
            footer={
              <>
                <DollarSign className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-400 font-medium ml-0.5">${mrr.toFixed(2)}</span>
                <span className="text-gray-500 ml-2">{t('admin_dash_mrr')}</span>
              </>
            }
          />
        )}

        <KpiCard
          icon={AlertTriangle}
          iconClass={stats.pending_reports > 0 ? 'bg-red-500/10 text-red-400' : 'bg-gray-500/10 text-gray-400'}
          label={t('admin_dash_pending_reports')}
          value={stats.pending_reports}
          onClick={navTo('reports', 'moderator')}
          footer={
            <span className={stats.pending_reports > 0 ? 'text-red-400 font-medium' : 'text-gray-500'}>
              {stats.pending_reports > 0 ? t('admin_dash_requires_attention') : t('admin_dash_all_clear')}
            </span>
          }
        />

        <KpiCard
          icon={ImageIcon}
          iconClass="bg-purple-500/10 text-purple-400"
          label={t('admin_dash_total_content')}
          value={stats.total_posts}
          onClick={navTo('content', 'moderator')}
          footer={
            <>
              <span className="text-purple-400 font-medium">+{stats.new_posts_24h}</span>
              <span className="text-gray-500 ml-2">{t('admin_dash_last_24h')}</span>
            </>
          }
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Registrations Chart */}
        <div className="bg-[#15141d]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-5">
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
                  contentStyle={{ backgroundColor: '#15141d', border: '1px solid #ffffff1a', borderRadius: '14px', color: '#fff' }}
                  itemStyle={{ color: '#3b82f6' }}
                />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorReg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Content Chart */}
        <div className="bg-[#15141d]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-5">
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
                  contentStyle={{ backgroundColor: '#15141d', border: '1px solid #ffffff1a', borderRadius: '14px', color: '#fff' }}
                  itemStyle={{ color: '#a855f7' }}
                />
                <Area type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorPosts)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Lists Row — превью-списки ведут в свои вкладки */}
      <div className={`grid grid-cols-1 gap-4 ${canSeeFinancials ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {/* Recent Pending Reports → Reports */}
        <ListPanel
          title={t('admin_dash_recent_reports')}
          onNavigate={navTo('reports', 'moderator')}
          viewAllLabel={t('admin_dash_view_all')}
          empty={t('admin_dash_no_pending_reports')}
          items={stats.recent_reports}
          renderItem={(report) => (
            <div key={report.id} className="p-3 bg-white/[0.04] border border-white/5 rounded-2xl text-sm flex justify-between items-start">
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
          )}
        />

        {/* Recent Admin Actions → Logs (admin+) */}
        {canSeeFinancials && (
          <ListPanel
            title={t('admin_dash_recent_actions')}
            onNavigate={navTo('logs', 'admin')}
            viewAllLabel={t('admin_dash_view_all')}
            empty={t('admin_dash_no_recent_actions')}
            items={stats.recent_actions}
            renderItem={(action) => (
              <div key={action.id} className="p-3 bg-white/[0.04] border border-white/5 rounded-2xl text-sm flex justify-between items-start">
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
            )}
          />
        )}

        {/* Recent Subscription Cancellations → Subscriptions (admin+) */}
        {canSeeFinancials && (
          <ListPanel
            title={t('admin_dash_recent_cancellations')}
            titleIcon={<XCircle className="w-4 h-4 text-amber-400" />}
            onNavigate={navTo('subscriptions', 'admin')}
            viewAllLabel={t('admin_dash_view_all')}
            empty={t('admin_dash_no_cancellations')}
            items={stats.recent_cancellations}
            renderItem={(sub) => (
              <div key={sub.id} className="p-3 bg-white/[0.04] border border-white/5 rounded-2xl text-sm flex justify-between items-start">
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
            )}
          />
        )}
      </div>
    </div>
  )
}

// KPI-карточка. Если передан onClick — рендерится кнопкой с hover/стрелкой.
function KpiCard({ icon: Icon, iconClass, label, value, footer, onClick }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`group text-left bg-[#15141d]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-5 flex flex-col justify-between ${
        onClick ? 'hover:border-white/25 hover:bg-white/[0.04] transition-all cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm flex items-center gap-1">
            {label}
            {onClick && <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-white group-hover:translate-x-0.5 transition-all" />}
          </p>
          <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
        </div>
        <div className={`p-2 rounded-xl ${iconClass}`}>
          <Icon size={20} />
        </div>
      </div>
      <div className="mt-4 flex items-center text-xs">{footer}</div>
    </Comp>
  )
}

// Превью-список с кликабельным заголовком «Смотреть все».
function ListPanel({ title, titleIcon, items, renderItem, empty, onNavigate, viewAllLabel }) {
  return (
    <div className="bg-[#15141d]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-5 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-400 flex items-center gap-1.5">
          {titleIcon}
          {title}
        </h4>
        {onNavigate && (
          <button
            onClick={onNavigate}
            className="flex items-center gap-0.5 text-[11px] font-bold text-gray-500 hover:text-white transition-colors shrink-0"
          >
            {viewAllLabel}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto pr-2">
        {items?.length > 0 ? (
          <div className="space-y-3">{items.map(renderItem)}</div>
        ) : (
          <div className="text-center py-8 text-sm text-gray-500">{empty}</div>
        )}
      </div>
    </div>
  )
}
