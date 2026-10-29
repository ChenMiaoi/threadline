import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './Icon';

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog className="modal" ref={ref} onCancel={onClose} onClose={onClose} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <IconButton name="close" label="关闭弹窗" onClick={onClose} />
      </header>
      {children}
    </dialog>
  );
}
