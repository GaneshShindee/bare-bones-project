import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listJobSources,
  upsertJobSource,
  deleteJobSource,
  syncJobSource,
  type JobSource,
  type JobSourceKind,
} from "@/lib/job-sources.functions";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

export function JobSourcesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listJobSources);
  const upsertFn = useServerFn(upsertJobSource);
  const delFn = useServerFn(deleteJobSource);
  const syncFn = useServerFn(syncJobSource);

  const sources = useQuery({
    queryKey: ["job-sources"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const [kind, setKind] = useState<JobSourceKind>("rss");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [boardToken, setBoardToken] = useState("");
  const [site, setSite] = useState("");
  const [company, setCompany] = useState("");

  const webhookBase = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/public/telegram/webhook`;
  }, []);

  const create = useMutation({
    mutationFn: async (): Promise<JobSource> =>
      upsertFn({
        data: {
          name: name.trim(),
          kind,
          enabled: true,
          config: {
            url: kind === "rss" ? url.trim() : undefined,
            boardToken: kind === "greenhouse" ? boardToken.trim() : undefined,
            site: kind === "lever" ? site.trim() : undefined,
            company: company.trim() || undefined,
          },
        },
      }) as Promise<JobSource>,
    onSuccess: (row: JobSource) => {
      qc.invalidateQueries({ queryKey: ["job-sources"] });
      toast.success("Source added");
      setName("");
      setUrl("");
      setBoardToken("");
      setSite("");
      setCompany("");
      if (row.kind === "telegram" && row.webhook_secret) {
        const wh = `${webhookBase}?secret=${row.webhook_secret}`;
        void navigator.clipboard.writeText(wh).then(
          () => toast.message("Telegram webhook URL copied", { description: wh }),
          () => toast.message("Telegram webhook URL", { description: wh }),
        );
      }
    },
    onError: (e) => toast.error("Could not add source", { description: (e as Error).message }),
  });

  const sync = useMutation({
    mutationFn: (id: string) => syncFn({ data: { id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["job-sources"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(`Synced: ${r.created} new, ${r.skipped} skipped`, {
        description: `Scanned ${r.scanned} listings`,
      });
    },
    onError: (e) => toast.error("Sync failed", { description: (e as Error).message }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-sources"] });
      toast.success("Source removed");
    },
  });

  const copyWebhook = (s: JobSource) => {
    if (!s.webhook_secret) return;
    const wh = `${webhookBase}?secret=${s.webhook_secret}`;
    void navigator.clipboard.writeText(wh).then(
      () => toast.success("Webhook URL copied"),
      () => toast.message(wh),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[min(92dvh,900px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync job sources</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Pull openings from RSS feeds, Greenhouse / Lever boards, or a Telegram channel. Duplicates are skipped by URL.
          Run the <code className="text-[10px]">job_sources</code> SQL migration in Supabase if this fails.
        </p>

        <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as JobSourceKind)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rss">RSS / Atom feed</SelectItem>
                  <SelectItem value="greenhouse">Greenhouse board</SelectItem>
                  <SelectItem value="lever">Lever board</SelectItem>
                  <SelectItem value="telegram">Telegram channel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Name (optional)</Label>
              <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme careers" />
            </div>
          </div>

          {kind === "rss" && (
            <div>
              <Label className="text-xs">Feed URL</Label>
              <Input className="h-9" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/jobs.xml" />
            </div>
          )}
          {kind === "greenhouse" && (
            <div>
              <Label className="text-xs">Board token</Label>
              <Input
                className="h-9"
                value={boardToken}
                onChange={(e) => setBoardToken(e.target.value)}
                placeholder="from boards.greenhouse.io/TOKEN"
              />
            </div>
          )}
          {kind === "lever" && (
            <div>
              <Label className="text-xs">Site slug</Label>
              <Input className="h-9" value={site} onChange={(e) => setSite(e.target.value)} placeholder="from jobs.lever.co/SITE" />
            </div>
          )}
          {kind === "telegram" && (
            <p className="text-xs text-muted-foreground">
              Creates a webhook URL. Point your bot with{" "}
              <code className="text-[10px]">setWebhook</code>, add the bot to the channel, then post JDs — they become jobs automatically.
            </p>
          )}
          {kind !== "telegram" && (
            <div>
              <Label className="text-xs">Company fallback (optional)</Label>
              <Input className="h-9" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Used if AI cannot infer company" />
            </div>
          )}

          <Button
            size="sm"
            onClick={() => create.mutate()}
            disabled={
              create.isPending ||
              (kind === "rss" && !url.trim()) ||
              (kind === "greenhouse" && !boardToken.trim()) ||
              (kind === "lever" && !site.trim())
            }
          >
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Add source
          </Button>
        </div>

        <div className="space-y-2">
          {(sources.data as JobSource[] | undefined)?.length ? (
            (sources.data as JobSource[]).map((s) => (
              <div key={s.id} className="rounded-lg border px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{s.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{s.kind}</Badge>
                    {!s.enabled && <Badge variant="outline">off</Badge>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {s.kind === "rss" && String((s.config as { url?: string }).url ?? "")}
                    {s.kind === "greenhouse" && `board: ${(s.config as { boardToken?: string }).boardToken ?? ""}`}
                    {s.kind === "lever" && `site: ${(s.config as { site?: string }).site ?? ""}`}
                    {s.kind === "telegram" && "Webhook-driven"}
                    {s.last_synced_at ? ` · last sync ${new Date(s.last_synced_at).toLocaleString()}` : ""}
                  </div>
                  {s.last_error && <div className="text-[11px] text-destructive truncate">{s.last_error}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {s.kind === "telegram" ? (
                    <Button size="sm" variant="outline" onClick={() => copyWebhook(s)}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> Webhook
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(s.id)}>
                      {sync.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                      Sync
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remove this source?")) remove.mutate(s.id); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No sources yet.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
