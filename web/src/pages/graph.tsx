import React, { useState, useEffect, useRef } from 'react';
import { fetchGraph } from '../lib/api';
import { GraphNode, GraphEdge } from '../lib/mockData';
import { OutcomeBadge } from '../components/SourceBadge';

interface SimulationNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

export default function GraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simNodesRef = useRef<SimulationNode[]>([]);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const loadGraphData = async (centerId?: string) => {
    setLoading(true);
    try {
      const data = await fetchGraph(centerId);
      setNodes(data.nodes);
      setEdges(data.edges);
      initSimulation(data.nodes, data.edges);
      if (data.nodes.length > 0 && !selectedNode) {
        setSelectedNode(data.nodes[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraphData();
  }, []);

  const getNodeColor = (type: string, outcome?: string) => {
    if (type === 'Decision') {
      return outcome === 'rejected' ? '#e11d48' : '#10b981';
    }
    if (type === 'File') return '#3b82f6';
    if (type === 'Person') return '#a855f7';
    if (type === 'Source') return '#f59e0b';
    return '#6b7280';
  };

  const initSimulation = (rawNodes: GraphNode[], rawEdges: GraphEdge[]) => {
    const width = 800;
    const height = 600;

    const initialized: SimulationNode[] = rawNodes.map((n, i) => {
      const angle = (i / rawNodes.length) * 2 * Math.PI;
      const dist = 140 + (i % 3) * 60;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * dist + (Math.random() - 0.5) * 40,
        y: height / 2 + Math.sin(angle) * dist + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        radius: n.type === 'Decision' ? 18 : n.type === 'File' ? 14 : 12,
        color: getNodeColor(n.type, n.outcome),
      };
    });

    simNodesRef.current = initialized;
  };

  // Render loop
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
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Edge label midpoint
        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;
        ctx.fillStyle = '#64748b';
        ctx.font = '9px monospace';
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
        ctx.fillStyle = isMatch && isSearchMatch ? node.color : '#334155';
        ctx.fill();

        if (isSelected) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        } else {
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#0f172a';
          ctx.stroke();
        }

        // Label
        ctx.fillStyle = isSelected ? '#ffffff' : '#cbd5e1';
        ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
        const label =
          node.title?.substring(0, 20) ||
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

    // Check hit
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Knowledge Graph Explorer</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Graph of Decisions, Files (with Rename Chains), Authors, and Verifiable Source Threads.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs bg-[#0e1424] px-3.5 py-2 rounded-lg border border-gray-800">
          <span className="flex items-center space-x-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span><span className="text-gray-300">Decision (Adopted)</span></span>
          <span className="flex items-center space-x-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span><span className="text-gray-300">Decision (Rejected)</span></span>
          <span className="flex items-center space-x-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span><span className="text-gray-300">File</span></span>
          <span className="flex items-center space-x-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-500"></span><span className="text-gray-300">Person</span></span>
          <span className="flex items-center space-x-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span><span className="text-gray-300">Source</span></span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0e1424] p-3 rounded-xl border border-gray-800">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Search graph nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg bg-gray-900 border border-gray-700/80 px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 w-48 sm:w-64"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg bg-gray-900 border border-gray-700/80 px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Node Types</option>
            <option value="decision">Decisions Only</option>
            <option value="file">Files Only</option>
            <option value="person">Persons Only</option>
            <option value="source">Sources Only</option>
          </select>
        </div>

        <div className="flex items-center space-x-1 text-xs">
          <button onClick={() => zoom(1.2)} className="rounded bg-gray-800 px-2.5 py-1 text-gray-300 hover:bg-gray-700">Zoom +</button>
          <button onClick={() => zoom(0.8)} className="rounded bg-gray-800 px-2.5 py-1 text-gray-300 hover:bg-gray-700">Zoom -</button>
          <button onClick={resetZoom} className="rounded bg-gray-800 px-2.5 py-1 text-gray-300 hover:bg-gray-700">Reset</button>
          <button onClick={() => loadGraphData()} className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500 font-medium">Re-center</button>
        </div>
      </div>

      {/* Canvas and Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-xl border border-gray-800 bg-[#0e1424] p-2 relative overflow-hidden h-[540px]">
          <canvas
            ref={canvasRef}
            width={800}
            height={520}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="w-full h-full cursor-grab active:cursor-grabbing rounded-lg bg-[#070b14]"
          />
          <div className="absolute bottom-4 left-4 bg-gray-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-800 text-[11px] text-gray-400">
            Drag to pan • Click node to inspect details
          </div>
        </div>

        {/* Selected Node Inspector */}
        <div className="lg:col-span-4 rounded-xl border border-gray-800 bg-[#0e1424] p-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 border-b border-gray-800 pb-2">
            Node Details Inspector
          </h2>

          {selectedNode ? (
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-gray-500 font-medium">Node Type:</span>
                <div className="mt-1 flex items-center space-x-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: getNodeColor(selectedNode.type, selectedNode.outcome) }}
                  ></span>
                  <span className="font-semibold text-white">{selectedNode.type}</span>
                  {selectedNode.outcome && <OutcomeBadge outcome={selectedNode.outcome} />}
                </div>
              </div>

              <div>
                <span className="text-gray-500 font-medium">Identifier:</span>
                <p className="mt-1 font-mono text-[11px] text-gray-300 break-all bg-gray-900 p-2 rounded border border-gray-800">
                  {selectedNode.id}
                </p>
              </div>

              {selectedNode.title && (
                <div>
                  <span className="text-gray-500 font-medium">Title:</span>
                  <p className="mt-1 font-semibold text-white text-sm">{selectedNode.title}</p>
                </div>
              )}

              {selectedNode.path && (
                <div>
                  <span className="text-gray-500 font-medium">File Path:</span>
                  <p className="mt-1 font-mono text-blue-400">{selectedNode.path}</p>
                </div>
              )}

              {selectedNode.handle && (
                <div>
                  <span className="text-gray-500 font-medium">Author Handle:</span>
                  <p className="mt-1 font-mono text-purple-400">@{selectedNode.handle}</p>
                </div>
              )}

              {selectedNode.url && (
                <div>
                  <span className="text-gray-500 font-medium">Source URL:</span>
                  <p className="mt-1">
                    <a
                      href={selectedNode.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 underline break-all hover:text-blue-300"
                    >
                      {selectedNode.url} ↗
                    </a>
                  </p>
                </div>
              )}

              <div className="pt-3 border-t border-gray-800">
                <button
                  onClick={() => loadGraphData(selectedNode.id)}
                  className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white hover:bg-blue-500 transition"
                >
                  Focus Neighborhood (Depth 2)
                </button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-gray-500">
              Click any node in the graph to inspect its connected neighbors and properties.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
