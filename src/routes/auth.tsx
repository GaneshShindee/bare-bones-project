import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  // Redirect to dashboard if already authenticated
  loader: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      return redirect({ to: "/dashboard" });
    }
    return null;
  },
  head: () => ({ meta: [{ title: "Sign in — Smart Email Sender" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const signIn = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) {
      toast.error("Sign in failed", { description: String(result.error?.message ?? result.error) });
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth",
            data: fullName ? { full_name: fullName } : undefined,
          },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        toast.success("Password reset email sent. Check your inbox.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(mode === "forgot" ? "Reset failed" : "Sign in failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen orbit-mesh text-foreground">
      <Link
        to="/"
        className="absolute left-5 top-5 z-10 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-orbit hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <div className="min-h-screen grid lg:grid-cols-2">
        {/* Visual panel */}
        <aside className="hidden lg:flex relative flex-col justify-between p-10 xl:p-14 border-r border-border/50 overflow-hidden">
          <div className="absolute inset-0">
            <img
              src="/landing-dashboard-mock.png"
              alt=""
              className="h-full w-full object-cover opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
          </div>
          <div className="relative z-10 flex items-center gap-2.5">
            <img src={logoAsset.url} alt="Logo" className="h-9 w-9 rounded-xl ring-1 ring-border/70" />
            <span className="text-sm font-semibold tracking-tight">Smart Email Sender</span>
          </div>
          <div className="relative z-10 max-w-md space-y-6">
            <h1 className="text-3xl font-semibold tracking-tight leading-tight">
              Personalized Gmail campaigns, without the clutter.
            </h1>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {[
                "Templates with {{placeholders}} for every recipient",
                "Send from your own Gmail — replies stay in your inbox",
                "Track opens, resume views, and follow-ups",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[
                { v: "Gmail", l: "Native send" },
                { v: "64%", l: "Avg opens*" },
                { v: "AI", l: "Resume studio" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl border border-border/70 bg-card/70 backdrop-blur-sm p-3 text-center">
                  <div className="text-base font-semibold">{s.v}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.l}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/70">*Illustrative product preview</p>
          </div>
          <p className="relative z-10 text-xs text-muted-foreground">Secure sign-in · Your data stays in your workspace</p>
        </aside>

        {/* Form panel */}
        <div className="flex items-center justify-center px-4 py-16 lg:py-10">
          <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card p-7 shadow-[var(--shadow-soft)]">
            <div className="mb-6 flex items-center gap-2.5">
              <img src={logoAsset.url} alt="Logo" className="h-9 w-9 rounded-xl ring-1 ring-border/70 lg:hidden" />
              <div>
                <div className="text-[15px] font-semibold tracking-tight">
                  {mode === "signup" ? "Create account" : mode === "forgot" ? "Reset password" : "Welcome back"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {mode === "signup" ? "Start sending in minutes" : mode === "forgot" ? "We'll email you a reset link" : "Sign in to continue"}
                </div>
              </div>
            </div>
            <Button onClick={signIn} disabled={loading} className="w-full" variant="secondary">
              <GoogleIcon /> Continue with Google
            </Button>

            <div className="my-5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or continue with email <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={submitEmail} className="space-y-3">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="fn" className="text-xs">Full name</Label>
                  <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="em" className="text-xs">Email</Label>
                <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <Label htmlFor="pw" className="text-xs">Password</Label>
                  <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
                </div>
              )}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
              </Button>
            </form>

            <div className="mt-4 flex items-center justify-between text-xs">
              {mode === "signin" ? (
                <>
                  <button type="button" className="text-muted-foreground transition-orbit hover:text-foreground" onClick={() => setMode("forgot")}>
                    Forgot password?
                  </button>
                  <button type="button" className="text-muted-foreground transition-orbit hover:text-foreground" onClick={() => setMode("signup")}>
                    Create an account
                  </button>
                </>
              ) : (
                <button type="button" className="text-muted-foreground transition-orbit hover:text-foreground" onClick={() => setMode("signin")}>
                  ← Back to sign in
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 mr-2" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.5 14.7 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6 0-1.1-.1-1.6H12z"/>
    </svg>
  );
}
