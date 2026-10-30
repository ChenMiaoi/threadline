import type { PullDetail, RestComment, RestReview } from '../../core/github';
import { reviewThreads, type ReviewThread } from './reviewThreads';

export type DiscussionEntry =
  | { kind: 'comment'; id: string; comment: RestComment; date: string }
  | { kind: 'thread'; id: string; thread: ReviewThread; date: string }
  | { kind: 'review'; id: string; review: RestReview; threads: ReviewThread[]; date: string };

export function discussionEntries(
  data: Pick<PullDetail, 'comments' | 'reviews' | 'reviewComments'>,
): DiscussionEntry[] {
  const threads = reviewThreads(data.reviewComments.flat());
  const byReview = new Map<number, ReviewThread[]>();
  for (const thread of threads) {
    const id = thread.comment.pull_request_review_id;
    if (id != null) byReview.set(id, [...(byReview.get(id) ?? []), thread]);
  }
  const reviews = data.reviews
    .flat()
    .filter(
      (review) =>
        review.state !== 'PENDING' &&
        (review.state !== 'COMMENTED' || review.body.trim() || byReview.has(review.id)),
    );
  const reviewIds = new Set(reviews.map((review) => review.id));
  const threadDate = (thread: ReviewThread) =>
    thread.replies.at(-1)?.created_at ?? thread.comment.created_at;
  return [
    ...data.comments.flat().map((comment): DiscussionEntry => ({
      kind: 'comment',
      id: `comment-${comment.id}`,
      comment,
      date: comment.created_at,
    })),
    ...threads
      .filter((thread) => !reviewIds.has(thread.comment.pull_request_review_id ?? -1))
      .map((thread): DiscussionEntry => ({
        kind: 'thread',
        id: `inline-${thread.comment.id}`,
        thread,
        date: threadDate(thread),
      })),
    ...reviews.map((review): DiscussionEntry => {
      const children = byReview.get(review.id) ?? [];
      return {
        kind: 'review',
        id: `review-${review.id}`,
        review,
        threads: children,
        date: [review.submitted_at ?? '', ...children.map(threadDate)].sort().at(-1) ?? '',
      };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function discussionCount(entries: DiscussionEntry[]) {
  return entries.reduce(
    (count, entry) =>
      count +
      (entry.kind === 'thread'
        ? 1 + entry.thread.replies.length
        : entry.kind === 'review'
          ? 1 + entry.threads.reduce((total, thread) => total + 1 + thread.replies.length, 0)
          : 1),
    0,
  );
}
