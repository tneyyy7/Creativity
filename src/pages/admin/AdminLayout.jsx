import { Suspense, lazy } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, Flag, Users, FileImage, CreditCard, ScrollText, Link2, Loader2 } from 'lucide-react'
import { AnimatedPillGroup } from '../../components/AnimatedPillGroup'

// Вкладки будут lazy-loading, так как админка может быть тяжелой
const ReportsQueue = lazy(() => import('./ReportsQueue').then(m => ({ default: m.ReportsQueue })))
const Dashboard = lazy(() => import('./Dashboard').then(m => ({ default: m.Dashboard })))
const UsersTab = lazy(() => import('./Users').then(m => ({ default: m.Users })))
const ContentTab = lazy(() => import('./Content').then(m => ({ default: m.Content })))
const SubscriptionsTab = lazy(() => import('./Subscriptions').then(m => ({ default: m.Subscriptions })))
const LogsTab = lazy(() => import('./Logs').then(m => ({ default: m.Logs })))
const ReferralsTab = lazy(() => import('./Referrals').then(m => ({ default: m.Referrals })))

// minRole — минимальная роль для доступа к вкладке (роль-иерархия ниже).
const TABS = [
  { id: 'dashboard', icon: Shield, label: 'Dashboard', minRole: 'moderator' },
  { id: 'reports', icon: Flag, label: 'Reports', minRole: 'moderator' },
  { id: 'users', icon: Users, label: 'Users', minRole: 'admin' },
  { id: 'content', icon: FileImage, label: 'Content', minRole: 'moderator' },
  { id: 'subscriptions', icon: CreditCard, label: 'Subscriptions', minRole: 'admin' },
  { id: 'referrals', icon: Link2, label: 'Referrals', minRole: 'admin' },
  { id: 'logs', icon: ScrollText, label: 'Logs', minRole: 'admin' }
]

const ROLE_RANK = { moderator: 1, admin: 2, superadmin: 3 }
const hasAccess = (role, minRole) => (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 0)

export function AdminLayout({ activeTab = 'reports', onTabChange, onViewProfile, onOpenPost, adminRole = 'superadmin' }) {
  const { t } = useTranslation()

  // Показываем только доступные текущей роли вкладки.
  const visibleTabs = TABS.filter(tab => hasAccess(adminRole, tab.minRole))

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-16 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3 bg-[#15141d]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-4">
        <div className="w-11 h-11 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">{t('admin_panel')}</h1>
          <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
            {TABS.find(tab => tab.id === activeTab)?.label || 'Administration'}
          </p>
        </div>
        {adminRole && (
          <span className="ml-auto px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-primary/20 border border-primary/40 text-primary">
            {adminRole}
          </span>
        )}
      </div>

      {/* Tabs Navigation */}
      <AnimatedPillGroup
        value={activeTab}
        onChange={onTabChange}
        options={visibleTabs.map(tab => ({
          value: tab.id,
          label: tab.label,
          icon: <tab.icon className="w-3.5 h-3.5" />,
        }))}
        containerClassName="flex flex-wrap items-center gap-2 p-1.5 bg-white/[0.03] border border-white/5 rounded-2xl w-fit max-w-full overflow-x-auto custom-scrollbar"
        buttonClassName="lg-pill flex items-center px-4 py-2 rounded-xl text-xs font-black tracking-tighter uppercase whitespace-nowrap"
        pillVariant="glass"
      />

      {/* Tab Content */}
      <div className="min-h-[400px]">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-purple-500" />
          </div>
        }>
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'reports' && (
            <ReportsQueue 
              onViewProfile={onViewProfile}
              onOpenPost={onOpenPost}
            />
          )}
          {activeTab === 'users' && (
            <UsersTab adminRole={adminRole} onViewProfile={onViewProfile} />
          )}
          {activeTab === 'content' && (
            <ContentTab onViewProfile={onViewProfile} />
          )}
          {activeTab === 'subscriptions' && (
            <SubscriptionsTab onViewProfile={onViewProfile} />
          )}
          {activeTab === 'referrals' && (
            <ReferralsTab onViewProfile={onViewProfile} />
          )}
          {activeTab === 'logs' && <LogsTab />}
        </Suspense>
      </div>
    </div>
  )
}
