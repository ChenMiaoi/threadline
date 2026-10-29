import { useEffect, useEffectEvent, useState } from 'react';
import { newUpdates, quietHours, shouldNotify } from '../core/inbox';
import type { Activity } from '../features/activity/model';
import type { GitHubWorkspace } from './useGitHub';
import type { useWorkspace } from './useWorkspace';
import { notifyDesktop } from './notifications';

export function useInboxNotifications(
  github: GitHubWorkspace,
  records: Activity[],
  workspace: ReturnType<typeof useWorkspace>,
) {
  const [toast, setToast] = useState({ key: '', text: '' });
  const [error, setError] = useState({ key: '', text: '' });
  const observe = useEffectEvent(() => {
    if (
      !github.key ||
      github.syncing ||
      !github.times.inbox ||
      github.errors.inbox ||
      github.errors.review ||
      github.errors.issues ||
      !workspace.loaded ||
      workspace.error
    )
      return;
    const seen = workspace.data.inboxSeen[github.key];
    const changes = newUpdates(records, seen);
    const ids = records.map((record) => record.id);
    if (seen && ids.length === seen.length && ids.every((id) => seen.includes(id))) return;
    workspace.update((current) => ({
      ...current,
      read: current.read.filter((id) => !changes.some((record) => record.id === id)),
      inboxSeen: {
        ...current.inboxSeen,
        [github.key]: ids.slice(-2000),
      },
    }));
    const notify = changes.filter(
      (record) =>
        !(record.id in workspace.data.snoozed) && shouldNotify(record, workspace.data.preferences),
    );
    if (!notify.length || quietHours(workspace.data.preferences, new Date())) return;
    const message =
      notify.length === 1
        ? `${notify[0].kind === 'pull' ? 'PR' : 'Issue'} #${notify[0].number} 有新动态`
        : `${notify.length} 条 PR / Issue 有新动态`;
    setToast({ key: github.key, text: message });
    if (workspace.data.preferences.desktopNotifications)
      void notifyDesktop('ThreadLine · 新动态', `${github.repo} · ${message}`).catch((reason) =>
        setError({ key: github.key, text: String(reason) }),
      );
  });
  const revisions = records.map((record) => record.id).join('|');
  useEffect(() => {
    const timer = setTimeout(observe, 0);
    return () => clearTimeout(timer);
  }, [
    github.key,
    github.syncing,
    github.times.inbox,
    github.times.review,
    github.errors.inbox,
    github.errors.review,
    github.errors.issues,
    workspace.loaded,
    workspace.error,
    revisions,
  ]);
  useEffect(() => {
    if (!toast.text) return;
    const timer = setTimeout(() => setToast({ key: '', text: '' }), 10000);
    return () => clearTimeout(timer);
  }, [toast]);
  return {
    toast: toast.key === github.key ? toast.text : '',
    error: error.key === github.key ? error.text : '',
    dismiss: () => setToast({ key: '', text: '' }),
    clearError: () => setError({ key: '', text: '' }),
  };
}
