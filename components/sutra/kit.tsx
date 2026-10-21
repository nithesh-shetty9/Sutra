"use client";
/**
 * Sutra interaction kit.
 *
 * Provenance (per 02_UI_DESIGN_SPEC §13 / 05_TECHNICAL_RULES §13): `core-sutra-ui.md` supplied install/usage
 * info only for these components, NOT their source. Everything below is therefore a SUTRA-NATIVE implementation
 * of the named interaction pattern, built with Motion + Tailwind + Lucide. None of it is original library source.
 *
 *  TracingBeam    – Sutra-native (pattern: Aceternity Tracing Beam)
 *  StatusMark     – Sutra-native (pattern: React Bits Status Mark)
 *  SpringCheck    – Sutra-native (pattern: React Bits Spring Check)
 *  ThoughtLine    – Sutra-native (pattern: React Bits Thought Line), driven by real workflow stages
 *  TextLoop       – Sutra-native (pattern: Motion Primitives Text Loop)
 *  ProgressiveBlur– Sutra-native (pattern: Motion Primitives Progressive Blur)
 *  FloatingDock   – Sutra-native (pattern: Aceternity Floating Dock), used as the workflow stage dock
 */
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/* ───────────── StatusMark ───────────── */
export type MarkStatus = "pending" | "running" | "done" | "warning" | "error";
const MARK_COLOR: Record<MarkStatus, string> = {
  pending: "var(--line-strong)", running: "var(--blue-bright)", done: "var(--green)", warning: "var(--warn)", error: "var(--danger)",
};
export function StatusMark({ status, size = 22, label }: { status: MarkStatus; size?: number; label?: string }) {
  const reduce = useReducedMotion();
  const c = MARK_COLOR[status];
  const draw = { initial: reduce ? false : { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.35, ease: "easeOut" as const } };
  return (
    <svg role="img" aria-label={label ?? status} width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      {status === "running" ? (
        <g className="sutra-spin"><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="2" strokeLinecap="round" strokeDasharray="30 60" /></g>
      ) : (
        <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="2" fill={c} fillOpacity={status === "pending" ? 0 : 0.14} />
      )}
      {status === "done" && <motion.path d="M7.8 12.4l2.9 2.9 5.6-6.2" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...draw} />}
      {status === "warning" && <motion.path d="M12 7.5v5.5M12 16.4v.1" stroke={c} strokeWidth="2.2" strokeLinecap="round" {...draw} />}
      {status === "error" && <motion.path d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8" stroke={c} strokeWidth="2" strokeLinecap="round" {...draw} />}
    </svg>
  );
}

