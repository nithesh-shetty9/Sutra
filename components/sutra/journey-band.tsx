"use client";
import { Fragment } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BedDouble, CalendarDays, Plane, TrainFront, TriangleAlert, Ban } from "lucide-react";
import type { Booking, Diff, Disruption } from "@/lib/types";
import { day, fmtDuration, formatMoney, hm, shiftIso } from "@/lib/format";
import { placeName } from "@/lib/places";
import { useFriendly } from "./display-names";

const DIFF_STYLE: Record<Diff, string> = {
  UNCHANGED: "border-line-strong text-ink2",
  CHANGED: "border-blue text-blue-bright",
  NEW: "border-green text-green-bright",
  AFFECTED: "border-warn text-warn",
  DISRUPTED: "border-warn text-warn",
};
export const DIFF_LABEL: Record<Diff, string> = { UNCHANGED: "Unchanged", CHANGED: "Changed", NEW: "New", AFFECTED: "Affected", DISRUPTED: "Disrupted" };
export const DiffBadge = ({ d }: { d: Diff }) => (
  <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${DIFF_STYLE[d]}`}>{DIFF_LABEL[d]}</span>
);

type Props = {
  bookings: Booking[];
  currency: string;
  diffs?: Record<string, Diff>;
  /** When set, the matching leg is rendered as interrupted (delay shifts times; cancel strikes the leg). */
  disruption?: Disruption;
  /** Booking to emphasise (used by "View affected bookings"). */
  highlightId?: string;
  /** If set, bookings get DOM ids `${idPrefix}-booking-${id}` so other UI can scroll to them. */
  idPrefix?: string;
  /** Staggered left-to-right reveal (repaired journey). */
  reveal?: boolean;
};

export function JourneyBand({ bookings, currency, diffs, disruption, highlightId, idPrefix, reveal }: Props) {
  const reduce = useReducedMotion();
  const animate = !!reveal && !reduce;
  const legs = bookings.filter(b => b.kind === "train" || b.kind === "flight");
  const stays = bookings.filter(b => b.kind === "hotel");
  const activities = bookings.filter(b => b.kind === "activity");
  const cities = legs.length ? [legs[0].origin, ...legs.map(l => l.dest)] : [];
  const domId = (id: string) => (idPrefix ? `${idPrefix}-booking-${id}` : undefined);

  return (
    <div className="space-y-5">
      <ol className="flex flex-col lg:flex-row lg:items-start">
        {cities.map((c, i) => (
          <Fragment key={`${c}-${i}`}>
            <motion.li className="flex items-center gap-3 lg:w-24 lg:shrink-0 lg:flex-col lg:gap-1"
              initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: animate ? i * 0.35 : 0, duration: 0.3 }}>
              <span className="grid size-8 place-items-center" aria-hidden>
                <span className="size-3.5 rounded-full border-2 border-green bg-bg" />
              </span>
              <span className="lg:text-center">
                <span className="block font-display text-xl leading-tight text-ink">{placeName(c)}</span>
                <span className="block font-mono text-[12px] text-muted">{c}</span>
              </span>
            </motion.li>
            {legs[i] && (
              <Leg leg={legs[i]} index={i} diff={diffs?.[legs[i].id]} disruption={disruption} currency={currency}
                animate={animate} domId={domId(legs[i].id)} highlighted={highlightId === legs[i].id} />
            )}
          </Fragment>
        ))}
      </ol>

      {stays.map((h, k) => {
        const d = diffs?.[h.id];
        const hl = highlightId === h.id;
        return (
          <motion.div key={h.id} id={domId(h.id)}
            initial={animate ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: animate ? (legs.length + k) * 0.35 + 0.2 : 0 }}
            className={`sutra-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] border bg-surface px-4 py-3 transition-shadow ${hl ? "border-warn ring-2 ring-warn/70 shadow-l2" : d === "AFFECTED" ? "border-warn/60" : "border-line"}`}>
            <BedDouble aria-hidden className="size-5 text-blue-bright" />
            <span className="font-display text-lg">Accommodation · {placeName(h.dest)}</span>
            <span className="font-mono text-[13px] text-ink2">{day(h.start)} {hm(h.start)} → {day(h.end)} {hm(h.end)}</span>
            {h.cost !== undefined && <span className="font-mono text-[13px] text-muted">{formatMoney(h.cost, currency)}</span>}
            {d && <span className="ml-auto"><DiffBadge d={d} /></span>}
          </motion.div>
        );
      })}
      {activities.map((activity) => (
        <div key={activity.id} id={domId(activity.id)} className="sutra-card flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] border border-line bg-surface px-4 py-3">
          <CalendarDays aria-hidden className="size-5 text-green-bright" />
          <span className="font-display text-lg">Activity · {placeName(activity.dest)}</span>
          <span className="font-mono text-[13px] text-ink2">{day(activity.start)} {hm(activity.start)} → {day(activity.end)} {hm(activity.end)}</span>
          {diffs?.[activity.id] && <span className="ml-auto"><DiffBadge d={diffs[activity.id]} /></span>}
        </div>
      ))}
    </div>
  );
}

function Leg({ leg, index, diff, disruption, currency, animate, domId, highlighted }: {
  leg: Booking; index: number; diff?: Diff; disruption?: Disruption; currency: string; animate: boolean; domId?: string; highlighted: boolean;
}) {
  const f = useFriendly();
  const hit = disruption?.bookingId === leg.id ? disruption : undefined;
  const cancelled = hit?.kind === "cancel";
  const delayed = hit?.kind === "delay" && hit.delayMin ? hit.delayMin : 0;
  const disrupted = leg.impactState === "DISRUPTED";
  const hasAuthoritativeTimingChange = leg.originalStart !== undefined || leg.originalEnd !== undefined;
  const Icon = leg.kind === "train" ? TrainFront : Plane;
  const bookingLabel = leg.kind === "train" ? "Rail booking" : "Flight booking";
  const tone = hit ? "danger" : disrupted ? "warn" : diff === "NEW" ? "green" : diff === "CHANGED" ? "blue" : diff === "AFFECTED" ? "warn" : "line-strong";
  const lineColor = { danger: "border-danger", green: "border-green", blue: "border-blue", warn: "border-warn", "line-strong": "border-line-strong" }[tone];
  const newStart = delayed ? shiftIso(leg.start, delayed) : leg.start;
  const newEnd = delayed ? shiftIso(leg.end, delayed) : leg.end;
  const delay = animate ? index * 0.35 + 0.15 : 0;
  const pulse = animate && diff === "NEW"
    ? { boxShadow: ["0 0 0 0 rgba(84,201,139,0)", "0 0 0 6px rgba(84,201,139,0.28)", "0 0 0 0 rgba(84,201,139,0)"] }
    : undefined;

  return (
    <motion.li id={domId}
      initial={animate ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }}
      className={`border-l-2 pl-6 ml-[15px] py-3 lg:ml-0 lg:flex-1 lg:border-l-0 lg:pl-0 lg:py-0 ${lineColor} ${hit ? "border-dashed" : ""} lg:border-transparent`}>
      <div aria-hidden className="relative hidden h-8 items-center lg:flex">
        <motion.div className={`h-0 w-full border-t-2 ${lineColor} ${hit ? "border-dashed" : ""}`}
          initial={animate ? { scaleX: 0, originX: 0 } : false} animate={{ scaleX: 1 }} transition={{ delay, duration: 0.5, ease: "easeOut" }} />
        <span className={`absolute left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-bg ${hit ? "text-danger" : "text-blue-bright"}`}>
          {cancelled ? <Ban className="size-4" /> : hit ? <TriangleAlert className="size-4" /> : <Icon className="size-4" />}
        </span>
      </div>
      <motion.div animate={pulse} transition={{ delay: delay + 0.5, duration: 1.2 }}
        className={`sutra-card rounded-[14px] border bg-surface p-4 transition-shadow lg:mx-2 lg:mt-2 ${highlighted ? "border-warn ring-2 ring-warn/70 shadow-l2" : hit ? "border-danger/60 shadow-l1" : diff === "NEW" ? "border-green/60" : "border-line"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] text-muted">{bookingLabel} · {f(leg.id)}</span>
          <span className="text-[14px] text-ink2">{leg.origin} → {leg.dest}</span>
          {hit ? null : disrupted ? <span className="ml-auto rounded-full border border-warn px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-warn">Disrupted</span> : diff && <span className="ml-auto"><DiffBadge d={diff} /></span>}
        </div>
        <div className={`mt-2 font-display text-xl ${cancelled ? "text-muted line-through" : "text-ink"}`}>
          {delayed ? (
            <>
              <span className="mr-2 text-[15px] text-muted line-through">{hm(leg.start)} → {hm(leg.end)}</span>
              <span className="text-warn">{hm(newStart)} → {hm(newEnd)}</span>
            </>
          ) : hasAuthoritativeTimingChange ? (
            <>
              <span className="mr-2 text-[15px] text-muted line-through">{hm(leg.originalStart ?? leg.start)} → {hm(leg.originalEnd ?? leg.end)}</span>
              <span className={disrupted ? "text-warn" : "text-ink"}>{hm(leg.start)} → {hm(leg.end)}</span>
            </>
          ) : <>{hm(leg.start)} → {hm(leg.end)}</>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-[12px] text-muted">
          <span>{day(newStart)}</span>{leg.cost !== undefined && <span>{formatMoney(leg.cost, currency)}</span>}
        </div>
        {hit && (
          <p className={`mt-3 flex items-center gap-2 text-[14px] font-medium ${cancelled ? "text-danger" : "text-warn"}`}>
            {cancelled ? <Ban aria-hidden className="size-4" /> : <TriangleAlert aria-hidden className="size-4" />}
            {cancelled ? "Cancelled — this leg will not operate" : `Delayed by ${fmtDuration(delayed)}`}
          </p>
        )}
        {!hit && disrupted && (
          <p className="mt-3 flex items-center gap-2 text-[14px] font-medium text-warn">
            <TriangleAlert aria-hidden className="size-4" />
            Disrupted timing — this booking is unchanged by the recovery.
          </p>
        )}
      </motion.div>
    </motion.li>
  );
}
