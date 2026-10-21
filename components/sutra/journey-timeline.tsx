"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, Clock3, Eye, Plane, Route, Train } from "lucide-react";
import type { DisruptionAnalysis, Itinerary, RecoveryCandidate } from "@/lib/types";
import { day, fmtDuration, formatMoney, hm } from "@/lib/format";
import { useFriendly } from "./display-names";

type JourneyTimelineProps = {
  trip: Itinerary;
  candidates: RecoveryCandidate[];
  recommendedId?: string;
  disruption?: DisruptionAnalysis;
};

const transport = (trip: Itinerary) => trip.bookings.filter((booking) => booking.kind === "train" || booking.kind === "flight");

function Timing({ start, end }: { start: string; end: string }) {
  if (!start && !end) return <span className="text-muted">Timing unavailable</span>;
  return <span className="font-mono text-[13px] text-ink">{start ? `${day(start)} · ${hm(start)}` : "Departure unavailable"} <span className="text-muted">→</span> {end ? hm(end) : "Arrival unavailable"}</span>;
}

function JourneyStops({ bookings, original, disruption }: { bookings: Itinerary["bookings"]; original?: boolean; disruption?: DisruptionAnalysis }) {
  const legs = transport({ ...({ bookings } as Itinerary) });
  if (!legs.length) return <p className="text-[15px] text-muted">No segment-level journey data is available.</p>;
  return <ol className="space-y-3" aria-label={original ? "Original journey segments" : "Recovered journey segments"}>
    {legs.map((booking) => {
      const disrupted = original && booking.id === disruption?.disruption.bookingId;
      const timingChanged = !original && Boolean(booking.originalStart || booking.originalEnd);
      return <li key={booking.id} className={`relative border-l-2 pl-5 ${disrupted ? "border-danger" : timingChanged ? "border-green-bright" : "border-line-strong"}`}>
        <span aria-hidden className={`absolute -left-[7px] top-1 grid size-3 place-items-center rounded-full ${disrupted ? "bg-danger" : timingChanged ? "bg-green-bright" : "bg-line-strong"}`} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-ink"><span className="mr-1 inline-flex align-text-bottom">{booking.kind === "flight" ? <Plane aria-label="Flight" className="size-4 text-blue-bright" /> : <Train aria-label="Train" className="size-4 text-blue-bright" />}</span>{booking.origin} <span className="text-muted">to</span> {booking.dest}</p>
          {disrupted && <span className="rounded-full border border-danger/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-danger">{disruption?.disruption.kind === "cancel" ? "Cancelled" : "Disrupted"}</span>}
          {!original && timingChanged && <span className="rounded-full border border-green/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-green-bright">Recovered timing</span>}
        </div>
        <div className="mt-1"><Timing start={booking.start} end={booking.end} /></div>
        {!original && timingChanged && <p className="mt-1 text-[12px] text-muted">Originally {booking.originalStart ? hm(booking.originalStart) : "departure unavailable"} → {booking.originalEnd ? hm(booking.originalEnd) : "arrival unavailable"}</p>}
      </li>;
    })}
  </ol>;
}

function ConnectionChecks({ candidate }: { candidate: RecoveryCandidate }) {
  if (!candidate.connectionChecks?.length) return <p className="mt-4 text-[13px] text-muted">Connection status unavailable — no validator check was returned.</p>;
  return <ul className="mt-4 space-y-2" aria-label="Validated connection checks">
    {candidate.connectionChecks.map((check) => {
      const detail = check.actualBufferMinutes === null ? "Timing unavailable" : `${fmtDuration(check.actualBufferMinutes)} buffer · minimum ${fmtDuration(check.minimumBufferMinutes)}`;
      return <li key={`${check.predecessorBookingId}-${check.successorBookingId}`} className={`flex items-start gap-2 rounded-[10px] border px-3 py-2 text-[13px] ${check.passed ? "border-green/40 bg-green/10 text-green-bright" : "border-danger/50 bg-danger/10 text-danger"}`}>
        {check.passed ? <Check aria-hidden className="mt-0.5 size-4 shrink-0" /> : <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />}
        <span>{check.passed ? "Connection check passed" : "Connection check failed"} <span className="text-ink2">· {detail}</span></span>
      </li>;
    })}
  </ul>;
}

