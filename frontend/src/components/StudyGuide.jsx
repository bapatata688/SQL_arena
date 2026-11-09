import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, AlertTriangle, Lightbulb, CheckCircle2 } from 'lucide-react';

export default function StudyGuide({ topic }) {
  if (!topic) {
    return (
      <div className="p-8 text-center text-slate-500">
        Selecciona un módulo de estudio para ver la guía del Staff Engineer.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6 text-slate-300 leading-relaxed max-w-4xl mx-auto">
      {/* Module Header Badge */}
      <div className="mb-6 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800/80">
            {topic.badge}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">
          {topic.title}
        </h1>
        <p className="text-sm text-slate-400">
          {topic.summary}
        </p>
      </div>

      {/* Markdown Content */}
      <div className="prose prose-invert prose-indigo max-w-none text-sm space-y-4">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-bold text-slate-100 mt-6 mb-3 pb-2 border-b border-slate-800">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-lg font-semibold text-slate-200 mt-5 mb-2.5 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-indigo-500 rounded-sm"></span>
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-sm font-semibold text-slate-300 mt-4 mb-2">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="text-slate-300 leading-relaxed mb-3">
                {children}
              </p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside space-y-1 my-2 text-slate-300 pl-2">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside space-y-1 my-2 text-slate-300 pl-2">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-slate-300">
                {children}
              </li>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto my-4 rounded-lg border border-slate-800 bg-slate-900/50">
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
              <tr className="hover:bg-slate-800/30 transition">
                {children}
              </tr>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 font-medium text-slate-300">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                {children}
              </td>
            ),
            pre: ({ children }) => <>{children}</>,
            code: ({ className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '');
              const isBlock = Boolean(match) || (typeof children === 'string' && children.includes('\n'));
              if (!isBlock) {
                return (
                  <code className="bg-slate-800/90 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono border border-slate-700/60">
                    {children}
                  </code>
                );
              }
              const lang = match ? match[1].toLowerCase() : '';
              let badge = 'SQL Snippet';
              if (lang === 'text' || lang === 'ascii') {
                badge = 'Modelo Mental Visual / Arquitectura';
              } else if (lang && lang !== 'sql') {
                badge = `${lang.toUpperCase()} Snippet`;
              }
              return (
                <div className="my-3 rounded-lg overflow-hidden border border-slate-800 bg-slate-900/90">
                  <div className="bg-slate-800/70 px-3 py-1 text-[11px] font-mono text-slate-400 border-b border-slate-800 flex items-center justify-between">
                    <span>{badge}</span>
                  </div>
                  <pre className="p-3 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
                    <code>{children}</code>
                  </pre>
                </div>
              );
            },
            blockquote: ({ children }) => (
              <blockquote className="my-3 border-l-4 border-indigo-500 bg-indigo-950/20 px-4 py-2.5 rounded-r-lg text-slate-300 italic text-xs">
                {children}
              </blockquote>
            )
          }}
        >
          {topic.guide}
        </ReactMarkdown>
      </div>
    </div>
  );
}

