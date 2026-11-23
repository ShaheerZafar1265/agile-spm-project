/** True when the visitor asked the OS for reduced motion. Safe during SSR. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** Chart.js `animation` option: a short ease, or none under reduced motion. */
export function chartAnimation(): false | { duration: number } {
  return prefersReducedMotion() ? false : { duration: 250 };
}
