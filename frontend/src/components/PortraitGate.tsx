export function PortraitGate() {
  return (
    <div className="fixed inset-0 z-50 hidden portrait:flex items-center justify-center bg-canvas text-ink p-8">
      <div className="text-center max-w-md">
        <div className="text-[64px] leading-none mb-6" aria-hidden>
          ↻
        </div>
        <h2 className="text-h2 mb-2">Please rotate</h2>
        <p className="text-body-md text-slate">
          This screen is designed for landscape orientation.
        </p>
      </div>
    </div>
  );
}
