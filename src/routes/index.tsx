import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Send,
  History,
  LayoutTemplate,
  Eye,
  Mail,
  CheckCircle2,
  Reply,
  BarChart3,
  Link2,
  Wand2,
  FileText,
  Bell,
  ListChecks,
  ChevronDown,
  Shield,
  Zap,
  Inbox,
} from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Email Sender — Send Gmail emails from templates" },
      {
        name: "description",
        content:
          "Connect Gmail once, pick a template, fill the blanks, and send personalized emails from your own inbox in seconds.",
      },
      { property: "og:title", content: "Smart Email Sender" },
      {
        property: "og:description",
        content: "Send personalized template emails directly from your Gmail in seconds.",
      },
    ],
  }),
  component: Index,
});

const faqs = [
  {
    q: "Do emails send from my own Gmail?",
    a: "Yes. You connect Gmail once with send permission. Messages leave your inbox, so replies come straight back to you.",
  },
  {
    q: "What are placeholders?",
    a: "Tokens like {{name}} and {{company}} in your subject or body. At send time we fill them per recipient so every email feels personal.",
  },
  {
    q: "Can I track opens and resume views?",
    a: "Open tracking and PDF view signals are built in. Filter campaigns by who opened, replied, or still needs a follow-up.",
  },
  {
    q: "Is there a resume / AI studio?",
    a: "Yes. Upload a master resume, tailor versions to job descriptions, and attach the right PDF when you send.",
  },
];

const activity = [
  { icon: Eye, title: "Priya opened your email", meta: "Acme hiring manager · 2m ago", tone: "primary" },
  { icon: FileText, title: "Resume viewed 3×", meta: "Northwind · product designer role", tone: "secondary" },
  { icon: Reply, title: "Reply received", meta: "“Happy to chat Thursday…”", tone: "ok" },
  { icon: Bell, title: "Follow-up queued", meta: "Scheduled tomorrow 3:00 PM IST", tone: "muted" },
];

