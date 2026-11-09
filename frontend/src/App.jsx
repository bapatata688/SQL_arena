import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import StudyGuide from './components/StudyGuide';
import ProblemDescription from './components/ProblemDescription';
import SqlEditor from './components/SqlEditor';
import ConsoleOutput from './components/ConsoleOutput';
import TelemetryModal from './components/TelemetryModal';
import { BookOpen, FileCode2 } from 'lucide-react';

export default function App() {
  const [topics, setTopics] = useState([]);
  const [problems, setProblems] = useState([]);
  const [currentTopic, setCurrentTopic] = useState(null);
  const [currentProblem, setCurrentProblem] = useState(null);
  const [leftTab, setLeftTab] = useState('problem'); // 'guide' | 'problem'
  const [code, setCode] = useState('');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [telemetrySummary, setTelemetrySummary] = useState(null);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);

  // Initial load
  useEffect(() => {
    fetch('/api/topics')
      .then(res => res.json())
      .then(data => {
        setTopics(data);
        if (data.length > 0) setCurrentTopic(data[0]);
      })
      .catch(err => console.error('Failed to fetch topics:', err));

    fetch('/api/problems')
      .then(res => res.json())
      .then(data => {
        setProblems(data);
        if (data.length > 0) {
          const lastActiveProblemId = localStorage.getItem('sql_arena_last_problem') || data[0].id;
          loadProblem(lastActiveProblemId);
        }
      })
      .catch(err => console.error('Failed to fetch problems:', err));

    refreshTelemetry();
  }, []);

  const refreshTelemetry = () => {
    fetch('/api/telemetry')
      .then(res => res.json())
      .then(data => setTelemetrySummary(data))
      .catch(err => console.error('Failed to fetch telemetry:', err));
  };

  const loadProblem = (problemId) => {
    fetch(`/api/problems/${problemId}`)
      .then(res => res.json())
      .then(prob => {
        setCurrentProblem(prob);
        localStorage.setItem('sql_arena_last_problem', prob.id);
        
        // Restore cached draft from localStorage if available
        const cachedDraft = localStorage.getItem(`sql_arena_draft_${prob.id}`);
        setCode(cachedDraft !== null ? cachedDraft : prob.starterCode || '');
        setResult(null);

        // Sync active topic
        if (prob.topicId) {
          const matchTopic = topics.find(t => t.id === prob.topicId);
          if (matchTopic) setCurrentTopic(matchTopic);
        }
      })
      .catch(err => console.error('Failed to load problem:', err));
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    if (currentProblem) {
      localStorage.setItem(`sql_arena_draft_${currentProblem.id}`, newCode);
    }
  };

  const handleSelectTopic = (topic) => {
    setCurrentTopic(topic);
    const firstOfTopic = problems.find(p => p.topicId === topic.id);
    if (firstOfTopic) {
      loadProblem(firstOfTopic.id);
    }
  };

  const handleSelectProblem = (problemSummary) => {
    loadProblem(problemSummary.id);
  };

  const handleRun = async () => {
    if (!currentProblem || !code.trim() || executing) return;
    setExecuting(true);
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: currentProblem.id,
          query: code
        })
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        status: 'SYNTAX_ERROR',
        error: err.message,
        executionTimeMs: 0
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentProblem || !code.trim() || executing) return;
    setExecuting(true);
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: currentProblem.id,
          query: code
        })
      });
      const data = await res.json();
      setResult(data);
      refreshTelemetry();
    } catch (err) {
      setResult({
        status: 'SYNTAX_ERROR',
        error: err.message,
        executionTimeMs: 0
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleReset = () => {
    if (currentProblem) {
      localStorage.removeItem(`sql_arena_draft_${currentProblem.id}`);
      setCode(currentProblem.starterCode || '');
      setResult(null);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Navbar */}
      <Navbar
        topics={topics}
        problems={problems}
        currentTopic={currentTopic}
        currentProblem={currentProblem}
        onSelectTopic={handleSelectTopic}
        onSelectProblem={handleSelectProblem}
        onOpenTelemetry={() => setShowTelemetryModal(true)}
        telemetrySummary={telemetrySummary}
        onRun={handleRun}
        onSubmit={handleSubmit}
        loading={executing}
      />

      {/* Main Split Screen */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side: Study Guide or Problem Description */}
        <div className="w-full lg:w-1/2 h-1/2 lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/30">
          {/* Tab Switcher */}
          <div className="h-10 px-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between select-none">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLeftTab('problem')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  leftTab === 'problem'
                    ? 'bg-slate-800 text-slate-100 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Problema (LeetCode)</span>
              </button>

              <button
                onClick={() => setLeftTab('guide')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  leftTab === 'guide'
                    ? 'bg-slate-800 text-slate-100 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-teal-400" />
                <span>Guía Staff Engineer</span>
              </button>
            </div>
          </div>

          {/* Tab Body */}
          <div className="flex-1 overflow-hidden select-text">
            {leftTab === 'problem' ? (
              <ProblemDescription problem={currentProblem} />
            ) : (
              <StudyGuide topic={currentTopic} />
            )}
          </div>
        </div>

        {/* Right Side: Monaco Editor + Console Split */}
        <div className="w-full lg:w-1/2 h-1/2 lg:h-full flex flex-col overflow-hidden">
          {/* Top Half: Monaco SQL Editor */}
          <div className="h-3/5">
            <SqlEditor
              code={code}
              onChange={handleCodeChange}
              onReset={handleReset}
              onRun={handleRun}
              onSubmit={handleSubmit}
              loading={executing}
            />
          </div>

          {/* Bottom Half: Interactive Console / Diff */}
          <div className="h-2/5 border-t border-slate-800 select-text">
            <ConsoleOutput result={result} loading={executing} />
          </div>
        </div>
      </div>

      {/* Telemetry Progress Modal */}
      <TelemetryModal
        isOpen={showTelemetryModal}
        onClose={() => setShowTelemetryModal(false)}
        summary={telemetrySummary}
      />
    </div>
  );
}
