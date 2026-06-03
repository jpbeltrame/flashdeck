import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

const styles: Record<Variant, string> = {
  primary: 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]',
  ghost: 'border border-[var(--color-border)] text-[var(--color-text)]',
  danger: 'border border-[var(--color-border)] text-red-500',
}

export default function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40 ${styles[variant]} ${className}`}
    />
  )
}
