import { Link, useRouterState } from "@tanstack/react-router";
import { Briefcase, FileText, History, LayoutDashboard, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const leftTabs = [
  { url: "/dashboard", icon: LayoutDashboard },
  { url: "/jobs", icon: Briefcase },
] as const;

const rightTabs = [
  { url: "/history", icon: History },
  { url: "/resumes", icon: FileText },
] as const;

/** URLs already reachable from the mobile bottom nav — used to avoid duplicating them elsewhere. */
export const BOTTOM_NAV_URLS = [...leftTabs, ...rightTabs, { url: "/send" }].map((t) => t.url);

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (y < 24) setHidden(false);
        else if (delta > 8) setHidden(true);
        else if (delta < -8) setHidden(false);
        lastY.current = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  return (
    <nav
      className={cn(
        "md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-xl safe-bottom transition-transform duration-300 ease-out",
        hidden ? "translate-y-full" : "translate-y-0",
      )}
    >
      <div className="mx-auto flex max-w-md items-center justify-around gap-1 px-2 py-2.5">
        {leftTabs.map((t) => (
          <TabLink key={t.url} {...t} active={isActive(t.url)} />
        ))}

        <Link to="/send" aria-label="Send Mail" className="flex items-center justify-center">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold shadow-sm transition-colors text-primary-foreground",
              isActive("/send") ? "bg-primary" : "bg-primary/90",
            )}
          >
            <Send className="h-4 w-4" strokeWidth={2} />
            Send Mail
          </span>
        </Link>

        {rightTabs.map((t) => (
          <TabLink key={t.url} {...t} active={isActive(t.url)} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({
  url,
  icon: Icon,
  active,
}: {
  url: string;
  icon: typeof Briefcase;
  active: boolean;
}) {
  return (
    <Link
      to={url}
      aria-label={url.slice(1)}
      className="flex items-center justify-center px-2 py-2 rounded-lg"
    >
      <Icon
        className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")}
        strokeWidth={active ? 2.1 : 1.85}
      />
    </Link>
  );
}
