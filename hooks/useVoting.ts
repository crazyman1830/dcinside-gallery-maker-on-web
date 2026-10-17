import { useState, useCallback } from 'react';

type Vote = 'rec' | 'nonrec' | null;

interface PendingVote {
  // The props the vote was cast against; once the parent passes new props they win.
  base: { recs: number; nonRecs: number; voted: Vote };
  voted: Vote;
}

const shiftCount = (count: number, side: 'rec' | 'nonrec', from: Vote, to: Vote) =>
  count - (from === side ? 1 : 0) + (to === side ? 1 : 0);

export const useVoting = (
  initialRecs: number,
  initialNonRecs: number,
  initialVoted: Vote = null,
  onVoteChange?: (voted: Vote, recs: number, nonRecs: number) => void,
) => {
  const [pending, setPending] = useState<PendingVote | null>(null);
  const baseVoted = initialVoted || null;
  const isPendingCurrent =
    pending !== null &&
    pending.base.recs === initialRecs &&
    pending.base.nonRecs === initialNonRecs &&
    pending.base.voted === baseVoted;
  const voted = isPendingCurrent ? pending.voted : baseVoted;
  const recs = shiftCount(initialRecs, 'rec', baseVoted, voted);
  const nonRecs = shiftCount(initialNonRecs, 'nonrec', baseVoted, voted);

  const castVote = useCallback(
    (side: 'rec' | 'nonrec') => {
      // Voting the same side again cancels it; the other side switches the vote.
      const nextVoted = voted === side ? null : side;
      const nextRecs = shiftCount(recs, 'rec', voted, nextVoted);
      const nextNonRecs = shiftCount(nonRecs, 'nonrec', voted, nextVoted);
      setPending({
        base: { recs: initialRecs, nonRecs: initialNonRecs, voted: baseVoted },
        voted: nextVoted,
      });
      onVoteChange?.(nextVoted, nextRecs, nextNonRecs);
    },
    [voted, recs, nonRecs, initialRecs, initialNonRecs, baseVoted, onVoteChange],
  );

  const handleRecommend = useCallback(() => castVote('rec'), [castVote]);
  const handleNonRecommend = useCallback(() => castVote('nonrec'), [castVote]);

  return {
    recs,
    nonRecs,
    voted,
    handleRecommend,
    handleNonRecommend,
  };
};
