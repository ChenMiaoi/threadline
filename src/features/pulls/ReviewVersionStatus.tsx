import { useId } from 'react';
import { useI18n } from '../../i18n/I18n';

export function ReviewVersionStatus({ commit, head }: { commit: string; head: string }) {
  const { t } = useI18n();
  const tooltipId = useId();
  const known = Boolean(commit && head);
  const current = known && commit === head;
  const label = t(!known ? '评审版本暂不可确认' : current ? '评审针对当前版本' : '评审针对旧版本');
  const detail = known
    ? t('评审版本 {0} · 当前 HEAD {1}{2}', [
        commit.slice(0, 7),
        head.slice(0, 7),
        current ? '' : t(' · 代码版本已变化'),
      ])
    : label;
  return (
    <span
      className={`review-freshness ${!known ? 'is-unknown' : current ? 'is-current' : 'is-outdated'}`}
      tabIndex={0}
      role="img"
      aria-label={label}
      aria-describedby={tooltipId}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        {!known ? (
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01" />
        ) : current ? (
          <path d="m8 12 3 3 5-6" />
        ) : (
          <path d="M12 7v5l3 2" />
        )}
      </svg>
      <span className="review-freshness-tooltip" role="tooltip" id={tooltipId}>
        {label}
        <br />
        {known && detail}
      </span>
    </span>
  );
}
