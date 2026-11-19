import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchRepositories, ingestRepository } from '../lib/api';

export interface IngestResult {
  success: boolean;
  message: string;
  is_single_pr?: boolean;
  thread_id?: string;
  title?: string;
  number?: number;
  repo?: string;
}

interface RepoContextType {
  activeRepo: string;
  setActiveRepo: (repo: string) => void;
  repositories: string[];
  refreshRepositories: () => Promise<string[]>;
  loadingRepo: boolean;
  loadNewRepo: (repoUrl: string) => Promise<IngestResult>;
}

const RepoContext = createContext<RepoContextType>({
  activeRepo: '',
  setActiveRepo: () => {},
  repositories: [],
  refreshRepositories: async () => [],
  loadingRepo: false,
  loadNewRepo: async () => ({ success: false, message: '' }),
});

export const RepoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeRepo, setActiveRepoState] = useState<string>('');
  const [repositories, setRepositories] = useState<string[]>([]);
  const [loadingRepo, setLoadingRepo] = useState<boolean>(false);

  const refreshRepositories = async () => {
    try {
      const list = await fetchRepositories();
      setRepositories(list);
      return list;
    } catch (e) {
      console.warn('Failed to fetch repositories list:', e);
      return [];
    }
  };

  useEffect(() => {
    const init = async () => {
      const list = await refreshRepositories();
      const saved = typeof window !== 'undefined' ? localStorage.getItem('decisiontrail_active_repo') : null;
      if (saved && list.includes(saved)) {
        setActiveRepoState(saved);
      } else if (list.length > 0) {
        setActiveRepoState(list[0]);
      }
    };
    init();
  }, []);

  const setActiveRepo = (repo: string) => {
    setActiveRepoState(repo);
    if (typeof window !== 'undefined') {
      localStorage.setItem('decisiontrail_active_repo', repo);
    }
  };

  const loadNewRepo = async (repoUrl: string): Promise<IngestResult> => {
    setLoadingRepo(true);
    try {
      const res = await ingestRepository(repoUrl, 20);
      await refreshRepositories();
      if (res.repo) {
        setActiveRepo(res.repo);
      }
      return {
        success: true,
        message: res.is_single_pr
          ? `Successfully loaded PR #${res.number}: "${res.title}" with discussion comments!`
          : `Successfully ingested ${res.documents_ingested} discussions and extracted ${res.decisions_extracted} decisions from ${res.repo}!`,
        is_single_pr: res.is_single_pr,
        thread_id: res.thread_id,
        title: res.title,
        number: res.number,
        repo: res.repo,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Failed to ingest repository.',
      };
    } finally {
      setLoadingRepo(false);
    }
  };

  return (
    <RepoContext.Provider
      value={{
        activeRepo,
        setActiveRepo,
        repositories,
        refreshRepositories,
        loadingRepo,
        loadNewRepo,
      }}
    >
      {children}
    </RepoContext.Provider>
  );
};

export const useRepo = () => useContext(RepoContext);

