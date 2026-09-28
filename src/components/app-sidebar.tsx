import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";
import { NAV_ITEMS } from "@/lib/nav-items";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const items = NAV_ITEMS;

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pt-3 pb-1">
        <div className={cn("flex items-center gap-2.5 py-2", collapsed && !isMobile ? "justify-center px-0" : "px-2")}>
          <img
            src={logoAsset.url}
            alt="Logo"
            className={cn(
              "shrink-0 rounded-xl ring-1 ring-sidebar-border",
              collapsed && !isMobile ? "h-11 w-11" : "h-9 w-9",
            )}
          />
          {(!collapsed || isMobile) && (
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-none tracking-tight">Email Sender</div>
              <div className="mt-1 text-xs text-sidebar-foreground/45">Workspace</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarGroup className="px-0.5">
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    size="lg"
                    tooltip={item.title}
                    isActive={pathname === item.url || pathname.startsWith(item.url + "/")}
                  >
                    <Link to={item.url} className="flex items-center gap-2.5" onClick={closeMobile}>
                      <item.icon className={collapsed && !isMobile ? "h-5 w-5" : "h-[18px] w-[18px]"} strokeWidth={1.85} />
                      {(!collapsed || isMobile) && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-2.5 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={signOut}
              className="text-sidebar-foreground/70 hover:text-destructive"
            >
              <LogOut className={collapsed && !isMobile ? "h-5 w-5" : "h-[18px] w-[18px]"} strokeWidth={1.85} />
              {(!collapsed || isMobile) && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
