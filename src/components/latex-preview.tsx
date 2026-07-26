import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2, RefreshCw, Download, FileText, AlertTriangle, CheckCircle2,
  ZoomIn, ZoomOut, Maximize2, Printer, RotateCw,
} from "lucide-react";
import { PdfViewer } from "@/components/pdf-viewer";

type CompileError = { line: number | null; message: string; suggestion?: string };
type CompileResponse =
  | { success: true; pdfBase64: string; log: string; errors: [] }
  | { success: false; errors: CompileError[]; log: string };

type Status = "idle" | "compiling" | "success" | "error";

export function LatexPreview({
  tex,
  filename = "resume.tex",
  downloadName,
  onCompiled,
  onErrors,
  autoCompile = true,
  debounceMs = 900,
}: {
  tex: string;
  filename?: string;
  downloadName?: string;
  onCompiled?: (pdfBase64: string) => void;
  onErrors?: (errors: CompileError[]) => void;
  autoCompile?: boolean;
  debounceMs?: number;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<CompileError[]>([]);
  const [log, setLog] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<"width" | "page" | "custom">("width");
  const [containerWidth, setContainerWidth] = useState(600);
  const viewerWrapRef = useRef<HTMLDivElement | null>(null);
  const lastTexRef = useRef<string>("");
  const inflightRef = useRef<AbortController | null>(null);

  const pdfDownloadName = useMemo(() => {
    const base = (downloadName ?? filename).replace(/\.tex$/i, "");
    return `${base || "resume"}.pdf`;
  }, [downloadName, filename]);

  const compile = useCallback(async () => {
    if (!tex.trim()) return;
    inflightRef.current?.abort();
    const ac = new AbortController();
    inflightRef.current = ac;
    setStatus("compiling");
    try {
      const res = await fetch("/api/latex/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: tex, filename }),
        signal: ac.signal,
      });
      const data = (await res.json()) as CompileResponse;
      if (data.success) {
        const bytes = base64ToBytes(data.pdfBase64);
        const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" });
        setPdfBytes(new Uint8Array(bytes));
        setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        setStatus("success");
        setErrors([]);
        setLog("");
        lastTexRef.current = tex;
        onCompiled?.(data.pdfBase64);
        onErrors?.([]);
      } else {
        setStatus("error");
        setErrors(data.errors);
        setLog(data.log ?? "");
        onErrors?.(data.errors);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setStatus("error");
      setErrors([{ line: null, message: (e as Error).message }]);
    }
  }, [tex, filename, onCompiled, onErrors]);

  // Debounced auto-compile
  useEffect(() => {
    if (!autoCompile) return;
    if (!tex || tex === lastTexRef.current) return;
    const t = setTimeout(() => { void compile(); }, debounceMs);
    return () => clearTimeout(t);
  }, [tex, autoCompile, debounceMs, compile]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const iframeSrc = useMemo(() => {
    if (!pdfUrl) return null;
    const zoomParam = fitMode === "width" ? "page-width" : fitMode === "page" ? "page-fit" : String(zoom);
    return `${pdfUrl}#zoom=${zoomParam}&toolbar=1&navpanes=0`;
  }, [pdfUrl, zoom, fitMode]);

  const downloadPdf = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = pdfDownloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadTex = () => {
    const blob = new Blob([tex], { type: "application/x-tex" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const print = () => { iframeRef.current?.contentWindow?.print(); };
  const fullscreen = () => { iframeRef.current?.requestFullscreen().catch(() => {}); };
  const applyZoom = (next: number) => { setFitMode("custom"); setZoom(Math.max(25, Math.min(400, next))); };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 gap-2 flex-wrap">
        <div className="text-xs flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <StatusPill status={status} />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <div className="flex items-center border border-border rounded-md">
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => applyZoom(zoom - 25)} title="Zoom out">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <button
              type="button"
              onClick={() => setFitMode(fitMode === "width" ? "page" : "width")}
              className="text-xs px-2 min-w-[3.5rem] text-center hover:bg-accent h-8"
              title="Toggle fit width / fit page"
            >
              {fitMode === "width" ? "Fit W" : fitMode === "page" ? "Fit P" : `${zoom}%`}
            </button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => applyZoom(zoom + 25)} title="Zoom in">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate">
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={print} disabled={!pdfUrl} title="Print">
            <Printer className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={fullscreen} disabled={!pdfUrl} title="Fullscreen">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={downloadTex} title="Download .tex source">
            <Download className="h-3.5 w-3.5 mr-1" />.tex
          </Button>
          <Button size="sm" className="h-8" onClick={downloadPdf} disabled={!pdfUrl} title="Download the latest compiled PDF">
            <Download className="h-3.5 w-3.5 mr-1" />PDF
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => void compile()} disabled={status === "compiling"}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${status === "compiling" ? "animate-spin" : ""}`} />
            Compile
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative bg-muted/20">
        {iframeSrc ? (
          <iframe
            ref={iframeRef}
            title="Resume PDF"
            src={iframeSrc}
            className="w-full h-full border-0"
            style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: "center center" }}
          />
        ) : (
          <div className="h-full grid place-items-center text-center p-6">
            <div>
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
              <div className="text-sm text-muted-foreground">
                {status === "compiling" ? "Compiling…" : "Edit the LaTeX source to see a live PDF preview."}
              </div>
              <div className="text-xs text-muted-foreground/70 mt-1">
                Compilation runs on a TeX Live server — no local install required.
              </div>
            </div>
          </div>
        )}
        {status === "compiling" && pdfUrl && (
          <div className="absolute top-2 right-2 bg-background/90 border border-border rounded-md px-2 py-1 text-xs flex items-center gap-1 shadow">
            <Loader2 className="h-3 w-3 animate-spin" /> Compiling…
          </div>
        )}
        {status === "error" && errors.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 max-h-[50%] overflow-auto bg-destructive/10 border-t border-destructive/30 p-3">
            <div className="flex items-center gap-2 text-destructive text-sm font-semibold mb-2">
              <AlertTriangle className="h-4 w-4" /> Compilation failed ({errors.length} error{errors.length > 1 ? "s" : ""})
            </div>
            <ul className="space-y-2 text-xs">
              {errors.slice(0, 20).map((e, i) => (
                <li key={i} className="border-l-2 border-destructive/60 pl-2">
                  {e.line !== null && <div className="font-mono text-destructive">Line {e.line}</div>}
                  <div className="text-foreground/90">{e.message}</div>
                  {e.suggestion && <div className="text-muted-foreground italic">{e.suggestion}</div>}
                </li>
              ))}
            </ul>
            {log && (
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Full compiler log</summary>
                <pre className="whitespace-pre-wrap mt-1 max-h-60 overflow-auto">{log}</pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  if (status === "compiling") return <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Compiling…</span>;
  if (status === "success")   return <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Compiled</span>;
  if (status === "error")     return <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> Failed</span>;
  return <span className="text-muted-foreground">Live PDF preview</span>;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
