import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoScenarioFor } from "@/lib/domain/fixtures/recovery-scenarios";
import { goldenDisruption, goldenTrip } from "@/lib/domain/fixtures/golden-rail-delay-01";
import { getTrip as canonicalTrip, runRecovery } from "@/lib/recovery/core";
import { presentCandidate, presentImpact, presentRun, presentTrip } from "@/lib/rail-presentation";
import { getCanonicalTrip, getJourneyCatalogue, getTrip, runConfiguredRecovery, runScenario } from "@/lib/api";
import { violationLabel } from "@/lib/format";

const noop = async () => true;
// The application uses Next's automatic JSX runtime; tsx's Node test transform
// uses the classic runtime, so expose React before loading the client components.
(globalThis as typeof globalThis & { React?: typeof React }).React = React;

test("frontend renders the cancellation recovery supplied by the API projection", async () => {
  const fixture = demoScenarioFor("cancellation");
  const run = await runRecovery({ tripId: fixture.trip.id, tripVersion: fixture.trip.version, disruption: fixture.disruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const { RecoveryResultView } = await import("@/components/sutra/result");
  const projected = presentRun(fixture.trip, run);
  const html = renderToStaticMarkup(createElement(RecoveryResultView, { trip: presentTrip(fixture.trip), result: projected.result, candidates: projected.candidates, selectedId: projected.selectedId, onRestart: noop }));
  assert.match(html, /Your best travel option/);
  assert.match(html, /CC-A/);
});

test("frontend renders no-feasible explanations from API candidate violations", async () => {
  const fixture = demoScenarioFor("infeasible");
  const run = await runRecovery({ tripId: fixture.trip.id, tripVersion: fixture.trip.version, disruption: fixture.disruption });
  assert.equal(run.status, "NO_FEASIBLE_RECOVERY");
  const { NoFeasibleView } = await import("@/components/sutra/result");
  const projected = presentRun(fixture.trip, run);
  const html = renderToStaticMarkup(createElement(NoFeasibleView, { trip: presentTrip(fixture.trip), result: projected.result, candidates: projected.candidates, onRestart: noop }));
  assert.match(html, /No travel option fits yet/);
  assert.match(html, /Arrival deadline/);
});

test("traveller explanation shows the AI-selected feasible option and every relevant rejected reason", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption }, { recommender: { recommend: async () => ({ selectedCandidateId: "RC-A", preference: "EARLIER_ARRIVAL", comparedCandidateId: "RC-B", facts: { selectedArrivalAt: "2026-11-10T17:45:00", selectedExtraCost: 450, comparedArrivalAt: "2026-11-10T18:30:00", comparedExtraCost: 350 } }) } });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const { RecoveryResultView } = await import("@/components/sutra/result");
  const projected = presentRun(goldenTrip, run);
  const html = renderToStaticMarkup(createElement(RecoveryResultView, { trip: presentTrip(goldenTrip), result: projected.result, candidates: projected.candidates, selectedId: projected.selectedId, onRestart: noop }));
  assert.match(html, /Recommended option/);
  assert.match(html, /RC-A/);
  assert.match(html, /Requirements checked/);
  assert.match(html, /AI recommendation — checked against every requirement/);
  assert.match(html, /Why other options do not fit/);
  assert.match(html, /RC-C/);
  assert.match(html, /Arrival deadline/);
  assert.match(html, /RC-D/);
  assert.match(html, /Overnight travel/);
  assert.match(html, /Arrival window/);
  assert.match(html, /RC-E/);
  assert.match(html, /Additional budget/);
  assert.match(html, /Arrives at 7:30 PM, after your 7:00 PM arrival time\./);
  assert.match(html, /This option requires overnight travel\./);
  assert.match(html, /Arrival is outside the required time window\./);
  assert.match(html, /Costs ₹700 extra, above your ₹500 limit\./);
  assert.match(html, /No overnight travel is required\./);
  assert.doesNotMatch(html, /Meets: Overnight travel/);
  assert.match(html, /RC-A arrives 45 minutes earlier than RC-B/);
});

