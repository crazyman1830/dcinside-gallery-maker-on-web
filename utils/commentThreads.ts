import type { Comment } from '../types';

export interface ThreadedComment {
  comment: Comment;
  /** 0 for a top-level comment, 1 for any reply within its thread. */
  depth: 0 | 1;
}

/**
 * Orders comments as one-level threads, the way gallery boards show replies:
 * every reply is listed under the top-level comment its chain starts from,
 * keeping the original order inside each thread. Replies whose target no
 * longer exists stay top-level so nothing is hidden.
 */
export const threadComments = (comments: Comment[]): ThreadedComment[] => {
  const byId = new Map(comments.map(comment => [comment.id, comment]));
  const findRoot = (comment: Comment): Comment => {
    const visited = new Set<string>([comment.id]);
    let current = comment;
    while (current.replyTo) {
      const parent = byId.get(current.replyTo.commentId);
      if (!parent) break;
      // A malformed cycle has no real top-level comment; show it unthreaded.
      if (visited.has(parent.id)) return comment;
      visited.add(parent.id);
      current = parent;
    }
    return current;
  };

  const replies = new Map<string, Comment[]>();
  const roots: Comment[] = [];
  for (const comment of comments) {
    const root = findRoot(comment);
    if (root.id === comment.id) {
      roots.push(comment);
    } else {
      replies.set(root.id, [...(replies.get(root.id) ?? []), comment]);
    }
  }

  return roots.flatMap(root => [
    { comment: root, depth: 0 as const },
    ...(replies.get(root.id) ?? []).map(reply => ({ comment: reply, depth: 1 as const })),
  ]);
};
