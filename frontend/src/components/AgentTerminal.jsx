import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Cpu, Sparkles, FastForward } from 'lucide-react';

/**
 * Parses inline markdown:
 * - **bold** -> <strong>
 * - `code` -> <code>
 * Gracefully handles incomplete tags at the stream boundary (no raw ** showing).
 */
function renderInline(text) {
  if (!text) return null;

  // Split on bold (**...**) or inline code (`...`), handling incomplete ending tokens
  const parts = text.split(/(\*\*[^*]+(?:\*\*|$)|`[^`]+(?:`|$))/g);

  return parts.map((part, i) => {
    if (part.startsWith('**')) {
      const content = part.replace(/^\*\*|\*\*$/g, '');
      return (
        <strong key={i} className="text-white font-semibold">
          {content}
        </strong>
      );
    }
    if (part.startsWith('`')) {
      const content = part.replace(/^`|`$/g, '');
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-slate-800/90 text-sky-300 font-mono text-[11px] border border-slate-700/60 shadow-xs"
        >
          {content}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function AgentTerminal({ thoughts, rawThoughts, isRunning, completed }) {
  const [displayedText, setDisplayedText] = useState('');
  const queueRef = useRef('');
  const terminalRef = useRef(null);

  // Allow both prop names
  const incoming = thoughts || rawThoughts || '';

  // 1. Buffer new incoming text into queue, stripping out machine JSON payload
  useEffect(() => {
    // Strip trailing ```json codeblock so raw machine schemas never leak into terminal
    const cleanRaw = (incoming || '').replace(/```(?:json)?[\s\S]*$/i, '').trimEnd();

    if (cleanRaw.length > queueRef.current.length) {
      queueRef.current = cleanRaw;
    }
    if (!incoming && !isRunning) {
      queueRef.current = '';
      setDisplayedText('');
    }
  }, [incoming, isRunning]);

  // 2. Typing speed engine (tuned to authentic, deliberate human typing speed)
  useEffect(() => {
    const timer = setInterval(() => {
      const targetLen = queueRef.current.length;
      const currentLen = displayedText.length;

      if (currentLen < targetLen) {
        const backlog = targetLen - currentLen;
        // Paced typing: 1 char per tick if close, max 2-3 chars if large backlog
        let step = 1;
        if (backlog > 80) step = 3;
        else if (backlog > 30) step = 2;

        setDisplayedText((prev) => queueRef.current.slice(0, prev.length + step));
      }
    }, 24); // 24ms interval = authentic typing cadence (~40 characters / sec)

    return () => clearInterval(timer);
  }, [displayedText]);

  // 3. Smooth auto-scroll following the cursor
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [displayedText]);

  // Fast-forward button if user wants immediate view
  const handleFastForward = () => {
    setDisplayedText(queueRef.current);
  };

  // Structured Markdown line formatter
  const renderFormattedLine = (line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={idx} className="h-2" />;
    }

    // Headers: ### Step or ## Header or # Header
    if (/^#{1,4}\s+/.test(trimmed)) {
      const headerText = trimmed.replace(/^#{1,4}\s+/, '');
      return (
        <div key={idx} className="mt-3 mb-1.5 pb-1 border-b border-sky-900/40 flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
            STEP
          </span>
          <span className="text-sky-300 font-bold text-xs tracking-wide">
            {headerText}
          </span>
        </div>
      );
    }

    // Step markers without hashes: **Step 1: ...**
    if (/^\*\*Step\s+\d+.*?\*\*/i.test(trimmed)) {
      return (
        <div key={idx} className="mt-3 mb-1.5 pb-1 border-b border-sky-900/40 flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
            PHASE
          </span>
          <span className="text-sky-300 font-bold text-xs tracking-wide">
            {renderInline(trimmed)}
          </span>
        </div>
      );
    }

    // Bullet points: - , * , 1. , 2.
    if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*•\d.]+\s+/, '');
      return (
        <div key={idx} className="flex items-start gap-2 py-0.5 pl-2 text-slate-300 text-xs">
          <span className="text-amber-400 font-bold select-none text-[11px] mt-0.5">›</span>
          <span className="flex-1 leading-relaxed">{renderInline(content)}</span>
        </div>
      );
    }

    // Highlighted alert / conclusion banner
    if (
      trimmed.toLowerCase().startsWith('conclusion:') ||
      trimmed.toLowerCase().startsWith('root cause:') ||
      trimmed.toLowerCase().includes('critical failure')
    ) {
      return (
        <div
          key={idx}
          className="my-2 p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs font-medium leading-relaxed shadow-sm"
        >
          {renderInline(trimmed)}
        </div>
      );
    }

    // Standard reasoning text
    return (
      <div key={idx} className="py-0.5 text-slate-300 text-xs leading-relaxed">
        {renderInline(trimmed)}
      </div>
    );
  };

  const isTyping = displayedText.length < queueRef.current.length || isRunning;
  const hasBacklog = queueRef.current.length - displayedText.length > 20;

  return (
    <div className="flex flex-col h-full bg-slate-950/95 rounded-2xl border border-slate-800/90 overflow-hidden shadow-2xl backdrop-blur-xl">
      {/* Titlebar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-900/70">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <span className="text-xs font-mono font-medium text-slate-300 flex items-center gap-1.5 ml-2">
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            ROOTCAUSE_REASONER // SRE LIVE TRACE
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasBacklog && (
            <button
              onClick={handleFastForward}
              title="Fast forward to latest"
              className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            >
              <FastForward className="w-3 h-3 text-amber-400" />
              Skip
            </button>
          )}

          {isTyping ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              TYPING TRACE
            </span>
          ) : completed ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              <Sparkles className="w-3 h-3 text-sky-400" />
              TRACE COMPLETE
            </span>
          ) : (
            <span className="text-[10px] font-mono text-slate-500">STANDBY</span>
          )}
        </div>
      </div>

      {/* Terminal Content Area */}
      <div
        ref={terminalRef}
        className="flex-1 p-4 font-mono text-xs overflow-y-auto leading-relaxed text-slate-300 select-text space-y-1"
      >
        {!displayedText && !isRunning ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12">
            <Cpu className="w-8 h-8 mb-2 opacity-40 text-sky-400" />
            <p className="text-slate-400 font-medium text-xs">Autonomous SRE Reasoner Idle</p>
            <p className="text-[11px] text-slate-600 max-w-xs mt-1">
              Click "Launch Chaos Test" to initiate live stress and watch the agent analyze call propagation.
            </p>
          </div>
        ) : (
          <div>
            {displayedText.split('\n').map((line, idx) => renderFormattedLine(line, idx))}
            {isTyping && (
              <span className="inline-block w-2 h-3.5 ml-1 bg-sky-400 animate-pulse align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
