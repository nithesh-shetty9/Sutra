# Sutra - Product Brief

## 1. Product identity

**Product:** Sutra  
**Category:** AI agent for travel disruption recovery
**Hackathon problem:** PS 4.1 - AI Agent for Travel Disruption Recovery

> When a journey breaks, Sutra finds a practical way forward.

Sutra helps a traveller recover a planned trip when a transport disruption or a destination incident affects it. It connects the planned journey, transport and stay bookings, destination activities, traveller constraints, and available alternatives into one explainable recovery plan.

This is not a general trip-planning or booking marketplace. Its core job is to detect or simulate a disruption, identify what it affects, evaluate alternatives against explicit constraints, and show the traveller what to do next.

The frozen hackathon product and engineering baseline is in [`../planning/`](../planning/). The current implementation uses simulated recovery data, with a manual RailRadar train-status lookup available separately; live status does not drive recovery alternatives.

## 2. Problem and target traveller journey

A trip is a chain of dependent commitments, not an isolated ticket:

```text
Origin → rail journey → destination → accommodation → planned visit/activity → return
```

A train delay or cancellation can break a connection, push arrival past hotel check-in, or make a timed visit impossible. A strike, closure, severe weather event, or other destination incident can make a planned place or activity unavailable even when the train still runs.

Travellers need to know:

- what happened and how the system knows;
- which parts of their plan are affected and why;
- which alternatives are actually available in the demonstration;
- whether those alternatives meet their budget, timing, destination, and other stated constraints;
- what changed and which actions still require their approval.

## 3. Product outcome

Given a trip and traveller constraints, Sutra produces a clear, evidence-labelled recovery plan after a disruption.

```text
TRIP PLAN
   ↓
DISRUPTION SIGNAL
   ↓
AFFECTED BOOKINGS AND PLANS
   ↓
ALTERNATIVES + CONSTRAINT CHECKS
   ↓
RECOVERY ITINERARY + TRAVELLER ACTIONS
```

The system must distinguish a known disruption from an unverified signal, a completed search with no feasible option, and a technical failure. It must never describe seeded or simulated data as live information.

## 4. Hackathon deliverable mapping

| PS 4.1 expectation | Sutra must demonstrate |
| --- | --- |
| Detect or simulate travel disruptions | A clearly labelled, repeatable rail or destination-incident trigger; show incident type, affected place/booking, time, and source or simulation label. |
| Identify affected bookings | Trace the incident through the trip and explain each affected rail leg, stay, connection, or destination activity. |
| AI-driven alternative search and decision flow | Search the available demo alternatives, apply traveller constraints, use an AI step to choose/rank among valid candidates, and explain the selected option in plain language. |
| Recovery itinerary and traveller actions | Show the updated sequence, differences from the original, cost/time/constraint impact, and actions the traveller must take. |

The demo may use deterministic fixtures where live integrations are unavailable, but the interface and presentation must label that boundary honestly. Real-world detection and live availability are future integrations, not assumed capabilities.

## 5. Target user flow

1. **Create a trip.** The traveller enters or edits a structured plan: rail legs, accommodation, planned destination visit, dates/times, and constraints. Manual entry is the first prototype input; file import is optional future scope.
2. **Monitor or simulate.** Sutra checks the configured disruption feed when one exists. For the guaranteed hackathon path, the traveller or judge can trigger a named, deterministic rail-delay, rail-cancellation, or destination-incident scenario.
3. **Review the signal.** Show what was reported, its source or simulation status, event time, affected location/booking, and any uncertainty.
4. **Review impact.** Trace which bookings and plans are affected. Make the relationship between the event and each impact visible.
5. **Compare recovery options.** Search the available timetable, stay, or destination alternatives. Enforce hard constraints such as latest arrival and maximum extra budget before recommending an option.
6. **Review the recovery plan.** Show the revised trip in chronological order, what changed, why the selected option fits, remaining trade-offs, and the traveller actions required.
7. **Choose next action.** The traveller can accept, edit, or dismiss the proposal. The prototype does not purchase, cancel, or modify a real booking.

## 6. Disruption and impact boundaries

Initial disruption classes:

- **Rail:** delay or cancellation of a planned rail leg.
- **Destination:** a time- and place-bounded incident affecting a planned visit or local activity, such as a closure or a reported strike.

An incident affecting a destination activity must not be presented as proof that a hotel or train booking has been cancelled. Only mark a booking affected when the itinerary relationships and incident facts support that conclusion. If signal quality or impact is uncertain, say so and ask the traveller to verify.

Every signal shown in a demo should carry provenance appropriate to its source: provider and observed time for live data, or a visible `Simulated demo` label for fixtures.

## 7. Decision and trust rules

- Treat traveller constraints as explicit inputs, not assumptions.
- Apply hard constraints deterministically before asking AI to rank or explain recovery candidates. The model must only choose from the supplied feasible candidates; validate its response against that set.
- The hackathon demo must make the AI's role real and specific (for example, selecting among feasible candidates and generating a grounded explanation). A deterministic fallback protects the demo if the model is unavailable, but must not be presented as AI-generated.
- Do not claim an option is bookable unless the connected source confirms availability; static demo inventory must be labelled.
- Show the important inputs behind the recommendation: incident, impacted commitments, candidate trade-offs, and constraint checks.
- Keep the final booking decision with the traveller. No automatic purchase, cancellation, or third-party booking changes in the prototype.
- Keep a completed-but-infeasible result separate from an API, provider, or runtime error.
- Do not expose hidden model reasoning. Show concise, verifiable reasons and evidence instead.

## 8. Required outcomes and success criteria

A judge should be able to understand, without reading the source:

1. the trip and constraints the traveller entered;
2. whether the disruption was live or simulated, and its source/time;
3. which bookings and plans were affected and why;
4. which alternatives were evaluated and which constraints they pass or fail;
5. the proposed recovery itinerary, changes, and traveller actions;
6. what remains uncertain or requires the traveller to confirm.

The core end-to-end demo is successful when a reviewer can start from a trip, trigger a disruption, see its impact, compare at least two alternatives against constraints, and reach a clearly actionable recovery plan. At least one no-feasible-option or unavailable-data state should be handled honestly rather than presented as a successful recovery.

## 9. Scope guardrails

### First hackathon-fit slice

- One traveller and one manually created rail-first trip.
- At least one rail disruption and one destination incident represented by deterministic scenarios.
- A trip graph containing rail, accommodation, and a planned visit/activity.
- A small, explicit demo catalogue of alternative rail or destination choices.
- Hard checks for the agreed demo constraints (at minimum timing and extra budget).
- One recommended recovery itinerary, alternatives, and traveller actions.
- Clear simulation/source labels, infeasible state, and technical-error state.
- A reliable, repeatable demo that does not depend on an external provider.

### Not required for the first slice

- Production accounts, payments, or a general-purpose trip marketplace.
- Automatic booking, cancellation, refund, or ticket issuance.
- Unverified claims of continuous, real-time monitoring.
- Broad coverage of every transport mode, country, provider, event type, or disruption.
- Autonomous action on behalf of a traveller.

## 10. Current prototype status

The current frontend is a useful workflow and visual-design baseline, not the full target rail-and-destination product. It includes deterministic recovery scenarios, including flight delay, flight cancellation, no feasible recovery, and a retriable technical error; disruptions are triggered in the UI. It also offers a manual RailRadar train-status lookup. It does not poll for rail or destination events, and live status does not recalculate the simulated recovery alternatives.

Do not remove the current implementation until the replacement end-to-end flow is designed and verified. See [`../planning/`](../planning/) for the frozen implementation baseline and demo target.
