import { expect, it } from 'vitest';
import type { RestComment } from '../../core/github';
import { reviewThreads } from './reviewThreads';
const comment = (id: number, parent?: number): RestComment => ({
  id,
  in_reply_to_id: parent,
  body: `Comment ${id}`,
  user: { login: `user-${id}` },
  created_at: `2026-10-29T10:${String(id).padStart(2, '0')}:00Z`,
  path: 'same.cpp',
});
it('groups cross-page and nested replies without merging independent comments on the same file', () => {
  const threads = reviewThreads([comment(3, 2), comment(4), comment(2, 1), comment(1)]);
  expect(threads.map((t) => [t.comment.id, t.replies.map((r) => r.id)])).toEqual([
    [1, [2, 3]],
    [4, []],
  ]);
});
it('preserves orphan replies and malformed cycles without dropping or duplicating comments', () => {
  const threads = reviewThreads([comment(1, 99), comment(2, 3), comment(3, 2), comment(4, 4)]);
  expect(threads.flatMap((t) => [t.comment.id, ...t.replies.map((r) => r.id)]).sort()).toEqual([
    1, 2, 3, 4,
  ]);
});

it('treats shared root IDs as thread membership even when the starter replies again', () => {
  const root = { ...comment(1), user: { login: 'reviewer' } };
  const authorReply = { ...comment(2, 1), user: { login: 'author' } };
  const followUp = { ...comment(3, 1), user: { login: 'reviewer' } };
  const [thread] = reviewThreads([followUp, root, authorReply]);
  expect(thread.comment.id).toBe(1);
  expect(thread.replies.map((reply) => [reply.id, reply.in_reply_to_id])).toEqual([
    [2, 1],
    [3, 1],
  ]);
});
