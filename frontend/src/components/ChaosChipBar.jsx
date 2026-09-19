import React, { useState } from 'react';
import { Zap, Bug, Skull, X } from 'lucide-react';

const INJECT_TYPES = [
  {
    id: 'latency',
    label: '+2s latency',
    icon: Zap,
    chaos: { enabled: true, latency_ms: 2000, error_rate: 0 },
    color: 'var(--health-warn)',
  },
  {
    id: 'errors',
    label: '50% errors',
    icon: Bug,
    chaos: { enabled: true, latency_ms: 0, error_rate: 0.5 },
    color: 'var(--health-crit)',
  },
  {
    id: 'kill',
    label: 'kill service',
    icon: Skull,
    chaos: { enabled: true, latency_ms: 5000, error_rate: 0.9 },
    color: 'var(--health-crit)',
  },
];

export default function ChaosChipBar({ selectedNode, onInject, onClearAll, activeChaos = {} }) {
  const activeCount = Object.keys(activeChaos).length;

  if (!selectedNode && activeCount === 0) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg fade-in"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-data)', fontSize: '11px' }}
    >
      {selectedNode && (
        <>
          <span style={{ color: 'var(--text-muted)' }}>
            inject on <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{selectedNode}</span>
          </span>

          <span style={{ color: 'var(--border-medium)' }}>|</span>

          {INJECT_TYPES.map((t) => {
            const Icon = t.icon;
            const isActive = activeChaos[selectedNode]?.latency_ms === t.chaos.latency_ms &&
                             activeChaos[selectedNode]?.error_rate === t.chaos.error_rate;
            return (
              <button
                key={t.id}
                onClick={() => onInject(selectedNode, t)}
                className="flex items-center gap-1 px-2 py-1 rounded transition cursor-pointer"
                style={{
                  background: isActive ? `${t.color}22` : 'var(--bg-raised)',
                  border: `1px solid ${isActive ? t.color : 'var(--border-subtle)'}`,
                  color: isActive ? t.color : 'var(--text-secondary)',
                }}
              >
                <Icon className="w-3 h-3" />
                {t.label}
              </button>
            );
          })}
        </>
      )}

      {activeCount > 0 && (
        <>
          {selectedNode && <span style={{ color: 'var(--border-medium)' }}>|</span>}
          <button
            onClick={onClearAll}
            className="flex items-center gap-1 px-2 py-1 rounded transition cursor-pointer"
            style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <X className="w-3 h-3" />
            clear all ({activeCount})
          </button>
        </>
      )}
    </div>
  );
}
