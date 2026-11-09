import React from 'react';
import { X, Activity, CheckCircle2, XCircle, AlertTriangle, FileText, ExternalLink } from 'lucide-react';

export default function TelemetryModal({ isOpen, onClose, summary }) {
  if (!isOpen) return null;

  const total = summary?.totalSubmissions || 0;
  const accepted = summary?.accepted || 0;
  const wrong = summary?.wrongAnswer || 0;
  const syntax = summary?.syntaxError || 0;
  const passRate = total > 0 ? ((accepted / total) * 100).toFixed(1) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-slate-100">
              Telemetría y Registro en Vivo
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sync Info Banner */}
        <div className="px-5 py-3 bg-indigo-950/30 border-b border-indigo-900/40 flex items-center gap-2 text-xs text-indigo-300">
          <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span>
            Cada intento con <strong>Enviar Solución</strong> se persiste automáticamente en{' '}
            <code className="text-indigo-200 bg-indigo-900/50 px-1 py-0.5 rounded font-mono">
              c:\Users\Usuario\Projects\coe\sql_progress.txt
            </code>{' '}
            para revisión continua del mentor.
          </span>
        </div>

        {/* Metrics Grid */}
        <div className="p-5 grid grid-cols-4 gap-3 border-b border-slate-800">
          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50 text-center">
            <span className="text-[11px] text-slate-400 block mb-1">Intentos</span>
            <span className="text-xl font-bold font-mono text-slate-100">{total}</span>
          </div>

          <div className="bg-emerald-950/30 p-3 rounded-lg border border-emerald-900/50 text-center">
            <span className="text-[11px] text-emerald-400 block mb-1">Aprobados</span>
            <span className="text-xl font-bold font-mono text-emerald-300">{accepted}</span>
          </div>

          <div className="bg-rose-950/30 p-3 rounded-lg border border-rose-900/50 text-center">
            <span className="text-[11px] text-rose-400 block mb-1">Fallidos</span>
            <span className="text-xl font-bold font-mono text-rose-300">{wrong}</span>
          </div>

          <div className="bg-amber-950/30 p-3 rounded-lg border border-amber-900/50 text-center">
            <span className="text-[11px] text-amber-400 block mb-1">Tasa de Acierto</span>
            <span className="text-xl font-bold font-mono text-indigo-300">{passRate}%</span>
          </div>
        </div>

        {/* Submissions History List */}
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 font-mono">
            Últimos Envíos Registrados
          </h3>

          {(!summary?.history || summary.history.length === 0) ? (
            <div className="text-center py-8 text-xs text-slate-500 font-mono">
              Aún no hay envíos registrados. ¡Resuelve un problema y haz clic en "Enviar Solución"!
            </div>
          ) : (
            <div className="space-y-2 font-mono text-xs">
              {summary.history.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {item.status === 'ACCEPTED' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold text-slate-200">
                        {item.problemTitle || item.problemId}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.timestamp} • {item.executionTimeMs} ms
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      item.status === 'ACCEPTED'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

