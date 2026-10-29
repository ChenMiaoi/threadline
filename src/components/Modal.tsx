import { useI18n } from '../i18n/I18n';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { IconButton } from './Icon';

export function Modal({
  title,
  children,
  onClose,
  className = '',
  initialFocusRef,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();

  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement;
    dialog.showModal();
    initialFocusRef?.current?.focus();
    return () => {
      dialog.close();
      if (
        trigger instanceof HTMLElement &&
        trigger.isConnected &&
        !trigger.matches(':disabled') &&
        !trigger.closest('[inert]')
      )
        trigger.focus();
    };
  }, [initialFocusRef]);
  return (
    <dialog
      className={`modal ${className}`}
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-label={t(title)}
    >
      <header>
        <h2>{t(title)}</h2>
        <IconButton name="close" label={t('关闭弹窗')} onClick={onClose} />
      </header>
      {children}
    </dialog>
  );
}
