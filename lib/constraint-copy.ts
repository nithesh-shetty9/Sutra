/**
 * Plain-language wording for backend constraint kinds. This only RENAMES results that the backend (decision
 * audit / validator) already produced; it never decides whether a constraint passed.
 */
import { day, hm } from "./format";

type Wording = { pass: string; fail: string; short: string };

const WORDING: Record<string, Wording> = {
  ARRIVAL_DEADLINE: { pass: "Meets your arrival deadline", fail: "Doesn't meet your arrival deadline", short: "Arrival deadline" },
  MAX_EXTRA_BUDGET: { pass: "Within your extra budget", fail: "Over your extra budget", short: "Extra budget" },
  NO_OVERNIGHT: { pass: "No overnight travel", fail: "Needs overnight travel", short: "Overnight travel" },
  CONNECTION: { pass: "Connections leave enough time", fail: "A connection is too tight", short: "Connections" },
  TEMPORAL: { pass: "Journey stays in the right order", fail: "Timing is out of order", short: "Timing order" },
  LOCATION: { pass: "Each leg starts where the last one ends", fail: "Locations don't line up", short: "Locations" },
  WINDOW: { pass: "Arrives within the required window", fail: "Arrives outside the required window", short: "Arrival window" },
  // lowercase kinds used by the presented (non-audit) violation shape
  deadline: { pass: "Meets your arrival deadline", fail: "Doesn't meet your arrival deadline", short: "Arrival deadline" },
  budget: { pass: "Within your extra budget", fail: "Over your extra budget", short: "Extra budget" },
  overnight: { pass: "No overnight travel", fail: "Needs overnight travel", short: "Overnight travel" },
  connection: { pass: "Connections leave enough time", fail: "A connection is too tight", short: "Connections" },
  temporal: { pass: "Journey stays in the right order", fail: "Timing is out of order", short: "Timing order" },
  location: { pass: "Each leg starts where the last one ends", fail: "Locations don't line up", short: "Locations" },
  window: { pass: "Arrives within the required window", fail: "Arrives outside the required window", short: "Arrival window" },
  route: { pass: "Route is continuous", fail: "Route isn't continuous", short: "Route" },
  hotel: { pass: "Hotel check-in still works", fail: "Hotel check-in is missed", short: "Hotel check-in" },
};

const humanise = (kind: string) => { const s = kind.toLowerCase().replace(/_/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };

export const constraintOutcome = (kind: string, passed: boolean) => WORDING[kind]?.[passed ? "pass" : "fail"] ?? `${humanise(kind)} ${passed ? "satisfied" : "not satisfied"}`;
export const constraintShort = (kind: string) => WORDING[kind]?.short ?? humanise(kind);

/** Normalised family used to find the arrival-deadline / budget rows regardless of which shape produced them. */
export const kindFamily = (kind: string) => kind.toLowerCase();

const ISO = /\b(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?\b/g;
/** Re-formats timezone-less ISO timestamps inside a backend message ("2026-11-10T18:30:00" → "10 Nov, 6:30 PM"). Pure formatting. */
export const readableTimes = (message: string) => message.replace(ISO, (all) => `${day(all)}, ${hm(all)}`);