test("traveller explanation distinguishes deterministic fallback and keeps the full audit collapsed", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const projected = presentRun(goldenTrip, run);
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit: projected.audit, currency: goldenTrip.currency }));
  assert.match(html, /Automatic best match/);
  assert.match(html, /RC-B/);
  assert.match(html, /RC-D/);
  assert.match(html, /Arrival deadline/);
  assert.match(html, /Detailed audit/);
  assert.match(html, /See every returned check/);
  assert.match(html, /Direct requirements/);
  assert.match(html, /Journey dependencies/);
  assert.match(html, /Reported violations/);
  assert.equal((html.match(/Connection buffer is 30 minutes\./g) ?? []).length, 2);
});

test("traveller explanation safely flags inconsistent returned audit evidence", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const audit = structuredClone(run.decisionAudit);
  audit.decisionSource = "AI";
  const selected = audit.candidates.find((candidate) => candidate.candidateId === audit.selectedCandidateId)!;
  selected.violations.push({ kind: "ARRIVAL_DEADLINE", itemId: "RAIL-B", message: "Conflicting returned evidence." });
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit, currency: goldenTrip.currency }));
  assert.match(html, /Evidence needs review/);
  assert.match(html, /Decision source needs review/);
  assert.doesNotMatch(html, /AI recommendation — checked against every requirement/);
  assert.match(html, /feasibility status and its check evidence do not agree/);
  assert.match(html, /Reported violations/);
  assert.match(html, /Conflicting returned evidence\./);
  assert.match(html, /Detailed audit/);
});

test("traveller explanation describes known-timestamp temporal conflicts as wrong order", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const audit = structuredClone(run.decisionAudit);
  const candidate = audit.candidates.find((value) => value.candidateId === "RC-C")!;
  const temporal = {
    kind: "TEMPORAL" as const,
    itemId: "HOTEL-1",
    passed: false,
    message: "RAIL-B completes at 2026-11-10T23:30:00, which is after or cannot be compared with HOTEL-1 starting at 2026-11-10T17:00:00.",
  };
  candidate.constraintChecks.push(temporal);
  candidate.violations.push({ kind: temporal.kind, itemId: temporal.itemId, message: temporal.message });
  candidate.dependencyChecks.push({ dependencyId: "DEP-RAIL-B-HOTEL-1-TEMPORAL", kind: temporal.kind, predecessorItemId: "RAIL-B", successorItemId: temporal.itemId, predecessorCompletionAt: "2026-11-10T23:30:00", successorStartAt: "2026-11-10T17:00:00", passed: false, message: temporal.message });
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit, currency: goldenTrip.currency }));
  assert.match(html, /This option puts journey steps in the wrong order\./);
  assert.doesNotMatch(html, /We could not verify the order of these journey steps\./);
});

test("traveller explanation flags conflicting dependency evidence for a selected option", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const audit = structuredClone(run.decisionAudit);
  const selected = audit.candidates.find((candidate) => candidate.candidateId === audit.selectedCandidateId)!;
  const connection = selected.dependencyChecks.find((check) => check.kind === "CONNECTION")!;
  connection.passed = false;
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit, currency: goldenTrip.currency }));
  assert.match(html, /Selected option needs review/);
  assert.match(html, /Evidence needs review/);
  assert.doesNotMatch(html, /Requirements checked/);
});

test("traveller explanation flags a no-feasible audit that still selects an option with no source", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const audit = structuredClone(run.decisionAudit);
  audit.status = "NO_FEASIBLE_RECOVERY";
  audit.decisionSource = "NONE";
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit, currency: goldenTrip.currency }));
  assert.match(html, /Run-level audit needs review/);
  assert.match(html, /no feasible recovery but also names a selected option/);
  assert.match(html, /names a selected option but reports no decision source/);
  assert.match(html, /Selected option needs review/);
  assert.match(html, /Decision source needs review/);
  assert.doesNotMatch(html, /Requirements checked/);
  assert.doesNotMatch(html, /checked against every requirement/);
});

