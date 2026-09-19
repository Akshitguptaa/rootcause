import React from 'react';
import { Play, Square, Activity, Cpu, Settings2, Sparkles, RefreshCw } from 'lucide-react';

export default function Header({
  isRunning,
  onStart,
  onStop,
  clusterStatus,
  mode,
  setMode,
  concurrency,
  setConcurrency,
  duration,
  setDuration,
}) {
  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-6 flex items-center justify-between z-20">
      {/* Brand & Target Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              RootCause <span className="text-sky-400 font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">AI SRE</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">Autonomous Stress & Chaos Testing</p>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-800 hidden sm:block" />

        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-mono text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>target-services/docker-compose.yml</span>
          <span className="text-slate-500 font-semibold">• 5 Nodes</span>
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-3">
        {/* Mode Selector */}
        <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-1 text-xs font-mono">
          <button
            onClick={() => setMode('live')}
            className={`px-3 py-1 rounded-md transition-all ${mode === 'live' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            Live Cluster
          </button>
          <button
            onClick={() => setMode('sim_cascade')}
            className={`px-3 py-1 rounded-md transition-all ${mode === 'sim_cascade' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            Sim: Cascade
          </button>
          <button
            onClick={() => setMode('sim_retry')}
            className={`px-3 py-1 rounded-md transition-all ${mode === 'sim_retry' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            Sim: Retry Storm
          </button>
        </div>

        {/* Concurrency Selector */}
        <div className="hidden lg:flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300">
          <span className="text-slate-500">Users:</span>
          <select
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            disabled={isRunning}
            className="bg-transparent text-sky-400 font-bold focus:outline-none cursor-pointer"
          >
            <option value={20} className="bg-slate-900">20 VUs</option>
            <option value={35} className="bg-slate-900">35 VUs</option>
            <option value={50} className="bg-slate-900">50 VUs</option>
            <option value={80} className="bg-slate-900">80 VUs</option>
          </select>
        </div>

        {/* Launch Button */}
        {isRunning ? (
          <button
            onClick={onStop}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-semibold shadow-lg shadow-rose-600/20 transition cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            Stop Test
          </button>
        ) : (
          <button
            onClick={onStart}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-mono text-xs font-bold shadow-lg shadow-sky-500/25 transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Launch Chaos Test
          </button>
        )}
      </div>
    </header>
  );
}
