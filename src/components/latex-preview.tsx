import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Download, FileText, AlertTriangle } from "lucide-react";

/** Loads SwiftLaTeX's PdfTeXEngine on demand (browser-only). */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { PdfTeXEngine?: any }
}

async function loadEngine(): Promise<any> {
  if (typeof window === "undefined") throw new Error("Browser-only");
  if (window.PdfTeXEngine) return new window.PdfTeXEngine();
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/swiftlatex/PdfTeXEngine.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load PdfTeXEngine"));
    document.head.appendChild(s);
  });
  if (!window.PdfTeXEngine) throw new Error("PdfTeXEngine missing after load");
  return new window.PdfTeXEngine();
}

export function LatexPreview({
  tex,
  filename = "resume.tex",
  onCompiled,
  autoCompile = false,
}: {
  tex: string;
  filename?: string;
  onCompiled?: (pdfBase64: string) => void;
  autoCompile?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const engineRef = useRef<any>(null);
  const lastTexRef = useRef<string>("");

  const compile = async () => {
    setBusy(true); setError(null); setLog("");
    try {
      if (!engineRef.current) {
        engineRef.current = await loadEngine();
        await engineRef.current.loadEngine();
      }
      const eng = engineRef.current;
      eng.writeMemFSFile(filename, tex);
      eng.setEngineMainFile(filename);
      const r = await eng.compileLaTeX();
      setLog(String(r.log ?? "").slice(0, 20_000));
      if (r.status !== 0 || !r.pdf) {
        throw new Error("LaTeX compilation failed. See log below.");
      }
      const bytes = r.pdf as Uint8Array;
      const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      lastTexRef.current = tex;
      if (onCompiled) {
        // Convert Uint8Array -> base64 without blowing the stack.
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        onCompiled(btoa(bin));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoCompile && tex && tex !== lastTexRef.current) {
      const t = setTimeout(() => { void compile(); }, 800);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tex, autoCompile]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const download = () => {
    const blob = new Blob([tex], { type: "application/x-tex" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 gap-2">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" /> Live PDF preview
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={download}>
            <Download className="h-3.5 w-3.5 mr-1" /> .tex
          </Button>
          <Button size="sm" onClick={() => void compile()} disabled={busy}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${busy ? "animate-spin" : ""}`} />
            Compile
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative bg-muted/20">
        {pdfUrl ? (
          <iframe title="Resume PDF" src={pdfUrl} className="w-full h-full border-0" />
        ) : (
          <div className="h-full grid place-items-center text-center p-6">
            <div>
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
              <div className="text-sm text-muted-foreground">
                Click <span className="font-medium">Compile</span> to render your resume PDF in the browser.
              </div>
              <div className="text-xs text-muted-foreground/70 mt-1">First compile downloads the LaTeX engine (~15MB).</div>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-x-0 bottom-0 bg-destructive/10 border-t border-destructive/30 p-3">
            <div className="flex items-center gap-2 text-destructive text-sm font-medium">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
            {log && (
              <details className="mt-1 text-xs text-muted-foreground max-h-40 overflow-auto">
                <summary className="cursor-pointer">Compilation log</summary>
                <pre className="whitespace-pre-wrap">{log}</pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
