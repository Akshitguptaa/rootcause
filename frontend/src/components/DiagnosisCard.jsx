import React, { useState } from 'react';
import { AlertOctagon, Check, Copy, Flame, Layers, ShieldAlert, Wrench } from 'lucide-react';

export default function DiagnosisCard({ report, onHighlightService }) {
  const [copied, setCopied] = useState(false);

  if (!report) return null;

  const {
    failure_mode,
    root_cause_service,
    blast_radius = [],
    confidence_score = 0.9,
    summary,
    evidence = [],
    suggested_fix = {},
  } = report;

  const copyFix = () => {
    navigator.clipboard.writeText(suggested_fix.recommendation || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-950/95 border border-rose-500/40 rounded-2xl p-5 shadow-[0_0_35px_rgba(244,63,94,0.2)] backdrop-blur-2xl transition-all duration-300">
      {/* Top Banner */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-wider uppercase text-rose-400">
                {failure_mode}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {Math.round(confidence_score * 100)}% Confidence
              </span>
            </div>
            <h3 className="text-sm font-semibold text-white mt-0.5">Automated Architectural Diagnosis</h3>
          </div>
        </div>
      </div>

      {/* Root Cause & Blast Radius Row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-900/80 border border-rose-500/30 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1 mb-1">
            <Flame className="w-3.5 h-3.5 text-rose-400" /> Root Cause
          </div>
          <span className="font-mono text-sm font-bold text-rose-300 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-500/30">
            {root_cause_service}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1 mb-1">
            <Layers className="w-3.5 h-3.5 text-amber-400" /> Blast Radius ({blast_radius.length})
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {blast_radius.map((svc) => (
              <button
                key={svc}
                onClick={() => onHighlightService?.(svc)}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-500/30 hover:bg-amber-800/40 transition"
              >
                {svc}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80 mb-4 text-xs text-slate-300 leading-relaxed">
        {summary}
      </div>

      {/* Evidence Points */}
      {evidence.length > 0 && (
        <div className="mb-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-2 font-semibold">
            Telemetry Evidence
          </span>
          <ul className="space-y-1 text-xs text-slate-300 font-mono">
            {evidence.map((ev, i) => (
              <li key={i} className="flex items-start gap-2 bg-slate-900/40 px-2.5 py-1.5 rounded border border-slate-800/50">
                <span className="text-rose-400 font-bold mt-0.5">›</span>
                <span className="text-slate-300">{ev}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Remediation Box */}
      <div className="bg-gradient-to-br from-slate-900 to-sky-950/40 border border-sky-500/40 rounded-xl p-3.5 relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-sky-400 font-mono text-xs font-semibold">
            <Wrench className="w-3.5 h-3.5" />
            <span>Recommended Fix: {suggested_fix.action || 'Architectural Remediation'}</span>
          </div>
          <button
            onClick={copyFix}
            className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/30 transition"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy Patch'}
          </button>
        </div>

        <p className="text-xs text-slate-200 leading-relaxed font-mono bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          {suggested_fix.recommendation}
        </p>
      </div>
    </div>
  );
}