/* ───────────── SpringCheck ───────────── */
export function SpringCheck({ ok, label, detail, delay = 0 }: { ok: boolean; label: string; detail?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay, duration: 0.2, ease: "easeOut" }}
      className="flex items-start gap-3 py-2"
    >
      <motion.span
        initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 600, damping: 24, delay: delay + 0.02 }}
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-[8px] border ${ok ? "border-green bg-green text-bg" : "border-danger bg-danger/15 text-danger"}`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
          {ok ? <path d="M6 12.5l4 4 8-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              : <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}
        </svg>
      </motion.span>
      <span>
        <span className="block text-[15px] text-ink">{label}<span className="sr-only">{ok ? " — satisfied" : " — violated"}</span></span>
        {detail && <span className="block text-[13px] leading-snug text-ink2">{detail}</span>}
      </span>
    </motion.li>
  );
}

/* ───────────── ThoughtLine ─────────────
   Restrained operational activity: shows ONLY fixed, user-facing workflow stages (no reasoning text). */
export function ThoughtLine({ steps, current, done, doneLabel }: { steps: string[]; current: number; done: boolean; doneLabel: string }) {
  return (
    <ol aria-live="polite" className="space-y-3 font-mono text-[14px]">
      {steps.map((s, i) => {
        const st: MarkStatus = done || i < current ? "done" : i === current ? "running" : "pending";
        return (
          <li key={s} className={`flex items-center gap-3 transition-colors ${st === "pending" ? "text-muted" : st === "running" ? "text-ink" : "text-ink2"}`}>
            <StatusMark status={st} size={20} label={`${s}: ${st}`} />
            <span>{s}{st === "running" ? "…" : ""}</span>
          </li>
        );
      })}
      {done && (
        <li className="flex items-center gap-3 text-green-bright"><StatusMark status="done" size={20} label="complete" /><span>{doneLabel}</span></li>
      )}
    </ol>
  );
}

/* ───────────── TextLoop ─────────────
   Width animates to the current word so surrounding punctuation never floats away from it. */
export function TextLoop({ words, interval = 2600, className = "" }: { words: string[]; interval?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);
  const meas = useRef<(HTMLSpanElement | null)[]>([]);
  useLayoutEffect(() => { setWidths(meas.current.map(el => el?.offsetWidth ?? 0)); }, [words]);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI(n => (n + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [reduce, words.length, interval]);
  return (
    <span className={`relative inline-block align-baseline ${className}`}>
      <span aria-hidden className="pointer-events-none invisible absolute left-0 top-0">
        {words.map((w, n) => <span key={w} ref={el => { meas.current[n] = el; }} className="absolute left-0 top-0 whitespace-nowrap">{w}</span>)}
      </span>
      <motion.span className="inline-block whitespace-nowrap" animate={widths[i] ? { width: widths[i] } : undefined} transition={{ duration: reduce ? 0 : 0.3, ease: "easeOut" }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={words[i]} className="inline-block"
            initial={reduce ? false : { y: "40%", opacity: 0, filter: "blur(4px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={reduce ? undefined : { y: "-40%", opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.28, ease: "easeOut" }}>
            {words[i]}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </span>
  );
}

/* ───────────── ProgressiveBlur ───────────── */
export function ProgressiveBlur({ position = "top", height = 88 }: { position?: "top" | "bottom"; height?: number }) {
  const dir = position === "top" ? "to bottom" : "to top";
  const layers = [{ b: 1.5, stop: 70 }, { b: 4, stop: 48 }, { b: 9, stop: 28 }];
  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 z-30 ${position === "top" ? "top-0" : "bottom-0"}`} style={{ height }}>
      {layers.map(l => {
        const mask = `linear-gradient(${dir}, #000 0%, transparent ${l.stop}%)`;
        return <div key={l.b} className="absolute inset-0" style={{ backdropFilter: `blur(${l.b}px)`, WebkitBackdropFilter: `blur(${l.b}px)`, maskImage: mask, WebkitMaskImage: mask }} />;
      })}
    </div>
  );
}

/* ───────────── TracingBeam ───────────── */
export function TracingBeam({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el); setH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 55%"] });
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [0, h]), { stiffness: 380, damping: 60 });
  return (
    <div ref={ref} className="relative pl-9 md:pl-16">
      <div aria-hidden className="absolute left-2 top-2 bottom-2 md:left-5">
        <div className="absolute inset-y-0 left-0 w-px bg-line" />
        <motion.div className="absolute left-0 top-0 w-px bg-gradient-to-b from-green-deep via-green to-blue-bright" style={{ height: reduce ? "100%" : y }} />
        <motion.span className="absolute -left-[5px] size-[11px] rounded-full border-2 border-green-bright bg-bg shadow-[0_0_0_4px_rgba(84,201,139,0.12)]" style={{ top: reduce ? 0 : y }} />
      </div>
      {children}
    </div>
  );
}

/* ───────────── FloatingDock (workflow stages) ───────────── */
export type DockStage = { id: string; label: string; status: MarkStatus; enabled: boolean };
export function FloatingDock({ stages, action }: { stages: DockStage[]; action?: { label: string; onClick: () => void } | null }) {
  return (
    <nav aria-label="Recovery workflow" className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <div className="flex max-w-full items-center gap-1 rounded-[18px] border border-white/10 bg-surface/75 p-1.5 shadow-l3 backdrop-blur-[18px]">
        <ul className="flex items-center gap-0.5 overflow-x-auto">
          {stages.map(s => (
            <li key={s.id}>
              <motion.a
                href={s.enabled ? `#${s.id}` : undefined} aria-disabled={!s.enabled} aria-label={`${s.label}: ${s.status}`}
                whileHover={s.enabled ? { y: -2 } : undefined}
                className={`flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] ${s.enabled ? "text-ink2 hover:bg-soft hover:text-ink" : "pointer-events-none text-faint"}`}
              >
                <StatusMark status={s.status} size={16} label={s.status} />
                <span className="hidden sm:inline">{s.label}</span>
              </motion.a>
            </li>
          ))}
        </ul>
        {action && (
          <button type="button" onClick={action.onClick}
            className="ml-1 whitespace-nowrap rounded-[10px] bg-green px-4 py-2 text-[14px] font-medium text-bg transition hover:bg-green-bright">
            {action.label}
          </button>
        )}
      </div>
    </nav>
  );
}
