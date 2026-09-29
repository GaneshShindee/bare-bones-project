export const PROFILE_SECTIONS = [
  "education",
  "experience",
  "project",
  "skill",
  "certification",
  "achievement",
  "language",
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export type ProfileEntry = {
  id: string;
  section: ProfileSection;
  title: string;
  subtitle: string;
  location: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
  bullets: string[];
  tags: string[];
  url: string;
  sort_order: number;
};

export type ProfileDetails = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  summary: string;
};

export const EMPTY_DETAILS: ProfileDetails = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  github: "",
  portfolio: "",
  summary: "",
};

export function emptyEntry(section: ProfileSection): ProfileEntry {
  return {
    id: "",
    section,
    title: "",
    subtitle: "",
    location: "",
    start_date: "",
    end_date: "",
    is_current: false,
    description: "",
    bullets: [],
    tags: [],
    url: "",
    sort_order: 0,
  };
}

type FieldKey = keyof ProfileEntry;

export const SECTION_META: Record<
  ProfileSection,
  {
    label: string;
    singular: string;
    titleLabel: string;
    subtitleLabel?: string;
    fields: FieldKey[];
    bulletsLabel?: string;
    tagsLabel?: string;
  }
> = {
  education: {
    label: "Education",
    singular: "education entry",
    titleLabel: "Degree / Programme",
    subtitleLabel: "Institution",
    fields: ["title", "subtitle", "location", "start_date", "end_date", "description"],
  },
  experience: {
    label: "Experience",
    singular: "experience",
    titleLabel: "Role",
    subtitleLabel: "Company",
    fields: ["title", "subtitle", "location", "start_date", "end_date", "is_current", "description", "bullets", "tags"],
    bulletsLabel: "Highlights (one per line)",
    tagsLabel: "Technologies (comma-separated)",
  },
  project: {
    label: "Projects",
    singular: "project",
    titleLabel: "Project name",
    subtitleLabel: "Context / Organisation",
    fields: ["title", "subtitle", "url", "start_date", "end_date", "description", "bullets", "tags"],
    bulletsLabel: "Highlights (one per line)",
    tagsLabel: "Tech stack (comma-separated)",
  },
  skill: {
    label: "Skills",
    singular: "skill group",
    titleLabel: "Category (e.g. Languages)",
    fields: ["title", "tags"],
    tagsLabel: "Skills (comma-separated)",
  },
  certification: {
    label: "Certifications",
    singular: "certification",
    titleLabel: "Certification",
    subtitleLabel: "Issuer",
    fields: ["title", "subtitle", "end_date", "url", "description"],
  },
  achievement: {
    label: "Achievements",
    singular: "achievement",
    titleLabel: "Achievement",
    subtitleLabel: "Issuer / Context",
    fields: ["title", "subtitle", "end_date", "description"],
  },
  language: {
    label: "Languages",
    singular: "language",
    titleLabel: "Language",
    subtitleLabel: "Proficiency",
    fields: ["title", "subtitle"],
  },
};

export function entrySummary(e: ProfileEntry): string {
  const bits = [e.subtitle, e.location, [e.start_date, e.is_current ? "Present" : e.end_date].filter(Boolean).join(" – ")];
  return bits.filter(Boolean).join(" · ");
}