test("traveller explanation flags a no-feasible audit with an AI source and no selected option", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const audit = structuredClone(run.decisionAudit);
  audit.status = "NO_FEASIBLE_RECOVERY";
  audit.selectedCandidateId = null;
  audit.decisionSource = "AI";
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit, currency: goldenTrip.currency }));
  assert.match(html, /Run-level audit needs review/);
  assert.match(html, /no feasible recovery but also reports a decision source/);
  assert.doesNotMatch(html, /Requirements checked/);
});

test("traveller explanation flags a no-feasible audit that includes a feasible option", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const audit = structuredClone(run.decisionAudit);
  audit.status = "NO_FEASIBLE_RECOVERY";
  audit.selectedCandidateId = null;
  audit.decisionSource = "NONE";
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit, currency: goldenTrip.currency }));
  assert.match(html, /Run-level audit needs review/);
  assert.match(html, /no feasible recovery but includes a feasible option/);
  assert.doesNotMatch(html, /Requirements checked/);
});

test("traveller explanation flags a technical-error audit with a selection and decision source", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const audit = structuredClone(run.decisionAudit);
  audit.status = "TECHNICAL_ERROR";
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit, currency: goldenTrip.currency }));
  assert.match(html, /Run-level audit needs review/);
  assert.match(html, /technical error but also names a selected option/);
  assert.match(html, /technical error but also reports a decision source/);
  assert.doesNotMatch(html, /Requirements checked/);
});

test("traveller explanation retains technical-error audit warnings without effective constraints", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const audit = structuredClone(run.decisionAudit);
  audit.status = "TECHNICAL_ERROR";
  audit.effectiveConstraints = null;
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit, currency: goldenTrip.currency }));
  assert.match(html, /Run-level audit needs review/);
  assert.match(html, /technical error but also names a selected option/);
  assert.doesNotMatch(html, /Requirements checked/);
  assert.doesNotMatch(html, /checked against every requirement/);
});

test("traveller explanation flags recovered audits without a valid selected candidate or source", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const audit = structuredClone(run.decisionAudit);
  audit.selectedCandidateId = "NOT-RETURNED";
  audit.decisionSource = "NONE";
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit, currency: goldenTrip.currency }));
  assert.match(html, /Run-level audit needs review/);
  assert.match(html, /reports recovery but does not identify a returned selected option/);
  assert.match(html, /reports recovery but no decision source/);
  assert.match(html, /selected option ID does not match any returned option/);
  assert.doesNotMatch(html, /Requirements checked/);
  assert.doesNotMatch(html, /checked against every requirement/);
});

test("traveller explanation never presents an audit-selected infeasible option as safe", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const audit = structuredClone(run.decisionAudit);
  const selected = audit.candidates.find((candidate) => candidate.candidateId === audit.selectedCandidateId)!;
  selected.feasible = false;
  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit, currency: goldenTrip.currency }));
  assert.match(html, /Selected option needs review/);
  assert.match(html, /The audit selected this option, but the backend marks it as not a fit/);
  assert.doesNotMatch(html, /Requirements checked/);
  assert.doesNotMatch(html, /Recommended option/);
});

test("presentation preserves temporal, location, and window violation identities and labels", async () => {
  const trip = await canonicalTrip("trip-mangaluru-bengaluru-01");
  assert.ok(trip);
  if (!trip) return;
  const run = await runRecovery({ tripId: trip.id, tripVersion: trip.version, disruption: { source: "SIMULATED", scenarioId: "mangaluru-bengaluru-delay-01", bookingId: "RAIL-C", kind: "delay", delayMinutes: 30 } });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const candidate = structuredClone(run.candidates[0]);
  candidate.violations = [
    { kind: "TEMPORAL", itemId: "HOTEL-2", message: "temporal" },
    { kind: "LOCATION", itemId: "ACTIVITY-1", message: "location" },
    { kind: "WINDOW", itemId: "ACTIVITY-1", message: "window" },
  ];
  const projected = presentCandidate(trip, candidate);
  assert.deepEqual(projected.violations.map((violation) => violation.kind), ["temporal", "location", "window"]);
  assert.deepEqual(projected.violations.map((violation) => violationLabel[violation.kind]), ["Timing/order conflict", "Location continuity", "Arrival window"]);

  const { RecoveryExplanation } = await import("@/components/sutra/recovery-explanation");
  const html = renderToStaticMarkup(createElement(RecoveryExplanation, { audit: run.decisionAudit, currency: trip.currency }));
  assert.match(html, /Timing\/order/);
  assert.match(html, /Location continuity/);
  assert.match(html, /Arrival window/);
});

