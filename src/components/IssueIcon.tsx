import { useI18n } from '../i18n/I18n';
export function IssueIcon({ closed = false }: { closed?: boolean }) {
  const { t } = useI18n();

  return (
    <svg
      className={`issue-icon ${closed ? 'issue-closed' : 'issue-open'}`}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      role="img"
      aria-label={closed ? t('已关闭的 Issue') : t('开放的 Issue')}
    >
      <circle cx="10" cy="10" r="7" />
      {closed ? (
        <path d="m6.5 10 2.2 2.2 4.8-4.8" />
      ) : (
        <>
          <path d="M10 6v5" />
          <circle cx="10" cy="14" r=".6" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
