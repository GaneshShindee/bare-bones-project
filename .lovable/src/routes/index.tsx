import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, History, LayoutTemplate } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Email Sender — Send Gmail emails from templates" },
      { name: "description", content: "Connect Gmail once, pick a template, fill the blanks, and send personalized emails from your own inbox in seconds." },
      { property: "og:title", content: "Smart Email Sender" },
      { property: "og:description", content: "Send personalized template emails directly from your Gmail in seconds." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <img src={logoAsset.url} alt="Logo" className="h-8 w-8 rounded-lg" />
            Smart Email Sender
          </div>
          <Button asChild size="sm"><Link to="/auth">Sign in</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> Lightweight mail-merge for Gmail
          </span>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight md:text-6xl">
            Send personalized emails<br />from <span className="text-primary">your own Gmail</span>.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Connect Gmail once. Build templates with dynamic placeholders. Preview, send, and track — all from a clean dashboard.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg"><Link to="/auth">Get started — it's free</Link></Button>
          </div>
        </div>
        <div className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: LayoutTemplate, title: "Reusable templates", desc: "Save subjects and bodies once. Use {{placeholders}} that get filled at send time." },
            { icon: Send, title: "Sends from your inbox", desc: "Emails go through your Gmail account, so replies land where they should." },
            { icon: History, title: "Full history", desc: "Every send is logged with status, recipient, and timestamp." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-foreground"><f.icon className="h-5 w-5" /></div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
