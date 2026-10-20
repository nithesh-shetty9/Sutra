"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { getCanonicalTrip, getJourneyCatalogue, runConfiguredRecovery, SutraApiError } from "@/lib/api";
import { presentImpact, presentRun, presentTrip } from "@/lib/rail-presentation";
import type { ConstraintOverrides, JourneyCatalogueEntry, RecoveryPriority, RecoveryRunResult, SupportedDisruptionProfile, Trip } from "@/lib/domain/types";
import { RecoveryResultView, NoFeasibleView, type RecoveryResultTab } from "./result";
import { Btn } from "./sections";

const toInput = (value?: string) => value?.slice(0, 16) ?? "";
const toApi = (value: string) => `${value}:00`;
function delayOptions(profile?: SupportedDisruptionProfile) {
  const range = profile?.delayRange;
  if (!range || range.stepMinutes <= 0) return [];
  return Array.from({ length: Math.floor((range.maximumMinutes - range.minimumMinutes) / range.stepMinutes) + 1 }, (_, index) => range.minimumMinutes + index * range.stepMinutes);
}

function DependencyChecks({ run }: { run: RecoveryRunResult }) {
  return <details className="sutra-card mt-6 rounded-[18px] border border-line bg-surface/60 p-5 shadow-l2 md:p-6">
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-green-bright">Decision details</p>
      <h2 className="mt-2 font-display text-xl font-semibold">What else we checked</h2>
      <p className="mt-2 text-[14px] text-ink2">Open the returned evidence for connections, locations and timing.</p>
    </summary>
    <div className="mt-5 space-y-4">
      {run.decisionAudit.candidates.map(candidate => <article key={candidate.candidateId} className="rounded-[12px] border border-line bg-bg/40 p-4">
        <p className="font-mono text-[13px] text-ink">{candidate.candidateId} · {candidate.feasible ? "feasible" : "rejected"}</p>
        <ul className="mt-3 space-y-2 text-[14px] text-ink2">
          {candidate.dependencyChecks.map(check => <li key={check.dependencyId} className={check.passed ? "text-ink2" : "text-danger"}><strong>{check.passed ? "✓" : "×"} {check.kind}</strong> · {check.message}</li>)}
          {!candidate.dependencyChecks.length && <li className="text-muted">No dependency checks returned.</li>}
        </ul>
      </article>)}
    </div>
  </details>;
}

