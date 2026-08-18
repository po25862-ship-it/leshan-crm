const API_KEY_STORAGE = "leshan_gemini_api_key";
const DEFAULT_MODEL = "gemini-3.5-flash";

export function getGeminiApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || "";
}

export function saveGeminiApiKey(key) {
  const value = String(key || "").trim();
  if (value) localStorage.setItem(API_KEY_STORAGE, value);
  else localStorage.removeItem(API_KEY_STORAGE);
}

export async function askGemini({ apiKey, prompt, model = DEFAULT_MODEL }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 1200 },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "AI 服務暫時無法使用");
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n").trim();
}
