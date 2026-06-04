import { Suspense, lazy } from 'react'
import { useTranslation } from 'react-i18next'
import { Shield, Flag, Users, FileImage, CreditCard, ScrollText, Loader2 } from 'lucide-react'

// Вкладки будут lazy-loading, так как админка может быть тяжелой
const ReportsQueue = lazy(() => import('./ReportsQueue').then(m => ({ default: m.ReportsQueue })))
const Dashboard = lazy(() => import('./Dashboard').then(m => ({ default: m.Dashboard })))

const TABS = [
  { id: 'dashboard', icon: Shield, label: 'Dashboard' }, // Пока хардкодим лейблы для прототипа
  { id: 'reports', icon: Flag, label: 'Reports' },
  { id: 'users', icon: Users, label: 'Users' },
  { id: 'content', icon: FileImage, label: 'Content' },
  { id: 'subscriptions', icon: CreditCard, label: 'Subscriptions' },
  { id: 'logs', icon: ScrollText, label: 'Logs' }
]

export function AdminLayout({ activeTab = 'reports', onTabChange, onViewProfile, onOpenPost }) {
  const { t } = useTranslation()

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-16 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-purple-600/15 border border-purple-500/25 flex items-center justify-center text-purple-400">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">{t('admin_panel')}</h1>
          <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
            {TABS.find(tab => tab.id === activeTab)?.label || 'Administration'}
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 bg-white/[0.03] p-1.5 rounded-2xl border border-white/5 w-fit overflow-x-auto custom-scrollbar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black tracking-tighter transition-all ${
              activeTab === tab.id 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'text-white' : 'text-gray-500'}`} />
            <span className="uppercase">{tab.label}</span>
          </button>
        ))}
      </div>

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
            <div className="text-center py-20 bg-[#12111a]/20 border border-white/5 rounded-3xl p-8 max-w-md mx-auto space-y-3">
               <h3 className="text-base font-bold text-white">Users Management</h3>
               <p className="text-xs text-gray-500">Coming soon in Phase 3</p>
            </div>
          )}
          {activeTab === 'content' && (
             <div className="text-center py-20 bg-[#12111a]/20 border border-white/5 rounded-3xl p-8 max-w-md mx-auto space-y-3">
               <h3 className="text-base font-bold text-white">Content Moderation</h3>
               <p className="text-xs text-gray-500">Coming soon in Phase 4</p>
            </div>
          )}
          {activeTab === 'subscriptions' && (
             <div className="text-center py-20 bg-[#12111a]/20 border border-white/5 rounded-3xl p-8 max-w-md mx-auto space-y-3">
               <h3 className="text-base font-bold text-white">Subscriptions</h3>
               <p className="text-xs text-gray-500">Coming soon in Phase 5</p>
            </div>
          )}
           {activeTab === 'logs' && (
             <div className="text-center py-20 bg-[#12111a]/20 border border-white/5 rounded-3xl p-8 max-w-md mx-auto space-y-3">
               <h3 className="text-base font-bold text-white">Audit Logs</h3>
               <p className="text-xs text-gray-500">Coming soon</p>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
