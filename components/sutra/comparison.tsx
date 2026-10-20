"use client";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Diff, Itinerary, RecoveryCandidate } from "@/lib/types";
import { day, diffOf, fmtDuration, formatMoney, hm } from "@/lib/format";
import { JourneyBand } from "./journey-band";
import { MagicBento } from "./card-effects";

/** Candidate options stay beside a live itinerary preview so inspecting an option never
 * sends the traveller to a separate section below the cards. */
export function RecoveryComparison({ candidates, selectedId, trip, heading, intro }: {
  candidates: RecoveryCandidate[]; selectedId?: string; trip: Itinerary; heading: string; intro: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<string | undefined>(selectedId);
  const [showAll, setShowAll] = useState(false);
  if (!candidates.length) return null;

  const cur = trip.currency;
  const goal = trip.constraints.mustBeAt?.[0];
  const inspected = candidates.find(c => c.id === open)
    ?? candidates.find(c => c.id === selectedId)
    ?? candidates[0];
  const visibleCandidates = showAll ? candidates : candidates.slice(0, 3);
  const remainingCount = Math.max(0, candidates.length - 3);
  const inspectedDiffs = Object.fromEntries(
    inspected.itinerary.map(b => [b.id, diffOf(b, trip.bookings, inspected.affectedBookingIds)])
  ) as Record<string, Diff>;

  return (
    <div id="comparison" className="scroll-mt-24">
      <h3 className="font-display text-[clamp(1.5rem,2.6vw,2.25rem)] font-semibold">{heading}</h3>
      <p className="mt-2 max-w-2xl text-[16px] text-ink2">{intro}</p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
        <section aria-label="Recovery options" className="min-w-0 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="font-display text-lg font-semibold">Available options</h4>
            <span className="font-mono text-[11px] text-muted">{candidates.length} evaluated</span>
          </div>
          <MagicBento className="grid items-start gap-4">
            {visibleCandidates.map((c, i) => {
              const recommended = c.id === selectedId;
              const isOpen = inspected.id === c.id;
              const viol = (k: string) => c.violations.filter(v => v.kind === k);
              const diffs = Object.fromEntries(c.itinerary.map(b => [b.id, diffOf(b, trip.bookings, c.affectedBookingIds)])) as Record<string, Diff>;
              const added = c.itinerary.filter(b => diffs[b.id] === "NEW");
              const removed = trip.bookings.filter(o => !c.itinerary.some(r => r.id === o.id));
              const checks = c.connectionChecks ?? [];
              const status = recommended ? "Recommended" : c.feasible ? "Suitable option" : "Does not fit your limits";

              return (
                <motion.li key={c.id}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                  className={"sutra-card rounded-[16px] border p-4 transition-colors " + (
                    isOpen ? "border-blue/70 bg-blue/5 shadow-l2"
                    : recommended ? "border-green/70 bg-green-soft/30"
                    : c.feasible ? "border-line-strong bg-surface"
                    : "border-line bg-surface/60"
                  )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] text-muted">{c.id}</p>
                      <p className="mt-1 font-display text-[18px] font-semibold leading-snug text-ink">{c.label}</p>
                    </div>
                    <span className={"shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide " + (
                      recommended ? "border-green/70 text-green-bright"
                      : c.feasible ? "border-line-strong text-ink2" : "border-danger/70 text-danger"
                    )}>{status}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-bg/55 p-3">
                    <div>
                      <p className="text-[11px] text-muted">Extra cost</p>
                      <p className="mt-0.5 font-mono text-[14px] text-ink">{formatMoney(c.extraCost, cur)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">Arrival</p>
                      <p className="mt-0.5 font-mono text-[14px] text-ink">{hm(c.arrival)}</p>
                      <p className="font-mono text-[11px] text-muted">{day(c.arrival)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">Changes</p>
                      <p className="mt-0.5 text-[13px] text-ink">{c.changes} booking{c.changes === 1 ? "" : "s"}</p>
                      {removed.length > 0 && <p className="mt-0.5 break-words text-[11px] text-muted">Replaces {removed.map(b => b.id).join(", ")}</p>}
                      {added.length > 0 && <p className="mt-0.5 break-words text-[11px] text-green-bright">Adds {added.map(b => b.id).join(", ")}</p>}
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">Connection</p>
                      {viol("connection").length
                        ? <p className="mt-0.5 text-[12px] text-danger">{viol("connection")[0].message}</p>
                        : <p className="mt-0.5 text-[12px] text-ink">{checks.length
                          ? checks.map(check => check.actualBufferMinutes === null ? "Timing unavailable" : fmtDuration(check.actualBufferMinutes) + " buffer").join(" · ")
                          : "No connection"}</p>}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className={"text-[12px] " + (c.feasible ? "text-green-bright" : "text-danger")}>
                      {c.feasible
                        ? "Budget: " + formatMoney(c.extraCost, cur) + " of " + formatMoney(trip.constraints.maxExtraBudget, cur)
                        : viol("budget")[0]?.message ?? viol("deadline")[0]?.message ?? "Does not meet every constraint"}
                    </span>
                    <button type="button"
                      aria-pressed={isOpen}
                      aria-controls="candidate-itinerary-preview"
                      aria-label={(isOpen ? "Inspecting" : "Inspect") + " itinerary for " + c.id}
                      onClick={() => setOpen(c.id)}
                      className={"inline-flex min-h-10 items-center justify-center rounded-[10px] border px-3 py-2 text-[13px] font-medium transition " + (
                        isOpen ? "border-blue/70 bg-blue/10 text-ink"
                        : "border-line-strong text-ink2 hover:border-blue/60 hover:bg-blue/5 hover:text-ink"
                      )}>
                      {isOpen ? "Inspecting itinerary" : "Inspect itinerary"}
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </MagicBento>

          {remainingCount > 0 && (
            <button type="button" onClick={() => setShowAll(value => !value)}
              aria-expanded={showAll}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 py-3 text-[14px] font-semibold text-ink transition hover:border-green/60 hover:bg-green-soft/15">
              {showAll ? "Show fewer options" : "See your options"}
              {!showAll && <span className="font-mono text-[12px] text-muted">+{remainingCount} more</span>}
              <span aria-hidden>{showAll ? "↑" : "↓"}</span>
            </button>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Choose an option to preview its journey. The recommended option is highlighted, but you can inspect any candidate.
          </p>
        </section>

        <aside id="candidate-itinerary-preview" aria-live="polite" aria-labelledby="candidate-itinerary-heading"
          className="min-w-0 lg:sticky lg:top-24 lg:col-span-7">
          <div className="overflow-hidden rounded-[18px] border border-line bg-surface shadow-l2">
            <div className="border-b border-line bg-bg/55 p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-blue-bright">Itinerary preview</p>
                <span className={"rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide " + (
                  inspected.feasible ? "border-green/60 text-green-bright" : "border-danger/60 text-danger"
                )}>{inspected.feasible ? inspected.id === selectedId ? "Recommended · validated" : "Suitable option" : "Not recommended"}</span>
              </div>
              <h4 id="candidate-itinerary-heading" className="mt-2 font-display text-xl font-semibold text-ink">{inspected.id} · {inspected.label}</h4>
              <p className="mt-1 text-[13px] text-ink2">
                {formatMoney(inspected.extraCost, cur)} extra · arrives {hm(inspected.arrival)} · {day(inspected.arrival)}
              </p>
            </div>
            <div className="max-h-[65vh] space-y-4 overflow-y-auto p-4 md:p-5">
              {!inspected.feasible && <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-[13px] text-danger">
                This candidate doesn't meet every requirement, so it is shown for comparison only and is not a recommended recovery.
              </div>}
              {inspected.violations.map(v => <p key={v.kind + "-" + v.bookingId + "-" + v.message} className="text-[13px] text-danger">✕ {v.bookingId}: {v.message}</p>)}
              <JourneyBand bookings={inspected.itinerary} currency={cur} diffs={inspectedDiffs} />
              <dl className="grid gap-x-4 gap-y-3 rounded-xl border border-line bg-bg/45 p-4 sm:grid-cols-2">
                <div><dt className="text-[12px] text-muted">Extra budget</dt><dd className="mt-1 text-[14px] text-ink">{formatMoney(inspected.extraCost, cur)} of {formatMoney(trip.constraints.maxExtraBudget, cur)}</dd></div>
                <div><dt className="text-[12px] text-muted">Arrival deadline</dt><dd className="mt-1 text-[14px] text-ink">{goal ? "By " + hm(goal.arriveBy) : "No deadline provided"}</dd></div>
                <div><dt className="text-[12px] text-muted">Connection checks</dt><dd className="mt-1 text-[14px] text-ink">{(inspected.connectionChecks ?? []).length ? (inspected.connectionChecks ?? []).map(check => check.actualBufferMinutes === null ? "Timing unavailable" : fmtDuration(check.actualBufferMinutes) + " buffer · minimum " + fmtDuration(check.minimumBufferMinutes)).join(" · ") : "No connections to check"}</dd></div>
                <div><dt className="text-[12px] text-muted">Changed bookings</dt><dd className="mt-1 text-[14px] text-ink">{inspected.changes}</dd></div>
              </dl>
              {!inspected.feasible && (
                <div className="rounded-xl border border-danger/40 bg-danger/5 p-3">
                  <p className="font-medium text-[13px] text-danger">Why it doesn't fit</p>
                  <ul className="mt-2 space-y-1 text-[13px] text-danger">{inspected.violations.map(v => <li key={v.kind + "-" + v.bookingId + "-" + v.message}>{v.kind}: {v.message}</li>)}</ul>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
