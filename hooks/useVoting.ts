import { useState, useCallback, useEffect } from 'react';

export const useVoting = (
  initialRecs: number,
  initialNonRecs: number,
  initialVoted: 'rec' | 'nonrec' | null = null,
  onVoteChange?: (voted: 'rec' | 'nonrec' | null, recs: number, nonRecs: number) => void,
) => {
  const [recs, setRecs] = useState(initialRecs);
  const [nonRecs, setNonRecs] = useState(initialNonRecs);
  const [voted, setVoted] = useState<'rec' | 'nonrec' | null>(initialVoted);

  useEffect(() => {
    setRecs(initialRecs);
  }, [initialRecs]);

  useEffect(() => {
    setNonRecs(initialNonRecs);
  }, [initialNonRecs]);

  useEffect(() => {
    setVoted(initialVoted || null);
  }, [initialVoted]);

  const handleRecommend = useCallback(() => {
    let nextVoted: 'rec' | 'nonrec' | null = null;
    let nextRecs = recs;
    let nextNonRecs = nonRecs;

    if (voted === 'rec') {
      // Cancel recommendation
      nextRecs = recs - 1;
      nextVoted = null;
    } else if (voted === 'nonrec') {
      // Switch to recommendation
      nextRecs = recs + 1;
      nextNonRecs = nonRecs - 1;
      nextVoted = 'rec';
    } else {
      // New recommendation
      nextRecs = recs + 1;
      nextVoted = 'rec';
    }

    setRecs(nextRecs);
    setNonRecs(nextNonRecs);
    setVoted(nextVoted);

    if (onVoteChange) {
      onVoteChange(nextVoted, nextRecs, nextNonRecs);
    }
  }, [voted, recs, nonRecs, onVoteChange]);

  const handleNonRecommend = useCallback(() => {
    let nextVoted: 'rec' | 'nonrec' | null = null;
    let nextRecs = recs;
    let nextNonRecs = nonRecs;

    if (voted === 'nonrec') {
      // Cancel non-recommendation
      nextNonRecs = nonRecs - 1;
      nextVoted = null;
    } else if (voted === 'rec') {
      // Switch to non-recommendation
      nextNonRecs = nonRecs + 1;
      nextRecs = recs - 1;
      nextVoted = 'nonrec';
    } else {
      // New non-recommendation
      nextNonRecs = nonRecs + 1;
      nextVoted = 'nonrec';
    }

    setRecs(nextRecs);
    setNonRecs(nextNonRecs);
    setVoted(nextVoted);

    if (onVoteChange) {
      onVoteChange(nextVoted, nextRecs, nextNonRecs);
    }
  }, [voted, recs, nonRecs, onVoteChange]);

  return {
    recs,
    nonRecs,
    voted,
    handleRecommend,
    handleNonRecommend,
  };
};
