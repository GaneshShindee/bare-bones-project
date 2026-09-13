import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

export type EditorSelection = {
  text: string;
  /** 0-based character offsets into the document. */
  start: number;
  end: number;
  /** Viewport position of the selection end, for anchoring a floating toolbar. */
  top: number;
  left: number;
};

export type LatexEditorApi = {
  /** Replace a character range and select the inserted text. */
  replaceRange: (start: number, end: number, text: string) => void;
  focus: () => void;
};

export function LatexEditor({
  value,
  onChange,
  height = "100%",
  errorLines = [],
  onSelectionChange,
  onReady,
}: {
  value: string;
  onChange: (v: string) => void;
  height?: string | number;
  /** Line numbers (1-based) to mark as errors in the gutter. */
  errorLines?: number[];
  onSelectionChange?: (sel: EditorSelection | null) => void;
  onReady?: (api: LatexEditorApi) => void;
}) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const decorationsRef = useRef<string[]>([]);

  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    const model = ed.getModel();
    if (!model) return;
    const decos = errorLines
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => ({
        range: new monaco.Range(n, 1, n, 1),
        options: {
          isWholeLine: true,
          className: "bg-destructive/10",
          glyphMarginClassName: "before:content-['●'] before:text-destructive",
          linesDecorationsClassName: "border-l-2 border-destructive",
          overviewRuler: { color: "rgba(239,68,68,0.9)", position: 4 },
        },
      }));
    decorationsRef.current = ed.deltaDecorations(decorationsRef.current, decos);
    if (errorLines.length > 0) {
      ed.revealLineInCenter(errorLines[0]);
    }
  }, [errorLines]);

  return (
    <Editor
      height={height}
      defaultLanguage="latex"
      language="latex"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      theme="vs-dark"
      onMount={(editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        onReady?.({
          replaceRange: (start, end, text) => {
            const model = editor.getModel();
            if (!model) return;
            const range = monaco.Range.fromPositions(
              model.getPositionAt(start),
              model.getPositionAt(end),
            );
            editor.executeEdits("ask-ai", [{ range, text, forceMoveMarkers: true }]);
            editor.pushUndoStop();
          },
          focus: () => editor.focus(),
        });
        if (onSelectionChange) {
          editor.onDidChangeCursorSelection(() => {
            const model = editor.getModel();
            const sel = editor.getSelection();
            if (!model || !sel || sel.isEmpty()) {
              onSelectionChange(null);
              return;
            }
            const text = model.getValueInRange(sel);
            if (!text.trim()) {
              onSelectionChange(null);
              return;
            }
            const endPos = sel.getEndPosition();
            const coords = editor.getScrolledVisiblePosition(endPos);
            onSelectionChange({
              text,
              start: model.getOffsetAt(sel.getStartPosition()),
              end: model.getOffsetAt(endPos),
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
            });
          });
        }
      }}
      beforeMount={(monaco) => {
        const langs = monaco.languages.getLanguages();
        if (!langs.some((l: { id: string }) => l.id === "latex")) {
          monaco.languages.register({ id: "latex", extensions: [".tex"], aliases: ["LaTeX", "latex"] });
          monaco.languages.setMonarchTokensProvider("latex", {
            defaultToken: "",
            tokenPostfix: ".tex",
            tokenizer: {
              root: [
                [/%.*$/, "comment"],
                [/\\[a-zA-Z@]+/, "keyword"],
                [/\\[^a-zA-Z@]/, "keyword"],
                [/[{}]/, "delimiter.bracket"],
                [/[[\]]/, "delimiter.square"],
                [/\$\$?/, "string.escape"],
                [/[a-zA-Z]+/, "text"],
                [/[0-9]+/, "number"],
              ],
            },
          });
          monaco.languages.setLanguageConfiguration("latex", {
            comments: { lineComment: "%" },
            brackets: [["{", "}"], ["[", "]"]],
            autoClosingPairs: [
              { open: "{", close: "}" },
              { open: "[", close: "]" },
              { open: "$", close: "$" },
            ],
          });
        }
      }}
      options={{
        minimap: { enabled: true, scale: 1 },
        fontSize: 13,
        wordWrap: "on",
        lineNumbers: "on",
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
        folding: true,
        scrollBeyondLastLine: false,
        renderWhitespace: "boundary",
        glyphMargin: true,
      }}
    />
  );
}