test("frontend renders API-returned traveller actions as pending traveller work", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const { RecoveryResultView } = await import("@/components/sutra/result");
  const projected = presentRun(goldenTrip, run);
  const html = renderToStaticMarkup(createElement(RecoveryResultView, { trip: presentTrip(goldenTrip), result: projected.result, candidates: projected.candidates, selectedId: projected.selectedId, onRestart: noop }));
  assert.match(html, /What to do next/);
  assert.match(html, /Book simulated replacement RC-B-ALT\./);
  assert.match(html, /Traveller action required/);
  assert.match(html, /Not completed automatically — no booking or reservation has been changed\./);
  assert.doesNotMatch(html, /Booking confirmed/);
});

test("multimodal flight cancellation remains a traveller-safe recovery explanation", async () => {
  const run = await runRecovery({ tripId: "trip-bengaluru-delhi-jaipur-01", tripVersion: 1, disruption: { source: "SIMULATED", scenarioId: "bengaluru-delhi-flight-cancellation-01", bookingId: "FLIGHT-BLR-DEL", kind: "cancellation" } });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  assert.equal(run.recommendation.selectedCandidateId, "FDJ-A");
  const { RecoveryResultView } = await import("@/components/sutra/result");
  const projected = presentRun((await canonicalTrip("trip-bengaluru-delhi-jaipur-01"))!, run);
  const html = renderToStaticMarkup(createElement(RecoveryResultView, { trip: projected.effectiveTrip, result: projected.result, candidates: projected.candidates, selectedId: projected.selectedId, onRestart: noop }));
  assert.match(html, /FDJ-A/);
  assert.match(html, /Connection time/);
  assert.match(html, /Traveller action required/);
  assert.doesNotMatch(html, /Booking confirmed/);
});

test("frontend API client uses only canonical v1 trip and recovery-run endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  globalThis.fetch = (async (input: string | URL | Request) => {
    paths.push(typeof input === "string" ? input : input.toString());
    return new Response(JSON.stringify(paths.length === 1 ? goldenTrip : run), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    await getTrip("delay", 0);
    await runScenario("delay", 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(paths, ["/api/v1/trips/trip-golden-rail-delay-01", "/api/v1/recovery-runs"]);
});

test("workbench client loads the API catalogue and sends a configured canonical recovery request", async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  const catalogue = { journeys: [{ tripId: goldenTrip.id, tripVersion: goldenTrip.version, source: "SIMULATED" as const, label: "Mangaluru Central to Mysuru Junction", origin: "Mangaluru Central", destination: "Mysuru Junction", journeyDate: "2026-11-10", currency: "INR", defaultConstraints: goldenTrip.constraints, items: [], supportedDisruptions: [{ id: goldenDisruption.scenarioId, label: "Rail A delay", bookingId: "RAIL-A", bookingLabel: "Rail A", kind: "delay", delayRange: { minimumMinutes: 30, maximumMinutes: 180, stepMinutes: 30 } }] }] };
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption, constraintOverrides: { priority: "EARLIER_ARRIVAL" } });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    paths.push(typeof input === "string" ? input : input.toString());
    if (paths.length === 3) assert.match(String(init?.body), /"priority":"EARLIER_ARRIVAL"/);
    return new Response(JSON.stringify(paths.length === 1 ? catalogue : paths.length === 2 ? goldenTrip : run), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.equal((await getJourneyCatalogue()).journeys[0]?.tripId, goldenTrip.id);
    assert.equal((await getCanonicalTrip(goldenTrip.id)).version, goldenTrip.version);
    await runConfiguredRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption, constraintOverrides: { priority: "EARLIER_ARRIVAL" } });
  } finally { globalThis.fetch = originalFetch; }
  assert.deepEqual(paths, ["/api/v1/trips", `/api/v1/trips/${goldenTrip.id}`, "/api/v1/recovery-runs"]);
});

