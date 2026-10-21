import assert from "node:assert/strict";
import test from "node:test";
import { candidateName, friendlyText } from "@/components/sutra/display-names";
import { constraintOutcome, readableTimes } from "@/lib/constraint-copy";

const names = { "RAIL-A": "Rail A", "RAIL-B": "Rail B", "HOTEL-1": "Mysuru Hotel" };

test("friendly text swaps whole internal ids for trip labels and neutral option names", () => {
  assert.equal(friendlyText("RAIL-B is replaced", names), "Rail B is replaced");
  assert.equal(friendlyText("RC-B is the lowest-cost feasible recovery.", names), "Option B is the lowest-cost feasible recovery.");
  assert.equal(candidateName("RC-C"), "Option C");
});

test("friendly text never rewrites an id that is only part of a longer id", () => {
  assert.equal(friendlyText("Adds RC-B-ALT", names), "Adds Option B’s new booking");
  assert.equal(friendlyText("RAIL-AB stays", names), "RAIL-AB stays");
  assert.equal(friendlyText("see RAIL-A-ALT2", names), "see RAIL-A-ALT2");
});

test("ids with no readable equivalent are left as they are rather than invented", () => {
  assert.equal(candidateName("CUSTOM-9"), "CUSTOM-9");
  assert.equal(friendlyText("ACT-1 pending", names), "ACT-1 pending");
});

test("constraint wording only renames the backend outcome, in both directions", () => {
  assert.equal(constraintOutcome("ARRIVAL_DEADLINE", true), "Meets your arrival deadline");
  assert.equal(constraintOutcome("ARRIVAL_DEADLINE", false), "Doesn't meet your arrival deadline");
  assert.equal(constraintOutcome("budget", false), "Over your extra budget");
  assert.equal(constraintOutcome("SOMETHING_NEW", false), "Something new not satisfied");
});

test("timestamps inside backend messages are reformatted without timezone conversion", () => {
  assert.equal(readableTimes("Final arrival 2026-11-10T18:30:00 must be no later than 2026-11-10T19:00:00."), "Final arrival 10 Nov, 6:30 PM must be no later than 10 Nov, 7:00 PM.");
});
