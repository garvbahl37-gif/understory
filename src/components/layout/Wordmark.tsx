/**
 * The mark is a soil profile in miniature: three strata, lightest at the
 * surface. It is the same device the dependency paths use, which is the point.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden className="shrink-0">
        <rect x="0" y="1" width="16" height="3.4" rx="1" fill="var(--depth-0)" opacity="0.92" />
        <rect x="0" y="6.2" width="16" height="3.4" rx="1" fill="var(--depth-2)" opacity="0.92" />
        <rect x="0" y="11.4" width="16" height="3.4" rx="1" fill="var(--depth-4)" opacity="0.92" />
        <rect x="6.2" y="1" width="1.3" height="14" fill="var(--ink)" />
      </svg>
      <span className="u-display text-[17px] tracking-[-0.01em]">Understory</span>
    </span>
  );
}
