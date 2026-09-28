import { useEffect, useRef, useState } from "react";

export interface UseRevealOptions {
  /** IntersectionObserver threshold: how much of the element must be visible to trigger reveal. */
  threshold?: number;
  /** IntersectionObserver rootMargin, e.g. to reveal slightly before the element enters the viewport. */
  rootMargin?: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Reveals an element (fades/rises it into view) the first time it scrolls
 * into the viewport. Returns a ref to attach to the element and a boolean
 * that flips to `true` once revealed and then stays `true`.
 *
 * Honors `prefers-reduced-motion`: when set, the element starts already
 * revealed and no IntersectionObserver is created, since there's nothing
 * left to animate.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseRevealOptions = {},
): { ref: React.RefObject<T | null>; revealed: boolean } {
  const { threshold = 0.15, rootMargin = "0px 0px -10% 0px" } = options;
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(prefersReducedMotion);

  useEffect(() => {
    if (revealed) return;

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [revealed, threshold, rootMargin]);

  return { ref, revealed };
}
