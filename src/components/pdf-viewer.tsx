import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Renders a PDF from raw bytes using PDF.js into canvases.
 * Reliable inside nested iframes (e.g. Lovable preview) where the browser's
 * built-in PDF plugin often refuses to render blob: URLs.
 */
export function PdfViewer({
  data,
  zoom,
  fitMode,
  rotation,
  containerWidth,
}: {
  data: Uint8Array | null;
  zoom: number; // percent, only used when fitMode === "custom"
  fitMode: "width" | "page" | "custom";
  rotation: number;
  containerWidth: number;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!data) { setDoc(null); return; }
    let cancelled = false;
    setError(null);
    // pdfjs mutates the buffer — clone so React state stays intact.
    const copy = new Uint8Array(data);
    const task = pdfjsLib.getDocument({ data: copy });
    task.promise
      .then((d) => { if (!cancelled) setDoc(d); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; task.destroy(); };
  }, [data]);

  useEffect(() => {
    if (!doc || !containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = "";
    let cancelled = false;

    (async () => {
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return;
        const page = await doc.getPage(i);
        const baseViewport = page.getViewport({ scale: 1, rotation });
        let scale = 1;
        if (fitMode === "width") {
          scale = Math.max(0.25, (containerWidth - 32) / baseViewport.width);
        } else if (fitMode === "page") {
          const h = container.clientHeight || 800;
          scale = Math.min((containerWidth - 32) / baseViewport.width, (h - 32) / baseViewport.height);
        } else {
          scale = zoom / 100;
        }
        const viewport = page.getViewport({ scale, rotation });
        const canvas = document.createElement("canvas");
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = "shadow-md bg-white mx-auto mb-3 rounded-sm";
        const ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);
        container.appendChild(canvas);
        try {
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        } catch (e) {
          if (!cancelled) console.error("pdf render failed", e);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [doc, zoom, fitMode, rotation, containerWidth]);

  if (error) {
    return (
      <div className="h-full grid place-items-center text-center p-6 text-destructive text-sm">
        Failed to render PDF: {error}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto p-4" />
  );
}
