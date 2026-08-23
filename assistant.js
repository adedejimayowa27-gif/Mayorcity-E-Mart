// assistant.js — Mayorcity E-Mart support chat widget.
// Deliberately standalone: creates its OWN Supabase client from the already-global
// window.SUPABASE_URL / window.SUPABASE_ANON_KEY (set by config.js) rather than
// importing anything from script.js, so this file can never break the main app.
// Calls /.netlify/functions/ai-assistant, which proxies to Groq.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_CONFIGURED = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
const supabase = SUPABASE_CONFIGURED
  ? createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

const SYSTEM_PROMPT_BASE = `You are the Mayorcity E-Mart support assistant. You help students
using the campus marketplace with practical questions — especially "why can't I do X"
questions about listing items, payments, and account verification.

About Mayorcity E-Mart:
- Mayorcity E-Mart is owned and run by a single person, Adedeji Mayowa — not a team or
  company. If asked who owns/runs the site, or to speak to "the team", say it's run by
  Adedeji Mayowa, not a team.
- Official support email: officialmayorcity@gmail.com
- Official support phone/WhatsApp: 09150434157 (also reachable on WhatsApp).
- If a user needs help beyond what you can resolve (e.g. account suspended, a dispute,
  something you don't have data for), point them to the email or WhatsApp number above.
  Never invent a different contact method.

Ground rules:
- Be concise and direct. This is a chat widget, not an essay.
- If you are given the user's real verification_status and/or payment status below, use it
  to give a SPECIFIC diagnosis, not a generic checklist. E.g. if verification_status is
  "pending", tell them their student ID is still under review — don't tell them to "check if
  they're verified" as if you don't know.
- verification_status meanings: "pending" = ID submitted, awaiting review; "verified" = can
  list items; "rejected" = ID was rejected, they need to resubmit a clearer photo; "suspended"
  = account suspended, direct them to contact support/admin.
- Only verified users can create marketplace listings — this is enforced by the platform
  itself (Supabase Row Level Security), not just a suggestion.
- If no verification/payment status was provided below, it means the user isn't signed in or
  the data wasn't available — ask them to make sure they're signed in, rather than guessing.
- Never invent order numbers, dates, or amounts you were not given.`;

function buildSystemPrompt(context) {
  if (!context) return SYSTEM_PROMPT_BASE;
  const lines = [SYSTEM_PROMPT_BASE, '', 'Current signed-in user context:'];
  if (context.fullName) lines.push(`- Name: ${context.fullName}`);
  if (context.verificationStatus) lines.push(`- verification_status: ${context.verificationStatus}`);
  if (context.latestPaymentStatus) lines.push(`- latest payment status: ${context.latestPaymentStatus}`);
  if (!context.verificationStatus && !context.latestPaymentStatus) {
    lines.push('- (no profile/payment data available)');
  }
  return lines.join('\n');
}

async function getUserContext() {
  if (!supabase) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const context = { fullName: '', verificationStatus: '', latestPaymentStatus: '' };

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, verification_status')
      .eq('id', user.id)
      .maybeSingle();
    if (profile) {
      context.fullName = profile.full_name || '';
      context.verificationStatus = profile.verification_status || '';
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('status, created_at')
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (payment) context.latestPaymentStatus = payment.status || '';

    return context;
  } catch (err) {
    console.warn('Assistant: could not load user context', err);
    return null;
  }
}

// ── Minimal chat widget UI, injected via JS so index.html only needs one <script> tag ──
function injectWidgetMarkup() {
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.id = 'assistant-launcher';
  launcher.setAttribute('aria-label', 'Open support chat');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.innerHTML = `
    <span id="assistant-launcher-icon">💬</span>
    <span id="assistant-launcher-label">AI Assistant</span>
  `;
  document.body.appendChild(launcher);

  const panel = document.createElement('div');
  panel.id = 'assistant-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div id="assistant-panel-header">
      <span>E-Mart Support</span>
      <button type="button" id="assistant-close-btn" aria-label="Close chat">✕</button>
    </div>
    <div id="assistant-messages"></div>
    <form id="assistant-form">
      <input type="text" id="assistant-input" placeholder="Ask a question…" autocomplete="off" />
      <button type="submit" id="assistant-send-btn">Send</button>
    </form>
  `;
  document.body.appendChild(panel);

  return { launcher, panel };
}

function appendMessage(container, role, text) {
  const bubble = document.createElement('div');
  bubble.className = `assistant-msg assistant-msg-${role}`;
  bubble.textContent = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function initWidget() {
  const { launcher, panel } = injectWidgetMarkup();
  const launcherIcon = launcher.querySelector('#assistant-launcher-icon');
  const messagesEl = panel.querySelector('#assistant-messages');
  const formEl = panel.querySelector('#assistant-form');
  const inputEl = panel.querySelector('#assistant-input');
  const closeBtn = panel.querySelector('#assistant-close-btn');

  const history = []; // [{role, content}]
  let contextPromise = null;
  let greeted = false;

  function openPanel() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    launcher.setAttribute('aria-label', 'Close support chat');
    if (launcherIcon) launcherIcon.textContent = '✕';
    if (!contextPromise) contextPromise = getUserContext();
    if (!greeted) {
      greeted = true;
      appendMessage(messagesEl, 'assistant', "Hi! Ask me things like \"why can't I list an item?\" or \"why is my payment stuck?\" — I'll check your account status.");
    }
    inputEl.focus();
  }

  function closePanel() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Open support chat');
    if (launcherIcon) launcherIcon.textContent = '💬';
  }

  launcher.addEventListener('click', () => {
    if (panel.hidden) openPanel(); else closePanel();
  });

  closeBtn.addEventListener('click', closePanel);

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = inputEl.value.trim();
    if (!question) return;
    inputEl.value = '';
    inputEl.disabled = true;

    appendMessage(messagesEl, 'user', question);
    history.push({ role: 'user', content: question });
    const thinkingBubble = appendMessage(messagesEl, 'assistant', 'Thinking…');

    try {
      const context = await contextPromise;
      const resp = await fetch('/.netlify/functions/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: buildSystemPrompt(context),
          messages: history
        })
      });
      const data = await resp.json();
      const answer = (data?.content?.[0]?.text) || data?.error || "Sorry, I couldn't get a response.";
      thinkingBubble.textContent = answer;
      history.push({ role: 'assistant', content: answer });
    } catch (err) {
      thinkingBubble.textContent = 'Something went wrong reaching support chat. Please try again.';
      console.warn('Assistant request failed', err);
    } finally {
      inputEl.disabled = false;
      inputEl.focus();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWidget);
} else {
  initWidget();
}
