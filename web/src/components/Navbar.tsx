import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export const Navbar: React.FC = () => {
  const router = useRouter();

  const navItems = [
    { label: 'Decisions Catalog', href: '/decisions', icon: '📋' },
    { label: 'Knowledge Graph', href: '/graph', icon: '🕸️' },
    { label: 'PR Simulator', href: '/pr', icon: '🤖' },
    { label: 'Evaluation Benchmark', href: '/eval', icon: '📊' },
  ];

  return (
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
              Verifiable ADRs
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
          <div className="flex items-center space-x-1.5 rounded-full bg-emerald-950/60 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-800/50">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Verbatim Trace Active</span>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-700 transition"
          >
            Docs
          </a>
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
  );
};
