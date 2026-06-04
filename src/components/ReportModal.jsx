import { useState } from 'react'
import { X, Flag, Loader2, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { reportContent } from '../lib/supabase'

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
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-md rounded-3xl border-white/10 p-6 space-y-5 bg-[#12111a]/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <Flag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white tracking-tight">{t('report_title')}</h3>
              <p className="text-[11px] text-gray-500">{t('report_subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
              <Check className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-white">{t('report_submitted')}</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">{t('report_reason')}</p>
              <div className="grid grid-cols-1 gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setReason(r.key)}
                    className={`text-left px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      reason === r.key
                        ? 'bg-purple-600/20 border-purple-500/50 text-white'
                        : 'bg-white/[0.02] border-white/5 text-gray-400 hover:text-white hover:border-white/10'
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
              className="w-full bg-[#0d0c13] border border-white/5 focus:border-purple-500/50 focus:outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 resize-none"
            />

            {error && <p className="text-[11px] text-red-400 font-bold">{error}</p>}

            <button
              onClick={submit}
              disabled={!reason || submitting}
              className="w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
              <span>{t('report_submit')}</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}
