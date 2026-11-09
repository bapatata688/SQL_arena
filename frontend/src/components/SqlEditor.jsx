import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { RotateCcw } from 'lucide-react';

export default function SqlEditor({
  code,
  onChange,
  onReset,
  onRun,
  onSubmit,
  loading
}) {
  const onRunRef = useRef(onRun);
  const onSubmitRef = useRef(onSubmit);

  useEffect(() => {
    onRunRef.current = onRun;
    onSubmitRef.current = onSubmit;
  }, [onRun, onSubmit]);

  const handleEditorDidMount = (editor, monaco) => {
    // Add custom keybindings inside Monaco Editor with ref-based fresh callback
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current?.();
    });

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => {
        onSubmitRef.current?.();
      }
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 border-b lg:border-b-0 lg:border-r border-slate-800">
      {/* Editor Sub-Header Toolbar */}
      <div className="h-9 px-4 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between select-none">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>MySQL Editor</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded hover:bg-slate-800 transition"
            title="Restaurar código inicial"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reiniciar</span>
          </button>
        </div>
      </div>

      {/* Monaco Editor Container */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language="mysql"
          theme="vs-dark"
          value={code}
          onChange={(value) => onChange(value || '')}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 13,
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            suggestOnTriggerCharacters: true
          }}
        />
      </div>
    </div>
  );
}
