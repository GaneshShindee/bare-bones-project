import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateEmails, type GenerateResult } from "@/lib/email-generator.functions";
import {
  listInstructionTemplates,
  upsertInstructionTemplate,
  deleteInstructionTemplate,
  duplicateInstructionTemplate,
} from "@/lib/instruction-templates.functions";
import {
  EMAIL_PATTERN_OPTIONS,
  RULE_LIBRARY,
  DEFAULT_RULES,
  DEFAULT_PREFIXES,
  buildPrompt,
  previewEmail,
  newBlankTemplate,
  type InstructionTemplate,
  type EmailPattern,
} from "@/lib/instruction-templates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sparkles, Copy, Loader2, Plus, Pencil, Files, Trash2, ChevronDown, Settings2, X } from "lucide-react";
import { toast } from "sonner";

const LAST_TPL_KEY = "ai-gen:last-template-id";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUse: (emails: string[]) => void;
};

function copyText(t: string) {
  navigator.clipboard.writeText(t).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
  );
}

export function EmailGeneratorDialog({ open, onOpenChange, onUse }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listInstructionTemplates);
  const upsertFn = useServerFn(upsertInstructionTemplate);
  const deleteFn = useServerFn(deleteInstructionTemplate);
  const dupFn = useServerFn(duplicateInstructionTemplate);
  const genFn = useServerFn(generateEmails);

  const templates = useQuery({
    queryKey: ["instruction-templates"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<InstructionTemplate | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [data, setData] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  // Restore last template / auto-select first
  useEffect(() => {
    if (!open || !templates.data) return;
    if (templates.data.length === 0) {
      setSelectedId(null);
      return;
    }
    const last = typeof window !== "undefined" ? localStorage.getItem(LAST_TPL_KEY) : null;
    const found = last && templates.data.find((t) => t.id === last);
    setSelectedId((cur) => cur ?? (found ? found.id : templates.data[0].id));
  }, [open, templates.data]);

  useEffect(() => {
    if (selectedId && typeof window !== "undefined") localStorage.setItem(LAST_TPL_KEY, selectedId);
  }, [selectedId]);

  const selected = useMemo(
    () => templates.data?.find((t) => t.id === selectedId) ?? null,
    [templates.data, selectedId],
  );

  // Working copy for live domain/rule tweaks without saving
  const [working, setWorking] = useState<InstructionTemplate | null>(null);
  useEffect(() => {
    setWorking(selected ? { ...selected } : null);
    setPromptOverride(null);
  }, [selected]);

  const generatedPrompt = useMemo(() => (working ? buildPrompt(working) : ""), [working]);
  const effectivePrompt = promptOverride ?? generatedPrompt;

  const totalLines = useMemo(
    () => data.split(/\r?\n/).filter((l) => l.trim()).length,
    [data],
  );

  const generate = useMutation({
    mutationFn: () => genFn({ data: { instructions: effectivePrompt, data } }),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast.error("Generation failed", { description: (e as Error).message }),
  });

  const upsert = useMutation({
    mutationFn: (t: InstructionTemplate) =>
      upsertFn({
        data: {
          id: t.id || null,
          name: t.name,
          email_pattern: t.email_pattern,
          custom_pattern: t.custom_pattern,
          company_domain: t.company_domain,
          batch_size: t.batch_size,
          rules: t.rules,
          prefixes: t.prefixes,
          custom_rules: t.custom_rules,
          surname_min_length: t.surname_min_length,
        },
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["instruction-templates"] });
      setSelectedId(row.id);
      setEditorOpen(false);
      toast.success("Template saved");
    },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instruction-templates"] });
      setSelectedId(null);
      toast.success("Template deleted");
    },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });

  const dup = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["instruction-templates"] });
      setSelectedId(row.id);
      toast.success("Duplicated");
    },
  });

  const emails = result?.emails ?? [];
  const skipped = result?.skipped ?? [];
  const batchSize = working?.batch_size ?? 100;
  const batches = useMemo(() => {
    const size = Math.max(1, Math.min(1000, batchSize || 100));
    const out: string[][] = [];
    for (let i = 0; i < emails.length; i += size) out.push(emails.slice(i, i + size));
    return out;
  }, [emails, batchSize]);
  const commaList = emails.join(", ");

  const preview = working ? previewEmail("Ganesh Shinde", working) : "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI Email Generator
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 grid md:grid-cols-2 gap-0 overflow-hidden">
            {/* Left: template + data */}
            <div className="flex flex-col gap-4 p-4 border-r min-h-0 overflow-y-auto">
              {/* Template selector */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Instruction Template</Label>
                <div className="flex gap-2">
                  <Select
                    value={selectedId ?? ""}
                    onValueChange={(v) => setSelectedId(v)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={templates.data?.length ? "Select template" : "No templates yet"} />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.data?.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" title="Template actions">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditing({ id: "", ...newBlankTemplate() } as InstructionTemplate); setEditorOpen(true); }}>
                        <Plus className="h-4 w-4 mr-2" /> New Template
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!selected} onClick={() => { if (selected) { setEditing({ ...selected }); setEditorOpen(true); } }}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit Template
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!selected} onClick={() => selected && dup.mutate(selected.id)}>
                        <Files className="h-4 w-4 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!selected}
                        onClick={() => selected && confirm(`Delete "${selected.name}"?`) && del.mutate(selected.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {!templates.data?.length && (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => { setEditing({ id: "", ...newBlankTemplate("My Template") } as InstructionTemplate); setEditorOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1" /> Create your first template
                  </Button>
                )}
              </div>

              {/* Quick controls bound to working copy */}
              {working && (
                <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Email Pattern</Label>
                      <Select
                        value={working.email_pattern}
                        onValueChange={(v) => setWorking({ ...working, email_pattern: v as EmailPattern })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EMAIL_PATTERN_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Company Domain</Label>
                      <Input
                        className="h-8 text-xs"
                        placeholder="milliman.com"
                        value={working.company_domain}
                        onChange={(e) => setWorking({ ...working, company_domain: e.target.value })}
                      />
                    </div>
                  </div>
                  {working.email_pattern === "custom" && (
                    <div>
                      <Label className="text-xs">Custom Pattern</Label>
                      <Input
                        className="h-8 text-xs font-mono"
                        placeholder="{first}.{last}"
                        value={working.custom_pattern}
                        onChange={(e) => setWorking({ ...working, custom_pattern: e.target.value })}
                      />
                    </div>
                  )}
                  <div className="text-xs">
                    <span className="text-muted-foreground">Live preview: </span>
                    <span className="font-mono">Ganesh Shinde → </span>
                    <span className="font-mono text-primary">{preview || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] text-muted-foreground">
                      {Object.values(working.rules).filter(Boolean).length}/{RULE_LIBRARY.length} rules on · {working.custom_rules.length} custom
                    </div>
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => { setEditing({ ...working }); setEditorOpen(true); }}>
                      <Settings2 className="h-3.5 w-3.5 mr-1" /> Rules
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-[180px] flex flex-col">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Data</Label>
                <Textarea
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  placeholder="Paste LinkedIn search results, employee list, Excel data, CSV, or any text…"
                  className="font-mono text-xs mt-1 flex-1 min-h-[180px]"
                />
                <div className="text-xs text-muted-foreground mt-1">{totalLines} non-empty lines</div>
              </div>

              {/* Advanced */}
              <div className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium"
                >
                  <span>Advanced · generated prompt</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                </button>
                {advancedOpen && (
                  <div className="border-t p-3 space-y-2">
                    <Textarea
                      value={effectivePrompt}
                      onChange={(e) => setPromptOverride(e.target.value)}
                      rows={8}
                      className="font-mono text-[11px]"
                    />
                    {promptOverride !== null && (
                      <Button variant="ghost" size="sm" onClick={() => setPromptOverride(null)}>
                        Reset to generated
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <Button
                onClick={() => generate.mutate()}
                disabled={generate.isPending || !data.trim() || !working}
                className="w-full"
              >
                {generate.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Generate Emails</>
                )}
              </Button>
            </div>

            {/* Right: results */}
            <div className="flex flex-col min-h-0 overflow-hidden">
              <div className="grid grid-cols-4 gap-2 p-3 border-b text-center text-xs">
                <Stat label="Lines" value={totalLines} />
                <Stat label="Generated" value={emails.length} />
                <Stat label="Skipped" value={skipped.length} />
                <Stat label="Batches" value={batches.length} />
              </div>

              <Tabs defaultValue="list" className="flex-1 min-h-0 flex flex-col">
                <TabsList className="mx-3 mt-3 self-start">
                  <TabsTrigger value="list">Emails</TabsTrigger>
                  <TabsTrigger value="comma">Comma</TabsTrigger>
                  <TabsTrigger value="batches">Batches</TabsTrigger>
                  <TabsTrigger value="skipped">Skipped</TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="flex-1 min-h-0 overflow-auto px-3 pb-3 mt-2">
                  {emails.length === 0 ? <Empty /> : (
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">{emails.join("\n")}</pre>
                  )}
                </TabsContent>

                <TabsContent value="comma" className="flex-1 min-h-0 overflow-auto px-3 pb-3 mt-2">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" disabled={!commaList} onClick={() => copyText(commaList)}>
                      <Copy className="h-3 w-3 mr-1" /> Copy all
                    </Button>
                  </div>
                  {commaList ? (
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">{commaList}</pre>
                  ) : <Empty />}
                </TabsContent>

                <TabsContent value="batches" className="flex-1 min-h-0 overflow-auto px-3 pb-3 mt-2 space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Batch size</Label>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={batchSize}
                      onChange={(e) => working && setWorking({ ...working, batch_size: parseInt(e.target.value) || 100 })}
                      className="h-7 w-24"
                    />
                  </div>
                  {batches.length === 0 && <Empty />}
                  {batches.map((b, i) => {
                    const text = b.join(", ");
                    return (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium">Part {i + 1} <Badge variant="secondary" className="ml-1">{b.length}</Badge></div>
                          <Button size="sm" variant="outline" onClick={() => copyText(text)}>
                            <Copy className="h-3 w-3 mr-1" /> Copy
                          </Button>
                        </div>
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto">{text}</pre>
                      </div>
                    );
                  })}
                </TabsContent>

                <TabsContent value="skipped" className="flex-1 min-h-0 overflow-auto px-3 pb-3 mt-2 space-y-2">
                  {skipped.length === 0 && <Empty />}
                  {skipped.map((s, i) => (
                    <div key={i} className="rounded-md border p-2 text-xs">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-muted-foreground">Reason: {s.reason}</div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={emails.length === 0}
              onClick={() => {
                onUse(emails);
                onOpenChange(false);
                toast.success(`Inserted ${emails.length} recipients`);
              }}
            >
              Use {emails.length} Generated Email{emails.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateEditorDialog
        open={editorOpen}
        template={editing}
        onOpenChange={setEditorOpen}
        onSave={(t) => upsert.mutate(t)}
        saving={upsert.isPending}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="text-xs text-muted-foreground text-center py-8">
      No results yet. Paste data on the left and click Generate.
    </div>
  );
}

function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: InstructionTemplate | null;
  onSave: (t: InstructionTemplate) => void;
  saving: boolean;
}) {
  const [t, setT] = useState<InstructionTemplate | null>(template);
  const [newPrefix, setNewPrefix] = useState("");
  const [newRule, setNewRule] = useState("");

  useEffect(() => { setT(template ? { ...template } : null); }, [template]);

  if (!t) return null;

  const rules = { ...DEFAULT_RULES, ...t.rules };
  const setRule = (k: string, v: boolean) => setT({ ...t, rules: { ...rules, [k]: v } });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{template?.id ? "Edit Template" : "New Template"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
            </div>
            <div>
              <Label>Email Pattern</Label>
              <Select value={t.email_pattern} onValueChange={(v) => setT({ ...t, email_pattern: v as EmailPattern })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMAIL_PATTERN_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Company Domain</Label>
              <Input placeholder="milliman.com" value={t.company_domain} onChange={(e) => setT({ ...t, company_domain: e.target.value })} />
            </div>
            {t.email_pattern === "custom" && (
              <div className="col-span-2">
                <Label>Custom Pattern</Label>
                <Input className="font-mono" placeholder="{first}.{last}" value={t.custom_pattern} onChange={(e) => setT({ ...t, custom_pattern: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Tokens: {"{first}"} {"{last}"} {"{f}"} {"{l}"}</p>
              </div>
            )}
            <div>
              <Label>Batch Size</Label>
              <Input type="number" min={1} max={1000} value={t.batch_size} onChange={(e) => setT({ ...t, batch_size: parseInt(e.target.value) || 100 })} />
            </div>
            <div>
              <Label>Surname min length</Label>
              <Input type="number" min={0} max={20} value={t.surname_min_length} onChange={(e) => setT({ ...t, surname_min_length: parseInt(e.target.value) || 0 })} />
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Rule Library</Label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {RULE_LIBRARY.map((r) => (
                <label key={r.key} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                  <Checkbox checked={rules[r.key] !== false} onCheckedChange={(v) => setRule(r.key, !!v)} />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Prefixes to strip</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.prefixes.map((p, i) => (
                <Badge key={`${p}-${i}`} variant="secondary" className="gap-1">
                  {p}
                  <button onClick={() => setT({ ...t, prefixes: t.prefixes.filter((_, idx) => idx !== i) })}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <div className="flex gap-1">
                <Input
                  className="h-7 w-24 text-xs"
                  placeholder="Add…"
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newPrefix.trim()) {
                      e.preventDefault();
                      setT({ ...t, prefixes: [...t.prefixes, newPrefix.trim()] });
                      setNewPrefix("");
                    }
                  }}
                />
                <Button size="sm" variant="outline" type="button" onClick={() => { if (newPrefix.trim()) { setT({ ...t, prefixes: [...t.prefixes, newPrefix.trim()] }); setNewPrefix(""); } }}>
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Custom Rules</Label>
            <div className="mt-2 space-y-1.5">
              {t.custom_rules.map((r, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input value={r} onChange={(e) => {
                    const next = [...t.custom_rules]; next[i] = e.target.value;
                    setT({ ...t, custom_rules: next });
                  }} />
                  <Button size="icon" variant="ghost" onClick={() => setT({ ...t, custom_rules: t.custom_rules.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder='e.g. Skip names ending with " Jr"'
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newRule.trim()) {
                      e.preventDefault();
                      setT({ ...t, custom_rules: [...t.custom_rules, newRule.trim()] });
                      setNewRule("");
                    }
                  }}
                />
                <Button variant="outline" type="button" onClick={() => { if (newRule.trim()) { setT({ ...t, custom_rules: [...t.custom_rules, newRule.trim()] }); setNewRule(""); } }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Rule
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || !t.name.trim()} onClick={() => onSave(t)}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}