import { useTranslation } from 'react-i18next'

export function Dashboard() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
       <div className="text-center py-20 bg-[#12111a]/20 border border-white/5 rounded-3xl p-8 max-w-md mx-auto space-y-3">
         <h3 className="text-base font-bold text-white">Dashboard</h3>
         <p className="text-xs text-gray-500">Overview metrics coming soon in Phase 2</p>
      </div>
    </div>
  )
}
