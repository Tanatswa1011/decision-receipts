/**
 * Public read-only demo (DR_PUBLIC_DEMO=1), for a hosted copy reviewers can click through.
 * Everything is served from committed synthetic files; nothing is written and no model
 * is called. Turned off: saving or testing keys, model and agent runs, replay, reset,
 * ingest-key rotation and POST /api/events. The live feed shows a committed snapshot
 * (data/live-snapshot/) of a real local replay plus built-in agent run.
 */
export const PUBLIC_DEMO = process.env.DR_PUBLIC_DEMO === "1";

export const DEMO_MESSAGE =
  "This is the public read-only demo: keys, model runs, agent runs and ingest are turned off. Clone the repo and run it locally to use them.";
