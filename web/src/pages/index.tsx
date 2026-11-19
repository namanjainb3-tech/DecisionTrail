import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/decisions');
  }, [router]);

  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Loading DecisionTrail...</p>
      </div>
    </div>
  );
}

