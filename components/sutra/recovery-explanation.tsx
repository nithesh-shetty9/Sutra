import { AlertTriangle, Check, CircleSlash, X } from "lucide-react";
import type { CandidateDecisionAudit, ConstraintViolation, DecisionAudit } from "@/lib/domain/types";
import { formatMoney, hm } from "@/lib/format";
import { useFriendly } from "./display-names";

const labels: Record<string, string> = {
  ARRIVAL_DEADLINE: "Arrival deadline", MAX_EXTRA_BUDGET: "Additional budget", NO_OVERNIGHT: "Overnight travel", CONNECTION: "Connection time", TEMPORAL: "Timing/order", LOCATION: "Location continuity", WINDOW: "Arrival window",
};
const dependencyKinds = new Set(["CONNECTION", "TEMPORAL", "LOCATION", "WINDOW"]);
const labelFor = (kind: string) => labels[kind] ?? kind;
const identityFor = (value: Pick<ConstraintViolation, "kind" | "itemId" | "message">) => `${value.kind}\u0000${value.itemId}\u0000${value.message}`;

function sameEvidence(left: readonly ConstraintViolation[], right: readonly ConstraintViolation[]) {
  const counts = new Map<string, number>();
  for (const value of left) counts.set(identityFor(value), (counts.get(identityFor(value)) ?? 0) + 1);
  for (const value of right) {
    const identity = identityFor(value);
    const count = counts.get(identity) ?? 0;
    if (!count) return false;
    counts.set(identity, count - 1);
  }
  return [...counts.values()].every((count) => count === 0);
}

function dependencyEvidenceAgrees(candidate: CandidateDecisionAudit) {
  const constraintDependencies = candidate.constraintChecks
    .filter((check) => dependencyKinds.has(check.kind))
    .map((check) => `${check.kind}\u0000${check.itemId}\u0000${check.message}\u0000${check.passed}`);
  const returnedDependencies = candidate.dependencyChecks
    .map((check) => `${check.kind}\u0000${check.successorItemId}\u0000${check.message}\u0000${check.passed}`);
  const counts = new Map<string, number>();
  for (const identity of constraintDependencies) counts.set(identity, (counts.get(identity) ?? 0) + 1);
  for (const identity of returnedDependencies) {
    const count = counts.get(identity) ?? 0;
    if (!count) return false;
    counts.set(identity, count - 1);
  }
  return [...counts.values()].every((count) => count === 0);
}

function travellerMessage(check: ConstraintViolation, currency: string) {
  const message = check.message;
  if (check.kind === "ARRIVAL_DEADLINE") {
    const match = /^Final arrival (.+) must be no later than (.+)\.$/.exec(message);
    return match ? `Arrives at ${hm(match[1])}, after your ${hm(match[2])} arrival time.` : message;
  }
  if (check.kind === "MAX_EXTRA_BUDGET") {
    const match = /^Extra cost (\d+(?:\.\d+)?) must not exceed (\d+(?:\.\d+)?)\.$/.exec(message);
    return match ? `Costs ${formatMoney(Number(match[1]), currency)} extra, above your ${formatMoney(Number(match[2]), currency)} limit.` : message;
  }
  if (check.kind === "NO_OVERNIGHT" && message === "Recovery requires overnight travel while overnight travel is prohibited.") return "This option requires overnight travel.";
  if (check.kind === "CONNECTION") {
    const match = /^Connection requires (\d+) minutes; actual buffer is (\d+)\.$/.exec(message);
    return match ? `The connection has ${match[2]} minutes; you need ${match[1]} minutes.` : message;
  }
  if (check.kind === "TEMPORAL") return message.includes("an unavailable time") ? "We could not verify the order of these journey steps." : "This option puts journey steps in the wrong order.";
  if (check.kind === "LOCATION") return message.includes("could not be verified") ? "We could not confirm that this journey continues from the same place." : "The next part of this journey starts somewhere different.";
  if (check.kind === "WINDOW") return message.includes("unavailable") ? "We could not verify arrival in the required time window." : "Arrival is outside the required time window.";
  return message;
}

