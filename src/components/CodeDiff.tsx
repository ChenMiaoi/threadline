import { useI18n } from '../i18n/I18n';
import { lazy, Suspense, useMemo, useState } from 'react';
import { filenameLanguage } from '../lib/syntaxLanguage';
import { DiffLines } from './DiffLines';
import './syntax.css';

const HighlightedDiffLines = lazy(() => import('./HighlightedDiffLines'));
import { parseDiff } from '../core/diff';

export function CodeDiff({ patch, filename }: { patch: string; filename: string }) {
  const { t } = useI18n();

  const [limit, setLimit] = useState(400);
  const lines = useMemo(() => parseDiff(patch), [patch]);
  const visibleLines = useMemo(() => lines.slice(0, limit), [lines, limit]);
  const language = filenameLanguage(filename);
  return (
    <>
      <pre
        className="github-patch"
        tabIndex={0}
        role="region"
        aria-label={t('{0} 的代码差异', [filename])}
      >
        <code>
          {language ? (
            <Suspense fallback={<DiffLines lines={visibleLines} />}>
              <HighlightedDiffLines lines={visibleLines} language={language} />
            </Suspense>
          ) : (
            <DiffLines lines={visibleLines} />
          )}
        </code>
      </pre>
      {lines.length > limit && (
        <button className="chip" onClick={() => setLimit((current) => current + 400)}>
          {t('显示更多差异（还有')}
          {lines.length - limit} {t('行）')}
        </button>
      )}
    </>
  );
}
