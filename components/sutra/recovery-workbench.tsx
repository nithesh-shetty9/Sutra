"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowLeft, Check } from "lucide-react";
import { getCanonicalTrip, getJourneyCatalogue, runConfiguredRecovery, SutraApiError } from "@/lib/api";
import { presentImpact, presentRun, presentTrip } from "@/lib/rail-presentation";
import { constraintShort, readableTimes } from "@/lib/constraint-copy";
import { formatMoney } from "@/lib/format";
import type { ConstraintOverrides, JourneyCatalogueEntry, RecoveryPriority, RecoveryRunResult, SupportedDisruptionProfile, Trip } from "@/lib/domain/types";
import { RecoveryResultView, NoFeasibleView, type RecoveryResultTab } from "./result";
import { Btn } from "./sections";
import { LiveRailStatus } from "./live-rail-status";
import { DisplayNamesProvider, useFriendly } from "./display-names";
import { EntranceProvider, FadeIn, DURATION } from "./ui-motion";
import { WorkbenchForm, FIELD_ORDER, focusField, type FormErrors } from "./workbench-form";

const toInput = (value?: string) => value?.slice(0, 16) ?? "";
const toApi = (value: string) => `${value}:00`;
function delayOptions(profile?: SupportedDisruptionProfile) {
  const range = profile?.delayRange;
  if (!range || range.stepMinutes <= 0) return [];
  return Array.from({ length: Math.floor((range.maximumMinutes - range.minimumMinutes) / range.stepMinutes) + 1 }, (_, index) => range.minimumMinutes + index * range.stepMinutes);
}

/** Technical evidence behind the decision. Raw ids stay visible here for debugging; the plain name leads. */
function DependencyChecks({ run }: { run: RecoveryRunResult }) {
  const f = useFriendly();
  return <details className="sutra-card mt-6 rounded-[18px] border border-line bg-surface/60 p-5 shadow-l2 md:p-6">
    <summary className="cursor-pointer list-none rounded-[8px] outline-offset-4 focus-visible:outline-2 focus-visible:outline-green-bright [&::-webkit-details-marker]:hidden">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-green-bright">Decision details</p>
      <h2 className="mt-2 font-display text-xl font-semibold">What else we checked</h2>
      <p className="mt-2 text-[14px] text-ink2">Open this to see the connection, location and timing checks behind each option.</p>
    </summary>
    <div className="mt-5 space-y-4">
      {run.decisionAudit.candidates.map(candidate => <article key={candidate.candidateId} className="rounded-[12px] border border-line bg-bg/40 p-4">
        <p className="text-[14px] text-ink"><span className="font-medium">{f(candidate.candidateId)}</span> <span className="font-mono text-[12px] text-muted">({candidate.candidateId})</span> · {candidate.feasible ? "fits your limits" : "doesn't fit your limits"}</p>
        <ul className="mt-3 space-y-2 text-[14px] text-ink2">
          {candidate.dependencyChecks.map(check => <li key={check.dependencyId} className={check.passed ? "text-ink2" : "text-danger"}><strong>{check.passed ? "✓" : "×"} {constraintShort(check.kind)}</strong> · {readableTimes(f(check.message))}</li>)}
          {!candidate.dependencyChecks.length && <li className="text-muted">No dependency checks returned.</li>}
        </ul>
      </article>)}
    </div>
  </details>;
}

type StepStatus = "current" | "complete" | "ready" | "upcoming";
const STEPS: { step: 1 | 4; number: string; label: string; hint: string }[] = [
  { step: 1, number: "1", label: "Your trip & preferences", hint: "Tell us what happened" },
  { step: 4, number: "2", label: "Your options", hint: "Review and compare" },
];

