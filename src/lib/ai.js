const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY

export const getAIResponse = async (prompt, language = 'en') => {
  // 1. Try Google Gemini first (Smartest)
  if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10) {
    try {
      const systemInstruction = `You are a creative muse for an artist. Give concise, inspiring, and professional advice in ${language}. Focus on composition, colors, and artistic growth. Respond only with the advice text.`
      
      // Using gemini-1.5-flash-latest which is more stable and often resolves 404s
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          system_instruction: { parts: [{ text: systemInstruction }] }
        })
      })

      if (response.ok) {
        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) return text.trim()
      } else {
        const errData = await response.json()
        console.error("Gemini API Error:", errData)
      }
    } catch (e) {
      console.warn("Gemini Connection Error:", e)
    }
  }

  // 2. Fallback to Pollinations (Unified API)
  try {
    const encodedPrompt = encodeURIComponent(prompt)
    const system = encodeURIComponent(`You are a creative muse. Give concise, inspiring advice in ${language}. Respond only with the advice.`)
    
    // Using gen.pollinations.ai as it is the current official unified endpoint
    const url = `https://text.pollinations.ai/${encodedPrompt}?system=${system}`
    
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Pollinations Status: ${response.status}`)
    
    const text = await response.text()
    // Clean up if the service still returns some junk
    if (text.includes("IMPORTANT NOTICE")) {
       return "I'm currently recalibrating my creative frequencies. Please try again in a moment!"
    }
    return text.trim() || "I'm feeling a bit silent today. Try again!"
  } catch (error) {
    console.error("AI Fallback Failure:", error)
    return "Sorry, I'm having trouble connecting to my creative brain right now. Please try again."
  }
}

/**
 * Enhances a simple prompt with artistic keywords for better results.
 */
const enhancePrompt = (prompt) => {
  const suffixes = [
    "highly detailed oil painting, fine art, masterpiece, realistic textures, cinematic lighting",
    "vibrant colors, sharp focus, 8k resolution, artistic composition",
    "soft brushstrokes, elegant lighting, professional gallery style, expressive"
  ]
  const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)]
  return `${prompt}, ${randomSuffix}`
}

export const generateImage = async (prompt) => {
  const enhancedPrompt = enhancePrompt(prompt)
  const encodedPrompt = encodeURIComponent(enhancedPrompt)
  const seed = Math.floor(Math.random() * 1000000)
  
  // Using the most basic and reliable URL format to avoid 500 errors
  return `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${seed}`
}
