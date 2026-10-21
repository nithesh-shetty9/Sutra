"use client";
/**
 * Traveller-facing names for internal identifiers.
 *
 * The recovery API returns ids such as `RAIL-A` or `RC-B`. Where the trip data carries a human label for an
 * item (e.g. "Rail A") the workbench supplies it through this context; candidate ids of the form `RC-B` get a
 * neutral positional name ("Option B"). Without a provider (tests, guided demo) every helper is the identity,
 * so existing views render exactly as before. Raw ids stay available in the technical-detail areas.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

type Names = Record<string, string>;
const DisplayNamesContext = createContext<Names | null>(null);

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// An id is only a whole token: not preceded/followed by a word character or a hyphen ("RC-B" must not match inside "RC-B-ALT").
const token = (id: string) => new RegExp(`(?<![\\w-])${escapeRe(id)}(?![\\w-])`, "g");
const CANDIDATE_ID = /(?<![\w-])[A-Z]{2}-([A-Z])(?![\w-])/g;
const REPLACEMENT_ID = /(?<![\w-])[A-Z]{2}-([A-Z])-ALT(?![\w-])/g;

export function candidateName(id: string): string {
  const match = /^[A-Z]{2}-([A-Z])$/.exec(id);
  return match ? `Option ${match[1]}` : id;
}

export function friendlyText(text: string, names: Names): string {
  let out = text;
  for (const id of Object.keys(names).sort((a, b) => b.length - a.length)) out = out.replace(token(id), names[id]);
  return out.replace(REPLACEMENT_ID, (_all, letter: string) => `Option ${letter}\u2019s new booking`).replace(CANDIDATE_ID, (_all, letter: string) => `Option ${letter}`);
}

export function DisplayNamesProvider({ names, children }: { names: Names; children: ReactNode }) {
  const value = useMemo(() => names, [names]);
  return <DisplayNamesContext.Provider value={value}>{children}</DisplayNamesContext.Provider>;
}

/** Returns a function that replaces internal ids in a string with traveller-facing names (identity without a provider). */
export function useFriendly(): (text: string) => string {
  const names = useContext(DisplayNamesContext);
  return useCallback((text: string) => (names ? friendlyText(text, names) : text), [names]);
}

/** True when a provider is mounted, i.e. we are rendering the traveller-facing workbench. */
export function useHasDisplayNames(): boolean {
  return useContext(DisplayNamesContext) !== null;
}
