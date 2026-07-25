import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/latex/compile
 * body: { latex: string, filename?: string }
 * ok:   { success: true, pdfBase64: string, log: string }
 * fail: { success: false, errors: {line:number|null,message:string}[], log: string }
 *
 * Compilation runs on texlive.net (the public LaTeX-as-a-service used by
 * TeX StackExchange). Full TeX Live 2024 — no missing format files.
 */
const ENDPOINT = "https://texlive.net/cgi-bin/latexcgi";

type CompileError = { line: number | null; message: string; suggestion?: string };

function parseLatexLog(log: string): CompileError[] {
  const errors: CompileError[] = [];
  const lines = log.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Standard TeX error format: "! Undefined control sequence."
    if (line.startsWith("! ")) {
      const message = line.slice(2).trim();
      // Look ahead for "l.<number>" indicating the source line.
      let lineNo: number | null = null;
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const m = lines[j].match(/^l\.(\d+)/);
        if (m) { lineNo = Number(m[1]); break; }
      }
      const suggestion = suggestFor(message);
      errors.push({ line: lineNo, message, suggestion });
    }
    // LaTeX Error: File `xyz.sty' not found.
    const latexErr = line.match(/^(?:.*?)LaTeX Error: (.+)$/);
    if (latexErr && !line.startsWith("! ")) {
      errors.push({ line: null, message: latexErr[1] });
    }
  }
  return errors;
}

function suggestFor(msg: string): string | undefined {
  if (/Undefined control sequence/i.test(msg)) return "Check for a typo in a \\command or a missing \\usepackage.";
  if (/File .+ not found/i.test(msg)) return "The requested package or file is not available in TeX Live.";
  if (/Missing \\?\$/i.test(msg)) return "Unmatched math delimiter. Balance your $ or \\[ \\].";
  if (/Missing \} inserted/i.test(msg)) return "Unbalanced braces — check { } pairs.";
  if (/Emergency stop/i.test(msg)) return "Compilation aborted. Fix earlier errors first.";
  return undefined;
}

export const Route = createFileRoute("/api/latex/compile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { latex?: string; filename?: string };
        try { body = await request.json(); }
        catch { return Response.json({ success: false, errors: [{ line: null, message: "Invalid JSON body" }], log: "" }, { status: 400 }); }

        const latex = (body.latex ?? "").toString();
        const filename = (body.filename ?? "document.tex").toString().replace(/[^A-Za-z0-9._-]+/g, "_") || "document.tex";
        if (!latex.trim()) {
          return Response.json({ success: false, errors: [{ line: null, message: "Empty LaTeX source" }], log: "" }, { status: 400 });
        }
        if (latex.length > 500_000) {
          return Response.json({ success: false, errors: [{ line: null, message: "Source too large (max 500KB)" }], log: "" }, { status: 413 });
        }

        const form = new FormData();
        form.append("filename[]", filename);
        form.append("filecontents[]", latex);
        form.append("engine", "pdflatex");
        form.append("return", "pdf");

        let upstream: Response;
        try {
          upstream = await fetch(ENDPOINT, { method: "POST", body: form });
        } catch (e) {
          return Response.json({
            success: false,
            errors: [{ line: null, message: `Compilation service unreachable: ${(e as Error).message}` }],
            log: "",
          }, { status: 502 });
        }

        const contentType = upstream.headers.get("content-type") ?? "";
        if (upstream.ok && contentType.includes("application/pdf")) {
          const buf = new Uint8Array(await upstream.arrayBuffer());
          // base64 encode
          let bin = "";
          const chunk = 0x8000;
          for (let i = 0; i < buf.length; i += chunk) {
            bin += String.fromCharCode(...buf.subarray(i, i + chunk));
          }
          const pdfBase64 = btoa(bin);
          return Response.json({ success: true, pdfBase64, log: "", errors: [] });
        }

        // Failure — texlive.net returns the raw .log as text/plain.
        const log = await upstream.text();
        const errors = parseLatexLog(log);
        if (errors.length === 0) {
          errors.push({ line: null, message: "Compilation failed. See log below." });
        }
        return Response.json({ success: false, errors, log }, { status: 200 });
      },
    },
  },
});