/** Displays only trip facts and validator-produced recovery facts; it never evaluates feasibility. */
export function JourneyTimeline({ trip, candidates, recommendedId, disruption }: JourneyTimelineProps) {
  const f = useFriendly();
  const feasible = useMemo(() => candidates.filter((candidate) => candidate.feasible), [candidates]);
  const recommended = feasible.find((candidate) => candidate.id === recommendedId) ?? feasible[0];
  const [previewId, setPreviewId] = useState<string | undefined>(recommended?.id);
  useEffect(() => { setPreviewId(recommended?.id); }, [recommended?.id, candidates]);
  const preview = feasible.find((candidate) => candidate.id === previewId) ?? recommended;

  return <section aria-labelledby="journey-timeline-heading" className="sutra-card rounded-[18px] border border-line bg-surface/60 p-5 shadow-l2 md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-blue-bright">Journey view</p>
        <h3 id="journey-timeline-heading" className="mt-2 font-display text-[clamp(1.4rem,2.4vw,2rem)] font-semibold">Original plan and recovery route</h3>
        <p className="mt-2 max-w-3xl text-[15px] text-ink2">Timings and connection states are from the simulated trip and the validated recovery response.</p>
      </div>
      <Route aria-hidden className="size-7 text-blue-bright" />
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <div className="rounded-[14px] border border-line bg-bg/40 p-4">
        <div className="mb-4 flex items-center gap-2"><Train aria-hidden className="size-4 text-blue-bright" /><h4 className="font-medium">Original journey</h4></div>
        <JourneyStops bookings={trip.bookings} original disruption={disruption} />
      </div>
      <div className="rounded-[14px] border border-green/40 bg-green-soft/20 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Clock3 aria-hidden className="size-4 text-green-bright" /><h4 className="font-medium">Recovery itinerary</h4></div>{preview && <span className="font-mono text-[12px] text-green-bright">{f(preview.id)}{preview.id === recommended?.id ? " · Recommended" : " · Preview"}</span>}</div>
        {preview ? <><JourneyStops bookings={preview.itinerary} /><p className="mt-4 text-[13px] text-ink2">Arrival {hm(preview.arrival)} · additional cost {formatMoney(preview.extraCost, trip.currency)}</p><ConnectionChecks candidate={preview} /></> : <p className="text-[15px] text-muted">No feasible recovery itinerary was returned.</p>}
      </div>
    </div>

    {feasible.length > 1 && <div className="mt-6 border-t border-line pt-5">
      <p className="flex items-center gap-2 text-[14px] text-ink"><Eye aria-hidden className="size-4 text-blue-bright" />Preview a feasible alternative</p>
      <p className="mt-1 text-[13px] text-muted">Previewing changes this view only; it does not change Sutra&rsquo;s backend recommendation.</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Feasible recovery candidates">
        {feasible.map((candidate) => <button key={candidate.id} type="button" onClick={() => setPreviewId(candidate.id)} aria-pressed={preview?.id === candidate.id} className={`min-h-11 rounded-[10px] border px-3 py-2 text-left text-[13px] transition-[border-color,background-color,color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-bright ${preview?.id === candidate.id ? "border-green bg-green text-bg" : "border-line bg-bg text-ink hover:border-green"}`}>
          <span className="font-mono">{f(candidate.id)}</span><span className="mx-1 text-muted">·</span>{hm(candidate.arrival)} · {formatMoney(candidate.extraCost, trip.currency)}{candidate.id === recommended?.id ? " · Recommended" : ""}
        </button>)}
      </div>
    </div>}
  </section>;
}
