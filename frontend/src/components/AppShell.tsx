import type { ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen w-screen bg-canvas text-ink overflow-hidden">
      {children}
    </div>
  );
}
