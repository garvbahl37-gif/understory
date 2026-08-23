"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * True once React has hydrated. `useSyncExternalStore` gives the server and the
 * first client render the same answer without an effect that immediately sets
 * state, which is both cheaper and what the React compiler wants to see.
 */
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * Renders children at the end of `<body>`.
 *
 * Overlays cannot live inside the masthead. `backdrop-filter` makes an element
 * a containing block for `position: fixed` descendants, so a dialog rendered
 * inside the blurred header positions itself against the header box instead of
 * the viewport — which looks exactly like a broken modal. Portalling sidesteps
 * every stacking-context question rather than fighting them one at a time.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return createPortal(children, document.body);
}

/** Locks background scrolling while an overlay is open. */
export function useScrollLock(active: boolean) {
  const lock = useCallback(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    return lock();
  }, [active, lock]);
}
