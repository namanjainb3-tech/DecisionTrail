import React, { useState, useEffect, useRef } from 'react';
import { fetchGraph, fetchGraphStatus } from '../lib/api';
import { GraphNode, GraphEdge } from '../lib/mockData';
import { OutcomeBadge } from '../components/SourceBadge';
import { useRepo } from '../context/RepoContext';

interface SimulationNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

export default function GraphPage() {
  const { activeRepo, setActiveRepo, repositories, refreshRepositories, loadNewRepo, loadingRepo } = useRepo();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [graphStatus, setGraphStatus] = useState<any>(null);
  const [newRepoInput, setNewRepoInput] = useState('');
  const [ingestBanner, setIngestBanner] = useState<{ success: boolean; message: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simNodesRef = useRef<SimulationNode[]>([]);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    refreshRepositories();
  }, []);

  const handleIngestRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoInput.trim()) return;
    setIngestBanner(null);
    const result = await loadNewRepo(newRepoInput.trim());
    setIngestBanner(result);
    if (result.success) {
      setNewRepoInput('');
      await refreshRepositories();
      if (result.repo) {
        setActiveRepo(result.repo);
      }
      await loadGraphData();
      setTimeout(() => setIngestBanner(null), 8000);
    }
  };

  const loadGraphData = async (centerId?: string) => {
    setLoading(true);
    try {
      const [data, status] = await Promise.all([
        fetchGraph(centerId, 2, activeRepo),
        fetchGraphStatus(),
      ]);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setGraphStatus(status);
      initSimulation(data.nodes || [], data.edges || []);
      if (data.nodes && data.nodes.length > 0) {
        setSelectedNode(data.nodes[0]);
      } else {
        setSelectedNode(null);
      }
    } catch (err) {
      console.warn('Failed to load graph data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraphData();
  }, [activeRepo]);

  const getNodeColor = (type: string, outcome?: string) => {
    if (type === 'Decision') {
      return outcome === 'rejected' ? '#f43f5e' : '#10b981';
    }
    if (type === 'Repo') return '#6366f1'; // Indigo
    if (type === 'Discussion') return '#06b6d4'; // Cyan
    if (type === 'Alternative') return '#f97316'; // Orange
    if (type === 'File') return '#38bdf8'; // Blue
    if (type === 'Person') return '#a855f7'; // Purple
    if (type === 'Source') return '#f59e0b'; // Amber
    return '#64748b';
  };

  const initSimulation = (rawNodes: GraphNode[], rawEdges: GraphEdge[]) => {
    const width = 800;
    const height = 600;

    const initialized: SimulationNode[] = rawNodes.map((n, i) => {
      const angle = (i / Math.max(1, rawNodes.length)) * 2 * Math.PI;
      const dist = 120 + (i % 4) * 45;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * dist + (Math.random() - 0.5) * 30,
        y: height / 2 + Math.sin(angle) * dist + (Math.random() - 0.5) * 30,
        vx: 0,
        vy: 0,
        radius: n.type === 'Repo' ? 22 : n.type === 'Decision' ? 17 : n.type === 'Discussion' ? 15 : n.type === 'File' ? 13 : 11,
        color: getNodeColor(n.type, n.outcome),
      };
    });

    simNodesRef.current = initialized;
  };

  // Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      const { x, y, k } = transformRef.current;
      ctx.translate(x, y);
      ctx.scale(k, k);

      const simNodes = simNodesRef.current;
      const nodeMap = new Map<string, SimulationNode>();
      simNodes.forEach((n) => nodeMap.set(n.id, n));

      // Draw edges
      edges.forEach((edge) => {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) return;

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Edge label midpoint
        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;
        ctx.fillStyle = '#475569';
        ctx.font = '8px monospace';
        ctx.fillText(edge.type, midX, midY);
      });

      // Draw nodes
      simNodes.forEach((node) => {
        const isMatch =
          filterType === 'all' || filterType === node.type.toLowerCase();
        const isSearchMatch =
          !searchTerm ||
          (node.title || node.path || node.name || node.id)
            .toLowerCase()
            .includes(searchTerm.toLowerCase());

        const isSelected = selectedNode?.id === node.id;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = isMatch && isSearchMatch ? node.color : '#1e293b';
        ctx.fill();

        if (isSelected) {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        } else {
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#080b11';
          ctx.stroke();
        }

        // Label
        ctx.fillStyle = isSelected ? '#ffffff' : '#94a3b8';
        ctx.font = isSelected ? '600 11px sans-serif' : '10px sans-serif';
        const label =
          node.title?.substring(0, 22) ||
          node.path?.split('/').pop() ||
          node.name ||
          node.handle ||
          node.id;
        ctx.fillText(label, node.x + node.radius + 4, node.y + 4);
      });

      ctx.restore();
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [edges, selectedNode, filterType, searchTerm]);

  // Click handling on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { x, y, k } = transformRef.current;
    const worldX = (clickX - x) / k;
    const worldY = (clickY - y) / k;

    for (const n of simNodesRef.current) {
      const dx = n.x - worldX;
      const dy = n.y - worldY;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 4) {
        setSelectedNode(n);
        return;
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    transformRef.current.x += dx;
    transformRef.current.y += dy;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const zoom = (factor: number) => {
    transformRef.current.k *= factor;
  };

  const resetZoom = () => {
    transformRef.current = { x: 0, y: 0, k: 1 };
  };

  const allDropdownRepos = Array.from(
    new Set([...repositories, ...(activeRepo && activeRepo !== 'all' ? [activeRepo] : [])])
  ).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1a2233] pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Knowledge Graph Explorer</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Interactive graph mapping decisions, code artifacts, rename lineages, and verifiable source threads.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 text-xs bg-[#0a0e17] px-3.5 py-2 rounded-lg border border-[#1a2336]">
          <span className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500"></span><span className="text-slate-300 text-[11px] font-mono">Repo</span></span>
          <span className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"></span><span className="text-slate-300 text-[11px] font-mono">Adopted</span></span>
          <span className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-rose-500"></span><span className="text-slate-300 text-[11px] font-mono">Rejected</span></span>
          <span className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-cyan-500"></span><span className="text-slate-300 text-[11px] font-mono">Discussion</span></span>
          <span className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-sky-400"></span><span className="text-slate-300 text-[11px] font-mono">File</span></span>
          <span className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-purple-500"></span><span className="text-slate-300 text-[11px] font-mono">Person</span></span>
          <span className="flex items-center space-x-1.5"><span className="h-2 w-2 rounded-full bg-amber-500"></span><span className="text-slate-300 text-[11px] font-mono">Source</span></span>
        </div>
      </div>

      {/* Load Any Repo into Knowledge Graph Bar */}
      <div className="rounded-xl border border-[#1a2336] bg-[#0a0e17] p-3.5 sm:p-4 shadow-sm">
        <form onSubmit={handleIngestRepo} className="flex flex-col sm:flex-row items-center gap-2.5">
          <div className="relative flex-1 w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500 text-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Paste any GitHub repository link or specific PR (e.g. astral-sh/uv or https://github.com/.../pull/123)..."
              value={newRepoInput}
              onChange={(e) => setNewRepoInput(e.target.value)}
              disabled={loadingRepo}
              className="w-full rounded-lg bg-[#070a12] border border-[#1c273c] pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loadingRepo || !newRepoInput.trim()}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-5 py-2.5 text-xs sm:text-sm font-semibold shrink-0 disabled:opacity-50 transition shadow-sm"
          >
            {loadingRepo ? (
              <>
                <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                <span>Ingesting & Mapping Graph...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Load into Graph</span>
              </>
            )}
          </button>
        </form>

        {ingestBanner && (
          <div
            className={`mt-3 rounded-lg p-3 text-xs border ${
              ingestBanner.success
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            }`}
          >
            {ingestBanner.message}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0a0e17] p-3 rounded-xl border border-[#1a2336]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Target Repository Switcher */}
          <select
            value={activeRepo || 'all'}
            onChange={(e) => setActiveRepo(e.target.value)}
            className="rounded-lg bg-[#07090f] border border-sky-500/40 px-3 py-1.5 text-xs font-mono font-medium text-sky-300 focus:outline-none focus:border-sky-400"
          >
            <option value="all">All Repositories ({allDropdownRepos.length})</option>
            {allDropdownRepos.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            {nodes.length} nodes • {edges.length} edges
          </span>

          <input
            type="text"
            placeholder="Search graph nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg bg-[#07090f] border border-[#1c273c] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 w-36 sm:w-52"
          />

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg bg-[#07090f] border border-[#1c273c] px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">All Node Types</option>
            <option value="repo">Repos Only</option>
            <option value="decision">Decisions Only</option>
            <option value="discussion">Discussions Only</option>
            <option value="file">Files Only</option>
            <option value="person">Persons Only</option>
            <option value="source">Sources Only</option>
          </select>
        </div>

        <div className="flex items-center space-x-1.5 text-xs">
          <button onClick={() => zoom(1.2)} className="rounded bg-[#121927] border border-[#1c273c] px-2.5 py-1 text-slate-300 hover:bg-[#182338] transition font-mono">Zoom +</button>
          <button onClick={() => zoom(0.8)} className="rounded bg-[#121927] border border-[#1c273c] px-2.5 py-1 text-slate-300 hover:bg-[#182338] transition font-mono">Zoom -</button>
          <button onClick={resetZoom} className="rounded bg-[#121927] border border-[#1c273c] px-2.5 py-1 text-slate-300 hover:bg-[#182338] transition font-mono">Reset</button>
          <button onClick={() => loadGraphData()} className="rounded bg-sky-600 px-3 py-1 text-white hover:bg-sky-500 font-medium transition shadow-sm">Re-center</button>
        </div>
      </div>

      {/* Graph Engine Status Bar */}
      {graphStatus && (
        <div className="rounded-lg border border-[#1a2336] bg-[#0a0e17] px-4 py-2 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span
              className={`h-2 w-2 rounded-full ${
                graphStatus.is_live ? 'bg-emerald-400 animate-pulse' : 'bg-sky-400'
              }`}
            ></span>
            <span className="font-mono text-slate-300">
              Backend: {graphStatus.engine}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 font-mono text-[11px]">
              {nodes.length} nodes, {edges.length} edges active
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            {graphStatus.is_live
              ? 'Bolt protocol connected at ' + graphStatus.uri
              : 'Built-in memory engine active mirroring Cypher projection'}
          </span>
        </div>
      )}

      {/* Canvas and Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-xl border border-[#1a2336] bg-[#0a0e17] p-2 relative overflow-hidden h-[540px]">
          <canvas
            ref={canvasRef}
            width={800}
            height={520}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="w-full h-full cursor-grab active:cursor-grabbing rounded-lg bg-[#07090f]"
          />
          <div className="absolute bottom-4 left-4 bg-[#0a0e17]/90 backdrop-blur px-3 py-1 rounded-md border border-[#1a2336] text-[11px] font-mono text-slate-400">
            Drag to pan • Click node to inspect details
          </div>
        </div>

        {/* Selected Node Inspector */}
        <div className="lg:col-span-4 rounded-xl border border-[#1a2336] bg-[#0a0e17] p-5 space-y-4">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400 border-b border-[#161f30] pb-2">
            Node Details Inspector
          </h2>

          {selectedNode ? (
            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-slate-500 text-[11px] font-mono">Type</span>
                <div className="mt-1 flex items-center space-x-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: getNodeColor(selectedNode.type, selectedNode.outcome) }}
                  ></span>
                  <span className="font-semibold text-white">{selectedNode.type}</span>
                  {selectedNode.outcome && <OutcomeBadge outcome={selectedNode.outcome} />}
                </div>
              </div>

              <div>
                <span className="text-slate-500 text-[11px] font-mono">Identifier</span>
                <p className="mt-1 font-mono text-[10px] text-slate-300 break-all bg-[#07090f] p-2 rounded border border-[#161f30]">
                  {selectedNode.id}
                </p>
              </div>

              {selectedNode.title && (
                <div>
                  <span className="text-slate-500 text-[11px] font-mono">Title</span>
                  <p className="mt-0.5 font-semibold text-white text-xs leading-snug">{selectedNode.title}</p>
                </div>
              )}

              {selectedNode.path && (
                <div>
                  <span className="text-slate-500 text-[11px] font-mono">File Path</span>
                  <p className="mt-0.5 font-mono text-sky-400 text-xs">{selectedNode.path}</p>
                </div>
              )}

              {selectedNode.handle && (
                <div>
                  <span className="text-slate-500 text-[11px] font-mono">Author</span>
                  <p className="mt-0.5 font-mono text-purple-400 text-xs">@{selectedNode.handle}</p>
                </div>
              )}

              {selectedNode.repo_or_forum && (
                <div>
                  <span className="text-slate-500 text-[11px] font-mono">Repository</span>
                  <p className="mt-0.5 font-mono text-indigo-400 text-xs">{selectedNode.repo_or_forum}</p>
                </div>
              )}

              {selectedNode.thread_id && (
                <div>
                  <span className="text-slate-500 text-[11px] font-mono">Discussion Thread</span>
                  <p className="mt-0.5 font-mono text-cyan-400 text-xs break-all">{selectedNode.thread_id}</p>
                </div>
              )}

              {selectedNode.quote && (
                <div>
                  <span className="text-slate-500 text-[11px] font-mono">Verified Evidence Quote</span>
                  <blockquote className="mt-1 border-l-2 border-amber-500/70 bg-amber-950/20 p-2 text-[11px] text-amber-200 italic font-mono leading-relaxed">
                    "{selectedNode.quote}"
                  </blockquote>
                </div>
              )}

              {selectedNode.url && (
                <div>
                  <span className="text-slate-500 text-[11px] font-mono">Source Link</span>
                  <p className="mt-0.5">
                    <a
                      href={selectedNode.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 underline break-all hover:text-sky-300 font-mono text-[11px] flex items-center space-x-1"
                    >
                      <span>{selectedNode.url}</span>
                      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-[#161f30]">
                <button
                  onClick={() => loadGraphData(selectedNode.id)}
                  className="w-full rounded-lg bg-sky-600 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-sm"
                >
                  Focus Neighborhood (2 Hops)
                </button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              Click any node in the canvas to inspect its connected relationships and properties.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}    </div>
  );
}