function Index() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen orbit-mesh text-foreground overflow-x-hidden">
      <header className="border-b border-border/50 glass-header sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5 gap-4">
          <div className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight shrink-0">
            <img src={logoAsset.url} alt="Logo" className="h-8 w-8 rounded-xl ring-1 ring-border/70" />
            Smart Email Sender
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#product" className="hover:text-foreground transition-orbit">Product</a>
            <a href="#workflow" className="hover:text-foreground transition-orbit">How it works</a>
            <a href="#features" className="hover:text-foreground transition-orbit">Features</a>
            <a href="#faq" className="hover:text-foreground transition-orbit">FAQ</a>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-6 pt-14 md:pt-20 pb-10">
          <div className="mx-auto max-w-2xl text-center landing-rise">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-6">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Lightweight mail-merge for Gmail
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.08]">
              Smart Email Sender
            </h1>
            <p className="mt-5 text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
              Connect Gmail once. Build templates with dynamic placeholders. Preview, send, and track —
              all from a clean dashboard.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth">Get started — it's free</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#product">See how it works</a>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" /> Your Gmail, your inbox</span>
              <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Templates in minutes</span>
              <span className="inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-primary" /> Open & PDF tracking</span>
            </div>
          </div>

          <div className="relative mt-14 landing-rise landing-rise-delay-1">
            <div className="absolute inset-x-8 -bottom-6 h-24 rounded-[2rem] bg-primary/15 blur-3xl pointer-events-none" />
            <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-border/70 shadow-[var(--shadow-lift)] bg-card">
              <img
                src="/landing-hero-email.png"
                alt="Personalized Gmail templates flowing into tracked outbound campaigns"
                className="w-full h-auto object-cover max-h-[420px] md:max-h-[480px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="mx-auto max-w-6xl px-6 pb-6">
          <div className="rounded-2xl border border-border/60 bg-card/50 px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { k: "Gmail-native", v: "Send & reply in your threads" },
              { k: "Mail-merge", v: "{{placeholders}} per recipient" },
              { k: "Tracking", v: "Opens, resumes, replies" },
              { k: "AI resume", v: "Tailor PDFs to each JD" },
            ].map((t) => (
              <div key={t.k} className="px-2">
                <div className="text-sm font-semibold tracking-tight">{t.k}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{t.v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Live product widgets */}
        <section id="product" className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="text-center max-w-xl mx-auto mb-10 landing-rise">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Built for real outreach</h2>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">
              Templates, Gmail sending, and open tracking — the pieces you need before you hit send.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-5 rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] landing-rise landing-rise-delay-1">
              <div className="flex items-center gap-2 text-sm font-semibold mb-4">
                <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <LayoutTemplate className="h-4 w-4" />
                </div>
                Template preview
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-4 space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Subject</div>
                  <div className="text-sm font-medium">
                    Quick intro — {"{{role}}"} at {"{{company}}"}
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
                  <p>Hi {"{{name}}"},</p>
                  <p>
                    I noticed {"{{company}}"} is hiring for {"{{role}}"}. Attaching a tailored resume —
                    happy to chat if useful.
                  </p>
                  <p className="text-foreground/80">— Ganesh</p>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {["{{name}}", "{{company}}", "{{role}}"].map((t) => (
                    <span key={t} className="rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 grid gap-4 sm:grid-cols-3">
              {[
                { icon: Send, label: "Campaigns sent", value: "128", sub: "this month", delay: "landing-rise-delay-1" },
                { icon: Eye, label: "Open rate", value: "64%", sub: "tracked emails", delay: "landing-rise-delay-2", pulse: true },
                { icon: Reply, label: "Replies", value: "19", sub: "in your inbox", delay: "landing-rise-delay-3" },
              ].map((s) => (
                <div
                  key={s.label}
                  className={`rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] landing-rise ${s.delay} flex flex-col items-center justify-center text-center min-h-[9rem]`}
                >
                  <div className={`grid size-9 place-items-center rounded-lg bg-primary/10 text-primary mb-2 ${s.pulse ? "landing-pulse" : ""}`}>
                    <s.icon className="h-4 w-4" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">{s.label}</div>
                  <div className="text-3xl font-semibold tracking-tight mt-1">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
                </div>
              ))}

              <div className="sm:col-span-3 rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] landing-rise landing-rise-delay-2 landing-float">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Mail className="h-4 w-4" />
                    </div>
                    Ready to send from Gmail
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Personalizing 24 recipients…</span>
                    <span className="text-foreground font-medium">92%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full w-[92%] rounded-full bg-primary landing-bar" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Activity + reply widgets */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-2 text-sm font-semibold mb-4">
                <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Bell className="h-4 w-4" />
                </div>
                Live activity
              </div>
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li key={a.title} className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/50 p-3">
                    <div className="grid size-8 place-items-center rounded-lg bg-muted text-foreground shrink-0">
                      <a.icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{a.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{a.meta}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] flex flex-col">
              <div className="flex items-center gap-2 text-sm font-semibold mb-4">
                <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Inbox className="h-4 w-4" />
                </div>
                Reply center snapshot
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-4 flex-1 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate">Re: Quick intro — Designer at Northwind</div>
                  <span className="text-[11px] text-muted-foreground shrink-0">Today</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  “Thanks for reaching out — your resume looks strong. Free for a quick call this week?”
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="rounded-md bg-emerald-500/10 text-emerald-500 px-2 py-0.5 text-[11px] font-medium">Opened 2×</span>
                  <span className="rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">Resume viewed</span>
                  <span className="rounded-md bg-secondary text-secondary-foreground px-2 py-0.5 text-[11px] font-medium">Needs reply</span>
                </div>
                <div className="pt-2">
                  <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    Draft with AI · Use template · Send from Gmail
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="mx-auto max-w-6xl px-6 pb-16 md:pb-20">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">How it works</h2>
            <p className="mt-2 text-sm md:text-base text-muted-foreground">
              Four steps from empty inbox to tracked, personalized campaigns.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-border/70 shadow-[var(--shadow-lift)] bg-card mb-8">
            <img
              src="/landing-workflow.png"
              alt="Connect, template, send, and track workflow"
              className="w-full h-auto object-cover max-h-[360px]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", icon: Link2, title: "Connect Gmail", desc: "Grant send access once. Tokens refresh in the background." },
              { n: "02", icon: LayoutTemplate, title: "Build a template", desc: "Write once with {{placeholders}} for names, roles, and companies." },
              { n: "03", icon: Send, title: "Personalize & send", desc: "Attach the right resume and fire a batch from your inbox." },
              { n: "04", icon: ListChecks, title: "Track & follow up", desc: "See opens, PDF views, and queue follow-ups for warm leads." },
            ].map((step) => (
              <div key={step.n} className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] transition-orbit hover:border-primary/25">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-primary tabular-nums">{step.n}</span>
                  <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <step.icon className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="text-sm font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Dashboard mock + tracking */}
        <section className="mx-auto max-w-6xl px-6 pb-16 md:pb-24">
          <div className="grid gap-6 lg:grid-cols-2 items-center">
            <div className="order-2 lg:order-1">
              <div className="relative overflow-hidden rounded-2xl border border-border/70 shadow-[var(--shadow-lift)] bg-card">
                <img
                  src="/landing-dashboard-mock.png"
                  alt="Dashboard mockup with campaign metrics, opens, and recent sends"
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
            <div className="order-1 lg:order-2 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium">
                <BarChart3 className="h-3.5 w-3.5" />
                Live campaign insight
              </div>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
                See opens, replies, and resume views in one place
              </h2>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                Every campaign logs recipients, open counts, and status. Drill into a send to filter who
                opened, who replied, and who still needs a follow-up.
              </p>
              <ul className="space-y-3 text-sm">
                {[
                  "Open tracking with first / last seen times",
                  "Resume PDF view signals when recruiters look",
                  "Bulk reply tools for warm conversations",
                  "AI Resume Studio to tailor attachments per JD",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button asChild>
                <Link to="/auth">Start sending</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border/50 bg-card/30">
          <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
            <div className="text-center max-w-xl mx-auto mb-10">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Everything in one workspace</h2>
              <p className="mt-2 text-sm md:text-base text-muted-foreground">
                From templates to analytics — without juggling five tools.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: LayoutTemplate, title: "Reusable templates", desc: "Save subjects and bodies once. Use {{placeholders}} that get filled at send time." },
                { icon: Send, title: "Sends from your inbox", desc: "Emails go through your Gmail account, so replies land where they should." },
                { icon: History, title: "Full history", desc: "Every send is logged with status, recipient, opens, and timestamp." },
                { icon: Wand2, title: "AI Resume Studio", desc: "Adapt your master .tex resume to each job description in a few clicks." },
                { icon: ListChecks, title: "Follow-up queue", desc: "Queue polite nudges for people who opened but haven’t replied yet." },
                { icon: BarChart3, title: "Analytics", desc: "See sends, open rates, and top templates over 7, 30, or 90 days." },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] transition-orbit hover:border-primary/25 hover:shadow-[var(--shadow-lift)]"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="h-4 w-4" strokeWidth={1.85} />
                  </div>
                  <h3 className="mt-3.5 text-base font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-6 py-16 md:py-20">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Questions, answered</h2>
            <p className="mt-2 text-sm text-muted-foreground">Straight answers before you create an account.</p>
          </div>
          <div className="space-y-2">
            {faqs.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-[var(--shadow-soft)]">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium hover:bg-muted/40 transition-orbit"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                  >
                    {item.q}
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-6 pb-16 md:pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-primary/10 px-6 py-12 md:px-12 md:py-14 text-center">
            <div className="absolute inset-0 orbit-mesh opacity-40 pointer-events-none" />
            <div className="relative">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Ready to send smarter?
              </h2>
              <p className="mt-3 text-sm md:text-base text-muted-foreground max-w-lg mx-auto">
                Create a free account, connect Gmail, and ship your first personalized campaign today.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg">
                  <Link to="/auth">Create your free account</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth">Sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-6 py-10 grid gap-8 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 font-semibold text-sm mb-2">
              <img src={logoAsset.url} alt="" className="h-7 w-7 rounded-lg" />
              Smart Email Sender
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
              Personalized Gmail campaigns with templates, tracking, and resume tooling.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Explore</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#product" className="hover:text-foreground transition-orbit">Product</a></li>
              <li><a href="#workflow" className="hover:text-foreground transition-orbit">How it works</a></li>
              <li><a href="#features" className="hover:text-foreground transition-orbit">Features</a></li>
              <li><a href="#faq" className="hover:text-foreground transition-orbit">FAQ</a></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Account</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/auth" className="hover:text-foreground transition-orbit">Sign in</Link></li>
              <li><Link to="/auth" className="hover:text-foreground transition-orbit">Create account</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/50 py-4 text-center text-xs text-muted-foreground">
          Smart Email Sender · Send personalized Gmail campaigns with confidence
        </div>
      </footer>
    </div>
  );
}
