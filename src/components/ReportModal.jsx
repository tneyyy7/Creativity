import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Flag, Loader2, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { reportContent } from '../lib/supabase'
import { LiquidGlassButton } from './LiquidGlass'

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

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 font-sans"
      onClick={onClose}
    >
      <div
        className="lg-card w-full max-w-md p-6 space-y-5 animate-in zoom-in-95 fade-in duration-200"
        style={{ borderRadius: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-400/30 flex items-center justify-center text-red-300">
              <Flag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">{t('report_title')}</h3>
              <p className="text-[11px] text-gray-400">{t('report_subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-green-500/15 border border-green-400/30 flex items-center justify-center text-green-300">
              <Check className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-white">{t('report_submitted')}</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{t('report_reason')}</p>
              <div className="grid grid-cols-1 gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setReason(r.key)}
                    className={`lg-pill w-full text-left px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      reason === r.key ? 'lg-pill--active' : ''
                    }`}
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
              className="w-full bg-white/[0.04] border border-white/10 focus:border-red-400/50 focus:outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-gray-500 resize-none backdrop-blur-sm transition-colors"
            />

            {error && <p className="text-[11px] text-red-300 font-semibold">{error}</p>}

            <LiquidGlassButton
              onClick={submit}
              disabled={!reason || submitting}
              fullWidth
              className="lg--danger font-bold uppercase tracking-widest text-xs"
              config={{ radius: 18, padY: '0.9rem' }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
              <span>{t('report_submit')}</span>
            </LiquidGlassButton>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