export function RecoveryWorkbench() {
  const reduceMotion = useReducedMotion();
  const [catalogue, setCatalogue] = useState<JourneyCatalogueEntry[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [trip, setTrip] = useState<Trip>();
  const [profileId, setProfileId] = useState("");
  const [delay, setDelay] = useState<number>();
  const [arrival, setArrival] = useState("");
  const [budget, setBudget] = useState("");
  const [noOvernight, setNoOvernight] = useState(true);
  const [priority, setPriority] = useState<RecoveryPriority>("LOWER_COST");
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string>();
  const [technicalError, setTechnicalError] = useState(false);
  const [run, setRun] = useState<RecoveryRunResult>();
  const [activeStep, setActiveStep] = useState<1 | 4>(1);
  const [resultTab, setResultTab] = useState<RecoveryResultTab>("best");

  const selectedJourney = catalogue.find(journey => journey.tripId === selectedId);
  const profile = selectedJourney?.supportedDisruptions.find(value => value.id === profileId);
  const delays = useMemo(() => delayOptions(profile), [profile]);

  const loadCatalogue = useCallback(async () => {
    setLoadingCatalogue(true); setError(undefined); setTechnicalError(false);
    try { const response = await getJourneyCatalogue(); setCatalogue(response.journeys); setSelectedId(current => response.journeys.some(journey => journey.tripId === current) ? current : response.journeys[0]?.tripId ?? ""); }
    catch (cause) { setTechnicalError(cause instanceof SutraApiError && cause.error.audit?.status === "TECHNICAL_ERROR"); setError(cause instanceof SutraApiError ? cause.error.message : "We couldn't load the journey catalogue."); }
    finally { setLoadingCatalogue(false); }
  }, []);
  useEffect(() => { void loadCatalogue(); }, [loadCatalogue]);

  useEffect(() => {
    if (!selectedJourney) { setTrip(undefined); return; }
    let active = true;
    setLoadingTrip(true); setError(undefined); setTechnicalError(false); setRun(undefined); setActiveStep(1); setTrip(undefined);
    setProfileId(selectedJourney.supportedDisruptions[0]?.id ?? "");
    void getCanonicalTrip(selectedJourney.tripId).then(value => {
      if (!active) return;
      setTrip(value); setArrival(toInput(value.constraints.latestArrivalAt)); setBudget(String(value.constraints.maxExtraBudget ?? "")); setNoOvernight(value.constraints.noOvernight);
    }).catch(cause => { if (active) { setTechnicalError(cause instanceof SutraApiError && cause.error.audit?.status === "TECHNICAL_ERROR"); setError(cause instanceof SutraApiError ? cause.error.message : "We couldn't load this journey."); } }).finally(() => { if (active) setLoadingTrip(false); });
    return () => { active = false; };
  }, [selectedJourney]);

  useEffect(() => { setDelay(delayOptions(profile)[0]); }, [profile]);
  const budgetIsValid = budget !== "" && Number.isFinite(Number(budget)) && Number(budget) >= 0;
  const valid = Boolean(trip && profile && (profile.kind === "cancellation" || delays.includes(delay ?? -1)) && arrival && budgetIsValid);
  const missingFields = [
    !trip && !loadingTrip ? "Wait for the trip details to finish loading." : undefined,
    !profile ? "Choose what happened to your trip." : undefined,
    profile?.kind === "delay" && !delays.includes(delay ?? -1) ? "Choose how long the delay is." : undefined,
    !arrival ? "Set the latest time you need to arrive." : undefined,
    budget === "" ? "Enter the most extra you can spend." : !budgetIsValid ? "Enter a valid budget of ₹0 or more." : undefined,
  ].filter((message): message is string => Boolean(message));
  const invalidateRun = () => { setRun(undefined); setResultTab("best"); };
  const calculate = async () => {
    if (!trip || !profile || !valid) return;
    const overrides: ConstraintOverrides = { latestArrivalAt: toApi(arrival), maxExtraBudget: Number(budget), noOvernight, priority };
    const disruption = { source: "SIMULATED" as const, scenarioId: profile.id, bookingId: profile.bookingId, kind: profile.kind, ...(profile.kind === "delay" ? { delayMinutes: delay } : {}) };
    setCalculating(true); setError(undefined); setTechnicalError(false); setRun(undefined); setResultTab("best");
    try { setRun(await runConfiguredRecovery({ tripId: trip.id, tripVersion: trip.version, disruption, constraintOverrides: overrides })); setActiveStep(4); window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); }
    catch (cause) { setTechnicalError(cause instanceof SutraApiError && cause.error.audit?.status === "TECHNICAL_ERROR"); setError(cause instanceof SutraApiError ? cause.error.message : "Recovery could not be calculated. Please retry."); setActiveStep(4); window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); }
    finally { setCalculating(false); }
  };
  const resetResult = () => { setRun(undefined); setResultTab("best"); setActiveStep(1); };
  const projection = trip && run ? presentRun(trip, run) : undefined;
  const openStep = (step: 1 | 4) => { if (step === 1 || run) { setActiveStep(step); window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); } };
  const tabs: { id: RecoveryResultTab; label: string; description: string }[] = [
    { id: "best", label: "Best Recovery", description: "Recommendation, timing and fit" },
    { id: "journey", label: "Journey & Itinerary", description: "Original and repaired journey" },
    { id: "compare", label: "Compare & Explain", description: "Alternatives and reasoning" },
  ];

  return <main id="workbench-top" className="min-h-screen bg-bg px-5 py-6 text-ink md:px-8 md:py-8">
    <div className="mx-auto max-w-6xl pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div><Link href="/" className="inline-flex items-center gap-2 text-[14px] text-muted hover:text-ink"><ArrowLeft className="size-4" />Back home</Link><h1 className="mt-4 font-display text-3xl font-semibold md:text-4xl">Find a way forward</h1><p className="mt-2 max-w-3xl text-ink2">Tell Sutra what happened and what matters to you. We will compare options that fit.</p><p className="mt-2 text-sm text-muted">Sutra compares options only. It will not book or change your tickets.</p></div>
        <span className="rounded-full border border-warn/60 bg-warn/10 px-3 py-1.5 text-[11px] font-medium tracking-wide text-warn">DEMO · SAMPLE TRIPS</span>
      </header>

      <nav aria-label="Recovery steps" className="sticky top-3 z-20 mt-5 rounded-2xl border border-line bg-bg/95 p-2 shadow-l2 backdrop-blur-xl">
        <ol className="grid gap-2 sm:grid-cols-2">
          {[{ step: 1 as const, label: "Your trip & preferences", complete: Boolean(trip && profile && valid) }, { step: 4 as const, label: "Your options", complete: Boolean(run) }].map(item => <li key={item.step}><button type="button" onClick={() => openStep(item.step)} disabled={item.step === 4 && !run} aria-current={activeStep === item.step ? "step" : undefined} className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${activeStep === item.step ? "border-green/70 bg-green-soft/45 text-ink shadow-[0_0_0_1px_rgba(124,255,167,0.12)]" : item.step === 1 || run ? "border-line bg-surface/45 text-ink2 hover:border-green/50 hover:bg-green-soft/20" : "border-line/70 bg-surface/20 text-muted opacity-70"}`}><span className={`flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs ${item.complete ? "bg-green-bright text-bg" : activeStep === item.step ? "border border-green-bright text-green-bright" : "border border-line text-muted"}`}>{item.complete ? <CheckCircle2 className="size-4" /> : item.step === 1 ? "01" : "02"}</span><span><span className="block text-sm font-medium">{item.label}</span><span className="block text-xs text-muted">{item.step === 1 ? "Tell us about your journey and what you need" : "Review and compare the available options"}</span></span></button></li>)}
        </ol>
      </nav>

      {error && <div role="alert" className="mt-5 flex items-start justify-between gap-4 rounded-[14px] border border-danger/60 bg-danger/10 p-4 text-danger"><span><AlertTriangle className="mr-2 inline size-4" /><strong>{technicalError ? "Technical error — no recovery result was created. " : ""}</strong>{error}</span><Btn variant="ghost" onClick={trip ? calculate : loadCatalogue}><RefreshCw className="size-4" />Retry</Btn></div>}

      {activeStep === 1 && <motion.section key="trip-form" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }} aria-labelledby="workbench-configuration" className="sutra-card mt-5 rounded-[18px] border border-line bg-surface/60 p-5 shadow-l2 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[12px] uppercase tracking-[0.14em] text-green-bright">Your trip and preferences</p><h2 id="workbench-configuration" className="mt-2 font-display text-2xl font-semibold">Tell us about your trip</h2><p className="mt-2 max-w-3xl text-[15px] text-ink2">Choose the trip, tell us what changed, and set your arrival and budget limits.</p></div>{trip && <span className="inline-flex items-center gap-2 rounded-full border border-green/40 bg-green-soft/25 px-3 py-1.5 text-[13px] text-ink2"><CheckCircle2 className="size-4 text-green-bright" />Trip loaded</span>}</div>
        {loadingCatalogue ? <div role="status" aria-label="Finding available trips" aria-busy="true" className="mt-6 space-y-3"><p className="text-sm text-ink2">Finding trips you can choose from…</p><div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map(item => <div key={item} className="motion-reduce:animate-none animate-pulse rounded-xl border border-line bg-bg/60 p-4"><div className="h-3 w-24 rounded bg-line/70" /><div className="mt-3 h-5 w-3/4 rounded bg-line/60" /><div className="mt-3 h-3 w-1/2 rounded bg-line/50" /></div>)}</div></div> : !catalogue.length ? <p className="mt-5 rounded-xl border border-warn/40 bg-warn/5 p-4 text-warn">No trips are available right now. Please try again in a moment.</p> : <div className="mt-6 grid gap-5 md:grid-cols-2"><label className="grid gap-1.5 text-[14px]" htmlFor="journey"><span className="font-medium">Which trip was disrupted?</span><span className="text-[13px] text-muted">Choose the trip you need help with.</span><select id="journey" value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={loadingTrip || calculating} className="min-h-11 rounded-[10px] border border-line bg-bg px-3 py-2 transition-colors hover:border-green/50 focus-visible:border-green-bright disabled:opacity-60">{catalogue.map(journey => <option key={journey.tripId} value={journey.tripId}>{journey.label} · {journey.journeyDate}</option>)}</select></label><label className="grid gap-1.5 text-[14px]" htmlFor="disruption"><span className="font-medium">What happened?</span><span className="text-[13px] text-muted">Choose the disruption affecting this trip.</span><select id="disruption" value={profileId} onChange={event => { setProfileId(event.target.value); invalidateRun(); }} disabled={!trip || calculating} className="min-h-11 rounded-[10px] border border-line bg-bg px-3 py-2 transition-colors hover:border-green/50 focus-visible:border-green-bright disabled:opacity-60">{selectedJourney?.supportedDisruptions.map(value => <option key={value.id} value={value.id}>{value.label} · {value.bookingLabel}</option>)}</select></label>{profile?.kind === "delay" && <label className="grid gap-1.5 text-[14px]" htmlFor="delay"><span className="font-medium">How long is the delay?</span><span className="text-[13px] text-muted">Choose the delay length you were told.</span><select id="delay" value={delay ?? ""} onChange={event => { setDelay(Number(event.target.value)); invalidateRun(); }} disabled={calculating} className="min-h-11 rounded-[10px] border border-line bg-bg px-3 py-2 transition-colors hover:border-green/50 focus-visible:border-green-bright disabled:opacity-60">{delays.map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>}{profile?.kind === "cancellation" && <p className="self-end rounded-[10px] border border-line bg-bg px-3 py-3 text-[14px] text-ink2">This trip is cancelled, so you do not need to enter a delay length.</p>}<label className="grid gap-1.5 text-[14px]" htmlFor="latest-arrival"><span className="font-medium">What time do you need to arrive by?</span><span className="text-[13px] text-muted">Sutra will reject options that miss this deadline.</span><input id="latest-arrival" type="datetime-local" value={arrival} onChange={event => { setArrival(event.target.value); invalidateRun(); }} disabled={calculating} aria-invalid={!arrival} className="min-h-11 rounded-[10px] border border-line bg-bg px-3 py-2 transition-colors hover:border-green/50 focus-visible:border-green-bright disabled:opacity-60" /></label><label className="grid gap-1.5 text-[14px]" htmlFor="budget"><span className="font-medium">What is the most extra you can spend?</span><span className="text-[13px] text-muted">Enter only the additional amount you can pay (₹).</span><input id="budget" type="number" min="0" value={budget} onChange={event => { setBudget(event.target.value); invalidateRun(); }} disabled={calculating} aria-invalid={!budgetIsValid} className="min-h-11 rounded-[10px] border border-line bg-bg px-3 py-2 transition-colors hover:border-green/50 focus-visible:border-green-bright disabled:opacity-60" /></label><label className={`flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-3 transition-colors ${noOvernight ? "border-green/60 bg-green-soft/20" : "border-line bg-bg hover:border-green/40"}`}><input id="overnight" type="checkbox" checked={noOvernight} onChange={event => { setNoOvernight(event.target.checked); invalidateRun(); }} disabled={calculating} className="mt-1 size-4 shrink-0 accent-green" /><span><strong>Avoid overnight travel</strong><span className="block text-[12px] text-muted">Keep overnight journeys out of your options.</span></span>{noOvernight && <CheckCircle2 aria-hidden className="ml-auto mt-0.5 size-4 shrink-0 text-green-bright" />}</label></div>}
        {loadingTrip && <p role="status" className="mt-4 text-[14px] text-ink2">Getting your trip details ready…</p>}
        <fieldset className="mt-6"><legend className="text-[14px] font-medium">What matters most to you?</legend><p className="mt-1 text-[13px] text-muted">Choose the priority Sutra should use when comparing suitable options.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["LOWER_COST", "EARLIER_ARRIVAL"] as const).map(value => { const selected = priority === value; return <motion.label key={value} whileTap={reduceMotion ? undefined : { scale: 0.99 }} className={`flex min-h-[76px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-200 ${selected ? "border-green-bright bg-green-soft/25 shadow-[0_0_0_1px_rgba(121,226,168,0.12)]" : "border-line bg-bg hover:border-green/50 hover:bg-green-soft/10"}`}><input type="radio" name="workbench-priority" checked={selected} onChange={() => { setPriority(value); invalidateRun(); }} disabled={calculating} className="size-4 shrink-0 accent-green" /><span className="flex-1"><span className="block font-medium">{value === "LOWER_COST" ? "Keep costs low" : "Arrive as early as possible"}</span><span className="mt-0.5 block text-[13px] text-muted">{value === "LOWER_COST" ? "Prefer options that cost less." : "Prefer options that get you there sooner."}</span></span>{selected && <motion.span initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.16 }}><CheckCircle2 aria-hidden className="size-5 text-green-bright" /></motion.span>}</motion.label>; })}</div></fieldset>
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between"><div aria-live="polite" className="min-w-0 text-[13px] text-muted">{!valid && !loadingCatalogue && !loadingTrip && catalogue.length > 0 && missingFields.length > 0 ? <><p className="font-medium text-ink2">To continue, please check:</p><ul className="mt-1 space-y-1">{missingFields.map(message => <li key={message}>• {message}</li>)}</ul></> : valid ? <p className="inline-flex items-center gap-2 text-green-bright"><CheckCircle2 className="size-4" />Everything is ready to check.</p> : null}</div><Btn onClick={calculate} disabled={!valid || calculating || loadingTrip || loadingCatalogue}>{calculating ? "Checking suitable options…" : "Find my best option"}</Btn></div>
      </motion.section>}

      {activeStep === 4 && <motion.section key="recovery-results" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }} aria-labelledby="recovery-options" className="mt-5"><div className="rounded-[18px] border border-green/50 bg-green-soft/20 p-5 md:p-6"><p className="font-mono text-[12px] uppercase tracking-[0.14em] text-green-bright">Your options</p><h2 id="recovery-options" className="mt-2 font-display text-2xl font-semibold">Your recovery options</h2><p className="mt-2 text-[15px] text-ink2">Start with our best match. You can still review the full journey or compare the alternatives.</p></div><div role="tablist" aria-label="Recovery result views" className="mt-4 grid gap-2 rounded-2xl border border-line bg-surface/70 p-2 sm:grid-cols-3">{tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={resultTab === tab.id} aria-controls={`recovery-tabpanel-${tab.id}`} onClick={() => setResultTab(tab.id)} className={`rounded-xl border px-3 py-3 text-left transition ${resultTab === tab.id ? "border-green/70 bg-green-soft/45 text-ink" : "border-transparent text-ink2 hover:border-line hover:bg-bg/60"}`}><span className="block text-sm font-semibold">{tab.label}</span><span className="mt-1 block text-xs text-muted">{tab.description}</span></button>)}</div><div id={`recovery-tabpanel-${resultTab}`} role="tabpanel" tabIndex={0} className="mt-4 rounded-[18px] border border-line bg-surface/40 p-4 shadow-l2 md:p-6">{projection && run ? (run.status === "RECOVERED" ? <RecoveryResultView tab={resultTab} trip={presentTrip(trip!)} result={projection.result} candidates={projection.candidates} selectedId={projection.selectedId} disruption={presentImpact({ source: "SIMULATED", scenarioId: profileId, bookingId: profile?.bookingId ?? "", kind: profile?.kind ?? "delay", ...(profile?.kind === "delay" ? { delayMinutes: delay } : {}) }, run.impact)} onRestart={resetResult} /> : <NoFeasibleView tab={resultTab} trip={presentTrip(trip!)} result={projection.result} candidates={projection.candidates} onRestart={resetResult} />) : calculating ? <div className="p-8 text-center text-ink2" role="status">Checking suitable travel options…</div> : <div className="p-8 text-center text-ink2">No recovery result is available yet. Return to the input form to try again.</div>}{run && <DependencyChecks run={run} />}</div><div className="mt-5"><Btn variant="ghost" onClick={() => openStep(1)}><ArrowLeft className="size-4" />Back to inputs</Btn></div></motion.section>}
    </div>
  </main>;
}
