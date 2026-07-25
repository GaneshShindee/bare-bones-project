import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

export function LatexEditor({
  value,
  onChange,
  height = "100%",
  errorLines = [],
}: {
  value: string;
  onChange: (v: string) => void;
  height?: string | number;
  /** Line numbers (1-based) to mark as errors in the gutter. */
  errorLines?: number[];
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