function StepIndicator({ active, hasRun, onOpen }: { active: 1 | 4; hasRun: boolean; onOpen: (step: 1 | 4) => void }) {
  const status = (step: 1 | 4): StepStatus => step === 1 ? (active === 1 ? "current" : "complete") : active === 4 ? "current" : hasRun ? "ready" : "upcoming";
  return (
    <nav aria-label="Recovery steps" className="sticky top-3 z-20 mt-5 overflow-hidden rounded-2xl border border-line bg-bg/95 p-1.5 shadow-l2 backdrop-blur-xl sm:p-2">
      <ol className="grid grid-cols-2 gap-1.5 sm:gap-2">
        {STEPS.map(item => {
          const st = status(item.step);
          const disabled = st === "upcoming";
          return <li key={item.step}>
            <button type="button" onClick={() => onOpen(item.step)} disabled={disabled} aria-current={st === "current" ? "step" : undefined}
              className={`flex min-h-12 w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-[border-color,background-color,color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-bright sm:gap-3 sm:px-4 sm:py-3 ${
                st === "current" ? "border-green/70 bg-green-soft/45 text-ink shadow-[0_0_0_1px_rgba(124,255,167,0.12)]"
                  : st === "complete" ? "border-green/30 bg-surface/45 text-ink2 hover:border-green/60 hover:bg-green-soft/20"
                  : st === "ready" ? "border-line-strong bg-surface/45 text-ink2 hover:border-green/50 hover:bg-green-soft/20"
                  : "border-line/60 bg-surface/20 text-muted opacity-70"}`}>
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-[background-color,border-color,color] duration-200 ${
                st === "complete" ? "border-green-bright bg-green-bright text-bg" : st === "current" ? "border-green-bright text-green-bright" : st === "ready" ? "border-line-strong text-ink2" : "border-line text-muted"}`}>
                {st === "complete" ? <Check aria-hidden className="size-4" strokeWidth={3} /> : item.number}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium sm:text-sm">{item.label}</span>
                <span className="hidden text-xs text-muted sm:block">{st === "complete" ? "Done" : st === "ready" ? "Results ready" : item.hint}</span>
              </span>
              <span className="sr-only">{st === "current" ? " (current step)" : st === "complete" ? " (completed)" : st === "ready" ? " (results ready)" : " (not available yet)"}</span>
            </button>
          </li>;
        })}
      </ol>
      <div aria-hidden className="mx-2 mt-1.5 h-0.5 overflow-hidden rounded-full bg-line sm:mx-3">
        <motion.div className="h-full origin-left rounded-full bg-green-bright" initial={false} animate={{ width: active === 1 ? "50%" : "100%" }} transition={{ duration: DURATION.step, ease: "easeOut" }} />
      </div>
    </nav>
  );
}

export function RecoveryWorkbench() {
  const reduce = useReducedMotion();
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
  const [attempted, setAttempted] = useState(false);
  const [staleNotice, setStaleNotice] = useState(false);
  // A newer request (or a changed journey) makes any older response irrelevant; the guard also blocks duplicate submits.
  const requestSeq = useRef(0);
  const inFlight = useRef(false);
  const previousStep = useRef<1 | 4>(1);

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
    requestSeq.current += 1; inFlight.current = false; setCalculating(false);
    setLoadingTrip(true); setError(undefined); setTechnicalError(false); setRun(undefined); setActiveStep(1); setTrip(undefined); setStaleNotice(false);
    setProfileId(selectedJourney.supportedDisruptions[0]?.id ?? "");
    void getCanonicalTrip(selectedJourney.tripId).then(value => {
      if (!active) return;
      setTrip(value); setArrival(toInput(value.constraints.latestArrivalAt)); setBudget(String(value.constraints.maxExtraBudget ?? "")); setNoOvernight(value.constraints.noOvernight);
    }).catch(cause => { if (active) { setTechnicalError(cause instanceof SutraApiError && cause.error.audit?.status === "TECHNICAL_ERROR"); setError(cause instanceof SutraApiError ? cause.error.message : "We couldn't load this journey."); } }).finally(() => { if (active) setLoadingTrip(false); });
    return () => { active = false; };
  }, [selectedJourney]);

  useEffect(() => { setDelay(delayOptions(profile)[0]); }, [profile]);

  // Validation rules are unchanged; they are now reported per field.
  const errors = useMemo<FormErrors>(() => {
    const found: FormErrors = {};
    if (!selectedJourney) found.journey = "Choose the trip that was disrupted.";
    if (selectedJourney && !profile) found.disruption = "Choose what happened to your trip.";
    if (profile?.kind === "delay" && !delays.includes(delay ?? -1)) found.delay = "Choose how long the delay is.";
    if (!arrival) found.arrival = "Choose the latest date and time you can arrive.";
    if (budget === "") found.budget = "Enter the most extra you can pay. Enter 0 if you can't pay anything more.";
    else if (!Number.isFinite(Number(budget)) || Number(budget) < 0) found.budget = "Enter an amount of 0 or more.";
    return found;
  }, [selectedJourney, profile, delays, delay, arrival, budget]);
  const valid = Boolean(trip && profile && Object.keys(errors).length === 0);
  // Errors appear after the first submit attempt (not on blur): a message appearing mid-tap would shift the button and swallow the tap.
  const visible = () => attempted;
  const blocked = attempted && Object.keys(errors).length > 0;

  const invalidateRun = () => { if (run) setStaleNotice(true); setRun(undefined); setResultTab("best"); };
  const changeStep = useCallback((step: 1 | 4) => setActiveStep(step), []);

  const calculate = async () => {
    if (inFlight.current) return;
    setAttempted(true);
    if (!trip || !profile || !valid) {
      const first = FIELD_ORDER.find(field => errors[field]);
      if (first) focusField(first);
      return;
    }
    const overrides: ConstraintOverrides = { latestArrivalAt: toApi(arrival), maxExtraBudget: Number(budget), noOvernight, priority };
    const disruption = { source: "SIMULATED" as const, scenarioId: profile.id, bookingId: profile.bookingId, kind: profile.kind, ...(profile.kind === "delay" ? { delayMinutes: delay } : {}) };
    const seq = ++requestSeq.current;
    inFlight.current = true;
    setCalculating(true); setError(undefined); setTechnicalError(false); setRun(undefined); setResultTab("best"); setStaleNotice(false);
    try {
      const result = await runConfiguredRecovery({ tripId: trip.id, tripVersion: trip.version, disruption, constraintOverrides: overrides });
      if (seq !== requestSeq.current) return;
      setRun(result); setActiveStep(4);
    } catch (cause) {
      if (seq !== requestSeq.current) return;
      // Stay on the form so every answer is still in front of the traveller, with the reason and a retry beside the action.
      setTechnicalError(cause instanceof SutraApiError && cause.error.audit?.status === "TECHNICAL_ERROR");
      setError(cause instanceof SutraApiError ? cause.error.message : "Recovery could not be calculated. Please retry.");
    } finally {
      if (seq === requestSeq.current) { inFlight.current = false; setCalculating(false); }
    }
  };
  const resetResult = () => { setRun(undefined); setResultTab("best"); setActiveStep(1); };
  const projection = trip && run ? presentRun(trip, run) : undefined;
  const openStep = (step: 1 | 4) => { if (step === 1 || run) changeStep(step); };

  // After a step change, put the new section's heading in view below the sticky step bar and move focus to it.
  useEffect(() => {
    if (previousStep.current === activeStep) return;
    previousStep.current = activeStep;
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById(activeStep === 1 ? "workbench-configuration" : "recovery-options");
      heading?.focus({ preventScroll: true });
      document.getElementById(activeStep === 1 ? "workbench-step-1" : "workbench-step-2")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeStep, reduce]);
  // A failed request keeps the traveller on the form; bring the explanation into view.
  useEffect(() => { if (error) document.getElementById("workbench-error")?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }); }, [error, reduce]);

  const names = useMemo(() => Object.fromEntries((trip?.items ?? []).map(item => [item.id, item.label])), [trip]);
  const tabs: { id: RecoveryResultTab; label: string; description: string }[] = [
    { id: "best", label: "Best option", description: "Our pick and why" },
    { id: "journey", label: "Your journey", description: "Original and new route and times" },
    { id: "compare", label: "Compare options", description: "Every option and why some don't fit" },
  ];
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setResultTab(tabs[next].id);
    document.getElementById(`recovery-tab-${tabs[next].id}`)?.focus();
  };
  const currencySymbol = formatMoney(0, selectedJourney?.currency ?? "INR").replace(/[\d.,\s]/g, "");

  return <main id="workbench-top" className="min-h-screen bg-bg px-4 py-6 text-ink sm:px-5 md:px-8 md:py-8">
    <div className="mx-auto max-w-6xl pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-[14px] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-bright"><ArrowLeft aria-hidden className="size-4" />Back home</Link><h1 className="mt-2 font-display text-3xl font-semibold md:text-4xl">Find a way forward</h1><p className="mt-2 max-w-3xl text-ink2">Tell Sutra what happened and what matters to you. We will compare options that fit.</p><p className="mt-2 text-sm text-muted">This tool evaluates options only. It does not book or change tickets.</p></div>
        <span className="rounded-full border border-warn/60 bg-warn/10 px-3 py-1.5 font-mono text-[11px] tracking-wider text-warn">SIMULATED DATA · RECOVERY OFFERS</span>
      </header>

      <StepIndicator active={activeStep} hasRun={Boolean(run)} onOpen={openStep} />

      {activeStep === 1 && <FadeIn key="step-1" as="section" id="workbench-step-1" labelledBy="workbench-configuration" className="sutra-card mt-6 scroll-mt-28 rounded-[18px] border border-line bg-surface/60 p-5 shadow-l2 md:p-7">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[12px] uppercase tracking-[0.14em] text-green-bright">Your trip and preferences</p><h2 id="workbench-configuration" tabIndex={-1} className="mt-2 font-display text-2xl font-semibold outline-none">What went wrong with your trip?</h2><p className="mt-2 max-w-3xl text-[15px] text-ink2">Pick your trip, tell us what happened, then set the limits Sutra should respect.</p></div></div>
          <WorkbenchForm
            catalogue={catalogue} loadingCatalogue={loadingCatalogue} loadingTrip={loadingTrip} calculating={calculating}
            selectedId={selectedId} onJourney={setSelectedId} selectedJourney={selectedJourney} profile={profile} profileId={profileId} onProfile={id => { setProfileId(id); invalidateRun(); }}
            delays={delays} delay={delay} onDelay={value => { setDelay(value); invalidateRun(); }}
            arrival={arrival} onArrival={value => { setArrival(value); invalidateRun(); }} budget={budget} onBudget={value => { setBudget(value); invalidateRun(); }} currencySymbol={currencySymbol}
            noOvernight={noOvernight} onNoOvernight={value => { setNoOvernight(value); invalidateRun(); }} priority={priority} onPriority={value => { setPriority(value); invalidateRun(); }}
            errors={errors} visible={visible} blocked={blocked} error={error} technicalError={technicalError} staleNotice={staleNotice}
            onSubmit={calculate} onRetry={trip ? calculate : loadCatalogue} onRetryCatalogue={loadCatalogue}
          />
        </div>
      </FadeIn>}

      {activeStep === 4 && <FadeIn key="step-2" as="section" id="workbench-step-2" labelledBy="recovery-options" className="mt-6 scroll-mt-28">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-[18px] border border-green/50 bg-green-soft/20 p-5 md:p-6">
            <div><p className="font-mono text-[12px] uppercase tracking-[0.14em] text-green-bright">Your options</p><h2 id="recovery-options" tabIndex={-1} className="mt-2 font-display text-2xl font-semibold outline-none">Here&rsquo;s what Sutra found</h2><p className="mt-2 text-[15px] text-ink2">Start with the best option, then look at your journey or compare the alternatives.</p></div>
            <Btn variant="ghost" onClick={() => openStep(1)}><ArrowLeft aria-hidden className="size-4" />Edit my answers</Btn>
          </div>
          <div role="tablist" aria-label="Recovery result views" className="mt-4 grid gap-2 rounded-2xl border border-line bg-surface/70 p-2 sm:grid-cols-3">{tabs.map((tab, index) => <button key={tab.id} id={`recovery-tab-${tab.id}`} type="button" role="tab" aria-selected={resultTab === tab.id} aria-controls={`recovery-tabpanel-${tab.id}`} tabIndex={resultTab === tab.id ? 0 : -1} onClick={() => setResultTab(tab.id)} onKeyDown={event => onTabKey(event, index)}
            className={`min-h-12 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-bright ${resultTab === tab.id ? "border-green/70 bg-green-soft/45 text-ink" : "border-transparent text-ink2 hover:border-line hover:bg-bg/60"}`}>
            <span className="block text-sm font-semibold">{tab.label}</span><span className="mt-0.5 hidden text-xs text-muted sm:block">{tab.description}</span></button>)}</div>
          <div id={`recovery-tabpanel-${resultTab}`} role="tabpanel" aria-labelledby={`recovery-tab-${resultTab}`} tabIndex={0} className="mt-4 rounded-[18px] border border-line bg-surface/40 p-4 shadow-l2 outline-none focus-visible:outline-2 focus-visible:outline-green-bright md:p-6">
            <DisplayNamesProvider names={names}><EntranceProvider value={false}><FadeIn key={resultTab} y={6} duration={DURATION.tab}>
              {projection && run ? (run.status === "RECOVERED" ? <RecoveryResultView tab={resultTab} trip={presentTrip(trip!)} result={projection.result} candidates={projection.candidates} selectedId={projection.selectedId} disruption={presentImpact({ source: "SIMULATED", scenarioId: profileId, bookingId: profile?.bookingId ?? "", kind: profile?.kind ?? "delay", ...(profile?.kind === "delay" ? { delayMinutes: delay } : {}) }, run.impact)} onRestart={resetResult} /> : <NoFeasibleView tab={resultTab} trip={presentTrip(trip!)} result={projection.result} candidates={projection.candidates} onRestart={resetResult} onReviewPreferences={() => openStep(1)} />) : calculating ? <div className="p-8 text-center text-ink2" role="status">Checking the available journeys…</div> : <div className="p-8 text-center text-ink2"><AlertTriangle aria-hidden className="mx-auto mb-2 size-5 text-warn" />No options to show yet. Go back to your answers and try again.</div>}
              {run && <DependencyChecks run={run} />}
            </FadeIn></EntranceProvider></DisplayNamesProvider>
          </div>
          <div className="mt-5 flex flex-wrap gap-3"><Btn variant="ghost" onClick={() => openStep(1)}><ArrowLeft aria-hidden className="size-4" />Back to my answers</Btn></div>
        </div>
      </FadeIn>}

      {/* Optional, manual lookup. Kept below the main task so the form is the first thing a traveller sees. */}
      <LiveRailStatus />
    </div>
  </main>;
}
