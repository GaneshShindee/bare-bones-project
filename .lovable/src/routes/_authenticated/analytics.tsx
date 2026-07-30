import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { analyticsOverview } from "@/lib/history.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Send, Eye, Users, AlertTriangle, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar,
} from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Smart Email Sender" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const fn = useServerFn(analyticsOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", days],
    queryFn: () => fn({ data: { days } }),
  });

  const totals = data?.totals;
  const openRate = totals ? Math.round(totals.openRate * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Sends, deliveries, and opens over time.</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as 7 | 30 | 90)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Stat icon={Send} label="Sent" value={totals?.sent ?? 0} loading={isLoading} />
        <Stat icon={Users} label="Recipients" value={totals?.recipients ?? 0} loading={isLoading} />
        <Stat icon={Eye} label="Total opens" value={totals?.opens ?? 0} loading={isLoading} />
        <Stat icon={TrendingUp} label="Open rate" value={`${openRate}%`} sub={`${totals?.uniqueOpened ?? 0}/${totals?.trackedSent ?? 0}`} loading={isLoading} />
        <Stat icon={AlertTriangle} label="Failed" value={totals?.failed ?? 0} loading={isLoading} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Sends & opens per day</CardTitle></CardHeader>
        <CardContent className="h-72">
          {isLoading || !data ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="o" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2, 142 71% 45%))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2, 142 71% 45%))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} width={30} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="sent" name="Sent" stroke="hsl(var(--primary))" fill="url(#s)" strokeWidth={2} />
                <Area type="monotone" dataKey="opens" name="Opens" stroke="hsl(var(--chart-2, 142 71% 45%))" fill="url(#o)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Top templates</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !data ? (
            <Skeleton className="h-40 w-full" />
          ) : data.topTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No sends in this range yet.</p>
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topTemplates} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" allowDecimals={false} fontSize={11} />
                    <YAxis type="category" dataKey="name" width={140} fontSize={11} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="sent" name="Sends" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="divide-y divide-border text-sm">
                {data.topTemplates.map((t) => (
                  <li key={t.name} className="flex items-center justify-between py-2 gap-3">
                    <span className="truncate">{t.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">{t.sent} sent</Badge>
                      <Badge variant="secondary">{Math.round(t.openRate * 100)}% open</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, loading }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; sub?: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        {loading ? <Skeleton className="h-7 w-20 mt-2" /> : (
          <>
            <div className="text-2xl font-semibold mt-1">{value}</div>
            {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}