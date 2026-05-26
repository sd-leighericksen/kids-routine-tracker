import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'yellow' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none';

const sizes: Record<Size, string> = {
  sm: 'h-10 px-4 text-button-md',
  md: 'h-12 px-6 text-button-md',
  lg: 'h-14 px-8 text-button-md',
};

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary active:bg-charcoal',
  secondary:
    'bg-canvas text-ink border border-hairline-strong active:bg-surface',
  yellow: 'bg-brand-yellow text-primary active:bg-brand-yellow-deep',
  danger: 'bg-brand-red-dark text-on-primary active:opacity-80',
  ghost: 'bg-transparent text-ink active:bg-surface',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
