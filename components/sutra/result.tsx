"use client";
import React from "react";
import { ArrowRight, Check, CircleSlash, CircleUserRound, PhoneCall, RotateCcw, X } from "lucide-react";
import type { Diff, Itinerary, RecoveryCandidate, RecoveryResult } from "@/lib/types";
import { day, diffOf, fmtDuration, formatMoney, hm, violationLabel } from "@/lib/format";
import { constraintOutcome, readableTimes } from "@/lib/constraint-copy";
import { placeName } from "@/lib/places";
import { Btn, Section } from "./sections";
import { JourneyBand } from "./journey-band";
import { RecoveryPath } from "./recovery-path";
import { RecoveryComparison } from "./comparison";
import { RepairTimeline, WhatChanged } from "./repair-diff";
import { SpringCheck, StatusMark } from "./kit";
import { BorderGlow } from "./card-effects";
import { RecoveryExplanation } from "./recovery-explanation";
import { useFriendly, useHasDisplayNames } from "./display-names";
import { JourneyTimeline } from "./journey-timeline";
import type { DisruptionAnalysis } from "@/lib/types";

const cities = (bs: { kind: string; origin: string; dest: string }[]) => {
  const legs = bs.filter(b => b.kind === "flight" || b.kind === "train");
  return legs.length ? [legs[0].origin, ...legs.map(l => l.dest)] : [];
};
const H3 = "font-display text-[clamp(1.5rem,2.6vw,2.25rem)] font-semibold";
export type RecoveryResultTab = "best" | "journey" | "compare";

/** Each line is derived from `result.violations` and the repaired itinerary — nothing is asserted that the data does not show. */
function constraintChecks(trip: Itinerary, result: RecoveryResult) {
  const audited = result.audit?.candidates.find((candidate) => candidate.candidateId === result.audit?.selectedCandidateId);
  if (audited) return audited.constraintChecks.map((check, index) => ({ k: `${check.kind}-${index}`, kind: check.kind as string, ok: check.passed, label: constraintOutcome(check.kind, check.passed), detail: check.message }));
  const c = trip.constraints, cur = trip.currency;
  const legs = result.itinerary.filter(b => b.kind === "flight" || b.kind === "train");
  const arrival = legs[legs.length - 1]?.end;
  const goal = c.mustBeAt?.[0];
  const checks = result.connectionChecks ?? [];
  const viol = (k: string) => result.violations.filter(v => v.kind === k);
  const msg = (k: string) => viol(k).map(v => `${v.bookingId}: ${v.message}`).join(" · ");
  const rows: { k: string; kind: string; ok: boolean; label: string; detail?: string }[] = [
    { k: "budget", kind: "budget", ok: !viol("budget").length, label: constraintOutcome("budget", !viol("budget").length),
      detail: viol("budget").length ? msg("budget") : `${formatMoney(result.extraCost, cur)} of ${formatMoney(c.maxExtraBudget, cur)}` },
    { k: "connection", kind: "connection", ok: !viol("connection").length, label: constraintOutcome("connection", !viol("connection").length),
      detail: viol("connection").length ? msg("connection") : checks.length ? checks.map(check => check.actualBufferMinutes === null ? "Connection timing unavailable" : `${fmtDuration(check.actualBufferMinutes)} buffer · minimum ${fmtDuration(check.minimumBufferMinutes)}`).join(" · ") : "No connections to check" },
  ];
  if (goal && arrival) rows.push({ k: "deadline", kind: "deadline", ok: !viol("deadline").length, label: constraintOutcome("deadline", !viol("deadline").length),
    detail: viol("deadline").length ? msg("deadline") : `Arrives ${hm(arrival)} · needed by ${hm(goal.arriveBy)}` });
  if (c.noOvernight) rows.push({ k: "overnight", kind: "overnight", ok: !viol("overnight").length, label: constraintOutcome("overnight", !viol("overnight").length),
    detail: viol("overnight").length ? msg("overnight") : violationLabel.overnight });
  (["route", "hotel"] as const).forEach(k => { if (viol(k).length) rows.push({ k, kind: k, ok: false, label: constraintOutcome(k, false), detail: msg(k) }); });
  return rows;
}

