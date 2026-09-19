import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, X, Play, Download } from 'lucide-react';

export default function DiagnosisDrawer({ report, onHighlightService, onDismiss, onApplyFix, onRerun }) {
  const [copied, setCopied] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [fixState, setFixState] = useState('idle');

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

  const handleApplyFix = async () => {
    setFixState('applying');
    await onApplyFix?.(root_cause_service);
    setFixState('applied');
  };

  const downloadPostmortem = () => {
    const content = `# Incident Postmortem
**Date**: ${new Date().toLocaleString()}
**Failure Mode**: ${failure_mode}
**Root Cause**: ${root_cause_service}
**Confidence**: ${Math.round(confidence_score * 100)}%
**Blast Radius**: ${blast_radius.join(', ')}

## Summary
${summary}

## Evidence
${evidence.map(e => `- ${e}`).join('\n')}

## Remediation
**Action**: ${suggested_fix.action}
${suggested_fix.recommendation}
`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postmortem-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40">
      {!minimized && (
        <div className="absolute inset-0 -top-[200vh]" style={{ background: 'rgba(0,0,0,0.15)' }}
          onClick={() => setMinimized(true)} />
      )}

      <div className={`relative slide-up ${minimized ? 'max-h-12' : ''} transition-all overflow-hidden`}
        style={{ background: 'var(--bg-surface)', borderTop: `2px solid var(--health-crit)` }}>

        {/* Handle bar */}
        <div className="flex items-center justify-between px-5 py-2.5 cursor-pointer select-none"
          style={{ borderBottom: minimized ? 'none' : '1px solid var(--border-subtle)' }}
          onClick={() => setMinimized(!minimized)}>
          <div className="flex items-center gap-3">
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: 600, color: 'var(--health-crit)' }}>
              {failure_mode}
            </span>
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowEvidence(!showEvidence); }} className="cursor-pointer transition"
                style={{ fontFamily: 'var(--font-data)', fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-raised)', padding: '2px 6px', borderRadius: 3, border: showEvidence ? '1px solid var(--text-muted)' : '1px solid transparent' }}>
                {Math.round(confidence_score * 100)}% confidence
              </button>
              {showEvidence && (
                <div className="absolute left-0 top-full mt-2 w-72 p-3 rounded-md shadow-lg z-50 cursor-default"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
                  onClick={(e) => e.stopPropagation()}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Evidence Breakdown
                  </div>
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                    {evidence.map((ev, i) => (
                      <li key={i} className="flex items-start gap-2" style={{ fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--health-crit)', fontWeight: 600 }}>›</span>
                        <span>{ev}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
              className="p-1 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              {minimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}
              className="p-1 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {!minimized && (
          <>
            <div className="px-5 py-4 overflow-y-auto fade-in" style={{ maxHeight: '45vh' }}>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>

              {/* Root cause + blast radius */}
              <div className="space-y-3">
                <div className="rounded-lg p-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Root cause
                  </div>
                  <span style={{ fontFamily: 'var(--font-data)', fontSize: '13px', fontWeight: 600, color: 'var(--health-crit)' }}>
                    {root_cause_service}
                  </span>
                </div>

                <div className="rounded-lg p-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Blast radius ({blast_radius.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {blast_radius.map((svc) => (
                      <button key={svc} onClick={() => onHighlightService?.(svc)}
                        className="px-2 py-0.5 rounded cursor-pointer transition"
                        style={{ fontFamily: 'var(--font-data)', fontSize: '11px', background: 'rgba(229,166,62,0.08)', border: '1px solid var(--health-warn)', color: 'var(--health-warn)' }}>
                        {svc}
                      </button>
                    ))}
                  </div>
                </div>

                {summary && (
                  <div className="rounded-lg p-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {summary}
                  </div>
                )}
              </div>

              {/* Fix card */}
              <div className="space-y-3">

                <div className="rounded-lg p-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--agent-blue)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600, color: 'var(--agent-blue)' }}>
                      {suggested_fix.action || 'Recommended fix'}
                    </span>
                    <button onClick={copyFix} className="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer transition"
                      style={{ fontFamily: 'var(--font-data)', fontSize: '10px', background: 'rgba(79,140,201,0.1)', border: '1px solid var(--agent-blue)', color: 'var(--agent-blue)' }}>
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'copied' : 'copy'}
                    </button>
                  </div>
                  <p style={{ fontFamily: 'var(--font-data)', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6, background: 'var(--bg-root)', padding: 8, borderRadius: 4 }}>
                    {suggested_fix.recommendation}
                  </p>

                  <div className="mt-4 flex items-center justify-end gap-2">
                    {fixState === 'applied' && (
                      <button onClick={() => { setFixState('idle'); onRerun?.(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition hover:opacity-90"
                        style={{ background: 'var(--health-ok)', color: '#fff', fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600 }}>
                        <Play className="w-3 h-3 fill-current" />
                        Re-run experiment
                      </button>
                    )}
                    <button onClick={handleApplyFix} disabled={fixState !== 'idle'} className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition hover:opacity-90"
                      style={{ background: fixState === 'applied' ? 'var(--bg-raised)' : 'var(--agent-blue)', color: fixState === 'applied' ? 'var(--agent-blue)' : '#fff', fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600, opacity: fixState === 'applying' ? 0.7 : 1 }}>
                      {fixState === 'applied' ? <Check className="w-3 h-3" /> : null}
                      {fixState === 'idle' ? 'Apply Fix' : fixState === 'applying' ? 'Applying...' : 'Fix Applied'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <button onClick={downloadPostmortem} className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer transition hover:bg-[rgba(255,255,255,0.05)]"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-ui)', fontSize: '11px' }}>
              <Download className="w-3 h-3" />
              Generate Postmortem (MD)
            </button>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
