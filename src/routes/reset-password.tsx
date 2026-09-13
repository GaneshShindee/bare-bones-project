import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Smart Email Sender" }] }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) {
      toast.error("Passwords don't match");
      return;
    }
    if (pw.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      toast.error("Reset failed", { description: error.message });
      return;
    }
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen orbit-mesh text-foreground grid place-items-center px-4">
      <Link
        to="/auth"
        className="absolute left-5 top-5 z-10 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-orbit hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card p-7 shadow-[var(--shadow-soft)]">
        <div className="mb-6 flex items-center gap-2.5">
          <img src={logoAsset.url} alt="Logo" className="h-9 w-9 rounded-xl ring-1 ring-border/70" />
          <div>
            <div className="text-sm font-semibold tracking-tight">Reset password</div>
            <div className="text-[12px] text-muted-foreground">Choose a new password for your account.</div>
          </div>
        </div>
        {!ready ? (
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Waiting for the reset link to load. Open this page from the email link we sent you.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">New password</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Confirm password</Label>
              <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
