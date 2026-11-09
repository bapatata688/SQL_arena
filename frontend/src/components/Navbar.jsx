import React from 'react';
import { Database, BookOpen, Code2, Award, Activity, Play, Send } from 'lucide-react';

export default function Navbar({
  topics,
  problems,
  currentTopic,
  currentProblem,
  onSelectTopic,
  onSelectProblem,
  onOpenTelemetry,
  telemetrySummary,
  onRun,
  onSubmit,
  loading
}) {
  const filteredProblems = problems.filter(p => p.topicId === currentTopic?.id);

  const getDifficultyColor = (diff) => {
    switch (diff?.toLowerCase()) {
      case 'easy': return 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
      case 'medium': return 'text-amber-400 bg-amber-950/60 border-amber-800';
      case 'hard': return 'text-rose-400 bg-rose-950/60 border-rose-800';
      default: return 'text-slate-400 bg-slate-900 border-slate-700';
    }
  };

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between select-none">
      {/* Brand & Topic Selection */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 font-black tracking-wider text-indigo-400">
          <Database className="w-5 h-5 text-indigo-400" />
          <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 via-sky-300 to-teal-300 bg-clip-text text-transparent">
            SQL ARENA
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/80 font-mono font-medium">
            STAFF DRILLS
          </span>
        </div>

        {/* Topic Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-medium hidden md:inline">Módulo:</label>
          <select
            value={currentTopic?.id || ''}
            onChange={(e) => {
              const selected = topics.find(t => t.id === e.target.value);
              if (selected) onSelectTopic(selected);
            }}
            className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[200px] truncate"
          >
            {topics.map(t => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        {/* Problem Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-medium hidden md:inline">Ejercicio:</label>
          <select
            value={currentProblem?.id || ''}
            onChange={(e) => {
              const selected = problems.find(p => p.id === e.target.value);
              if (selected) onSelectProblem(selected);
            }}
            className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[260px] truncate"
          >
            {filteredProblems.map(p => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.difficulty})
              </option>
            ))}
          </select>
          {currentProblem && (
            <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getDifficultyColor(currentProblem.difficulty)}`}>
              {currentProblem.difficulty}
            </span>
          )}
        </div>
      </div>

      {/* Actions & Telemetry Summary */}
      <div className="flex items-center gap-3">
        {/* Run & Submit Buttons */}
        <button
          onClick={onRun}
          disabled={loading}
          title="Ctrl + Enter"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />
          <span>Ejecutar</span>
          <kbd className="hidden lg:inline text-[9px] text-slate-400 bg-slate-900 px-1 py-0.5 rounded">Ctrl ↵</kbd>
        </button>

        <button
          onClick={onSubmit}
          disabled={loading}
          title="Ctrl + Shift + Enter"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 transition disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5 fill-white" />
          <span>Enviar Solución</span>
          <kbd className="hidden lg:inline text-[9px] text-emerald-200 bg-emerald-700 px-1 py-0.5 rounded">Ctrl ⇧ ↵</kbd>
        </button>

        {/* Telemetry Indicator */}
        <button
          onClick={onOpenTelemetry}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 transition"
          title="Ver registro de progreso y telemetría"
        >
          <Activity className="w-3.5 h-3.5 text-teal-400" />
          <span className="font-mono">
            {telemetrySummary?.solvedCount || 0} / {problems.length}
          </span>
          <span className="text-[10px] text-slate-400 hidden sm:inline">resueltos</span>
        </button>
      </div>
    </header>
  );
}


