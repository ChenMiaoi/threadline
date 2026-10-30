import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useI18n } from '../i18n/I18n';
import './floating-warnings.css';

export const WARNING_COLLAPSE_MS = 10_000;
interface Notice {
  id: string;
  title: string;
  content: ReactNode;
  kind: 'warning' | 'update';
}
const WarningContext = createContext<{
  put: (warning: Notice) => void;
  remove: (id: string) => void;
} | null>(null);

export function FloatingWarnings({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [warnings, setWarnings] = useState<Notice[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [paused, setPaused] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const put = useCallback((warning: Notice) => {
    setWarnings((items) => [...items.filter((item) => item.id !== warning.id), warning]);
  }, []);
  const remove = useCallback((id: string) => {
    setWarnings((items) => items.filter((item) => item.id !== id));
  }, []);
  const context = useMemo(() => ({ put, remove }), [put, remove]);
  const hasWarnings = warnings.some((warning) => warning.kind === 'warning');
  const onlyWarnings = warnings.every((warning) => warning.kind === 'warning');
  const tone = hasWarnings ? 'warning' : 'update';
  const signature = warnings
    .map((warning) => `${warning.id}:${warning.title}`)
    .sort()
    .join('|');
  const [openedSignature, setOpenedSignature] = useState('');
  const isExpanded = expanded || signature !== openedSignature;
  useEffect(() => {
    if (!signature || !isExpanded || paused) return;
    const timer = setTimeout(() => {
      setOpenedSignature(signature);
      setExpanded(false);
    }, WARNING_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [signature, isExpanded, paused]);
  function collapse() {
    setOpenedSignature(signature);
    setExpanded(false);
    launcher.current?.focus();
  }
  return (
    <WarningContext.Provider value={context}>
      {children}
      {warnings.length > 0 && (
        <aside
          className="floating-warnings"
          aria-label={t('应用提醒')}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
          }}
        >
          {isExpanded && (
            <section
              className="floating-warning-panel"
              data-tone={tone}
              id={panelId}
              aria-label={t('待处理的提醒')}
            >
              <header>
                <strong>
                  {t(onlyWarnings ? '需要注意' : hasWarnings ? '应用提醒' : '更新提示')}
                </strong>
                <button className="text-button" aria-label={t('收起提醒')} onClick={collapse}>
                  −
                </button>
              </header>
              <div className="floating-warning-list">
                {warnings.map((warning) => (
                  <article
                    role={warning.kind === 'warning' ? 'alert' : 'status'}
                    data-tone={warning.kind}
                    key={warning.id}
                  >
                    <h2>{warning.title}</h2>
                    {warning.content}
                  </article>
                ))}
              </div>
            </section>
          )}
          <button
            ref={launcher}
            className="floating-warning-launcher"
            data-tone={tone}
            aria-label={t('查看提醒（{0}）', [warnings.length])}
            aria-expanded={isExpanded}
            aria-controls={isExpanded ? panelId : undefined}
            onClick={() => {
              if (isExpanded) collapse();
              else {
                setOpenedSignature(signature);
                setExpanded(true);
              }
            }}
          >
            <span aria-hidden="true">{hasWarnings ? '!' : '↑'}</span>
            <span>{warnings.length}</span>
          </button>
        </aside>
      )}
    </WarningContext.Provider>
  );
}

type NoticeProps = { title: string; children: ReactNode };

function FloatingNotice({ title, children, kind }: NoticeProps & { kind: Notice['kind'] }) {
  const center = useContext(WarningContext);
  const id = useId();
  useEffect(() => {
    center?.put({ id, title, content: children, kind });
  }, [center, id, title, children, kind]);
  useEffect(() => () => center?.remove(id), [center, id]);
  // Keep isolated views usable outside the workspace host (including component tests).
  return center ? null : (
    <aside role={kind === 'warning' ? 'alert' : 'status'}>
      <h2>{title}</h2>
      {children}
    </aside>
  );
}

export function FloatingWarning(props: NoticeProps) {
  return <FloatingNotice {...props} kind="warning" />;
}

export function FloatingUpdate(props: NoticeProps) {
  return <FloatingNotice {...props} kind="update" />;
}
