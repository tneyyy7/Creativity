export const getAIResponse = async (prompt, language = 'en') => {
  try {
    const encodedPrompt = encodeURIComponent(prompt)
    const systemInstruction = encodeURIComponent(`You are a creative muse. Give concise, inspiring advice in ${language}. Respond only with the advice.`)
    
    // Switching to mistral as it's more stable for text generation on pollinations
    const url = `https://text.pollinations.ai/${encodedPrompt}?system=${systemInstruction}&model=mistral`
    
    const response = await fetch(url)

    if (!response.ok) throw new Error("AI provider error")
    
    const text = await response.text()
    return text.trim() || "I'm feeling a bit silent today. Try again!"
  } catch (error) {
    console.error("AI Error:", error)
    return "Sorry, I'm having trouble connecting to my creative brain right now. Please try again."
  }
}

export const generateImage = async (prompt) => {
  // Using the absolute cleanest URL format for image.pollinations.ai
  const encodedPrompt = encodeURIComponent(prompt)
  const seed = Math.floor(Math.random() * 1000000)
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`
}
