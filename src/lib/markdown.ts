export const loadMarkdown = () => import('../components/MarkdownContent');
export function preloadGitHubMarkdown() {
  void loadMarkdown();
}
