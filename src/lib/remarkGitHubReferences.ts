interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

/** Link prose references without rewriting code, existing links, or raw HTML. */
export function remarkGitHubReferences({ repo }: { repo?: string }) {
  return (tree: MarkdownNode) => {
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return;
    function visit(node: MarkdownNode) {
      if (['link', 'linkReference', 'code', 'inlineCode', 'html'].includes(node.type)) return;
      if (!node.children) return;
      node.children = node.children.flatMap((child): MarkdownNode[] => {
        if (child.type !== 'text' || !child.value) {
          visit(child);
          return [child];
        }
        const parts: MarkdownNode[] = [];
        const pattern = /(?<![\w/#])(?:([\w.-]+\/[\w.-]+))?#([1-9]\d*)\b/g;
        let offset = 0;
        for (const match of child.value.matchAll(pattern)) {
          if (match.index > offset)
            parts.push({ type: 'text', value: child.value.slice(offset, match.index) });
          parts.push({
            type: 'link',
            url: `https://github.com/${match[1] ?? repo}/issues/${match[2]}`,
            children: [{ type: 'text', value: match[0] }],
          });
          offset = match.index + match[0].length;
        }
        if (offset < child.value.length)
          parts.push({ type: 'text', value: child.value.slice(offset) });
        return parts;
      });
    }
    visit(tree);
  };
}
