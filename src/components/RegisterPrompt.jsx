import { Sparkles, ArrowRight, LogIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlassModal, GlassModalHeader } from './GlassModal'

/*
  Приглашение зарегистрироваться. Показывается, когда гость (неавторизованный
  посетитель) пробует действие, требующее аккаунта — лайк, комментарий,
  подписку, сообщение и т.п. Контекст просмотра при этом сохраняется: модалка
  просто наложена поверх ленты/поста.

  @param reason   — короткий текст, поясняющий, ради чего регистрироваться
                    (например, «чтобы ставить лайки»). Опционально.
  @param onLogin  — открыть форму входа.
  @param onSignup — открыть форму регистрации.
  @param onClose  — закрыть и вернуться к просмотру.
*/
export function RegisterPrompt({ reason, onLogin, onSignup, onClose }) {
  const { t } = useTranslation()

  return (
    <GlassModal onClose={onClose} maxWidth="max-w-sm" z="z-[300]">
      <GlassModalHeader
        icon={<Sparkles className="w-4 h-4" />}
        title={t('guest_join_title', 'Присоединяйтесь к Creativity')}
        subtitle={reason || t('guest_join_subtitle', 'Создайте аккаунт, чтобы взаимодействовать')}
      />

      <p className="text-sm text-gray-400 leading-relaxed mb-6">
        {t(
          'guest_join_body',
          'Лайки, комментарии, подписки и сообщения доступны участникам. Регистрация занимает меньше минуты.'
        )}
      </p>

      <div className="space-y-3">
        <button
          onClick={onSignup}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black uppercase tracking-wider text-white bg-purple-600 hover:bg-purple-500 transition-all active:scale-[0.98] group"
        >
          {t('guest_signup_cta', 'Зарегистрироваться')}
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>

        <button
          onClick={onLogin}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-gray-300 bg-white/[0.04] hover:bg-white/10 border border-white/10 transition-all active:scale-[0.98]"
        >
          <LogIn className="w-4 h-4" />
          {t('guest_login_cta', 'У меня уже есть аккаунт')}
        </button>

        <button
          onClick={onClose}
          className="w-full py-2 text-xs font-bold text-gray-500 hover:text-gray-300 transition-colors"
        >
          {t('guest_keep_browsing', 'Продолжить просмотр')}
        </button>
      </div>
    </GlassModal>
  )
}
