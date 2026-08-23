// netlify/functions/ai-assistant.js
// Mayorcity E-Mart support assistant. Proxies chat requests to the Groq API
// (OpenAI-compatible) so the API key never reaches the browser. Reuses the same
// GROQ_API_KEY already set up for the Mayorcity B&F AI project — just add it to
// THIS site's Netlify Environment Variables too (Site settings → Environment variables).
// The frontend (site/js/assistant.js) is responsible for building the "system"
// prompt with the logged-in user's real verification/payment status pulled from
// Supabase, so answers are personalized rather than generic FAQ text.

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
// Groq's vision-capable lineup changes often; qwen/qwen3.6-27b is current as of Aug 2026 but is a
// PREVIEW model (Groq can discontinue preview models at short notice). If image attachments start
// failing, check https://console.groq.com/docs/vision for the current model and update this.
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "GROQ_API_KEY is not set on the server." })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  const { system, messages, image } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "messages[] is required." }) };
  }

  // Build the OpenAI-compatible message list. Every turn is plain text except the final
  // (current) user turn, which becomes a multimodal [text, image_url] array if an image
  // was attached — Groq (like OpenAI) only expects image content on the turns that have one.
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
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: data?.error?.message || `Groq API error (model: ${model}).` })
      };
    }

    const text = (data?.choices?.[0]?.message?.content || "").trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: [{ text: text || "Sorry, I couldn't generate a response." }] })
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Failed to reach Groq API: " + err.message })
    };
  }
};
