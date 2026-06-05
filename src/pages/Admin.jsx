import { useState } from 'react'
import { AdminLayout } from './admin/AdminLayout'

export function Admin({ onOpenPost, onViewProfile, adminRole }) {
  const [activeTab, setActiveTab] = useState('reports')

  return (
    <AdminLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onOpenPost={onOpenPost}
      onViewProfile={onViewProfile}
      adminRole={adminRole}
    />
  )
}
