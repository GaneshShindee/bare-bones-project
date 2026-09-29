import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listHistory } from "@/lib/history.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, EmptyState } from "./dashboard";
import { History as HistoryIcon, Search, Eye, ChevronRight } from "lucide-react";
import { useState } from "react";

type Row = {
  id: string;
  recipient: string;
  subject: string;
  template_name: string | null;
  status: string;
  sent_at: string;
  error: string | null;
  sender_email: string | null;
  bcc: string | null;
  attachments: unknown;
  recipient_count: number;
  open_count: number;
  last_opened_at: string | null;
  first_opened_at: string | null;
  tracking_enabled: boolean | null;
};

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Email History — Smart Email Sender" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const listFn = useServerFn(listHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["history", search, status],
    queryFn: () => listFn({ data: { search, status, limit: 200 } }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email History</h1>
        <p className="text-sm text-muted-foreground">Every email you've sent through Smart Email Sender.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipient or subject…" className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="py-2">
          {isLoading ? (
            <div className="space-y-2 py-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : data?.length ? (
            <ul className="divide-y divide-border">
              {(data as Row[]).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between py-3 gap-3 cursor-pointer hover:bg-accent/40 rounded-md px-2 -mx-2"
                  onClick={() => navigate({ to: "/campaigns/$id", params: { id: r.id } })}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.subject}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      to {r.recipient_count} recipient{r.recipient_count === 1 ? "" : "s"} · {new Date(r.sent_at).toLocaleString()}
                      {r.template_name ? ` · ${r.template_name}` : ""}
                    </div>
                    {r.status === "failed" && r.error && <div className="text-xs text-destructive truncate">{r.error}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.open_count > 0 && (
                      <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" />{r.open_count}</Badge>
                    )}
                    <StatusBadge status={r.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={HistoryIcon} title="No emails match" desc="Try changing the search or filter." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}