import { useI18n } from '../i18n/I18n';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <header className="page-header">
      <div className="page-heading">
        <h1>{t(title)}</h1>
        {description && <p title={t(description)}>{t(description)}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </header>
  );
}
