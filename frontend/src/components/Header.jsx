import React from 'react';
import { Play, Square } from 'lucide-react';

export default function Header({
  isRunning,
  onStart,
  onStop,
  mode,
  setMode,
  concurrency,
  setConcurrency,
  duration,
  setDuration,
  children,
}) {
  return (
    <header className="h-14 border-b flex items-center justify-between px-5 z-20"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>

      {/* Brand */}
      <div className="flex items-center gap-3">
        <h1 style={{ fontFamily: 'var(--font-brand)', color: 'var(--text-primary)' }}
          className="text-lg font-bold tracking-tight">
          rootcause
        </h1>
        <span style={{ fontFamily: 'var(--font-data)', color: 'var(--text-muted)', fontSize: '11px' }}>
          live failure diagnosis
        </span>
      </div>

      {/* Center - ChaosChipBar */}
      <div className="flex-1 flex justify-center items-center px-4">
        {children}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Mode toggle */}
        <div className="flex items-center rounded-md p-0.5"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
          {[
            { key: 'live', label: 'Live' },
            { key: 'sim_cascade', label: 'Cascade' },
            { key: 'sim_retry', label: 'Retry storm' },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className="px-3 py-1 rounded transition-colors cursor-pointer"
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '12px',
                fontWeight: mode === m.key ? 600 : 400,
                background: mode === m.key ? 'var(--border-medium)' : 'transparent',
                color: mode === m.key ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Concurrency */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-data)', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-muted)' }}>users</span>
          <select
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            disabled={isRunning}
            className="bg-transparent focus:outline-none cursor-pointer"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-data)', fontSize: '12px' }}
          >
            {[20, 35, 50, 80].map((v) => (
              <option key={v} value={v} style={{ background: 'var(--bg-raised)' }}>{v}</option>
            ))}
          </select>
        </div>

        {/* Duration */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-data)', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-muted)' }}>duration</span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={isRunning}
            className="bg-transparent focus:outline-none cursor-pointer"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-data)', fontSize: '12px' }}
          >
            {[5, 8, 12, 20, 30].map((v) => (
              <option key={v} value={v} style={{ background: 'var(--bg-raised)' }}>{v}s</option>
            ))}
          </select>
        </div>

        {/* Start/Stop */}
        {isRunning ? (
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md transition cursor-pointer"
            style={{
              background: 'var(--health-crit)',
              color: 'white',
              fontFamily: 'var(--font-ui)',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </button>
        ) : (
          <button
            onClick={onStart}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md transition cursor-pointer"
            style={{
              background: 'var(--health-ok)',
              color: 'var(--bg-root)',
              fontFamily: 'var(--font-ui)',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Play className="w-3 h-3 fill-current" />
            Run experiment
          </button>
        )}
      </div>
    </header>
  );
}
