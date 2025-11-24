
import { useState, useCallback } from 'react';

export const useVoting = (initialRecs: number, initialNonRecs: number) => {
  const [recs, setRecs] = useState(initialRecs);
  const [nonRecs, setNonRecs] = useState(initialNonRecs);
  const [voted, setVoted] = useState<'rec' | 'nonrec' | null>(null);

  const handleRecommend = useCallback(() => {
    if (voted === 'rec') {
        // Cancel recommendation
        setRecs(prev => prev - 1);
        setVoted(null);
    } else if (voted === 'nonrec') {
        // Switch to recommendation
        setRecs(prev => prev + 1);
        setNonRecs(prev => prev - 1);
        setVoted('rec');
    } else {
        // New recommendation
        setRecs(prev => prev + 1);
        setVoted('rec');
    }
  }, [voted]);

  const handleNonRecommend = useCallback(() => {
    if (voted === 'nonrec') {
        // Cancel non-recommendation
        setNonRecs(prev => prev - 1);
        setVoted(null);
    } else if (voted === 'rec') {
        // Switch to non-recommendation
        setNonRecs(prev => prev + 1);
        setRecs(prev => prev - 1);
        setVoted('nonrec');
    } else {
        // New non-recommendation
        setNonRecs(prev => prev + 1);
        setVoted('nonrec');
    }
  }, [voted]);

  return {
    recs,
    nonRecs,
    voted,
    handleRecommend,
    handleNonRecommend,
  };
};
