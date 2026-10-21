"use client";
import { useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import type { Diff, Itinerary, RecoveryCandidate } from "@/lib/types";
import { day, diffOf, fmtDuration, formatMoney, hm } from "@/lib/format";
import { JourneyBand } from "./journey-band";
import { MagicBento } from "./card-effects";
import { useFriendly } from "./display-names";
import { RevealItem } from "./ui-motion";
import { constraintOutcome, readableTimes } from "@/lib/constraint-copy";

function Row({ label, ok, children }: { label: string; ok?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="flex items-center gap-2 text-[13px] text-muted">
        {ok !== undefined && (
          <span className={`grid size-5 shrink-0 place-items-center rounded-full ${ok ? "bg-green/20 text-green-bright" : "bg-danger/20 text-danger"}`}>
            {ok ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <X aria-hidden className="size-3.5" strokeWidth={3} />}
            <span className="sr-only">{ok ? "Satisfied" : "Violated"}</span>
          </span>
        )}
        {label}
      </dt>
      <dd className="text-right text-[14px] text-ink">{children}</dd>
    </div>
  );
}

/** Side-by-side decision surface. Every criterion is visible without interaction. All values come from the
 *  candidate data (violations, itinerary, affectedBookingIds); the selected candidate is the engine's selection. */
export function RecoveryComparison({ candidates, selectedId, trip, heading, intro }: {
  candidates: RecoveryCandidate[]; selectedId?: string; trip: Itinerary; heading: string; intro: string;
}) {
  const f = useFriendly();
  const [open, setOpen] = useState<string>();
  if (!candidates.length) return null;
  const cur = trip.currency;
  const goal = trip.constraints.mustBeAt?.[0];
  const inspected = candidates.find(c => c.id === open);
  // Options that fit come first (the recommendation leads); the rest keep their original order and stay inspectable.
  const fitting = candidates.filter(c => c.feasible).sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
  const rejected = candidates.filter(c => !c.feasible);
  const groups = [{ key: "fit", title: "Options that fit your limits", items: fitting }, { key: "nofit", title: "Options that don't fit", items: rejected }].filter(group => group.items.length);
  const reasons = (c: RecoveryCandidate) => [...new Set(c.violations.map(v => constraintOutcome(v.kind, false)))];

  return (
    <div id="comparison" className="scroll-mt-24">
      <h3 className="font-display text-[clamp(1.5rem,2.6vw,2.25rem)] font-semibold">{heading}</h3>
      <p className="mt-2 max-w-2xl text-[16px] text-ink2">{intro}</p>
      {groups.map(group => <div key={group.key} className="mt-8">
        {groups.length > 1 && <h4 className="mb-4 font-display text-[18px] font-semibold text-ink">{group.title} <span className="font-sans text-[14px] font-normal text-muted">({group.items.length})</span></h4>}
      <MagicBento className="grid items-start gap-5 lg:grid-cols-3">
        {group.items.map((c, i) => {
          const sel = c.id === selectedId;
          const viol = (k: string) => c.violations.filter(v => v.kind === k);
          const diffs = Object.fromEntries(c.itinerary.map(b => [b.id, diffOf(b, trip.bookings, c.affectedBookingIds)])) as Record<string, Diff>;
          const added = c.itinerary.filter(b => diffs[b.id] === "NEW");
          const removed = trip.bookings.filter(o => !c.itinerary.some(r => r.id === o.id));
          const checks = c.connectionChecks ?? [];
          const isOpen = open === c.id;
          const status = sel ? "Recommended" : c.feasible ? "Also fits" : "Doesn't fit";
          const why = c.feasible ? [] : reasons(c);
          return (
            <RevealItem key={c.id} index={i}
              className={`sutra-card rounded-[18px] border p-5 ${
                sel ? "border-2 border-green bg-green-soft/50 shadow-l3 lg:-mt-3 lg:p-6"
                : c.feasible ? "border-line-strong bg-surface shadow-l1" : "border-line bg-surface/60"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-ink2" title={c.id}>{f(c.id)}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold ${
                  sel ? "border-green bg-green text-bg" : c.feasible ? "border-green text-green-bright" : "border-danger text-danger"}`}>
                  {c.feasible ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <X aria-hidden className="size-3.5" strokeWidth={3} />}
                  {status}
                </span>
              </div>
              <p className={`mt-3 font-display leading-snug ${sel ? "text-[22px]" : "text-[19px]"} text-ink`}>{f(c.label)}</p>
              {why.length > 0 && <p className="mt-2 text-[14px] leading-snug text-danger">{why.join(" · ")}</p>}

              <dl className="mt-4 divide-y divide-line">
                <Row label="Changes to your trip">
                  <span className="font-mono">{c.changes}</span>
                  {removed.length > 0 && <span className="block text-[12px] text-muted">Replaces {removed.map(b => f(b.id)).join(", ")}</span>}
                  {added.length > 0 && <span className="block text-[12px] text-green-bright">Adds {added.map(b => f(b.id)).join(", ")}</span>}
                </Row>
                <Row label="Extra cost"><span className="font-mono">{formatMoney(c.extraCost, cur)}</span></Row>
                <Row label="Arrival"><span className="font-mono">{hm(c.arrival)}</span><span className="block text-[12px] text-muted">{day(c.arrival)}</span></Row>
                <Row label="Connection" ok={viol("connection").length === 0}>
                  {viol("connection").length ? <span className="text-danger">{readableTimes(f(viol("connection")[0].message))}</span>
                    : <span className="text-[13px]">{checks.length ? checks.map(check => check.actualBufferMinutes === null ? "Connection timing unavailable" : `${fmtDuration(check.actualBufferMinutes)} buffer · min ${fmtDuration(check.minimumBufferMinutes)}`).join(" · ") : "No connection"}</span>}
                </Row>
                <Row label="Budget" ok={viol("budget").length === 0}>
                  {viol("budget").length ? <span className="text-danger">{readableTimes(f(viol("budget")[0].message))}</span>
                    : <span className="text-[13px]">+{formatMoney(c.extraCost, cur)} of {formatMoney(trip.constraints.maxExtraBudget, cur)}</span>}
                </Row>
                {goal && (
                  <Row label="Deadline" ok={viol("deadline").length === 0}>
                    {viol("deadline").length ? <span className="text-danger">{readableTimes(f(viol("deadline")[0].message))}</span>
                      : <span className="text-[13px]">Arrives {hm(c.arrival)} · by {hm(goal.arriveBy)}</span>}
                  </Row>
                )}
                <Row label="Also affected">
                  <span className="inline-flex flex-wrap justify-end gap-1">
                    {c.affectedBookingIds.length ? c.affectedBookingIds.map(id => <span key={id} className="rounded-full border border-warn/60 px-2 text-[12px] text-warn">{f(id)}</span>) : <span className="text-[13px] text-muted">None</span>}
                  </span>
                </Row>
              </dl>

              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : c.id)}
                className="mt-4 min-h-11 w-full rounded-[10px] border border-line-strong px-4 py-2 text-[14px] text-ink2 transition-[background-color,color] duration-200 hover:bg-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-bright">
                {isOpen ? "Hide itinerary" : "Inspect itinerary"}
              </button>
            </RevealItem>
          );
        })}
      </MagicBento>
      </div>)}

      {inspected && (
        <div className="sutra-card mt-6 space-y-4 rounded-[18px] border border-line bg-surface/60 p-5 md:p-6" aria-live="polite">
          <p className={`font-mono text-[12px] uppercase tracking-wide ${inspected.feasible ? "text-green-bright" : "text-danger"}`}>
            {f(inspected.id)} · {inspected.id === selectedId ? "Recommended" : inspected.feasible ? "Also fits your limits" : "Doesn't fit your limits, so it isn't offered"}
          </p>
          {inspected.violations.map(v => <p key={v.message} className="text-[14px] text-danger">✕ {f(v.bookingId)}: {readableTimes(f(v.message))}</p>)}
          <JourneyBand bookings={inspected.itinerary} currency={cur}
            diffs={Object.fromEntries(inspected.itinerary.map(b => [b.id, diffOf(b, trip.bookings, inspected.affectedBookingIds)])) as Record<string, Diff>} />
        </div>
      )}
    </div>
  );
}
