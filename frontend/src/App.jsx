import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';

import ServiceNode from './components/ServiceNode';
import AgentTerminal from './components/AgentTerminal';
import DiagnosisCard from './components/DiagnosisCard';
import Header from './components/Header';
import { Activity, Database, Flame, Server, Sparkles } from 'lucide-react';

const nodeTypes = {
  serviceNode: ServiceNode,
};

const DEFAULT_COMPOSE = `version: "3.8"
services:
  gateway:
    ports: ["8080:8080"]
    depends_on: [orders]
  orders:
    ports: ["8081:8081"]
    depends_on: [inventory, payment]
  inventory:
    ports: ["8082:8082"]
    depends_on: [db-service]
  payment:
    ports: ["8083:8083"]
    depends_on: [db-service]
  db-service:
    ports: ["8084:8084"]
`;

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [topology, setTopology] = useState(null);

  const [mode, setMode] = useState('live'); // 'live', 'sim_cascade', 'sim_retry'
  const [concurrency, setConcurrency] = useState(35);
  const [duration, setDuration] = useState(8);

  const [isRunning, setIsRunning] = useState(false);
  const [thoughts, setThoughts] = useState('');
  const [report, setReport] = useState(null);
  const [highlightedService, setHighlightedService] = useState(null);
  const [currentMetrics, setCurrentMetrics] = useState({});

  const socketRef = React.useRef(null);

  // 1. Initial Topology Load from FastAPI backend
  const loadTopology = useCallback(async () => {
    try {
      const res = await fetch('/api/topology/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml_content: DEFAULT_COMPOSE, target_host: 'localhost' }),
      });
      if (res.ok) {
        const data = await res.json();
        setTopology(data);
        layoutGraph(data, {}, null, []);
      }
    } catch (e) {
      console.error('Failed to parse topology:', e);
    }
  }, []);

  useEffect(() => {
    loadTopology();
  }, [loadTopology]);

  // 2. Compute visual tree layout for nodes & edges
  const layoutGraph = (graph, metricsMap = {}, rootCauseId = null, blastRadiusIds = []) => {
    if (!graph || !graph.nodes) return;

    // Hardwired clean tree coordinates for the 5 services
    const positions = {
      gateway: { x: 320, y: 30 },
      orders: { x: 320, y: 190 },
      inventory: { x: 130, y: 360 },
      payment: { x: 510, y: 360 },
      'db-service': { x: 320, y: 530 },
    };

    const flowNodes = graph.nodes.map((n, i) => {
      const pos = positions[n.id] || { x: 100 + i * 180, y: 100 + (i % 3) * 150 };
      const m = metricsMap[n.id] || {};
      const isRoot = rootCauseId === n.id;
      const isBlast = blastRadiusIds.includes(n.id);

      return {
        id: n.id,
        type: 'serviceNode',
        position: pos,
        data: {
          id: n.id,
          display_name: n.display_name || n.id,
          role: n.role,
          host_port: n.host_port,
          metrics: m,
          isRootCause: isRoot,
          isBlastRadius: isBlast,
        },
      };
    });

    const flowEdges = graph.edges.map((e, idx) => {
      const isStressed =
        metricsMap[e.target]?.latency_p99_ms > 400 ||
        metricsMap[e.target]?.pool_active >= (metricsMap[e.target]?.pool_max || 999);

      let strokeColor = '#38bdf8'; // sky cyan normal
      if (rootCauseId === e.target) strokeColor = '#f43f5e'; // rose red
      else if (isStressed) strokeColor = '#f59e0b'; // amber

      return {
        id: `e-${e.source}-${e.target}-${idx}`,
        source: e.source,
        target: e.target,
        animated: true,
        style: { stroke: strokeColor, strokeWidth: isStressed ? 2.5 : 1.8 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 16,
          height: 16,
        },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // 3. Start Experiment via WebSocket
  const startExperiment = () => {
    if (!topology) return;

    setIsRunning(true);
    setThoughts('');
    setReport(null);
    setHighlightedService(null);

    const wsHost = window.location.port === '5173' ? `${window.location.hostname}:8000` : window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${wsHost}/api/ws/experiment`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      const plan = {
        name: 'Live Target Services Stress Test',
        target_url: 'http://localhost:8080',
        http_endpoint: '/order',
        concurrency_users: concurrency,
        duration_seconds: duration,
        stress_pattern: 'SPIKE',
      };

      let simScenario = null;
      if (mode === 'sim_cascade') simScenario = 'CASCADING_FAILURE';
      if (mode === 'sim_retry') simScenario = 'RETRY_STORM';

      ws.send(
        JSON.stringify({
          topology: topology,
          plan: plan,
          simulation_scenario: simScenario,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { event_type, data } = msg;

        if (event_type === 'METRICS_TICK') {
          const snaps = data.snapshots || {};
          setCurrentMetrics(snaps);
          layoutGraph(topology, snaps, null, []);
        } else if (event_type === 'REASONING_CHUNK') {
          setThoughts((prev) => prev + (data.token || ''));
        } else if (event_type === 'DIAGNOSIS_REPORT') {
          setReport(data);
          const root = data.root_cause_service;
          const blast = data.blast_radius || [];
          layoutGraph(topology, currentMetrics, root, blast);
        } else if (event_type === 'COMPLETED') {
          setIsRunning(false);
          ws.close();
        }
      } catch (err) {
        console.error('Error processing WS frame:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setIsRunning(false);
    };

    ws.onclose = () => {
      setIsRunning(false);
    };
  };

  const stopExperiment = () => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    setIsRunning(false);
  };

  // 4. Highlight specific service when clicking blast radius chip
  const handleHighlight = (serviceId) => {
    setHighlightedService(serviceId);
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: {
          ...n.data,
          status: n.id === serviceId ? 'critical' : n.data.status,
        },
      }))
    );
  };

  const dbSnap = currentMetrics['db-service'] || {};
  const gwSnap = currentMetrics['gateway'] || {};

  return (
    <div className="w-screen h-screen flex flex-col bg-[#07090e] text-slate-200 overflow-hidden select-none">
      <Header
        isRunning={isRunning}
        onStart={startExperiment}
        onStop={stopExperiment}
        mode={mode}
        setMode={setMode}
        concurrency={concurrency}
        setConcurrency={setConcurrency}
        duration={duration}
        setDuration={setDuration}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Interactive Topology Canvas (65%) */}
        <div className="flex-1 relative border-r border-slate-800/80">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.5}
            maxZoom={1.5}
          >
            <Background color="#1e293b" gap={20} size={1} />
            <Controls className="!bg-slate-900 !border-slate-800 !fill-slate-400 !rounded-xl overflow-hidden shadow-xl" />
          </ReactFlow>

          {/* Quick Metrics Overlay (Bottom Left) */}
          <div className="absolute bottom-5 left-5 flex items-center gap-2 bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5 backdrop-blur-xl font-mono text-xs shadow-xl pointer-events-none">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span className="text-slate-400">Gateway:</span>
              <span className="font-bold text-white">{(gwSnap.throughput_rps || 0).toFixed(1)} RPS</span>
            </div>

            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800">
              <span className={`w-2 h-2 rounded-full ${dbSnap.pool_active >= 5 ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'}`} />
              <span className="text-slate-400">DB Pool:</span>
              <span className={`font-bold ${dbSnap.pool_active >= 5 ? 'text-rose-400' : 'text-white'}`}>
                {dbSnap.pool_active ?? 0}/5
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800">
              <span className="text-slate-400">p99:</span>
              <span className={`font-bold ${gwSnap.latency_p99_ms > 800 ? 'text-rose-400' : 'text-white'}`}>
                {Math.round(gwSnap.latency_p99_ms || 0)}ms
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Reasoning Terminal & Diagnosis (35%) */}
        <div className="w-[480px] h-full flex flex-col p-4 bg-[#090d16] overflow-y-auto space-y-4">
          <div className="h-[380px] shrink-0">
            <AgentTerminal thoughts={thoughts} isRunning={isRunning} completed={Boolean(report)} />
          </div>

          <div className="flex-1">
            <DiagnosisCard report={report} onHighlightService={handleHighlight} />
          </div>
        </div>
      </div>
    </div>
  );
}
