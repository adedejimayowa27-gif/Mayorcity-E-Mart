// ─── Config ─────────────────────────────────────────────────────────────
// These are Supabase public (anon) credentials — safe to serve to the browser.
// Security is enforced via Supabase Row Level Security policies.
window.SUPABASE_URL      = "https://dnsdftescwyepyospezg.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_Tz6vcwt_IK4aHI1ylaAt1A_aQfTqWq_";
window.ADMIN_EMAIL       = "adedejimayowa27@gmail.com";

// Flutterwave PUBLIC key only — safe to expose in the browser (it can only
// start a payment, never verify or refund one). Get this from:
// Flutterwave Dashboard → Settings → API Keys.
// Use the "Test" key first to make sure everything works before going live.
window.FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK-70e7b652bc00ffd3064e6529157df441-X";

// Web Push VAPID public key — safe to expose in the browser (it can only be
// used to subscribe a device, never to send a push; the matching private key
// stays only in the send-push-notification Edge Function's secrets).
window.VAPID_PUBLIC_KEY = "BGBSAOFytefo5f0JDXWmn3CZLpmbw9DT-3CmmRtUDu1D9A_qETnKMWKPbUh31xwQaISaVsUWzQTQyHfcqjgb_Zo";
