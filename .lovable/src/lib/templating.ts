export function applyTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, k) => (vars[k] ?? `{{${k}}}`));
}

export function extractVariables(text: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([\w.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) set.add(m[1]);
  return [...set];
}