import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { fetchGraphStatus } from '../lib/api';

export const Navbar: React.FC = () => {
  const router = useRouter();
  const [graphStatus, setGraphStatus] = useState<{
    is_live: boolean;
    engine: string;
    instructions: string;
  } | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchGraphStatus().then(setGraphStatus).catch(() => null);
  }, []);

  const navItems = [
    { label: 'Decisions Catalog', href: '/decisions', icon: '📋' },
    { label: 'Knowledge Graph', href: '/graph', icon: '🕸️' },
    { label: 'PR Simulator', href: '/pr', icon: '🤖' },
    { label: 'Evaluation Benchmark', href: '/eval', icon: '📊' },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-gray-800 bg-[#090d16]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center space-x-6">
            <Link href="/decisions" className="flex items-center space-x-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-mono font-bold text-white shadow-lg shadow-blue-500/30">
                DT
              </span>
              <span className="font-bold tracking-tight text-white sm:text-lg">
                DecisionTrail
              </span>
              <span className="hidden rounded bg-blue-950/80 px-2 py-0.5 text-xs font-semibold text-blue-400 border border-blue-800/60 sm:inline-block">
                psf/black
              </span>
            </Link>

            <nav className="hidden md:flex space-x-1">
              {navItems.map((item) => {
                const active = router.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center space-x-3">
            {/* Neo4j / Graph Status Pill */}
            {graphStatus && (
              <button
                onClick={() => setShowModal(true)}
                className={`flex items-center space-x-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition ${
                  graphStatus.is_live
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900/60'
                    : 'bg-blue-950/60 text-blue-300 border-blue-800/50 hover:bg-blue-900/50'
                }`}
                title="Click for Graph Database details"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    graphStatus.is_live ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'
                  }`}
                ></span>
                <span className="hidden sm:inline">
                  {graphStatus.is_live ? 'Neo4j 5.x Live' : 'Graph Engine: Built-in'}
                </span>
                <span className="sm:hidden">
                  {graphStatus.is_live ? 'Neo4j' : 'Graph'}
                </span>
              </button>
            )}

            <div className="flex items-center space-x-1.5 rounded-full bg-emerald-950/60 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-800/50">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              <span className="hidden sm:inline">RapidFuzz ≥ 95% Verified</span>
              <span className="sm:hidden">Verified</span>
            </div>
          </div>
        </div>
        
        {/* Mobile nav */}
        <div className="flex md:hidden border-t border-gray-800/80 px-4 py-2 space-x-2 overflow-x-auto">
          {navItems.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center space-x-1 rounded px-2.5 py-1 text-xs font-medium ${
                  active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Graph Status Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-[#0e1424] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <span>🕸️ Knowledge Graph Diagnostics</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-gray-400 font-medium">Active Graph Backend:</span>
                <p className="mt-1 font-semibold text-white text-sm">
                  {graphStatus?.engine}
                </p>
              </div>

              <div>
                <span className="text-gray-400 font-medium">Connection Status:</span>
                <div className="mt-1 flex items-center space-x-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      graphStatus?.is_live ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}
                  ></span>
                  <span className="font-mono text-gray-200">
                    {graphStatus?.is_live
                      ? 'Live Neo4j instance connected via Bolt protocol.'
                      : 'Built-in high-performance graph engine active (in-memory mock store).'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg bg-gray-900 border border-gray-800 p-3 space-y-2">
                <span className="font-semibold text-blue-400">💡 How to Connect Real Neo4j:</span>
                <p className="text-gray-300 leading-relaxed">
                  DecisionTrail automatically connects to Neo4j if available. To run Neo4j:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-gray-400">
                  <li>
                    <strong className="text-gray-200">Neo4j Aura Cloud (Free, No Docker):</strong> Create a free database at{' '}
                    <a
                      href="https://console.neo4j.io"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 underline"
                    >
                      console.neo4j.io
                    </a>{' '}
                    and paste the connection URI into <code>.env</code>.
                  </li>
                  <li>
                    <strong className="text-gray-200">Local Docker:</strong> Run <code>docker compose up -d</code>.
                  </li>
                  <li>
                    <strong className="text-gray-200">Diagnostic Check:</strong> Run{' '}
                    <code>python scripts/check_neo4j.py</code> to test your connection anytime!
                  </li>
                </ol>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
