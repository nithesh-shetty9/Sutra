"use client";
import type { Booking, Diff } from "@/lib/types";
import { hm } from "@/lib/format";
import { placeName } from "@/lib/places";
import { DiffBadge } from "./journey-band";
import { StatusMark } from "./kit";
import { useFriendly } from "./display-names";

const STEPS = ["Journey broken", "Impact traced", "Recovery selected", "Journey repaired"];

/** broken journey → downstream impact → recovery selected → repaired journey.
 *  This is the story of a result that already exists, so it is shown complete straight away (nothing is "in progress"). */
export function RepairTimeline() {
  const cur = STEPS.length - 1;
  return (
    <ol aria-label="Repair sequence" className="relative grid max-w-2xl grid-cols-4 gap-2">
      <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[13px] h-px bg-gradient-to-r from-warn via-green to-green-bright" />
      {STEPS.map((s, i) => (
        <li key={s} className="relative flex flex-col items-center gap-2 text-center">
          <span className="grid place-items-center rounded-full bg-bg p-0.5">
            <StatusMark status={i <= cur ? (i < 2 ? "warning" : "done") : "pending"} size={22} label={s} />
          </span>
          <span className={`text-[12px] leading-tight md:text-[13px] ${i <= cur ? "text-ink" : "text-muted"}`}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

const range = (b: Booking) => (b.kind === "hotel" ? `check-in ${hm(b.start)}` : `${hm(b.start)}–${hm(b.end)}`);
const route = (b: Booking) => b.kind === "hotel" ? `Accommodation · ${placeName(b.dest)}` : b.kind === "activity" ? `Activity · ${placeName(b.dest)}` : `${placeName(b.origin)} → ${placeName(b.dest)}`;

/** Explicit before/after accounting: unchanged, changed, new, affected, and what was replaced. */
export function WhatChanged({ original, repaired, diffs }: { original: Booking[]; repaired: Booking[]; diffs: Record<string, Diff> }) {
  const f = useFriendly();
  const removed = original.filter(o => !repaired.some(r => r.id === o.id));
  const legend: { d: Diff; text: string }[] = [
    { d: "UNCHANGED", text: "kept as booked" }, { d: "CHANGED", text: "changed by recovery" },
    { d: "DISRUPTED", text: "timing disrupted; recovery did not replace it" },
    { d: "NEW", text: "added by the recovery" }, { d: "AFFECTED", text: "touched by the disruption" },
  ];
  return (
    <div className="space-y-4">
      <ul aria-label="Legend" className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
        {legend.map(l => <li key={l.d} className="flex items-center gap-2"><DiffBadge d={l.d} />{l.text}</li>)}
      </ul>
      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface/60">
        {removed.map(b => (
          <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="rounded-full border border-danger px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-danger">Replaced</span>
            <span className="text-[13px] text-muted">{f(b.id)}</span>
            <span className="text-[15px] text-muted line-through">{route(b)} · {range(b)}</span>
          </li>
        ))}
        {repaired.map(b => {
          const o = original.find(x => x.id === b.id);
          return (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <DiffBadge d={diffs[b.id]} />
              <span className="text-[13px] text-muted">{f(b.id)}</span>
              <span className="text-[15px] text-ink">{route(b)} · {range(b)}</span>
              {(diffs[b.id] === "CHANGED" || diffs[b.id] === "DISRUPTED") && o && <span className="text-[13px] text-muted">was {range(o)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
