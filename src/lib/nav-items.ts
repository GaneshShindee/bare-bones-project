import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  UserRound,
  Briefcase,
  LayoutTemplate,
  FileText,
  Wand2,
  Send,
  History,
  ListChecks,
  Inbox,
  Bell,
  BarChart3,
  Settings,
} from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  description: string;
};

export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, description: "Overview of your sending activity" },
  { title: "Profile", url: "/profile", icon: UserRound, description: "Your name, contact details and links" },
  { title: "Jobs", url: "/jobs", icon: Briefcase, description: "Community jobs board" },
  { title: "My Templates", url: "/templates", icon: LayoutTemplate, description: "Reusable email templates" },
  { title: "Resumes", url: "/resumes", icon: FileText, description: "Your resume library" },
  { title: "AI Resume Studio", url: "/resume-studio", icon: Wand2, description: "Generate tailored resumes with AI" },
  { title: "Send Email", url: "/send", icon: Send, description: "Compose and send a campaign" },
  { title: "History", url: "/history", icon: History, description: "Every campaign you've sent" },
  { title: "Follow-ups", url: "/followups", icon: ListChecks, description: "Scheduled and pending follow-ups" },
  { title: "Replies", url: "/replies", icon: Inbox, description: "Incoming replies from recipients" },
  { title: "Notifications", url: "/notifications", icon: Bell, description: "Opens, replies and alerts" },
  { title: "Analytics", url: "/analytics", icon: BarChart3, description: "Sends, opens and trends over time" },
  { title: "Settings", url: "/settings", icon: Settings, description: "Gmail accounts and preferences" },
];
