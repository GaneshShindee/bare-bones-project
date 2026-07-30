import { createFileRoute } from "@tanstack/react-router";
import { parseUserAgent } from "@/lib/user-agent";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/track/pdf/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = String(params.token ?? "");
        if (!UUID_RE.test(token)) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rec } = await supabaseAdmin
          .from("email_recipients")
          .select("id, user_id, email_history_id")
          .eq("pdf_tracking_token", token)
          .maybeSingle();
        if (!rec) return new Response("Not found", { status: 404 });

        // Look up the primary attached resume for this campaign.
        const { data: hist } = await supabaseAdmin
          .from("email_history")
          .select("attachments")
          .eq("id", rec.email_history_id)
          .maybeSingle();
        const atts = Array.isArray(hist?.attachments) ? (hist!.attachments as Array<{ name?: string; source?: string }>) : [];
        const pdfName = atts.find((a) => /\.pdf$/i.test(a.name ?? ""))?.name ?? atts[0]?.name ?? null;

        // Log the event (never fail the redirect).
        try {
          const h = request.headers;
          const uaRaw = h.get("user-agent");
          const ua = parseUserAgent(uaRaw);
          const ip =
            h.get("cf-connecting-ip") ??
            h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            h.get("x-real-ip") ??
            null;
          await supabaseAdmin.from("pdf_events").insert({
            user_id: rec.user_id,
            email_history_id: rec.email_history_id,
            email_recipient_id: rec.id,
            tracking_token: token,
            filename: pdfName,
            event_type: "view",
            ip,
            user_agent: uaRaw ?? null,
            device_type: ua.deviceType,
            browser: ua.browser,
            os: ua.os,
            country: h.get("cf-ipcountry") ?? null,
            city: h.get("cf-ipcity") ?? null,
            region: h.get("cf-region") ?? null,
          });
        } catch { /* ignore */ }

        // Try to return a signed URL redirect for the first PDF resume from this user.
        try {
          const { data: resumes } = await supabaseAdmin
            .from("resumes")
            .select("storage_path, original_filename, mime_type")
            .eq("user_id", rec.user_id)
            .eq("original_filename", pdfName ?? "");
          const row = resumes?.[0];
          if (row) {
            const signed = await supabaseAdmin.storage.from("resumes").createSignedUrl(row.storage_path, 60 * 30);
            if (signed.data?.signedUrl) {
              return new Response(null, { status: 302, headers: { Location: signed.data.signedUrl } });
            }
          }
        } catch { /* ignore */ }

        return new Response(
          `<!doctype html><html><body style="font-family:system-ui;padding:2rem"><h2>Resume opened</h2><p>Thanks — the sender has been notified you viewed the attachment.</p></body></html>`,
          { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      },
    },
  },
});