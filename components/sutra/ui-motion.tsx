"use client";
/**
 * Shared, restrained motion for the workbench.
 *
 * Built on the `motion` package already used across Sutra (no new dependency). Durations stay in the 150–280 ms
 * range, movement is a few pixels, nothing loops, and everything collapses to an instant change under
 * `prefers-reduced-motion`.
 */
import { createContext, useContext, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const DURATION = { select: 0.18, tab: 0.18, step: 0.24, item: 0.2 } as const;

/** Lets a parent that already animates its content (step / tab fade) switch off a child's own entrance. */
const EntranceContext = createContext(true);
export const EntranceProvider = EntranceContext.Provider;
export const useEntranceEnabled = () => useContext(EntranceContext);

/** Short fade with a small rise. Re-mount it with a new `key` to play it again (e.g. per step or tab). */
export function FadeIn({ children, className, y = 8, duration = DURATION.step, delay = 0, as = "div", id, labelledBy }: {
  children: ReactNode; className?: string; y?: number; duration?: number; delay?: number; as?: "div" | "section"; id?: string; labelledBy?: string;
}) {
  const reduce = useReducedMotion();
  const Tag = as === "section" ? motion.section : motion.div;
  return (
    <Tag id={id} aria-labelledby={labelledBy} className={className} initial={reduce ? false : { opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration, delay, ease: EASE_OUT }}>
      {children}
    </Tag>
  );
}

/** Small staggered entrance for a list of cards. Plays once on mount; the first item is never delayed. */
export function RevealItem({ index, children, className }: { index: number; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.li className={className} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.item, delay: reduce ? 0 : Math.min(index, 4) * 0.045, ease: EASE_OUT }}>
      {children}
    </motion.li>
  );
}
