"use client";
/**
 * Step 1 of the recovery workbench: "Your trip and preferences".
 *
 * Presentation only. All values, validation rules and the recovery request still live in `RecoveryWorkbench`;
 * this component renders them as three short groups, shows validation beside the relevant field, and uses
 * accessible radio / checkbox cards for choices.
 */
import type { ReactNode } from "react";
import { AlertTriangle, CircleAlert, Info, RefreshCw } from "lucide-react";
import type { JourneyCatalogueEntry, RecoveryPriority, SupportedDisruptionProfile } from "@/lib/domain/types";
import { day, hm } from "@/lib/format";
import { Btn } from "./sections";
import { ChoiceCard, ChoiceChip } from "./choice";
import { FadeIn } from "./ui-motion";

export type FieldKey = "journey" | "disruption" | "delay" | "arrival" | "budget";
export type FormErrors = Partial<Record<FieldKey, string>>;
export const FIELD_ORDER: FieldKey[] = ["journey", "disruption", "delay", "arrival", "budget"];
const FIELD_NAME: Record<FieldKey, string> = { journey: "Trip", disruption: "What happened", delay: "Length of delay", arrival: "Arrival time", budget: "Extra amount" };

/** Moves keyboard focus to a field (or to the first enabled option of a choice group). */
export function focusField(key: FieldKey) {
  const el = document.getElementById(`field-${key}`);
  if (!el) return;
  const target = el.matches("input,select,textarea,button") ? el : el.querySelector<HTMLElement>("input:checked:not(:disabled), input:not(:disabled)");
  target?.focus();
  (target ?? el).scrollIntoView({ block: "center", behavior: "smooth" });
}

export const delayLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
};

const Tag = ({ required }: { required?: boolean }) => <span className="ml-2 inline-block rounded-full border border-line px-2 py-0.5 align-middle text-[11px] font-normal leading-none text-muted">{required ? "Required" : "Optional"}</span>;
const Help = ({ id, children }: { id?: string; children: ReactNode }) => <p id={id} className="mt-1 text-[13px] leading-snug text-ink2">{children}</p>;
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <FadeIn y={-3} duration={0.16} className="mt-2"><p id={id} className="flex items-start gap-1.5 text-[13px] text-danger"><CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />{message}</p></FadeIn>;
}
const inputClass = (invalid: boolean) => `h-12 w-full rounded-[10px] border bg-bg px-3 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-200 focus-visible:border-green-bright focus-visible:ring-2 focus-visible:ring-green/40 disabled:cursor-not-allowed disabled:opacity-60 ${invalid ? "border-danger/70" : "border-line hover:border-line-strong"}`;

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-6 first:border-t-0 first:pt-0">
      <h3 className="font-display text-[19px] font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-1 text-[14px] text-ink2">{hint}</p>}
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  );
}

export type WorkbenchFormProps = {
  catalogue: JourneyCatalogueEntry[]; loadingCatalogue: boolean; loadingTrip: boolean; calculating: boolean;
  selectedId: string; onJourney: (id: string) => void;
  profile?: SupportedDisruptionProfile; profileId: string; onProfile: (id: string) => void; selectedJourney?: JourneyCatalogueEntry;
  delays: number[]; delay?: number; onDelay: (minutes: number) => void;
  arrival: string; onArrival: (value: string) => void;
  budget: string; onBudget: (value: string) => void; currencySymbol: string;
  noOvernight: boolean; onNoOvernight: (value: boolean) => void;
  priority: RecoveryPriority; onPriority: (value: RecoveryPriority) => void;
  errors: FormErrors; visible: (field: FieldKey) => boolean; blocked: boolean;
  error?: string; technicalError: boolean; staleNotice: boolean;
  onSubmit: () => void; onRetry: () => void; onRetryCatalogue: () => void;
};

