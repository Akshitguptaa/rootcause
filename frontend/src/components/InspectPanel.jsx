import React from 'react';
import { X, TrendingUp, Clock, AlertTriangle } from 'lucide-react';

function Sparkline({ data = [], color = 'var(--health-ok)', height = 28, width = 240 }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {data.length > 0 && (() => {
        const last = data[data.length - 1];
        const cy = height - ((last - min) / range) * (height - 4) - 2;
        return <circle cx={width} cy={cy} r={2.5} fill={color} />;
      })()}
    </svg>
  );
}

function Stat({ label, value, unit, warn, crit }) {
  const color = crit ? 'var(--health-crit)' : warn ? 'var(--health-warn)' : 'var(--text-primary)';
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-data)', fontSize: '12px', fontWeight: 600, color }}>
        {value}{unit && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
      </span>
    </div>
  );
}

export default function InspectPanel({ node, metricsHistory = {}, chaosState = null, onClose }) {
  if (!node) return null;

  const { id, display_name, role, host_port, metrics = {} } = node;
  const history = metricsHistory[id] ?? [];
  const p99History = history.map(h => h.latency_p99_ms ?? 0);
  const rpsHistory = history.map(h => h.throughput_rps ?? 0);

  const rps = metrics.throughput_rps ?? 0;
  const p50 = metrics.latency_p50_ms ?? 0;
  const p99 = metrics.latency_p99_ms ?? 0;
  const errRate = metrics.error_rate ?? 0;
  const poolActive = metrics.pool_active;
  const poolMax = metrics.pool_max;
  const retries = metrics.retries_per_sec ?? 0;
  const downstream = metrics.downstream_calls ?? [];

  const p99Color = p99 > 800 ? 'var(--health-crit)' : p99 > 300 ? 'var(--health-warn)' : 'var(--health-ok)';

  return (
    <div className="panel-slide-in h-full flex flex-col overflow-hidden"
      style={{ width: 320, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {display_name || id}
          </div>
          <div style={{ fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--text-muted)' }}>
            :{host_port} · {role}
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded cursor-pointer transition" style={{ color: 'var(--text-muted)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Chaos indicator */}
        {chaosState && (
          <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: 'rgba(229,166,62,0.08)', border: '1px solid var(--health-warn)', fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--health-warn)' }}>
            chaos active:
            {chaosState.latency_ms > 0 && ` +${chaosState.latency_ms}ms`}
            {chaosState.error_rate > 0 && ` ${Math.round(chaosState.error_rate * 100)}% err`}
          </div>
        )}

        {/* Vitals */}
        <div className="rounded-lg p-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Vitals
          </div>
          <Stat label="throughput" value={rps.toFixed(1)} unit="rps" />
          <Stat label="p50" value={Math.round(p50)} unit="ms" warn={p50 > 200} />
          <Stat label="p99" value={Math.round(p99)} unit="ms" warn={p99 > 300} crit={p99 > 800} />
          <Stat label="error rate" value={(errRate * 100).toFixed(1)} unit="%" warn={errRate > 0.05} crit={errRate > 0.15} />
          <Stat label="retries" value={retries.toFixed(1)} unit="/s" warn={retries > 5} />
          {poolMax != null && <Stat label="pool" value={`${poolActive ?? 0}/${poolMax}`} warn={(poolActive / poolMax) > 0.7} crit={poolActive >= poolMax} />}
        </div>

        {/* p99 chart */}
        {p99History.length > 1 && (
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                p99 latency
              </span>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: '9px', color: 'var(--text-muted)' }}>
                {p99History.length} samples
              </span>
            </div>
            <Sparkline data={p99History} color={p99Color} width={260} />
          </div>
        )}

        {/* Throughput chart */}
        {rpsHistory.length > 1 && (
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Throughput
            </div>
            <Sparkline data={rpsHistory} color="var(--health-ok)" width={260} height={24} />
          </div>
        )}

        {/* Downstream */}
        {downstream.length > 0 && (
          <div className="rounded-lg p-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Downstream calls
            </div>
            {downstream.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-1" style={{ fontFamily: 'var(--font-data)', fontSize: '11px', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>→ {c.target}</span>
                <span style={{ color: c.latency_ms > 500 ? 'var(--health-crit)' : 'var(--text-primary)' }}>{Math.round(c.latency_ms)}ms</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
