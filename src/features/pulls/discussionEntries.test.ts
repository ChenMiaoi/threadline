import { expect, it } from 'vitest';
import type { RestComment, RestReview } from '../../core/github';
import { discussionCount, discussionEntries } from './discussionEntries';

const review: RestReview = {
  id: 10,
  state: 'COMMENTED',
  body: '',
  user: { login: 'reviewer' },
  submitted_at: '2026-10-30T18:25:00Z',
  commit_id: 'head',
};
const comment: RestComment = {
  id: 20,
  body: 'Code feedback',
  user: { login: 'reviewer' },
  created_at: '2026-10-30T18:23:00Z',
  pull_request_review_id: 10,
};

it('keeps an empty submitted review when it owns comments and nests replies once', () => {
  const entries = discussionEntries({
    comments: [],
    reviews: [[review]],
    reviewComments: [
      [
        { ...comment, id: 21, in_reply_to_id: 20, pull_request_review_id: 11, body: 'Reply' },
        comment,
      ],
    ],
  });
  expect(entries).toHaveLength(1);
  expect(entries[0].kind).toBe('review');
  if (entries[0].kind !== 'review') throw new Error('Expected review group');
  expect(entries[0].threads[0].comment.id).toBe(20);
  expect(entries[0].threads[0].replies.map((reply) => reply.id)).toEqual([21]);
  expect(discussionCount(entries)).toBe(3);
});

it('never guesses review ownership from author, path, or timestamps', () => {
  const entries = discussionEntries({
    comments: [],
    reviews: [[{ ...review, body: 'Summary' }]],
    reviewComments: [
      [
        { ...comment, pull_request_review_id: 99 },
        { ...comment, id: 22, pull_request_review_id: undefined },
      ],
    ],
  });
  expect(entries.filter((entry) => entry.kind === 'thread')).toHaveLength(2);
  expect(discussionCount(entries)).toBe(3);
});

it('hides pending and empty unattached reviews while preserving orphaned comments', () => {
  const entries = discussionEntries({
    comments: [],
    reviews: [[review, { ...review, id: 12, state: 'PENDING' }]],
    reviewComments: [[{ ...comment, pull_request_review_id: 12 }]],
  });
  expect(entries.map((entry) => entry.kind)).toEqual(['thread']);
});
