import { describe, expect, it } from 'vitest';
import type { Comment } from '../types';
import { threadComments } from '../utils/commentThreads';

const comment = (id: string, replyTo?: string): Comment => ({
  id,
  author: `author-${id}`,
  text: `text-${id}`,
  timestamp: '2026-10-16T09:00:00.000Z',
  recommendations: 0,
  nonRecommendations: 0,
  ...(replyTo ? { replyTo: { author: `author-${replyTo}`, commentId: replyTo } } : {}),
});

const shape = (comments: Comment[]) =>
  threadComments(comments).map(({ comment: item, depth }) => `${item.id}:${depth}`);

describe('threadComments', () => {
  it('groups replies and nested replies under their top-level comment in original order', () => {
    expect(
      shape([
        comment('a'),
        comment('b'),
        comment('a1', 'a'),
        comment('b1', 'b'),
        comment('a1x', 'a1'),
        comment('c'),
      ]),
    ).toEqual(['a:0', 'a1:1', 'a1x:1', 'b:0', 'b1:1', 'c:0']);
  });

  it('keeps replies to missing comments visible at the top level', () => {
    expect(shape([comment('a'), comment('orphan', 'gone')])).toEqual(['a:0', 'orphan:0']);
  });

  it('does not loop on malformed reply cycles', () => {
    expect(shape([comment('x', 'y'), comment('y', 'x')])).toHaveLength(2);
  });
});
