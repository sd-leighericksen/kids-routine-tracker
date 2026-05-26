import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Sheet({ open, onClose, title, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-2xl flex-col rounded-3xl bg-canvas shadow-elev-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-hairline-soft px-8 py-5">
          <h2 className="text-h4 text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-stone hover:text-ink active:bg-surface"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-auto px-8 py-6">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-3 border-t border-hairline-soft px-8 py-5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