type CheckRow = ReturnType<typeof constraintChecks>[number];
const findCheck = (checks: CheckRow[], kinds: string[]) => checks.find(check => kinds.includes(check.kind));
function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-[12px] border border-line bg-bg/50 p-4">
    <dt className="text-[13px] text-ink2">{label}</dt>
    <dd className="mt-1 font-display text-[26px] font-semibold leading-tight text-ink">{value}</dd>
    {sub && <dd className="mt-1 text-[13px] leading-snug text-ink2">{sub}</dd>}
  </div>;
}

/** The answer first: which option, when it arrives, what it costs, and whether the traveller's limits hold.
 *  Every value comes from the result / decision audit; the green marks follow the validator's own check results. */
function RecommendationSummary({ trip, result, candidates, selectedId, arrival, checks }: { trip: Itinerary; result: RecoveryResult; candidates: RecoveryCandidate[]; selectedId?: string; arrival?: string; checks: CheckRow[] }) {
  const f = useFriendly();
  const cur = trip.currency;
  const picked = candidates.find(candidate => candidate.id === selectedId);
  const limits = result.audit?.effectiveConstraints;
  const chips = [findCheck(checks, ["MAX_EXTRA_BUDGET", "budget"]), findCheck(checks, ["ARRIVAL_DEADLINE", "deadline"])].filter((check): check is CheckRow => Boolean(check));
  return (
    <section aria-labelledby="recommendation-summary-h" className="rounded-[18px] border-2 border-green bg-green-soft/40 p-5 shadow-l2 md:p-7">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-green px-3 py-1 text-[12px] font-semibold text-bg"><Check aria-hidden className="size-3.5" strokeWidth={3} />Recommended for you</p>
      <h3 id="recommendation-summary-h" className="mt-3 font-display text-[clamp(1.4rem,2.4vw,2rem)] font-semibold text-ink">{picked ? f(picked.label) : "Your recommended option"}</h3>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <Tile label="Arrival time" value={arrival ? hm(arrival) : "Not available"} sub={arrival ? `${day(arrival)}${limits?.latestArrivalAt ? ` · you need to be there by ${hm(limits.latestArrivalAt)}` : ""}` : undefined} />
        <Tile label="Extra cost" value={formatMoney(result.extraCost, cur)} sub={limits?.maxExtraBudget !== undefined ? `Your limit is ${formatMoney(limits.maxExtraBudget, cur)}` : undefined} />
        <Tile label="Changes to your trip" value={String(result.changes)} sub="Everything else stays as booked." />
      </dl>
      {chips.length > 0 && <ul aria-label="Your limits" className="mt-5 flex flex-wrap gap-2">{chips.map(check => (
        <li key={check.k} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${check.ok ? "border-green/60 bg-green/10 text-green-bright" : "border-danger/60 bg-danger/10 text-danger"}`}>
          {check.ok ? <Check aria-hidden className="size-4" strokeWidth={3} /> : <X aria-hidden className="size-4" strokeWidth={3} />}{check.label}
        </li>))}</ul>}
    </section>
  );
}

export function RecoveryResultView({ tab = "best", trip, result, candidates, selectedId, disruption, onRestart }: {
  tab?: RecoveryResultTab; trip: Itinerary; result: RecoveryResult; candidates: RecoveryCandidate[]; selectedId?: string; disruption?: DisruptionAnalysis; onRestart: () => void;
}) {
  const f = useFriendly();
  const hasNames = useHasDisplayNames();
  const cur = trip.currency;
  const diffs = Object.fromEntries(result.itinerary.map(b => [b.id, diffOf(b, trip.bookings, result.affectedBookingIds)])) as Record<string, Diff>;
  const legs = result.itinerary.filter(b => b.kind === "flight" || b.kind === "train");
  const arrival = legs[legs.length - 1]?.end;
  const route = cities(result.itinerary);
  const checks = constraintChecks(trip, result);
  const sourceText = result.decisionSource === "AI" ? "AI recommendation (post-validated)" : "Deterministic fallback";
  const isBest = tab === "best";
  const isJourney = tab === "journey";
  const isCompare = tab === "compare";

  return (
    <Section id="result" kicker={hasNames ? "Your recommended option" : "05 · Your recommended option"} tone="success"
      title={<span className="flex items-center gap-4"><StatusMark status="done" size={44} label="Option available" />Your best travel option</span>}>
      {isBest && <>
      <RecommendationSummary trip={trip} result={result} candidates={candidates} selectedId={selectedId} arrival={arrival} checks={checks} />
      <RepairTimeline />
      </>}
      {isJourney && <>
      <BorderGlow className="hidden rounded-[18px] border border-line bg-surface/60 p-5 shadow-l2 sm:block md:p-8">
        <RecoveryPath cities={route} label={`Repaired route: ${route.map(placeName).join(" to ")}`} />
      </BorderGlow>
      <div className="space-y-6">
        <h3 className={H3}>Repaired itinerary</h3>
        <JourneyBand bookings={result.itinerary} currency={cur} diffs={diffs} reveal />
        <WhatChanged original={trip.bookings} repaired={result.itinerary} diffs={diffs} />
      </div>
      <JourneyTimeline trip={trip} candidates={candidates} recommendedId={selectedId} disruption={disruption} />
      </>}
      {isBest && <>
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <h3 className={H3}>Does it fit your preferences?</h3>
          <ul className="mt-3 divide-y divide-line">
            {checks.map((x, i) => <SpringCheck key={x.k} ok={x.ok} label={x.label} detail={x.detail ? readableTimes(f(x.detail)) : undefined} delay={0.03 + i * 0.04} />)}
          </ul>
        </div>
        <div>
          <h3 className={H3}>Why Sutra chose this</h3>
          <p className="mt-3 text-[17px] leading-relaxed text-ink2">{f(result.explanation)}</p>
          {hasNames
            ? <p className="mt-3 text-[14px] text-ink2">{result.decisionSource === "AI" ? "Picked by AI, then checked against all of your limits." : "Picked by Sutra's rules from the options that meet all of your limits."}</p>
            : <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">Decision source: {sourceText}</p>}
          {!!result.tradeoffs?.length && <ul className="mt-3 space-y-1 text-[15px] text-ink2">{result.tradeoffs.map((tradeoff) => <li key={tradeoff}>• {f(tradeoff)}</li>)}</ul>}
          {hasNames && <details className="mt-4 text-[13px]">
            <summary className="cursor-pointer rounded-[6px] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-bright">Technical details</summary>
            <div className="mt-2 space-y-1 font-mono text-[12px] text-muted">
              {selectedId && <p>Option reference: {selectedId}</p>}
              <p>Decision source: {sourceText}</p>
              <p>{result.explanation}</p>
              {result.tradeoffs?.map((tradeoff) => <p key={tradeoff}>{tradeoff}</p>)}
            </div>
          </details>}
        </div>
      </div>
      </>}
      {isBest && <RecoveryExplanation audit={result.audit} currency={cur} recommendationReason={result.explanation} />}
      {isBest && <>
      <div>
        <h3 className={H3}>What to do next</h3>
        {result.actions.length ? (
          <ul className="mt-3 divide-y divide-line rounded-[18px] border border-line bg-surface/60 px-5">
            {result.actions.map((action) => (
              <li key={action.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[16px] text-ink">{f(action.description)}</p>
                    <p className="mt-1 text-[13px] text-muted">This is a suggested next step for your simulated journey.</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-warn">
                    <CircleUserRound aria-hidden className="size-3.5" />{action.automated ? "Completed automatically" : "Traveller action required"}
                  </span>
                </div>
                {action.automated ? <p className="mt-2 text-[14px] text-ink2">Completed automatically as a workflow step; this does not confirm a booking or reservation.</p> : <p className="mt-2 text-[14px] text-ink2">Not completed automatically — no booking or reservation has been changed.</p>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-[16px] text-ink2">No traveller actions were returned for this recovery.</p>}
      </div>
      </>}
      {isCompare && <>
      <RecoveryComparison candidates={candidates} selectedId={selectedId} trip={trip}
        heading="Alternatives compared" intro="Every candidate Sutra evaluated, checked against the same constraints. The selected recovery is highlighted." />
      </>}
      {isBest && <Btn variant="ghost" onClick={onRestart}><RotateCcw aria-hidden className="size-4" />Start over</Btn>}
    </Section>
  );
}

export function NoFeasibleView({ tab = "best", result, candidates, trip, onRestart, onReviewPreferences }: { tab?: RecoveryResultTab; result: RecoveryResult; candidates: RecoveryCandidate[]; trip: Itinerary; onRestart: () => void; onReviewPreferences?: () => void }) {
  const f = useFriendly();
  const hasNames = useHasDisplayNames();
  const byKind = new Map<string, { bookingId: string; message: string }[]>();
  result.violations.forEach(v => byKind.set(v.kind, [...(byKind.get(v.kind) ?? []), v]));
  const isBest = tab === "best";
  const isJourney = tab === "journey";
  const isCompare = tab === "compare";
  return (
    <Section id="result" kicker={hasNames ? "No matching option" : "05 · No matching option"} tone="warn"
      title={<span className="flex items-center gap-4"><CircleSlash aria-hidden className="size-10 text-warn" />No travel option fits yet</span>}>
      {isBest && <><div role="alert" className="sutra-card rounded-[18px] border border-warn/50 bg-elevated p-6 shadow-l2 md:p-8">
        <p className="max-w-2xl text-[17px] text-ink">No available option meets all of your current preferences, so Sutra is not recommending one.</p>
        <div className="mt-6 space-y-5">
          {[...byKind.entries()].map(([k, vs]) => (
            <div key={k}>
              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-warn">{violationLabel[k as keyof typeof violationLabel]}</p>
              <ul className="mt-1 space-y-1 text-[15px] text-ink2">{vs.map(v => <li key={v.message}><span className="text-[13px] text-muted">{f(v.bookingId)}</span> · {readableTimes(f(v.message))}</li>)}</ul>
            </div>
          ))}
        </div>
        <p className="mt-6 flex items-center gap-2 text-[15px] text-ink"><PhoneCall aria-hidden className="size-4 text-warn" />You can review your preferences or ask a travel agent to help. Changing a preference may reveal more options, but does not guarantee one.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Btn variant="neutral" onClick={() => onReviewPreferences ? onReviewPreferences() : document.getElementById("traveller-constraints-heading")?.scrollIntoView({ behavior: "smooth" })}><ArrowRight aria-hidden className="size-4" />Review my preferences</Btn>
        <Btn variant="ghost" onClick={onRestart}><RotateCcw aria-hidden className="size-4" />Start over</Btn>
      </div></>}
      {isJourney && <div className="sutra-card rounded-[18px] border border-line bg-surface/60 p-6 text-ink2">There is no repaired itinerary to display because no option passed all of the current requirements.</div>}
      {isCompare && <RecoveryComparison candidates={candidates} trip={trip}
        heading="Why no alternative works" intro="Each candidate below violates at least one constraint, so none is offered as a recovery." />}
      {isBest && <RecoveryExplanation audit={result.audit} currency={trip.currency} recommendationReason={result.explanation} />}
    </Section>
  );
}
