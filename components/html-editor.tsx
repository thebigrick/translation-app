"use client";

import { useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { EditorView } from "@codemirror/view";
import { Box } from "@bigcommerce/big-design";

interface HtmlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  height?: string;
}

export default function HtmlEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  height = "600px",
}: HtmlEditorProps) {
  const editorRef = useRef<any>(null);
  const currentValueRef = useRef<string>(value || "");

  // Update ref when value changes
  useEffect(() => {
    currentValueRef.current = value || "";
  }, [value]);

  const extensions = [
    html(),
    EditorView.theme({
      "&": {
        fontSize: "14px",
        width: "100%",
        maxWidth: "100%",
        height: "100%",
      },
      ".cm-scroller": {
        overflowX: "scroll",
        overflowY: "scroll",
        width: "100%",
        maxWidth: "100%",
      },
      ".cm-content": {
        minHeight: "100%",
        overflowWrap: "normal",
        wordBreak: "normal",
        padding: "0",
      },
      ".cm-editor": {
        width: "100%",
        maxWidth: "100%",
        height: "100%",
      },
      ".cm-gutters": {
        flexShrink: 0,
      },
      ".cm-line": {
        whiteSpace: "pre",
      },
      ".cm-lineNumbers": {
        minWidth: "3ch",
      },
    }),
  ];

  if (readOnly) {
    extensions.push(EditorView.editable.of(false));
  }

  return (
    <Box
      style={{
        height: height === "100%" ? "100%" : height,
        minHeight: height === "100%" ? "0" : height,
        border: "1px solid #e0e0e0",
        borderRadius: "4px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        backgroundColor: "#fff",
      }}
    >
      <CodeMirror
        ref={editorRef}
        value={value || ""}
        onChange={onChange}
        extensions={extensions}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          dropCursor: !readOnly,
          allowMultipleSelections: false,
          indentOnInput: !readOnly,
          bracketMatching: true,
          closeBrackets: !readOnly,
          autocompletion: !readOnly,
          highlightSelectionMatches: !readOnly,
        }}
        style={{
          height: "100%",
          fontSize: "14px",
          flex: 1,
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
        }}
      />
    </Box>
  );
}