export function WorkbenchForm(p: WorkbenchFormProps) {
  const err = (field: FieldKey) => (p.visible(field) ? p.errors[field] : undefined);
  const lockedByTrip = p.calculating || p.loadingTrip;
  const failing = FIELD_ORDER.filter(field => p.errors[field]);

  return (
    <form noValidate aria-busy={p.calculating || undefined} onSubmit={event => { event.preventDefault(); p.onSubmit(); }} className="mt-6 space-y-7">
      <Group title="Your disrupted trip" hint="Pick your trip and tell us what went wrong.">
        {p.loadingCatalogue ? (
          <div role="status" aria-live="polite">
            <span className="sr-only">Finding your trips…</span>
            <div aria-hidden className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="sutra-skeleton h-[4.25rem]" />)}</div>
          </div>
        ) : !p.catalogue.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-warn/50 bg-warn/10 p-4 text-warn">
            <span className="flex items-center gap-2 text-[15px]"><AlertTriangle aria-hidden className="size-4 shrink-0" />No supported trips are available right now.</span>
            <Btn variant="ghost" onClick={p.onRetryCatalogue}><RefreshCw aria-hidden className="size-4" />Try again</Btn>
          </div>
        ) : (
          <>
            <fieldset id="field-journey" aria-describedby={err("journey") ? "err-journey" : undefined} className="min-w-0">
              <legend className="text-[15px] font-medium text-ink">Which trip is affected?<Tag required /></legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {p.catalogue.map(journey => (
                  <ChoiceCard key={journey.tripId} type="radio" name="workbench-journey" checked={journey.tripId === p.selectedId} onChange={() => p.onJourney(journey.tripId)}
                    disabled={p.calculating} title={journey.label} description={`${day(journey.journeyDate)} ${journey.journeyDate.slice(0, 4)}`} />
                ))}
              </div>
              <FieldError id="err-journey" message={err("journey")} />
            </fieldset>

            <fieldset id="field-disruption" aria-describedby={err("disruption") ? "err-disruption" : undefined} className="min-w-0">
              <legend className="text-[15px] font-medium text-ink">What happened?<Tag required /></legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {p.selectedJourney?.supportedDisruptions.map(value => (
                  <ChoiceCard key={value.id} type="radio" name="workbench-disruption" checked={value.id === p.profileId} onChange={() => p.onProfile(value.id)} disabled={p.calculating}
                    title={value.label} description={value.kind === "delay" ? "It is running late." : "It has been cancelled."} meta={value.bookingLabel} />
                ))}
              </div>
              <FieldError id="err-disruption" message={err("disruption")} />
            </fieldset>

            {p.profile?.kind === "delay" && (
              <fieldset id="field-delay" aria-describedby={err("delay") ? "err-delay" : undefined} className="min-w-0">
                <legend className="text-[15px] font-medium text-ink">How long is the delay?<Tag required /></legend>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {p.delays.map(value => <ChoiceChip key={value} name="workbench-delay" checked={value === p.delay} onChange={() => p.onDelay(value)} disabled={p.calculating} invalid={Boolean(err("delay"))}>{delayLabel(value)}</ChoiceChip>)}
                </div>
                <FieldError id="err-delay" message={err("delay")} />
              </fieldset>
            )}
            {p.profile?.kind === "cancellation" && <p className="flex items-center gap-2 text-[14px] text-ink2"><Info aria-hidden className="size-4 shrink-0 text-blue-bright" />Cancelled, so there is no delay length to enter.</p>}
          </>
        )}
      </Group>

      {!p.loadingCatalogue && p.catalogue.length > 0 && (
        <>
          <Group title="Your time and budget limits" hint="Sutra only suggests options that stay inside these limits.">
            {p.loadingTrip && <p role="status" className="text-[13px] text-muted">Getting your booking details…</p>}
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="field-arrival" className="block text-[15px] font-medium text-ink">When do you need to arrive by?<Tag required /></label>
                <Help id="help-arrival">The latest time you can reach your destination.</Help>
                <input id="field-arrival" type="datetime-local" value={p.arrival} onChange={event => p.onArrival(event.target.value)}
                  disabled={lockedByTrip} aria-invalid={Boolean(err("arrival")) || undefined} aria-describedby={`help-arrival${err("arrival") ? " err-arrival" : ""}`} className={`mt-2 ${inputClass(Boolean(err("arrival")))}`} />
                {p.arrival && !err("arrival") && <p className="mt-1.5 text-[13px] text-muted">That is {day(`${p.arrival}:00`)}, {hm(`${p.arrival}:00`)}.</p>}
                <FieldError id="err-arrival" message={err("arrival")} />
              </div>
              <div>
                <label htmlFor="field-budget" className="block text-[15px] font-medium text-ink">What is the most extra you can pay?<Tag required /></label>
                <Help id="help-budget">The additional amount, on top of your original tickets, you would pay to get there.</Help>
                <div className="relative mt-2">
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[15px] text-muted">{p.currencySymbol}</span>
                  <input id="field-budget" type="number" min="0" inputMode="numeric" value={p.budget} onChange={event => p.onBudget(event.target.value)}
                    disabled={lockedByTrip} aria-invalid={Boolean(err("budget")) || undefined} aria-describedby={`help-budget${err("budget") ? " err-budget" : ""}`} className={`${inputClass(Boolean(err("budget")))} pl-8`} />
                </div>
                <FieldError id="err-budget" message={err("budget")} />
              </div>
            </div>
            <ChoiceCard type="checkbox" checked={p.noOvernight} onChange={() => p.onNoOvernight(!p.noOvernight)} disabled={lockedByTrip}
              title={<>No overnight travel<Tag /></>} description="Skip options that mean travelling late at night or overnight." />
          </Group>

          <Group title="What matters most" hint="If more than one option fits your limits, Sutra recommends the one that does best on this.">
            <fieldset className="min-w-0">
              <legend className="sr-only">What should Sutra prefer?</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {([["LOWER_COST", "Keep the extra cost low", "Choose the cheapest option that works."], ["EARLIER_ARRIVAL", "Arrive as early as possible", "Choose the option that gets you there soonest."]] as const).map(([value, title, description]) => (
                  <ChoiceCard key={value} type="radio" name="workbench-priority" checked={p.priority === value} onChange={() => p.onPriority(value)} disabled={p.calculating} title={title} description={description} />
                ))}
              </div>
            </fieldset>
          </Group>
        </>
      )}

      <div className="space-y-4 border-t border-line pt-6">
        {p.staleNotice && <FadeIn y={4} duration={0.18}><p role="status" className="flex items-start gap-2 rounded-[10px] border border-blue/40 bg-blue-soft/40 px-3 py-2 text-[14px] text-ink2"><Info aria-hidden className="mt-0.5 size-4 shrink-0 text-blue-bright" />You changed a setting, so your earlier options were cleared. Find your best option again to update them.</p></FadeIn>}
        {p.error && (
          <div id="workbench-error" role="alert" tabIndex={-1} className="flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-danger/60 bg-danger/10 p-4 text-danger outline-none">
            <span className="flex items-start gap-2 text-[15px]"><AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /><span>
              <strong className="block">{p.technicalError ? "Something went wrong on our side. Nothing was changed." : "We couldn't finish that."}</strong>{p.error} Your answers are still here.</span></span>
            <Btn variant="ghost" onClick={p.onRetry} disabled={p.calculating}><RefreshCw aria-hidden className="size-4" />Try again</Btn>
          </div>
        )}
        {p.blocked && failing.length > 0 && (
          <FadeIn y={-3} duration={0.18}>
            <div role="alert" className="rounded-[10px] border border-danger/50 bg-danger/10 px-4 py-3 text-[14px] text-ink">
              <p className="font-medium text-danger">Please check {failing.length === 1 ? "one thing" : `${failing.length} things`} before continuing:</p>
              <ul className="mt-1.5 space-y-1">{failing.map(field => <li key={field}><button type="button" onClick={() => focusField(field)} className="text-left underline decoration-danger/50 underline-offset-2 hover:decoration-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-bright">{FIELD_NAME[field]}</button><span className="text-ink2"> — {p.errors[field]}</span></li>)}</ul>
            </div>
          </FadeIn>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted" role={p.calculating ? "status" : undefined}>{p.calculating ? "Checking your options against your limits…" : "Sutra only compares options. It does not book or change anything."}</p>
          <Btn onClick={p.onSubmit} loading={p.calculating} disabled={p.loadingCatalogue || !p.catalogue.length} className="w-full sm:w-auto sm:min-w-[13rem]">{p.calculating ? "Checking options…" : "Find my best option"}</Btn>
        </div>
      </div>
    </form>
  );
}
