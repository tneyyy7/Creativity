import { useState } from 'react'
import { Flag, Loader2, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { reportContent } from '../lib/supabase'
import {
  GlassModal,
  GlassModalHeader,
  glassSectionLabel,
  glassOption,
  glassOptionActive,
  glassInput,
  glassActionBase,
  glassActionDanger,
} from './GlassModal'

const REASONS = [
  { key: 'spam', label: 'reason_spam' },
  { key: 'inappropriate', label: 'reason_inappropriate' },
  { key: 'harassment', label: 'reason_harassment' },
  { key: 'nsfw', label: 'reason_nsfw' },
  { key: 'copyright', label: 'reason_copyright' },
  { key: 'other', label: 'reason_other' },
]

// Shared report dialog for posts, users, and comments.
export function ReportModal({ targetType, targetId, reporterId, onClose }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!reason || submitting) return
    setSubmitting(true)
    setError('')
    const res = await reportContent({
      reporterId,
      targetType,
      targetId,
      reason,
      details: details.trim() || null,
    })
    setSubmitting(false)
    if (res.ok) {
      setDone(true)
      setTimeout(onClose, 1400)
    } else if (res.alreadyReported) {
      setError(t('already_reported'))
    } else {
      setError(t('already_reported'))
    }
  }

  return (
    <GlassModal onClose={onClose} z="z-[300]">
      <GlassModalHeader
        icon={<Flag className="w-4 h-4" />}
        iconClass="bg-red-500/15 border border-red-400/30 text-red-300"
        title={t('report_title')}
        subtitle={t('report_subtitle')}
      />

      {done ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-green-500/15 border border-green-400/30 flex items-center justify-center text-green-300">
            <Check className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-white">{t('report_submitted')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className={glassSectionLabel}>{t('report_reason')}</p>
            <div className="grid grid-cols-1 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setReason(r.key)}
                  className={`${glassOption} ${reason === r.key ? glassOptionActive : ''}`}
                >
                  {t(r.label)}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={t('report_details_placeholder')}
            rows={3}
            className={`${glassInput} resize-none`}
          />

          {error && <p className="text-[11px] text-red-300 font-semibold">{error}</p>}

          <button
            onClick={submit}
            disabled={!reason || submitting}
            className={`${glassActionBase} ${glassActionDanger}`}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
            <span>{t('report_submit')}</span>
          </button>
        </div>
      )}
    </GlassModal>
  )
}
