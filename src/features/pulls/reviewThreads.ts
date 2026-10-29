import type { RestComment } from '../../core/github';

export interface ReviewThread {
  comment: RestComment;
  replies: RestComment[];
}

/** Only GitHub's explicit reply IDs establish a thread; paths and mentions do not. */
export function reviewThreads(comments: readonly RestComment[]): ReviewThread[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const threads = new Map<number, ReviewThread>();
  for (const comment of byId.values()) {
    let root = comment;
    const seen = new Set([comment.id]);
    while (root.in_reply_to_id != null) {
      const parent = byId.get(root.in_reply_to_id);
      if (!parent) break;
      if (seen.has(parent.id)) {
        root = comment;
        break;
      }
      seen.add(parent.id);
      root = parent;
    }
    const thread = threads.get(root.id) ?? { comment: root, replies: [] };
    if (root.id !== comment.id) thread.replies.push(comment);
    threads.set(root.id, thread);
  }
  for (const thread of threads.values()) {
    thread.replies.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return [...threads.values()].sort((a, b) =>
    a.comment.created_at.localeCompare(b.comment.created_at),
  );
}
