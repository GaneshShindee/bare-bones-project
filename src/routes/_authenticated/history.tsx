import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteCampaign, listCampaignsPage, setCampaignFollowupEnabled, type CampaignSummary } from "@/lib/history.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { StatusBadge, EmptyState } from "./dashboard";
import { History as HistoryIcon, Search, Eye, FileText, Reply, Users, ChevronRight, Paperclip, BellRing, BellOff, MoreVertical, Trash2, CalendarRange, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

const PAGE_SIZE = 25;

type CampaignFilters = { search: string; status: string; dateFrom: string; dateTo: string };
const defaultCampaignFilters: CampaignFilters = { search: "", status: "all", dateFrom: "", dateTo: "" };

/** Parses a "YYYY-MM-DD" filter value as a local date (not UTC, so the picker shows the right day). */
function parseDateKey(key: string): Date | undefined {
  if (!key) return undefined;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(key: string): string {
  return parseDateKey(key)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) ?? "";
}

/** A "Sent date" filter button that opens a custom (themed) calendar popover instead of the native date picker. */
function DateRangeFilter({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (patch: Partial<CampaignFilters>) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasFilter = !!dateFrom || !!dateTo;
  const selected: DateRange | undefined = hasFilter
    ? { from: parseDateKey(dateFrom), to: parseDateKey(dateTo) }
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 font-normal sm:w-auto",
            hasFilter ? "border-primary/40 text-foreground" : "text-muted-foreground",
          )}
        >
          <CalendarRange className="h-4 w-4 shrink-0" />
          {hasFilter ? `${formatDateLabel(dateFrom) || "…"} – ${formatDateLabel(dateTo) || "…"}` : "Sent date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={1}
          defaultMonth={selected?.from}
          selected={selected}
          onSelect={(range) =>
            onChange({
              dateFrom: range?.from ? toDateKey(range.from) : "",
              dateTo: range?.to ? toDateKey(range.to) : "",
            })
          }
        />
        {hasFilter && (
          <div className="flex justify-end border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange({ dateFrom: "", dateTo: "" });
                setOpen(false);
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" />Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Email History — Smart Email Sender" },
      { name: "description", content: "Every campaign you've sent, with recipients, opens, resume views and replies." },
      { property: "og:title", content: "Email History — Smart Email Sender" },
      { property: "og:description", content: "Browse campaigns, then drill into recipients and full conversations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<CampaignFilters>(defaultCampaignFilters);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<CampaignSummary | null>(null);
  const listFn = useServerFn(listCampaignsPage);
  const setFollowupEnabledFn = useServerFn(setCampaignFollowupEnabled);
  const deleteCampaignFn = useServerFn(deleteCampaign);

  const { data, isLoading } = useQuery({
    queryKey: ["campaign-history", filters, page],
    queryFn: () =>
      listFn({
        data: {
          search: filters.search,
          status: filters.status,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Any filter change jumps back to page 1, since the current page may no longer exist.
  const updateFilter = (patch: Partial<CampaignFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const toggleFollowup = useMutation({
    mutationFn: (vars: { campaignId: string; enabled: boolean }) =>
      setFollowupEnabledFn({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign-history"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (campaignId: string) => deleteCampaignFn({ data: { campaignId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-history"] });
      setDeleteTarget(null);
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">Email History</h1>
        <p className="text-sm text-muted-foreground">
          One row per campaign. Open a campaign to see its recipients, filters and bulk reply tools.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
            placeholder="Search subject, recipient, role or company…"
            className="pl-9"
          />
        </div>
        <Select value={filters.status} onValueChange={(status) => updateFilter({ status })}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <DateRangeFilter dateFrom={filters.dateFrom} dateTo={filters.dateTo} onChange={updateFilter} />
      </div>

      <Card>
        <CardContent className="py-2">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : rows.length ? (
            <ul className="divide-y divide-border">
              {rows.map((c) => (
                <li
                  key={c.id}
                  className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 py-3 px-2 -mx-2 rounded-md cursor-pointer hover:bg-accent/40 transition-colors ${
                    c.followupPending ? "border-l-2 border-l-destructive bg-destructive/5" : ""
                  }`}
                  onClick={() => navigate({ to: "/campaigns/$id", params: { id: c.id } })}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {c.role && c.company
                        ? `${c.role} · ${c.company}`
                        : c.role || c.company || c.subject}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.role || c.company ? `${c.subject} · ` : ""}
                      {new Date(c.sent_at).toLocaleString()}
                      {c.sender_email ? ` · from ${c.sender_email}` : ""}
                      {c.template_name ? ` · ${c.template_name}` : ""}
                    </div>
                    {c.status === "failed" && c.error && (
                      <div className="text-xs text-destructive truncate">{c.error}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap sm:justify-end sm:shrink-0">
                    {c.followupPending && (
                      <Badge variant="destructive" className="gap-1">
                        <BellRing className="h-3 w-3" />Day {c.followupDueDay} follow-up
                      </Badge>
                    )}
                    <Badge variant="outline" className="gap-1">
                      <Users className="h-3 w-3" />{c.recipients}
                    </Badge>
                    {c.opened > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <Eye className="h-3 w-3" />{c.opened}/{c.recipients}
                      </Badge>
                    )}
                    {c.resume_views > 0 && (
                      <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" />{c.resume_views}</Badge>
                    )}
                    {c.replied > 0 && (
                      <Badge className="gap-1"><Reply className="h-3 w-3" />{c.replied}</Badge>
                    )}
                    {c.attachment_count > 0 && (
                      <Badge variant="outline" className="gap-1"><Paperclip className="h-3 w-3" />{c.attachment_count}</Badge>
                    )}
                    <StatusBadge status={c.status} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Campaign options"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() => toggleFollowup.mutate({ campaignId: c.id, enabled: !c.followupEnabled })}
                        >
                          {c.followupEnabled ? (
                            <><BellOff className="h-4 w-4 mr-2" />Turn off follow-up tracking</>
                          ) : (
                            <><BellRing className="h-4 w-4 mr-2" />Turn on follow-up tracking</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />Delete campaign
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={HistoryIcon} title="No campaigns match" desc="Try changing the search or status filter." />
          )}
        </CardContent>
      </Card>

      {total > 0 && (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} campaign{total === 1 ? "" : "s"}
          </p>
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={page <= 1}
                  className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                  onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={page >= totalPages}
                  className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
                  onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{deleteTarget?.subject}" along with all its recipients, opens, replies and
              follow-up tracking. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
