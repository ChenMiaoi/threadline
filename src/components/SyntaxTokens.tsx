import { memo, useMemo } from 'react';
import { highlightCode, type SyntaxToken } from '../lib/syntax';

export function TokenSpans({ tokens }: { tokens: SyntaxToken[] }) {
  return tokens.map((token, index) =>
    token.classes ? (
      <span className={token.classes} key={index}>
        {token.text}
      </span>
    ) : (
      token.text
    ),
  );
}

export default memo(function SyntaxTokens({
  source,
  language,
}: {
  source: string;
  language: string;
}) {
  const tokens = useMemo(() => highlightCode(source, language), [source, language]);
  return tokens ? <TokenSpans tokens={tokens} /> : source;
});