function passedMessage(check: ConstraintViolation) {
  if (check.kind === "ARRIVAL_DEADLINE") return "Arrival is within your requested arrival time.";
  if (check.kind === "MAX_EXTRA_BUDGET") return "Additional cost is within your budget.";
  if (check.kind === "NO_OVERNIGHT") return "No overnight travel is required.";
  if (check.kind === "CONNECTION") return "Connection time meets the required minimum.";
  if (check.kind === "TEMPORAL") return "Journey steps remain in the required order.";
  if (check.kind === "LOCATION") return "Journey steps continue from the same location.";
  if (check.kind === "WINDOW") return "Arrival is within the required time window.";
  return check.message;
}

function evidenceState(candidate: CandidateDecisionAudit) {
  const failedChecks = candidate.constraintChecks.filter((check) => !check.passed);
  const evidenceSupportsStatus = candidate.feasible ? failedChecks.length === 0 && candidate.violations.length === 0 : failedChecks.length > 0 || candidate.violations.length > 0;
  return { failedChecks, inconsistent: !evidenceSupportsStatus || !sameEvidence(failedChecks, candidate.violations) || !dependencyEvidenceAgrees(candidate) };
}

function failuresFor(candidate: CandidateDecisionAudit) {
  const checks = [...evidenceState(candidate).failedChecks];
  const seen = new Set(checks.map(identityFor));
  for (const violation of candidate.violations) if (!seen.has(identityFor(violation))) checks.push({ ...violation, passed: false });
  return checks;
}

function SourceLabel({ source, inconsistent }: { source: DecisionAudit["decisionSource"]; inconsistent: boolean }) {
  if (inconsistent) return <>Decision source needs review</>;
  if (source === "AI") return <>AI recommendation — checked against every requirement</>;
  if (source === "DETERMINISTIC_FALLBACK") return <>Automatic best match — selected by Sutra&apos;s fixed rules</>;
  return <>No option selected</>;
}

function runAuditIssues(audit: DecisionAudit, selected?: CandidateDecisionAudit) {
  const issues: string[] = [];
  const hasSelectedId = audit.selectedCandidateId !== null;
  if (audit.status === "NO_FEASIBLE_RECOVERY" && hasSelectedId) issues.push("The audit reports no feasible recovery but also names a selected option.");
  if (audit.status === "NO_FEASIBLE_RECOVERY" && audit.decisionSource !== "NONE") issues.push("The audit reports no feasible recovery but also reports a decision source.");
  if (audit.status === "NO_FEASIBLE_RECOVERY" && audit.candidates.some((candidate) => candidate.feasible)) issues.push("The audit reports no feasible recovery but includes a feasible option.");
  if (audit.status === "TECHNICAL_ERROR" && hasSelectedId) issues.push("The audit reports a technical error but also names a selected option.");
  if (audit.status === "TECHNICAL_ERROR" && audit.decisionSource !== "NONE") issues.push("The audit reports a technical error but also reports a decision source.");
  if (hasSelectedId && audit.decisionSource === "NONE") issues.push("The audit names a selected option but reports no decision source.");
  if (audit.status === "RECOVERED" && !selected) issues.push("The audit reports recovery but does not identify a returned selected option.");
  if (audit.status === "RECOVERED" && audit.decisionSource === "NONE") issues.push("The audit reports recovery but no decision source.");
  if (hasSelectedId && !selected) issues.push("The selected option ID does not match any returned option.");
  return [...new Set(issues)];
}