test("workbench exposes an API-backed simulated-data configuration surface", async () => {
  const { RecoveryWorkbench } = await import("@/components/sutra/recovery-workbench");
  const html = renderToStaticMarkup(createElement(RecoveryWorkbench));
  assert.match(html, /Find a way forward/);
  assert.match(html, /SIMULATED DATA/);
  assert.match(html, /What went wrong with your trip/);
  // The loading state is announced to assistive technology as a status, not just drawn as placeholders.
  assert.match(html, /role="status"[^>]*>\s*<span class="sr-only">Finding your trips/);
});

test("presentation renders validator-provided delayed timing and connection buffers", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const projected = presentRun(goldenTrip, run);
  const rcA = projected.candidates.find((candidate) => candidate.id === "RC-A")!;
  const rcB = projected.candidates.find((candidate) => candidate.id === "RC-B")!;
  const railA = projected.result.itinerary.find((booking) => booking.id === "RAIL-A")!;
  assert.equal(railA.end, "2026-11-10T15:00:00");
  assert.equal(railA.originalEnd, "2026-11-10T13:00:00");
  assert.equal(railA.impactState, "DISRUPTED");
  assert.equal(railA.recoveryChange, "UNCHANGED");
  assert.deepEqual(rcA.connectionChecks?.[0] && { departure: rcA.connectionChecks[0].replacementDepartureAt, buffer: rcA.connectionChecks[0].actualBufferMinutes, minimum: rcA.connectionChecks[0].minimumBufferMinutes }, { departure: "2026-11-10T15:30:00", buffer: 30, minimum: 30 });
  assert.deepEqual(rcB.connectionChecks?.[0] && { departure: rcB.connectionChecks[0].replacementDepartureAt, buffer: rcB.connectionChecks[0].actualBufferMinutes, minimum: rcB.connectionChecks[0].minimumBufferMinutes }, { departure: "2026-11-10T16:00:00", buffer: 60, minimum: 30 });
  const { RecoveryResultView } = await import("@/components/sutra/result");
  const html = renderToStaticMarkup(createElement(RecoveryResultView, {
    tab: "journey",
    trip: presentTrip(goldenTrip),
    result: projected.result,
    candidates: projected.candidates,
    selectedId: projected.selectedId,
    disruption: presentImpact(goldenDisruption, run.impact),
    onRestart: noop,
  }));
  assert.match(html, /Original plan and recovery route/);
  assert.match(html, /Disrupted/);
  assert.match(html, /Recovered timing/);
  assert.doesNotMatch(html, /CHANGED RAIL-A/);
  assert.match(html, /1h 00m buffer/);
});

test("journey timeline separates the original plan from the recommended validator-backed recovery", async () => {
  const run = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  assert.equal(run.status, "RECOVERED");
  if (run.status !== "RECOVERED") return;
  const { JourneyTimeline } = await import("@/components/sutra/journey-timeline");
  const projected = presentRun(goldenTrip, run);
  const html = renderToStaticMarkup(createElement(JourneyTimeline, { trip: presentTrip(goldenTrip), candidates: projected.candidates, recommendedId: projected.selectedId, disruption: { disruption: { bookingId: "RAIL-A", kind: "delay", delayMin: 120 }, affectedBookingIds: [], impact: [] } }));
  assert.match(html, /Original journey/);
  assert.match(html, /Recovery itinerary/);
  assert.match(html, /Mangaluru Central/);
  assert.match(html, /Disrupted/);
  assert.match(html, /Connection check passed/);
  assert.match(html, /Previewing changes this view only/);
  assert.match(html, /RC-A.*Recommended/);
  assert.doesNotMatch(html, /RC-C.*Previewing changes/);
});

test("frontend renders a technical error distinctly with a retry action", async () => {
  const { TechnicalErrorView } = await import("@/components/sutra/sections");
  const html = renderToStaticMarkup(createElement(TechnicalErrorView, { error: { code: "RECOVERY_SERVICE_UNAVAILABLE", message: "Recovery could not be calculated. Please retry." }, onRetry: noop }));
  assert.match(html, /system problem, not a recovery result/i);
  assert.match(html, /Retry/);
});

