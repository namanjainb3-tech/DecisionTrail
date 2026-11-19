import React from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import { Navbar } from '../components/Navbar';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>DecisionTrail — Verifiable Architectural Decisions</title>
        <meta name="description" content="Surfaces past architectural and design decisions with verbatim verified citations." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="min-h-screen bg-[#090d16] text-gray-100 flex flex-col font-sans">
        <Navbar />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:px-6">
          <Component {...pageProps} />
        </main>
        <footer className="border-t border-gray-800/80 py-4 text-center text-xs text-gray-500">
          DecisionTrail • 100% Verifiable Source Traceability • RapidFuzz Machine-Verified Quotes
        </footer>
      </div>
    </>
  );
}

