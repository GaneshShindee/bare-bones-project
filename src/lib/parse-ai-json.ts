/**
 * Parse JSON returned by LLM gateways. Models often emit LaTeX or Windows paths
 * with bare backslashes (`\usepackage`, `\begin`) which are invalid JSON escapes.
 */

function extractJsonBlob(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    // Prefer full document when it already looks like JSON
    const endObj = trimmed.lastIndexOf("}");
    const endArr = trimmed.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (end > 0) return trimmed.slice(0, end + 1);
    return trimmed;
  }
  const m = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) throw new Error("AI returned invalid JSON");
  return m[0];
}

/** Fix illegal `\` escapes so JSON.parse can succeed (keeps valid JSON escapes). */
export function repairJsonEscapes(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i]!;
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }

    // Inside a JSON string
    if (escaped) {
      // Previous char was `\`; current must form a valid escape or we already doubled it
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      const next = json[i + 1];
      if (next === undefined) {
        out += "\\\\";
        continue;
      }
      // Always-valid JSON escapes
      if (next === '"' || next === "\\" || next === "/") {
        out += "\\";
        escaped = true;
        continue;
      }
      // \b \f \n \r \t — only treat as JSON if NOT followed by a letter
      // (otherwise it's LaTeX like \begin, \newcommand, \textbf)
      if ("bfnrt".includes(next)) {
        const after = json[i + 2];
        if (after && /[A-Za-z]/.test(after)) {
          out += "\\\\";
          continue;
        }
        out += "\\";
        escaped = true;
        continue;
      }
      if (next === "u") {
        const hex = json.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += "\\";
          escaped = true;
          continue;
        }
        // Invalid \u — treat as literal backslash
        out += "\\\\";
        continue;
      }
      // Invalid escape (e.g. LaTeX \usepackage) — escape the backslash
      out += "\\\\";
      continue;
    }

    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }

    // Control chars inside strings break JSON.parse
    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      continue;
    }
    if (ch === "\t") {
      out += "\\t";
      continue;
    }

    out += ch;
  }

  return out;
}

export function parseAiJson<T = unknown>(raw: string): T {
  const blob = extractJsonBlob(raw);
  try {
    return JSON.parse(blob) as T;
  } catch (first) {
    try {
      return JSON.parse(repairJsonEscapes(blob)) as T;
    } catch {
      // Last resort: strip trailing junk after last brace
      const repaired = repairJsonEscapes(blob);
      const lastBrace = Math.max(repaired.lastIndexOf("}"), repaired.lastIndexOf("]"));
      if (lastBrace > 0) {
        try {
          return JSON.parse(repaired.slice(0, lastBrace + 1)) as T;
        } catch {
          /* fall through */
        }
      }
      throw first instanceof Error ? first : new Error("AI returned invalid JSON");
    }
  }
}
