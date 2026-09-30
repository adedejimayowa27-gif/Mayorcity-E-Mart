// api/ai-assistant.js  (Vercel Serverless Function)
// Replaces netlify/functions/ai-assistant.js. Same request/response shape,
// so the frontend only needs its fetch URL changed to /api/ai-assistant.

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY is not set on the server." });
  }

  // Vercel parses JSON bodies automatically when Content-Type is application/json.
  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON body." });
    }
  }
  payload = payload || {};

  const { system, messages, image } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages[] is required." });
  }

  const chatMessages = [];
  if (system) chatMessages.push({ role: "system", content: system });

  messages.forEach((m, i) => {
    const role = m.role === "assistant" ? "assistant" : "user";
    const isLast = i === messages.length - 1;
    if (image && isLast && role === "user") {
      chatMessages.push({
        role: "user",
        content: [
          { type: "text", text: String(m.content || "") },
          { type: "image_url", image_url: { url: image } }
        ]
      });
    } else {
      chatMessages.push({ role, content: String(m.content || "") });
    }
  });

  const model = image ? GROQ_VISION_MODEL : GROQ_MODEL;

  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: chatMessages,
        max_completion_tokens: 1500
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: data?.error?.message || `Groq API error (model: ${model}).`
      });
    }

    const text = (data?.choices?.[0]?.message?.content || "").trim();

    return res.status(200).json({
      content: [{ text: text || "Sorry, I couldn't generate a response." }]
    });
  } catch (err) {
    return res.status(502).json({ error: "Failed to reach Groq API: " + err.message });
  }
};
