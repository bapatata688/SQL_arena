import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Clock, ListChecks, GitCompare, Table } from 'lucide-react';

export default function ConsoleOutput({ result, loading }) {
  const [activeTab, setActiveTab] = useState('output');

  useEffect(() => {
    if (result) {
      if (result.status === 'ACCEPTED' || !result.diff) {
        if (activeTab === 'diff') setActiveTab('output');
      } else if (result.diff) {
        setActiveTab('diff');
      }
    }
  }, [result]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-mono">Ejecutando consulta en MySQL sandbox...</span>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 text-slate-500 p-6 text-center select-none">
        <Table className="w-8 h-8 text-slate-700 mb-2 stroke-1" />
        <span className="text-xs">Presiona "Ejecutar" o "Enviar Solución" para ver la salida de la base de datos.</span>
        <span className="text-[11px] text-slate-600 mt-1">Shortcut: Ctrl + Enter</span>
      </div>
    );
  }

  const renderTable = (rows) => {
    if (!rows || rows.length === 0) {
      return (
        <div className="p-4 text-xs font-mono text-slate-500 italic">
          (0 filas devueltas / Conjunto vacío)
        </div>
      );
    }

    const columns = Object.keys(rows[0]);

    return (
      <div className="overflow-x-auto select-text">
        <table className="w-full text-xs text-left border-collapse font-mono">
          <thead className="bg-slate-900 border-b border-slate-800 text-slate-300">
            <tr>
              {columns.map(col => (
                <th key={col} className="px-3 py-2 font-semibold tracking-wider">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-900/40 transition">
                {columns.map(col => {
                  const val = row[col];
                  return (
                    <td key={col} className="px-3 py-1.5 whitespace-nowrap text-slate-300">
                      {val === null || val === undefined ? (
                        <span className="text-slate-500 italic font-semibold text-[11px]">NULL</span>
                      ) : (
                        String(val)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Status Bar */}
      <div className="h-10 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          {result.status === 'ACCEPTED' && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>ACCEPTED</span>
            </div>
          )}
          {result.status === 'WRONG_ANSWER' && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>WRONG ANSWER</span>
            </div>
          )}
          {result.status === 'SYNTAX_ERROR' && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>SYNTAX ERROR</span>
            </div>
          )}
          {result.status === 'ERROR' && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>ERROR</span>
            </div>
          )}
          {result.status === 'TIME_LIMIT_EXCEEDED' && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>TIME LIMIT EXCEEDED</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
            <Clock className="w-3 h-3" />
            <span>{result.executionTimeMs} ms</span>
          </div>
        </div>

        {/* Console Tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('output')}
            className={`text-xs px-2.5 py-1 rounded font-medium transition ${
              activeTab === 'output' ? 'bg-slate-800 text-slate-100 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tu Resultado ({result.output?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('expected')}
            className={`text-xs px-2.5 py-1 rounded font-medium transition ${
              activeTab === 'expected' ? 'bg-slate-800 text-slate-100 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Esperado ({result.expected?.length || 0})
          </button>
          {result.diff && (
            <button
              onClick={() => setActiveTab('diff')}
              className={`text-xs px-2.5 py-1 rounded font-medium transition flex items-center gap-1 ${
                activeTab === 'diff' ? 'bg-rose-950/80 text-rose-300 font-semibold border border-rose-800' : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              <GitCompare className="w-3 h-3" />
              <span>Diff</span>
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto select-text">
        {result.status === 'SYNTAX_ERROR' || result.status === 'ERROR' || result.status === 'TIME_LIMIT_EXCEEDED' ? (
          <div className="p-4">
            <div className="rounded-lg bg-rose-950/40 border border-rose-900/60 p-4">
              <div className="flex items-center gap-2 text-rose-300 text-xs font-bold mb-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Error de Consulta en MySQL</span>
              </div>
              <pre className="text-xs font-mono text-rose-200 whitespace-pre-wrap leading-relaxed select-text">
                {result.error}
              </pre>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'output' && renderTable(result.output)}
            {activeTab === 'expected' && renderTable(result.expected)}
            {activeTab === 'diff' && result.diff && (
              <div className="p-4 space-y-3 font-mono text-xs select-text">
                {result.diff.columnOrderMismatch && (
                  <div className="p-3 rounded bg-rose-950/40 border border-rose-900/60 text-rose-200">
                    <span className="font-bold block mb-1">Discrepancia en Orden de Proyección de Columnas:</span>
                    <div>Columnas obtenidas: [{result.diff.actualColumns.join(', ')}]</div>
                    <div>Columnas esperadas: [{result.diff.expectedColumns.join(', ')}]</div>
                  </div>
                )}

                {result.diff.columnMismatch && (
                  <div className="p-3 rounded bg-rose-950/40 border border-rose-900/60 text-rose-200">
                    <span className="font-bold block mb-1">Discrepancia en Nombres de Columnas:</span>
                    <div>Obtenidas: [{result.diff.actualColumns.join(', ')}]</div>
                    <div>Esperadas: [{result.diff.expectedColumns.join(', ')}]</div>
                  </div>
                )}

                {result.diff.rowCountMismatch && (
                  <div className="p-3 rounded bg-amber-950/40 border border-amber-900/60 text-amber-200">
                    <span className="font-bold block mb-1">Discrepancia en Cantidad de Filas:</span>
                    <div>Filas devueltas por tu consulta: {result.diff.actualRowCount}</div>
                    <div>Filas requeridas: {result.diff.expectedRowCount}</div>
                  </div>
                )}

                {result.diff.sampleMismatches?.length > 0 && (
                  <div className="space-y-2">
                    <span className="font-bold text-slate-300 block">Diferencias Muestra en Datos:</span>
                    {result.diff.sampleMismatches.map((m, i) => (
                      <div key={i} className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs space-y-1">
                        <div className="text-slate-400 font-semibold">[Fila #{m.index + 1}]</div>
                        <div className="text-rose-400">
                          - Obtenido: {JSON.stringify(m.actual)}
                        </div>
                        <div className="text-emerald-400">
                          + Esperado: {JSON.stringify(m.expected)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
