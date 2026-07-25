import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/public/gmail/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const origin = `${url.protocol}//${url.host}`;

        const finish = (msg: string, ok: boolean) =>
          new Response(html(msg, ok, origin), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

        if (error) return finish(`Google returned: ${error}`, false);
        if (!code || !state) return finish("Missing code or state.", false);

        const { verifyState, exchangeCode, fetchUserInfo, callbackRedirectUri } = await import("@/lib/gmail.server");
        const parsed = verifyState(state);
        if (!parsed) return finish("Invalid or expired authorization state.", false);

        try {
          const tokens = await exchangeCode(code, callbackRedirectUri(origin));
          if (!tokens.refresh_token) {
            return finish("Google did not return a refresh token. Try again and approve all requested permissions.", false);
          }
          const info = await fetchUserInfo(tokens.access_token);
          const email = info.email;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Does this user already have any accounts? If not, this one becomes default.
          const { count: existingCount } = await supabaseAdmin
            .from("gmail_connections")
            .select("id", { count: "exact", head: true })
            .eq("user_id", parsed.userId);
          const shouldBeDefault = !existingCount || existingCount === 0;

          const { error: upErr } = await supabaseAdmin
            .from("gmail_connections")
            .upsert(
              {
                user_id: parsed.userId,
                gmail_email: email,
                refresh_token: tokens.refresh_token,
                access_token: tokens.access_token,
                expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
                scope: tokens.scope,
                full_name: info.name ?? null,
                avatar_url: info.picture ?? null,
                is_default: shouldBeDefault,
                reads_enabled: /gmail\.readonly/.test(tokens.scope ?? ""),
              },
              { onConflict: "user_id,gmail_email" },
            );
          if (upErr) return finish(`Failed to save Gmail connection: ${upErr.message}`, false);
          return finish(`Connected ${email}. You can close this tab.`, true);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return finish(`Connection failed: ${msg}`, false);
        }
      },
    },
  },
});

function html(message: string, ok: boolean, origin: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Gmail connection</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0f172a;color:#f8fafc;display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:420px;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;text-align:center}
h1{font-size:18px;margin:0 0 8px}p{color:#94a3b8;font-size:14px;margin:0 0 16px}
a{display:inline-block;background:#6366f1;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px}</style>
</head><body><div class="card">
<h1>${ok ? "Gmail connected" : "Connection issue"}</h1>
<p>${escapeHtml(message)}</p>
<a href="${origin}/settings">Back to Settings</a>
</div></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}