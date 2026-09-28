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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, CheckCircle2, Star, Plus, Pencil, Trash2, Zap, Eye, KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getUserPreferences, setUserPreferences } from "@/lib/profile.functions";
import {
  getAiKeyStatus,
  setActiveAiProvider,
  setGeminiApiKey,
  clearGeminiApiKey,
  testGeminiApiKey,
  setGrokApiKey,
  clearGrokApiKey,
  testGrokApiKey,
} from "@/lib/ai-settings.functions";
import type { AiProvider } from "@/lib/ai-gateway";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Smart Email Sender" }] }),
  component: SettingsPage,
});

function providerLabel(p: AiProvider): string {
  return p === "gemini" ? "Gemini" : p === "grok" ? "Grok" : "Lovable (shared)";
}

type ProviderKeyStatus = { hasKey: boolean; maskedKey: string | null };

function useApiKeyField(opts: {
  setFn: (args: { data: { apiKey: string } }) => Promise<{ ok: boolean }>;
  clearFn: () => Promise<{ ok: boolean }>;
  testFn: (args: { data: { apiKey: string } }) => Promise<{ ok: boolean; error?: string }>;
  label: string;
  onChanged: () => void;
}) {
  const [input, setInput] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const test = useMutation({
    mutationFn: (apiKey: string) => opts.testFn({ data: { apiKey } }),
    onSuccess: (r) => {
      setTestResult(r);
      if (r.ok) toast.success(`Key works — connected to ${opts.label} successfully.`);
      else toast.error("Key test failed", { description: r.error });
    },
    onError: (e) => toast.error("Couldn't test key", { description: (e as Error).message }),
  });
  const save = useMutation({
    mutationFn: (apiKey: string) => opts.setFn({ data: { apiKey } }),
    onSuccess: () => {
      opts.onChanged();
      setInput("");
      setTestResult(null);
      toast.success(`${opts.label} API key saved.`);
    },
    onError: (e) => toast.error("Couldn't save key", { description: (e as Error).message }),
  });
  const remove = useMutation({
    mutationFn: () => opts.clearFn(),
    onSuccess: () => {
      opts.onChanged();
      setTestResult(null);
      toast.success(`${opts.label} API key removed.`);
    },
    onError: (e) => toast.error("Couldn't remove key", { description: (e as Error).message }),
  });

  return { input, setInput, testResult, setTestResult, test, save, remove };
}

function ProviderKeyPanel({
  label,
  placeholder,
  docsUrl,
  docsLabel,
  status,
  loading,
  field,
}: {
  label: string;
  placeholder: string;
  docsUrl: string;
  docsLabel: string;
  status: ProviderKeyStatus | undefined;
  loading: boolean;
  field: ReturnType<typeof useApiKeyField>;
}) {
  if (loading) return <Skeleton className="h-10 w-full" />;

  if (status?.hasKey) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className="gap-1 shrink-0"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />{label} key saved</Badge>
          <span className="text-sm text-muted-foreground truncate">{status.maskedKey}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive shrink-0"
          onClick={() => { if (confirm(`Remove your ${label} API key?`)) field.remove.mutate(); }}
          disabled={field.remove.isPending}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="password"
          value={field.input}
          onChange={(e) => { field.setInput(e.target.value); field.setTestResult(null); }}
          placeholder={placeholder}
          className="h-9 min-w-0 flex-1 max-w-sm font-mono"
          autoComplete="off"
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => field.test.mutate(field.input)}
          disabled={!field.input.trim() || field.test.isPending}
        >
          {field.test.isPending ? "Testing…" : "Test"}
        </Button>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => field.save.mutate(field.input)}
          disabled={!field.input.trim() || field.save.isPending}
        >
          {field.save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      {field.testResult && !field.testResult.ok && (
        <p className="text-xs text-destructive">{field.testResult.error}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Get a key at{" "}
        <a href={docsUrl} target="_blank" rel="noreferrer" className="underline">{docsLabel}</a>.
        Stored on your account and only used for your own AI requests.
      </p>
    </div>
  );
}

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

  const aiKeyStatusFn = useServerFn(getAiKeyStatus);
  const setActiveProviderFn = useServerFn(setActiveAiProvider);
  const aiKeyStatus = useQuery({ queryKey: ["ai-key-status"], queryFn: () => aiKeyStatusFn() });

  const setActiveProvider = useMutation({
    mutationFn: (provider: AiProvider) => setActiveProviderFn({ data: { provider } }),
    onSuccess: (_r, provider) => {
      qc.invalidateQueries({ queryKey: ["ai-key-status"] });
      toast.success(
        provider === "lovable" ? "Using the shared Lovable gateway" : `Using your ${providerLabel(provider)} key`,
      );
    },
    onError: (e) => toast.error("Couldn't update AI provider", { description: (e as Error).message }),
  });

  const geminiKey = useApiKeyField({
    setFn: useServerFn(setGeminiApiKey),
    clearFn: useServerFn(clearGeminiApiKey),
    testFn: useServerFn(testGeminiApiKey),
    label: "Gemini",
    onChanged: () => qc.invalidateQueries({ queryKey: ["ai-key-status"] }),
  });
  const grokKey = useApiKeyField({
    setFn: useServerFn(setGrokApiKey),
    clearFn: useServerFn(clearGrokApiKey),
    testFn: useServerFn(testGrokApiKey),
    label: "Grok",
    onChanged: () => qc.invalidateQueries({ queryKey: ["ai-key-status"] }),
  });

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
        <h1 className="page-title">Settings</h1>
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
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> AI providers</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            AI features (drafting, resume tailoring, job parsing, etc.) use the shared Lovable pool by default, which
            can hit rate limits or run out of credits. Save your own Gemini and/or Grok API key below, then pick which
            one to use. If you don't pick a provider — or the one you pick has no key saved, or its request fails —
            AI features automatically fall back to the shared Lovable pool.
          </p>

          <div className="space-y-1.5">
            <Label className="text-sm">Active provider</Label>
            <Select
              value={aiKeyStatus.data?.activeProvider ?? "lovable"}
              onValueChange={(v) => setActiveProvider.mutate(v as AiProvider)}
              disabled={aiKeyStatus.isLoading || setActiveProvider.isPending}
            >
              <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lovable">Lovable (shared, default)</SelectItem>
                <SelectItem value="gemini">Gemini{aiKeyStatus.data?.gemini.hasKey ? "" : " (no key saved)"}</SelectItem>
                <SelectItem value="grok">Grok{aiKeyStatus.data?.grok.hasKey ? "" : " (no key saved)"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Gemini API key</Label>
            <ProviderKeyPanel
              label="Gemini"
              placeholder="AIza..."
              docsUrl="https://aistudio.google.com/apikey"
              docsLabel="aistudio.google.com/apikey"
              status={aiKeyStatus.data?.gemini}
              loading={aiKeyStatus.isLoading}
              field={geminiKey}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Grok (xAI) API key</Label>
            <ProviderKeyPanel
              label="Grok"
              placeholder="xai-..."
              docsUrl="https://console.x.ai"
              docsLabel="console.x.ai"
              status={aiKeyStatus.data?.grok}
              loading={aiKeyStatus.isLoading}
              field={grokKey}
            />
          </div>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          placeholder="Label (e.g. Recruiter)"
                          className="h-8 min-w-0 flex-1 max-w-xs"
                          autoFocus
                        />
                        <Button size="sm" className="shrink-0" onClick={() => rename.mutate({ id: acc.id, label: renameValue })}>Save</Button>
                        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setRenamingId(null)}>Cancel</Button>
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