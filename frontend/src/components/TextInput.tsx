import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
}

export function TextInput({
  label,
  hint,
  error,
  className = '',
  id,
  ...rest
}: Props) {
  const inputId = id ?? `in-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      {label && (
        <span className="text-body-sm font-medium text-ink">{label}</span>
      )}
      <input
        id={inputId}
        className={`h-14 rounded-md border ${
          error ? 'border-brand-red-dark' : 'border-hairline-strong'
        } bg-canvas px-4 text-body-md text-ink focus:border-brand-blue focus:outline-none ${className}`}
        {...rest}
      />
      {error && <span className="text-caption text-brand-red-dark">{error}</span>}
      {!error && hint && <span className="text-caption text-stone">{hint}</span>}
    </label>
  );
}
