import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

type Kind = 'info' | 'success' | 'error';

interface ToastEntry {
  id: number;
  message: string;
  kind: Kind;
}

interface ToastApi {
  show: (message: string, kind?: Kind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside <ToastProvider>');
  return ctx;
}

let nextId = 1;
const DURATION_MS = 3200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const show = useCallback((message: string, kind: Kind = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <Viewport toasts={toasts} />
    </ToastContext.Provider>
  );
}

function Viewport({ toasts }: { toasts: ToastEntry[] }) {
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto rounded-feature px-5 py-3 text-body-md shadow-elev-3 ${kindStyle(t.kind)}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

function kindStyle(kind: Kind): string {
  if (kind === 'success') return 'bg-success-accent text-on-primary';
  if (kind === 'error') return 'bg-brand-red-dark text-on-primary';
  return 'bg-primary text-on-primary';
}
