const SYSTEM_PROMPT =
  "You are an expert agronomy assistant for small farms. Give concise, practical guidance on irrigation, soil moisture, crop care, pests, and fertilizer. Use bullet points when listing steps.";

function getGeminiConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() || "",
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",
  };
}

function isGeminiConfigured() {
  return Boolean(getGeminiConfig().apiKey);
}

async function generateGeminiReply(message) {
  const { apiKey, model } = getGeminiConfig();

  if (!apiKey) {
    return "I can help with irrigation, soil moisture, pests, and fertilizer schedules. Add GEMINI_API_KEY in backend/.env for full AI responses (free key from Google AI Studio).";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: message }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0.7,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const apiMessage = data?.error?.message || `HTTP ${response.status}`;
      console.error("[chat] Gemini error:", apiMessage);
      throw new Error(apiMessage);
    }

    const parts = data?.candidates?.[0]?.content?.parts;
    const text = parts?.map((part) => part.text).filter(Boolean).join("\n").trim();

    if (text) {
      return text;
    }

    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(`Response blocked: ${blockReason}`);
    }

    return "I could not parse an AI response. Please try again.";
  } catch (error) {
    console.error("[chat] Gemini request failed:", error.message);
    return `AI service is temporarily unavailable (${error.message}). Check GEMINI_API_KEY and your network connection.`;
  }
}

module.exports = { generateGeminiReply, isGeminiConfigured, getGeminiConfig };
