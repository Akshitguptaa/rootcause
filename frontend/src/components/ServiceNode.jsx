import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Server, Database, Shield, Zap, AlertTriangle, CheckCircle, Flame } from 'lucide-react';

export default function ServiceNode({ data }) {
  const {
    id,
    display_name,
    role,
    host_port,
    metrics = {},
    isRootCause = false,
    isBlastRadius = false,
    status = 'healthy', // 'healthy', 'warning', 'critical'
  } = data;

  const rps = metrics.throughput_rps ?? 0;
  const p99 = metrics.latency_p99_ms ?? 0;
  const errorRate = metrics.error_rate ?? 0;
  const poolActive = metrics.pool_active ?? null;
  const poolMax = metrics.pool_max ?? null;
  const poolSaturation = metrics.pool_saturation ?? (poolMax ? poolActive / poolMax : 0);
  const retries = metrics.retries_per_sec ?? 0;

  // Determine visual styling based on status
  let ringClass = 'border-slate-800 bg-slate-900/80 hover:border-slate-700';
  let badgeBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

  if (isRootCause) {
    ringClass = 'border-rose-500/90 bg-rose-950/40 shadow-[0_0_30px_rgba(244,63,94,0.35)]';
    badgeBg = 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse';
  } else if (isBlastRadius || status === 'critical') {
    ringClass = 'border-amber-500/80 bg-amber-950/30 shadow-[0_0_20px_rgba(245,158,11,0.25)]';
    badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  } else if (status === 'warning' || p99 > 400 || poolSaturation > 0.7) {
    ringClass = 'border-yellow-500/60 bg-yellow-950/20';
    badgeBg = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
  }

  const isDb = id.toLowerCase().includes('db') || id.toLowerCase().includes('data');
  const isGateway = role === 'ingress' || id.toLowerCase().includes('gateway');

  return (
    <div className={`relative w-64 rounded-xl border p-3.5 backdrop-blur-md transition-all duration-300 ${ringClass}`}>
      <Handle type="target" position={Position.Top} className="!bg-sky-400" />

      {isRootCause && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-rose-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-lg">
          <Flame className="w-3 h-3 animate-bounce" /> Root Cause
        </span>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg ${isRootCause ? 'bg-rose-500/20 text-rose-400' : isDb ? 'bg-purple-500/20 text-purple-400' : isGateway ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-300'}`}>
            {isDb ? <Database className="w-4 h-4" /> : isGateway ? <Shield className="w-4 h-4" /> : <Server className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-xs text-white truncate tracking-tight">{display_name || id}</h4>
            <span className="text-[10px] font-mono text-slate-400">:{host_port || 'internal'}</span>
          </div>
        </div>

        <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${badgeBg}`}>
          {isRootCause ? 'FAILING' : role || 'SERVICE'}
        </span>
      </div>

      {/* Vitals Grid */}
      <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono mb-2">
        <div className="bg-slate-950/60 rounded px-2 py-1 border border-slate-800/80">
          <span className="text-slate-500 text-[9px] block">RPS</span>
          <span className="font-semibold text-slate-200">{rps.toFixed(1)}</span>
        </div>

        <div className={`rounded px-2 py-1 border ${p99 > 800 ? 'bg-rose-950/40 border-rose-500/40 text-rose-300' : p99 > 300 ? 'bg-amber-950/40 border-amber-500/40 text-amber-300' : 'bg-slate-950/60 border-slate-800/80 text-slate-200'}`}>
          <span className="text-slate-500 text-[9px] block">p99 Latency</span>
          <span className="font-semibold">{Math.round(p99)}ms</span>
        </div>
      </div>

      {/* Connection Pool Bar if instrumented */}
      {poolMax !== null && poolMax > 0 && (
        <div className="bg-slate-950/80 rounded p-1.5 border border-slate-800/80 mb-1.5">
          <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
            <span>Conn Pool</span>
            <span className={poolActive >= poolMax ? 'text-rose-400 font-bold' : poolActive / poolMax > 0.7 ? 'text-amber-400' : 'text-slate-300'}>
              {poolActive}/{poolMax} ({Math.round(poolSaturation * 100)}%)
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
            <div
              className={`h-full transition-all duration-300 ${poolActive >= poolMax ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]' : poolActive / poolMax > 0.7 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${Math.min(100, poolSaturation * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Retries or Errors if spiking */}
      {(retries > 0 || errorRate > 0) && (
        <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-slate-800/80 text-amber-400">
          {retries > 0 && <span>Retries: {retries.toFixed(1)}/s</span>}
          {errorRate > 0 && <span className="text-rose-400">Err: {(errorRate * 100).toFixed(1)}%</span>}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-sky-400" />
    </div>
  );
}
