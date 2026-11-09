import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileCode, Database, Eye, ChevronDown, ChevronRight } from 'lucide-react';

export default function ProblemDescription({ problem }) {
  const [showDML, setShowDML] = useState(true);

  if (!problem) {
    return (
      <div className="p-8 text-center text-slate-500">
        Cargando especificación del ejercicio...
      </div>
    );
  }

  const getDifficultyColor = (diff) => {
    switch (diff?.toLowerCase()) {
      case 'easy': return 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
      case 'medium': return 'text-amber-400 bg-amber-950/60 border-amber-800';
      case 'hard': return 'text-rose-400 bg-rose-950/60 border-rose-800';
      default: return 'text-slate-400 bg-slate-900 border-slate-700';
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6 text-slate-300">
      {/* Title & Metadata */}
      <div className="mb-6 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs px-2.5 py-0.5 rounded border font-semibold ${getDifficultyColor(problem.difficulty)}`}>
            {problem.difficulty}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            ID: {problem.id}
          </span>
        </div>
        <h1 className="text-xl font-bold text-slate-100">
          {problem.title}
        </h1>
      </div>

      {/* Markdown Problem Description */}
      <div className="prose prose-invert prose-indigo max-w-none text-sm space-y-4">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h3: ({ children }) => (
              <h3 className="text-sm font-bold text-slate-200 mt-4 mb-2 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-sky-400" />
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="text-slate-300 leading-relaxed mb-3">
                {children}
              </p>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-3 rounded-lg border border-slate-800 bg-slate-900/40">
                <table className="w-full text-xs text-left border-collapse">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-slate-800/80 text-slate-200 uppercase tracking-wider font-mono text-[11px] border-b border-slate-700">
                {children}
              </thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {children}
              </tbody>
            ),
            tr: ({ children }) => (
              <tr className="hover:bg-slate-800/20">
                {children}
              </tr>
            ),
            th: ({ children }) => (
              <th className="px-3 py-1.5 font-medium text-slate-300">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-1.5 text-slate-300">
                {children}
              </td>
            ),
            code: ({ inline, children }) => {
              if (inline) {
                return (
                  <code className="bg-slate-800 text-indigo-300 px-1 py-0.5 rounded text-xs font-mono">
                    {children}
                  </code>
                );
              }
              return (
                <pre className="p-3 my-2 text-xs font-mono bg-slate-900 text-slate-200 rounded-lg border border-slate-800 overflow-x-auto">
                  <code>{children}</code>
                </pre>
              );
            }
          }}
        >
          {problem.description}
        </ReactMarkdown>
      </div>

      {/* Schema / DDL Accordion */}
      <div className="mt-8 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            <span>DDL de Creación y Datos Semilla (MySQL Sandbox)</span>
          </div>
          <button
            onClick={() => setShowDML(!showDML)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition px-2 py-0.5 rounded hover:bg-slate-800"
          >
            {showDML ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span>{showDML ? 'Ocultar DDL' : 'Mostrar DDL'}</span>
          </button>
        </div>

        {showDML && (
          <div className="mt-2 space-y-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">
              <span className="text-[11px] font-mono text-indigo-400 font-semibold block mb-1">
                Schema DDL:
              </span>
              <pre className="text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {problem.schemaDDL?.trim()}
              </pre>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">
              <span className="text-[11px] font-mono text-teal-400 font-semibold block mb-1">
                Seed DML:
              </span>
              <pre className="text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {problem.seedDML?.trim()}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

