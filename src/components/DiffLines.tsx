import { useI18n } from '../i18n/I18n';
import type { ReactNode } from 'react';
import type { DiffLine } from '../core/diff';

export function DiffLines({ lines, sources }: { lines: DiffLine[]; sources?: ReactNode[] }) {
  const { t } = useI18n();
  return lines.map((line, index) => (
    <span className={`diff-line diff-${line.kind}`} key={index}>
      <span
        className="diff-number"
        title={
          line.oldLine != null || line.newLine != null
            ? t('旧行 {0} · 新行 {1}', [line.oldLine ?? '—', line.newLine ?? '—'])
            : undefined
        }
      >
        {line.newLine ?? line.oldLine}
      </span>
      <span className="diff-source">
        {sources?.[index] ?? line.text}
        {'\n'}
      </span>
    </span>
  ));
}
