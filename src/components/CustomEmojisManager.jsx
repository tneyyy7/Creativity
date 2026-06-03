import { useState, useEffect, useRef } from 'react'
import { Smile, Upload, Trash2, Plus, Gem, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchCustomEmojis, uploadCustomEmoji, deleteCustomEmoji, convertHeicToJpeg } from '../lib/supabase'

export function CustomEmojisManager({ userId, isPro }) {
  const { t } = useTranslation()
  const [emojis, setEmojis] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [emojiName, setEmojiName] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [croppedBlob, setCroppedBlob] = useState(null)
  const [message, setMessage] = useState({ type: '', text: '' })
  
  const fileInputRef = useRef(null)

  const EMOJI_LIMIT = 50

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    loadEmojis()
  }, [userId])

  const loadEmojis = async () => {
    try {
      setLoading(true)
      const data = await fetchCustomEmojis(userId)
      setEmojis(data || [])
    } catch (err) {
      console.error('Error loading custom emojis:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle file selection and crop it in Canvas
  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const nameLower = file.name.toLowerCase()
    const isHeic = nameLower.endsWith('.heic') || nameLower.endsWith('.heif')

    if (!file.type.startsWith('image/') && !isHeic) {
      setMessage({ type: 'error', text: t('invalid_image', 'Пожалуйста, выберите правильный файл изображения.') })
      return
    }

    try {
      setMessage({ type: '', text: '' })
      let processedFile = file

      if (isHeic) {
        setMessage({ type: 'success', text: t('heic_converting') })
        processedFile = await convertHeicToJpeg(file)
        setMessage({ type: '', text: '' })
      }

      setSelectedFile(processedFile)

      const reader = new FileReader()
      reader.onerror = (err) => {
        console.error('FileReader error:', err)
        setMessage({ type: 'error', text: `${t('file_read_error')}: ${err.message || err}` })
      }
      reader.onload = (event) => {
        try {
          const img = new Image()
          img.onerror = (err) => {
            console.error('Image load error:', err)
            setMessage({ type: 'error', text: t('image_load_error') })
          }
          img.onload = () => {
            try {
              // Perform square cropping and scaling to 128x128 using HTML5 Canvas in memory
              const canvas = document.createElement('canvas')
              const ctx = canvas.getContext('2d')
              if (!ctx) {
                setMessage({ type: 'error', text: t('canvas_context_error') })
                return
              }
              
              const size = 128
              canvas.width = size
              canvas.height = size

              // Calculate source cropping coordinates (center square)
              const sourceSize = Math.min(img.width, img.height)
              const sourceX = (img.width - sourceSize) / 2
              const sourceY = (img.height - sourceSize) / 2

              // Draw image onto canvas
              ctx.clearRect(0, 0, size, size)
              ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size)

              // Convert canvas to data URL for preview
              const dataUrl = canvas.toDataURL('image/png')
              setPreviewUrl(dataUrl)

              // Convert canvas to Blob for uploading
              if (typeof canvas.toBlob === 'function') {
                canvas.toBlob((blob) => {
                  setCroppedBlob(blob)
                }, 'image/png')
              } else {
                // Fallback for environment lacking canvas.toBlob
                const binStr = atob(dataUrl.split(',')[1])
                const len = binStr.length
                const arr = new Uint8Array(len)
                for (let i = 0; i < len; i++) {
                  arr[i] = binStr.charCodeAt(i)
                }
                const blob = new Blob([arr], { type: 'image/png' })
                setCroppedBlob(blob)
              }

              // Suggest a name based on file name (lowercase, alphanumeric, underscores)
              const suggestedName = file.name
                .split('.')[0]
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '_')
                .substring(0, 20)
              setEmojiName(suggestedName)
            } catch (canvasErr) {
              console.error('Canvas processing error:', canvasErr)
              setMessage({ type: 'error', text: `${t('canvas_process_error')}: ${canvasErr.message || canvasErr}` })
            }
          }
          img.src = event.target.result
        } catch (readerOnloadErr) {
          console.error('Reader onload error:', readerOnloadErr)
          setMessage({ type: 'error', text: `${t('content_read_error')}: ${readerOnloadErr.message || readerOnloadErr}` })
        }
      }
      reader.readAsDataURL(processedFile)
    } catch (heicErr) {
      console.error('HEIC conversion failed:', heicErr)
      setMessage({ type: 'error', text: `${t('heic_convert_error')}: ${heicErr.message || heicErr}` })
    }
  }

  const handleUpload = async () => {
    if (!userId || !croppedBlob || !emojiName) return

    if (!isPro) {
      setMessage({ type: 'error', text: t('pro_required_emoji', 'Требуется активная подписка Pro для создания эмодзи.') })
      return
    }

    if (emojis.length >= EMOJI_LIMIT) {
      setMessage({ type: 'error', text: t('emoji_limit_reached') })
      return
    }

    // Validate emoji name shortcode
    const validNamePattern = /^[a-z0-9_]{2,20}$/
    if (!validNamePattern.test(emojiName)) {
      setMessage({ type: 'error', text: t('emoji_name_invalid') })
      return
    }

    try {
      setUploading(true)
      setMessage({ type: '', text: '' })
      
      const fileExt = 'png'
      const croppedFile = new File([croppedBlob], `${emojiName}.${fileExt}`, { type: 'image/png' })
      
      await uploadCustomEmoji(userId, emojiName, croppedFile)
      
      // Reset form
      setEmojiName('')
      setPreviewUrl(null)
      setSelectedFile(null)
      setCroppedBlob(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      
      setMessage({ type: 'success', text: t('emoji_created') })
      loadEmojis()
      
      // Auto-clear message
      setTimeout(() => setMessage({ type: '', text: '' }), 4000)
    } catch (err) {
      console.error('Error uploading emoji:', err)
      setMessage({ type: 'error', text: t('emoji_upload_failed') })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (emojiId) => {
    if (!window.confirm(t('emoji_delete_confirm'))) return

    try {
      await deleteCustomEmoji(emojiId)
      setEmojis(prev => prev.filter(e => e.id !== emojiId))
      setMessage({ type: 'success', text: t('emoji_deleted') })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    } catch (err) {
      console.error('Error deleting emoji:', err)
      setMessage({ type: 'error', text: t('emoji_delete_failed') })
    }
  }

  return (
    <div className="glass-card p-6 md:p-8 border-white/5 space-y-8">
      {/* Header */}
      <div className="border-b border-white/5 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
            <Smile className="w-6 h-6 text-cyan-400" /> {t('pro_comp_emojis', 'Кастомные эмодзи')}
          </h2>
          <p className="text-gray-400 text-xs md:text-sm mt-1">
            {t('emoji_desc')}
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-center flex-shrink-0">
          <span className="text-xs font-black text-gray-400 block uppercase tracking-wider">{t('used')}</span>
          <span className="text-lg font-black text-white">
            {emojis.length} <span className="text-gray-500 text-sm">/ {EMOJI_LIMIT}</span>
          </span>
        </div>
      </div>

      {/* Message Banner */}
      {message.text && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border ${
          message.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span className="font-semibold text-sm">{message.text}</span>
        </div>
      )}

      {/* Upload area */}
      {isPro ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-white/[0.01] p-6 rounded-2xl border border-white/5">
          {/* Uploader Left */}
          <div className="md:col-span-4 flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-cyan-500/40 rounded-2xl p-6 transition-all relative group cursor-pointer h-44"
               onClick={() => fileInputRef.current?.click()}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            {previewUrl ? (
              <div className="text-center space-y-2">
                <img src={previewUrl} alt="Cropped Preview" className="w-20 h-20 rounded-xl object-cover border border-cyan-500/30 shadow-md shadow-cyan-500/10 mx-auto" />
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">{t('click_to_replace')}</span>
              </div>
            ) : (
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto group-hover:bg-cyan-500/10 transition-colors">
                  <Upload className="w-6 h-6 text-gray-400 group-hover:text-cyan-400" />
                </div>
                <div>
                  <span className="text-xs font-black text-white block">{t('choose_image')}</span>
                  <span className="text-[10px] text-gray-500 block mt-0.5">{t('image_format_hint')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Form Right */}
          <div className="md:col-span-8 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <label className="text-xs font-black text-white uppercase tracking-wider block">{t('emoji_shortcode_label')}</label>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus-within:border-cyan-500 transition-all">
                <span className="text-gray-500 font-bold select-none mr-1">:</span>
                <input
                  type="text"
                  value={emojiName}
                  onChange={(e) => setEmojiName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  placeholder="cool_cat"
                  className="bg-transparent border-0 w-full text-white text-sm focus:outline-none placeholder-gray-600"
                  disabled={!previewUrl}
                />
                <span className="text-gray-500 font-bold select-none ml-1">:</span>
              </div>
              <p className="text-[10px] text-gray-500 leading-normal">
                {t('emoji_shortcode_hint')} <code className="text-cyan-400">smile_happy</code>.
              </p>
            </div>

            <button
              data-lg-fx
              onClick={handleUpload}
              disabled={uploading || !croppedBlob || !emojiName}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-500/10 disabled:text-gray-500 text-neutral-900 font-black py-3.5 rounded-xl transition-all text-sm shadow-[0_4px_20px_rgba(34,211,238,0.2)] flex items-center justify-center gap-2"
            >
              {uploading ? t('uploading') : (
                <>
                  <Plus className="w-4 h-4" /> {t('create_emoji')}
                </>
              )}
          </button>
        </div>
      </div>
      ) : (
        <div className="p-6 bg-amber-500/5 rounded-2xl border border-amber-500/10 flex items-center gap-4 text-amber-400 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{t('emoji_pro_required_banner')}</span>
        </div>
      )}

      {/* Grid of emojis */}
      <div className="space-y-4">
        <h3 className="text-xs font-black text-white uppercase tracking-widest">{t('my_collection')}</h3>
        
        {loading ? (
          <div className="h-20 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-cyan-400"></div>
          </div>
        ) : emojis.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-4">
            {emojis.map((emoji) => (
              <div
                key={emoji.id}
                className="glass-card p-3 border-white/5 hover:border-cyan-500/30 flex flex-col items-center justify-center relative group transition-all duration-300"
              >
                {/* Delete button (hover only) */}
                <button
                  onClick={() => handleDelete(emoji.id)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-400 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md shadow-red-900/40 z-10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                
                <img
                  src={emoji.image_url}
                  alt={emoji.name}
                  className="w-12 h-12 object-contain rounded-md"
                />
                
                <span className="text-[10px] text-gray-400 font-bold mt-2 truncate w-full text-center select-all notranslate" translate="no">
                  :{emoji.name}:
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-white/[0.01] rounded-2xl border border-white/5">
            <Smile className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t('no_custom_emojis')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