test("traveller constraints form exposes editable, labelled controls and recalculation actions", async () => {
  const { TravellerConstraints } = await import("@/components/sutra/traveller-constraints");
  const html = renderToStaticMarkup(createElement(TravellerConstraints, { trip: presentTrip(goldenTrip), defaults: presentTrip(goldenTrip), effectiveConstraints: goldenTrip.constraints, busy: false, onRecalculate: noop }));
  assert.match(html, /What matters most to you/);
  assert.match(html, /I need to arrive by/);
  assert.match(html, /Maximum extra amount I can spend/);
  assert.match(html, /No overnight travel/);
  assert.match(html, /What should Sutra prefer/);
  assert.match(html, /Prefer spending less/);
  assert.match(html, /Prefer arriving earlier/);
  assert.match(html, /Arrival, budget, connection and overnight constraints still apply/);
  assert.match(html, /Find my best travel option/);
  assert.match(html, /Restore original constraints/);
});

test("traveller constraints status follows the latest successful recovery response", async () => {
  const { TravellerConstraints } = await import("@/components/sutra/traveller-constraints");
  const originalFetch = globalThis.fetch;
  const initialRun = await runRecovery({ tripId: goldenTrip.id, tripVersion: goldenTrip.version, disruption: goldenDisruption });
  const overriddenRun = await runRecovery({
    tripId: goldenTrip.id,
    tripVersion: goldenTrip.version,
    disruption: goldenDisruption,
    constraintOverrides: { latestArrivalAt: "2026-11-10T20:00:00", maxExtraBudget: 300, noOvernight: true },
  });
  assert.equal(initialRun.status, "RECOVERED");
  assert.equal(overriddenRun.status, "RECOVERED");
  const responses = [initialRun, overriddenRun];
  globalThis.fetch = (async () => new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    const initial = await runScenario("delay", 0);
    const initialHtml = renderToStaticMarkup(createElement(TravellerConstraints, {
      trip: initial.effectiveTrip, defaults: presentTrip(goldenTrip), effectiveConstraints: initial.effectiveConstraints, busy: false, onRecalculate: noop,
    }));
    assert.match(initialHtml, /arrival 2026-11-10 19:00 · budget ₹500 · no overnight/);

    const updated = await runScenario("delay", 0, { latestArrivalAt: "2026-11-10T20:00:00", maxExtraBudget: 300, noOvernight: true });
    const updatedHtml = renderToStaticMarkup(createElement(TravellerConstraints, {
      trip: updated.effectiveTrip, defaults: presentTrip(goldenTrip), effectiveConstraints: updated.effectiveConstraints, busy: false, onRecalculate: noop,
    }));
    assert.match(updatedHtml, /arrival 2026-11-10 20:00 · budget ₹300 · no overnight/);
    assert.doesNotMatch(updatedHtml, /arrival 2026-11-10 19:00 · budget ₹500/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("traveller constraints show the latest backend values when recovery is infeasible", async () => {
  const { TravellerConstraints } = await import("@/components/sutra/traveller-constraints");
  const originalFetch = globalThis.fetch;
  const noFeasibleRun = await runRecovery({
    tripId: goldenTrip.id,
    tripVersion: goldenTrip.version,
    disruption: goldenDisruption,
    constraintOverrides: { latestArrivalAt: "2026-11-10T19:00:00", maxExtraBudget: 300, noOvernight: true },
  });
  assert.equal(noFeasibleRun.status, "NO_FEASIBLE_RECOVERY");
  globalThis.fetch = (async () => new Response(JSON.stringify(noFeasibleRun), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    const updated = await runScenario("delay", 0, { latestArrivalAt: "2026-11-10T19:00:00", maxExtraBudget: 300, noOvernight: true });
    const html = renderToStaticMarkup(createElement(TravellerConstraints, {
      trip: updated.effectiveTrip, defaults: presentTrip(goldenTrip), effectiveConstraints: updated.effectiveConstraints, busy: false, onRecalculate: noop,
    }));
    assert.match(html, /arrival 2026-11-10 19:00 · budget ₹300 · no overnight/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