function AuditEvidence({ audit }: { audit: DecisionAudit }) {
  return <details className="sutra-card mt-6 rounded-[18px] border border-line bg-surface/60 p-5 shadow-l2 md:p-6">
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">Detailed audit</p>
      <h3 className="mt-2 font-display text-xl font-semibold">See every returned check</h3>
      <p className="mt-2 text-[14px] text-ink2">This evidence comes directly from the recovery service.</p>
    </summary>
    <div className="mt-5 space-y-4">
      {audit.candidates.map((candidate) => {
        const directChecks = candidate.constraintChecks.filter((check) => !dependencyKinds.has(check.kind));
        const state = evidenceState(candidate);
        return <article key={candidate.candidateId} className="rounded-[12px] border border-line bg-bg/40 p-4">
          <p className="font-mono text-[13px] text-ink">{candidate.candidateId} · {candidate.feasible ? "feasible" : "rejected"}</p>
          <div className="mt-3 space-y-3 text-[14px] text-ink2">
            <div><p className="font-medium text-ink">Direct requirements</p><ul className="mt-1 space-y-1">{directChecks.map((check, index) => <li key={`${identityFor(check)}-${index}`}><strong>{check.passed ? "Passed" : "Failed"} · {labelFor(check.kind)}</strong> · {check.message}</li>)}{!directChecks.length && <li className="text-muted">No direct requirement checks were returned.</li>}</ul></div>
            <div><p className="font-medium text-ink">Journey dependencies</p><ul className="mt-1 space-y-1">{candidate.dependencyChecks.map((check) => <li key={check.dependencyId}><strong>{check.passed ? "Passed" : "Failed"} · {labelFor(check.kind)}</strong> · {check.message}</li>)}{!candidate.dependencyChecks.length && <li className="text-muted">No journey dependency checks were returned.</li>}</ul></div>
            <div><p className="font-medium text-ink">Reported violations</p><ul className="mt-1 space-y-1">{candidate.violations.map((violation, index) => <li key={`${identityFor(violation)}-${index}`}><strong>{labelFor(violation.kind)}</strong> · {violation.message}</li>)}{!candidate.violations.length && <li className="text-muted">No violations were returned.</li>}</ul></div>
            {state.inconsistent && <p role="alert" className="text-warn">The returned feasibility status, failed checks, and reported violations do not fully agree.</p>}
          </div>
        </article>;
      })}
      {audit.technicalError && <p role="status" className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-ink2">A technical recovery error was recorded: <span className="font-mono">{audit.technicalError.code}</span>.</p>}
    </div>
  </details>;
}

/** Presents backend decision evidence in traveller language without recalculating feasibility. */
export function RecoveryExplanation({ audit, currency, recommendationReason }: { audit?: DecisionAudit; currency: string; recommendationReason?: string }) {
  const f = useFriendly();
  if (!audit) return null;
  const selected = audit.selectedCandidateId ? audit.candidates.find((candidate) => candidate.candidateId === audit.selectedCandidateId) : undefined;
  const selectedState = selected && evidenceState(selected);
  const runIssues = runAuditIssues(audit, selected);
  const runInconsistent = runIssues.length > 0;
  const selectedUnsafe = Boolean(selected && (!selected.feasible || selectedState?.inconsistent || runInconsistent));
  const rejected = audit.candidates.filter((candidate) => candidate.candidateId !== audit.selectedCandidateId && !candidate.feasible);
  const review = audit.candidates.filter((candidate) => candidate.candidateId !== audit.selectedCandidateId && candidate.feasible && evidenceState(candidate).inconsistent);
  const passedChecks = selected?.constraintChecks.filter((check) => check.passed).slice(0, 3) ?? [];
  return <section aria-labelledby="recovery-explanation-heading" className="mt-8 space-y-5">
    {runInconsistent && <div role="alert" className="rounded-[14px] border border-warn/50 bg-warn/10 p-4 text-[14px] text-ink2"><p className="font-medium text-warn">Run-level audit needs review</p><ul className="mt-2 list-disc space-y-1 pl-5">{runIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
    {selected && <article className={`sutra-card rounded-[18px] border p-5 shadow-l2 md:p-6 ${selectedUnsafe ? "border-warn/50 bg-warn/10" : "border-green/50 bg-green-soft/20"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className={`font-mono text-[12px] uppercase tracking-[0.14em] ${selectedUnsafe ? "text-warn" : "text-green-bright"}`}>{selectedUnsafe ? "Selected option needs review" : "Recommended option"}</p><h3 id="recovery-explanation-heading" className="mt-2 font-display text-xl font-semibold">{f(selected.candidateId)}{f(selected.candidateId) !== selected.candidateId && <span className="ml-2 font-mono text-[12px] font-normal text-muted">({selected.candidateId})</span>}</h3></div>{selectedUnsafe ? <span className="inline-flex items-center gap-1 text-sm text-warn"><AlertTriangle aria-hidden className="size-4" />Evidence needs review</span> : <span className="inline-flex items-center gap-1 text-sm text-green-bright"><Check aria-hidden className="size-4" />Requirements checked</span>}</div>
      <p className="mt-3 text-[16px] text-ink">Arrives {hm(selected.finalArrivalAt)} · {formatMoney(selected.extraCost, currency)} additional cost</p>
      <p className="mt-2 text-[14px] text-ink2"><SourceLabel source={audit.decisionSource} inconsistent={selectedUnsafe} /></p>
      {recommendationReason && <p className="mt-3 text-[15px] leading-relaxed text-ink2">{f(recommendationReason)}</p>}
      {selectedUnsafe ? <p role="alert" className="mt-3 text-[14px] text-warn">{!selected.feasible ? "The audit selected this option, but the backend marks it as not a fit. It is not presented as a safe recommendation." : runInconsistent ? "The run-level audit is contradictory. Review the returned audit before relying on this option." : "The returned feasibility status and its check evidence do not agree. Review the detailed audit before relying on this option."}</p> : passedChecks.length > 0 ? <ul className="mt-3 space-y-1 text-[14px] text-ink2">{passedChecks.map((check, index) => <li key={`${identityFor(check)}-${index}`}>{passedMessage(check)}</li>)}</ul> : <p className="mt-3 text-[14px] text-ink2">The backend marked this option feasible; no individual requirement checks were returned.</p>}
    </article>}
    {rejected.length > 0 && <section aria-labelledby="rejected-options-heading"><h3 id="rejected-options-heading" className="font-display text-xl font-semibold">Why other options do not fit</h3><p className="mt-1 text-[14px] text-ink2">These options were not recommended because the recovery service marked them as not meeting all requirements.</p><div className="mt-3 grid gap-3 md:grid-cols-2">{rejected.map((candidate) => { const failures = failuresFor(candidate); const inconsistent = evidenceState(candidate).inconsistent; return <article key={candidate.candidateId} className="rounded-[14px] border border-line bg-surface/60 p-4"><div className="flex items-center justify-between gap-2"><h4 className="text-sm text-ink">{f(candidate.candidateId)}{f(candidate.candidateId) !== candidate.candidateId && <span className="ml-2 font-mono text-[12px] text-muted">({candidate.candidateId})</span>}</h4><span className="inline-flex items-center gap-1 text-sm text-danger"><X aria-hidden className="size-4" />Not a fit</span></div><p className="mt-1 text-[13px] text-muted">Arrives {hm(candidate.finalArrivalAt)} · {formatMoney(candidate.extraCost, currency)} additional cost</p>{inconsistent && <p role="alert" className="mt-3 text-sm text-warn">The returned rejection status and check evidence do not fully agree. See the detailed audit for the returned checks and violations.</p>}{failures.length ? <ul className="mt-3 space-y-2 text-[14px] text-ink2">{failures.map((failure, index) => <li key={`${identityFor(failure)}-${index}`}><strong className="text-ink">{labelFor(failure.kind)}:</strong> {f(travellerMessage(failure, currency))}</li>)}</ul> : <p className="mt-3 text-sm text-warn">The backend marked this option as rejected but did not return a failed requirement.</p>}</article>; })}</div></section>}
    {review.length > 0 && <div role="alert" className="rounded-[14px] border border-warn/50 bg-warn/10 p-4 text-[14px] text-ink2"><CircleSlash aria-hidden className="mr-2 inline size-4 text-warn" />Some returned options have conflicting feasibility evidence. They are not treated as safe recommendations; see the detailed audit.</div>}
    {!selected && audit.status === "NO_FEASIBLE_RECOVERY" && <p role="status" className="text-[15px] text-ink2">No option was selected because none met every returned requirement.</p>}
    <AuditEvidence audit={audit} />
  </section>;
}
