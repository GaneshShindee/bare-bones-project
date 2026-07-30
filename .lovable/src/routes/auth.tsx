import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
    <div className="min-h-screen bg-background text-foreground grid place-items-center px-4">
      <Link to="/" className="absolute left-6 top-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <img src={logoAsset.url} alt="Logo" className="h-9 w-9 rounded-lg" />
          <div>
            <div className="font-semibold">Smart Email Sender</div>
            <div className="text-xs text-muted-foreground">
              {mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in to continue"}
            </div>
          </div>
        </div>
        <Button onClick={signIn} disabled={loading} size="lg" className="w-full" variant="secondary">
          <GoogleIcon /> Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or continue with email <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submitEmail} className="space-y-3">
          {mode === "signup" && (
            <div>
              <Label htmlFor="fn" className="text-xs">Full name</Label>
              <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
          )}
          <div>
            <Label htmlFor="em" className="text-xs">Email</Label>
            <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          {mode !== "forgot" && (
            <div>
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
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMode("forgot")}>
                Forgot password?
              </button>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMode("signup")}>
                Create an account
              </button>
            </>
          ) : (
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMode("signin")}>
              ← Back to sign in
            </button>
          )}
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