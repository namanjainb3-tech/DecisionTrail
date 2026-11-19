import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchRepositories, ingestRepository } from '../lib/api';

interface RepoContextType {
  activeRepo: string;
  setActiveRepo: (repo: string) => void;
  repositories: string[];
  refreshRepositories: () => Promise<void>;
  loadingRepo: boolean;
  loadNewRepo: (repoUrl: string) => Promise<{ success: boolean; message: string }>;
}

const RepoContext = createContext<RepoContextType>({
  activeRepo: 'all',
  setActiveRepo: () => {},
  repositories: ['psf/black', 'django/django'],
  refreshRepositories: async () => {},
  loadingRepo: false,
  loadNewRepo: async () => ({ success: false, message: '' }),
});

export const RepoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeRepo, setActiveRepoState] = useState<string>('all');
  const [repositories, setRepositories] = useState<string[]>(['psf/black', 'django/django']);
  const [loadingRepo, setLoadingRepo] = useState<boolean>(false);

  const refreshRepositories = async () => {
    try {
      const list = await fetchRepositories();
      setRepositories(list);
    } catch (e) {
      console.warn('Failed to fetch repositories list:', e);
    }
  };

  useEffect(() => {
    // Load persisted repository from localStorage if available
    const saved = typeof window !== 'undefined' ? localStorage.getItem('decisiontrail_active_repo') : null;
    if (saved) {
      setActiveRepoState(saved);
    }
    refreshRepositories();
  }, []);

  const setActiveRepo = (repo: string) => {
    setActiveRepoState(repo);
    if (typeof window !== 'undefined') {
      localStorage.setItem('decisiontrail_active_repo', repo);
    }
  };

  const loadNewRepo = async (repoUrl: string): Promise<{ success: boolean; message: string }> => {
    setLoadingRepo(true);
    try {
      const res = await ingestRepository(repoUrl, 20);
      await refreshRepositories();
      setActiveRepo(res.repo);
      return {
        success: true,
        message: `Successfully ingested ${res.documents_ingested} discussions and extracted ${res.decisions_extracted} decisions from ${res.repo}!`,
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

