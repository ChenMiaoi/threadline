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
