import { useEffect, useState } from 'react';

interface Props {
  onSubmit: (pin: string) => Promise<boolean>;
  title?: string;
  subtitle?: string;
}

export function PinPad({
  onSubmit,
  title = 'Parent PIN',
  subtitle = 'Enter the 4-digit PIN to continue.',
}: Props) {
  const [digits, setDigits] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (digits.length !== 4) return;
    setBusy(true);
    setError(null);
    const submitted = digits;
    onSubmit(submitted)
      .then((ok) => {
        if (!ok) {
          setError('Incorrect PIN');
          setDigits('');
          setShake(true);
          window.setTimeout(() => setShake(false), 400);
        }
      })
      .catch((err: Error) => {
        setError(err.message);
        setDigits('');
        setShake(true);
        window.setTimeout(() => setShake(false), 400);
      })
      .finally(() => setBusy(false));
  }, [digits, onSubmit]);

  const handleKey = (key: string) => {
    if (busy) return;
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      setError(null);
      return;
    }
    setDigits((d) => (d.length >= 4 ? d : d + key));
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <div className={`flex flex-col items-center gap-8 ${shake ? 'animate-shake' : ''}`}>
      <div className="text-center">
        <h1 className="text-h2 text-ink">{title}</h1>
        <p className="mt-2 text-subtitle text-slate">{subtitle}</p>
      </div>

      <div className="flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-5 w-5 rounded-full border-2 transition-colors ${
              digits.length > i
                ? 'border-primary bg-primary'
                : 'border-hairline-strong bg-canvas'
            }`}
          />
        ))}
      </div>

      <div className="min-h-[1.5rem] text-body-md text-brand-red-dark" role="alert">
        {error ?? ''}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {keys.map((k, idx) =>
          k === '' ? (
            <div key={idx} />
          ) : (
            <button
              key={idx}
              type="button"
              onClick={() => handleKey(k)}
              disabled={busy}
              className="h-20 w-20 rounded-full bg-canvas text-h3 text-ink border border-hairline-strong active:bg-surface disabled:opacity-50"
            >
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
