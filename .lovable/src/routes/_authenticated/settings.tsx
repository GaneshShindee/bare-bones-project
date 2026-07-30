import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listGmailAccounts,
  startGmailConnect,
  disconnectGmail,
  setDefaultGmailAccount,
  renameGmailAccount,
  testGmailConnection,
  type GmailAccount,
} from "@/lib/gmail.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Mail, CheckCircle2, Star, Plus, Pencil, Trash2, Zap, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getUserPreferences, setUserPreferences } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Smart Email Sender" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listGmailAccounts);
  const startFn = useServerFn(startGmailConnect);
  const disconnectFn = useServerFn(disconnectGmail);
  const setDefaultFn = useServerFn(setDefaultGmailAccount);
  const renameFn = useServerFn(renameGmailAccount);
  const testFn = useServerFn(testGmailConnection);
  const { data: accounts, isLoading } = useQuery({ queryKey: ["gmail-accounts"], queryFn: () => listFn() });

  const prefsGet = useServerFn(getUserPreferences);
  const prefsSet = useServerFn(setUserPreferences);
  const prefs = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsGet() });
  const updatePref = useMutation({
    mutationFn: (v: boolean) => prefsSet({ data: { trackingOpenEnabled: v } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["user-prefs"] }); toast.success("Preference saved"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const [profile, setProfile] = useState<{ email?: string; name?: string; avatar?: string }>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setProfile({
        email: u.email ?? undefined,
        name: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string),
        avatar: u.user_metadata?.avatar_url as string,
      });
    });
  }, []);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["gmail-accounts"] });
    qc.invalidateQueries({ queryKey: ["gmail-status"] });
  };

  const connect = useMutation({
    mutationFn: () => startFn(),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (e) => toast.error("Couldn't start Gmail connection", { description: (e as Error).message }),
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Disconnected"); },
    onError: (e) => toast.error("Disconnect failed", { description: (e as Error).message }),
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => setDefaultFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Default updated"); },
  });
  const rename = useMutation({
    mutationFn: (input: { id: string; label: string | null }) => renameFn({ data: input }),
    onSuccess: () => { invalidate(); setRenamingId(null); toast.success("Renamed"); },
  });
  const test = useMutation({
    mutationFn: (id: string) => testFn({ data: { id } }),
    onSuccess: (r) => toast.success(`Connected: ${r.email}`),
    onError: (e) => toast.error("Test failed", { description: (e as Error).message }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and connected Gmail accounts.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          {profile.avatar && <img src={profile.avatar} alt="" className="h-12 w-12 rounded-full" />}
          <div>
            <div className="font-medium">{profile.name ?? "—"}</div>
            <div className="text-sm text-muted-foreground">{profile.email}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> Email tracking</CardTitle></CardHeader>
        <CardContent className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm">Track email opens</Label>
            <p className="text-xs text-muted-foreground">
              Adds an invisible pixel so we can tell you when a recipient opens your email.
              Applies to new sends only.
            </p>
          </div>
          <Switch
            checked={prefs.data?.trackingOpenEnabled ?? true}
            disabled={prefs.isLoading || updatePref.isPending}
            onCheckedChange={(v) => updatePref.mutate(!!v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Connected Gmail accounts</CardTitle>
          <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
            <Plus className="h-4 w-4 mr-1" />{connect.isPending ? "Redirecting…" : "Connect another"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !accounts || accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Badge variant="outline">Not connected</Badge>
              <p className="text-sm text-muted-foreground mt-2">Grant Gmail send permission to start sending from your inbox.</p>
              <Button className="mt-3" onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending ? "Redirecting…" : "Connect Gmail"}
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {accounts.map((acc: GmailAccount) => (
                <li key={acc.id} className="flex items-center gap-3 py-3 flex-wrap">
                  {acc.avatar_url ? (
                    <img src={acc.avatar_url} alt="" className="h-10 w-10 rounded-full shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-muted grid place-items-center text-sm font-medium shrink-0">
                      {acc.gmail_email.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {renamingId === acc.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          placeholder="Label (e.g. Recruiter)"
                          className="h-8 max-w-xs"
                          autoFocus
                        />
                        <Button size="sm" onClick={() => rename.mutate({ id: acc.id, label: renameValue })}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{acc.label ?? acc.full_name ?? acc.gmail_email}</span>
                          {acc.is_default && <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" />Default</Badge>}
                          <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />Connected</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {acc.gmail_email} · since {new Date(acc.connected_at).toLocaleDateString()}
                        </div>
                      </>
                    )}
                  </div>
                  {renamingId !== acc.id && (
                    <div className="flex flex-wrap gap-2">
                      {!acc.is_default && (
                        <Button size="sm" variant="outline" onClick={() => setDefault.mutate(acc.id)} disabled={setDefault.isPending}>
                          <Star className="h-3.5 w-3.5 mr-1" />Set default
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { setRenamingId(acc.id); setRenameValue(acc.label ?? ""); }}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />Rename
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => test.mutate(acc.id)} disabled={test.isPending}>
                        <Zap className="h-3.5 w-3.5 mr-1" />Test
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => { if (confirm(`Disconnect ${acc.gmail_email}?`)) disconnect.mutate(acc.id); }}
                        disabled={disconnect.isPending}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />Disconnect
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}