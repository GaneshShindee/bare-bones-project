import Editor from "@monaco-editor/react";
import { useEffect } from "react";

export function LatexEditor({
  value,
  onChange,
  height = "100%",
}: {
  value: string;
  onChange: (v: string) => void;
  height?: string | number;
}) {
  useEffect(() => {
    // Register a lightweight LaTeX language for syntax highlighting on first mount.
    // Monaco's global registration is idempotent because we check by id below.
  }, []);
  return (
    <Editor
      height={height}
      defaultLanguage="latex"
      language="latex"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      theme="vs-dark"
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
      }}
    />
  );
}
