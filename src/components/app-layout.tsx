import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/profile": "Profile",
  "/jobs": "Jobs",
  "/templates": "Templates",
  "/resumes": "Resumes",
  "/resume-studio": "AI Resume Studio",
  "/send": "Send Email",
  "/history": "History",
  "/followups": "Follow-ups",
  "/replies": "Replies",
  "/notifications": "Notifications",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

function headerTitle(pathname: string) {
  const exact = titles[pathname];
  if (exact) return exact;
  const hit = Object.keys(titles).find((k) => pathname.startsWith(k + "/"));
  return hit ? titles[hit] : "Smart Email Sender";
}

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const title = headerTitle(pathname);

  return (
    <SidebarProvider>
      <div className="min-h-svh flex w-full max-w-[100vw] overflow-x-hidden orbit-mesh text-foreground">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 max-w-full">
          <header className="h-14 flex items-center gap-2 sm:gap-3 border-b border-border/50 px-3 sm:px-4 md:px-5 sticky top-0 glass-header z-10 safe-top">
            <SidebarTrigger className="size-9 shrink-0 rounded-lg" />
            <div className="h-4 w-px bg-border/80 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tracking-tight truncate">{title}</div>
              <div className="text-[11px] text-muted-foreground truncate hidden sm:block">Smart Email Sender</div>
            </div>
            <div className="hidden md:flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary landing-pulse" />
              Live workspace
            </div>
          </header>
          <main className="flex-1 w-full min-w-0 p-3 sm:p-5 md:p-7 lg:p-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
