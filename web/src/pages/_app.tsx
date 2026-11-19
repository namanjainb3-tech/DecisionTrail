import React from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import { Navbar } from '../components/Navbar';
import { RepoProvider } from '../context/RepoContext';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <RepoProvider>
      <Head>
        <title>DecisionTrail — Verifiable Architectural Decisions</title>
        <meta name="description" content="Surfaces past architectural and design decisions with verbatim verified citations." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:px-6">
          <Component {...pageProps} />
        </main>
        <footer className="border-t border-[#1a2233] py-4 text-center text-xs text-slate-500">
          <div className="flex flex-col sm:flex-row items-center justify-between max-w-7xl mx-auto px-4 sm:px-6 gap-2">
            <span className="font-mono text-[11px] text-slate-400">
              DecisionTrail v1.0 • Architectural Decision Intelligence
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              RapidFuzz ≥ 95% Machine-Verified Quotes • Multi-Repo Graph Engine
            </span>
          </div>
        </footer>
      </div>
    </RepoProvider>
  );
}
