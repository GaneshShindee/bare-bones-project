# Smart Email Sender V2 – Final Enhancement Plan

Delivered in 4 phases so each phase is verifiable and doesn't regress the working app. All phases will be executed back-to-back in this thread unless you want to pause between them.

---

## Phase 1 — Attachments, Filenames, Downloads (highest-risk regressions)

**Goal:** stop attaching `.tex`, standardize PDF filename, fix broken downloads.

- Attachments
  - Send path (`send.tsx` + `gmail.functions.ts`): strip any `.tex` attachment before send; only PDFs pass through.
  - Resume Studio "Send Email" hand-off: pass PDF only.
- Filename helper (`src/lib/naming.ts` already exists – extend)
  - `FirstName_LastName_CompanyName.pdf`, fallback `FirstName_LastName_Resume.pdf`.
  - Used by: email attachment, Download PDF, Download LaTeX (`.tex` sibling name), saved generated resume, version history download.
- Download fixes in Resume Studio (`resume-studio/$id.tsx`)
  - Rebuild download handlers to always fetch fresh signed URL, force `download` attribute with computed filename, verify Blob has bytes, surface toast on failure.
  - Same for `.tex` (use `text/x-tex` blob from `tex_content`).

## Phase 2 — Profile Module

**Goal:** central "source of truth" profile used by AI generation.

- DB migration `profiles_v2`:
  - Extend `profiles` with: phone, location, linkedin, github, portfolio, summary.
  - New tables (RLS `auth.uid() = user_id`, GRANTs to authenticated + service_role):
    `profile_education`, `profile_experience`, `profile_projects`, `profile_skills` (category+items), `profile_certifications`, `profile_achievements`, `profile_languages`.
- Server fns `src/lib/profile-data.functions.ts`: CRUD per section + `getFullProfile`.
- Sidebar entry "Profile" → `/profile` route with tabbed sections + inline editors (reuse shadcn primitives).
- Import from resume: reuse existing resume parse pipeline (`resume-studio` extraction) to populate a draft profile the user reviews before saving.
- Resume generation prompts (`resume-studio.functions.ts`) read `getFullProfile` when present and use it as ground truth (no fabrication rule already in place).

## Phase 3 — Interactive Resume Editing + AI Suggestion Prompts

- "Update Resume" button next to LaTeX editor → dialog with free-form instructions → `improveResumeSection` variant that operates on full doc with instructions.
- Cursor-style inline edit
  - CodeMirror selection listener; floating "Ask AI" button anchored to selection range.
  - New server fn `rewriteResumeSelection({ tex, selection, instructions, jd? })` → returns replacement text; client replaces only that range.
- Every existing "Improve X" button opens a small prompt dialog with an optional `instructions` textarea (already partially wired for section improve) — extend to all Improve actions and pass through.

## Phase 4 — AI Email Generation (Jobs + Send) & Personalization

- Community Jobs "Generate Email" → routes into Resume Studio if JD present; after PDF built, opens AI email dialog pre-filled with JD/company/role/template/profile → `generateAiEmail` (already exists) with optional instructions; result → `/send` prefilled with PDF attached.
- Send page "Generate Body Using AI" button (separate from template select): opens modal with JD + instructions inputs, calls `generateAiEmail`, writes into subject/body fields (editable). Preserves `{{name}}` placeholder.
- Confirm send-time personalization stays greeting-only (already the case – add a regression test comment in code).

---

## Technical notes

- No new packages needed beyond what's installed (CodeMirror already ships with `@uiw/react-codemirror` in the editor component).
- Zod v4 signature already fixed project-wide; new schemas will use v4 syntax.
- All new server fns use `requireSupabaseAuth`; admin client only for storage ops.
- Every migration includes `GRANT` + RLS per project rules.
- After each phase: run `tsgo` + build; only advance when green.

## Out of scope (call out explicitly)

- Rewriting Template Marketplace, Analytics, Follow-ups, multi-account Gmail — the request lists these under "quality gates" but does not ask for changes; I will not touch them beyond verifying they still build.

---

**Approve this plan and I'll execute Phases 1→4 in sequence without stopping.** If you want a different order (e.g. Profile first), say so now — reordering after Phase 1 lands is cheap, reordering after Phase 2's migrations is not.