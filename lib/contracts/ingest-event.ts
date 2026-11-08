import { z } from "zod";

export const ingestEventTypeSchema = z.enum([
  "run.started",
  "workflow.step.completed",
  "workflow.step.failed",
  "run.completed",
]);
export type IngestEventType = z.infer<typeof ingestEventTypeSchema>;

/**
 * Workflow / step status values used in MVP fixtures and future `workflow_events`.
 * Lifecycle and step events share: `started` | `completed` | `failed`.
 */
export const ingestEventStatusSchema = z.enum([
  "started",
  "completed",
  "failed",
]);
export type IngestEventStatus = z.infer<typeof ingestEventStatusSchema>;

/** JSON object state snapshot (before/after), or null when not applicable. */
export const stateObjectSchema = z.record(z.string(), z.unknown()).nullable();
export type StateObject = z.infer<typeof stateObjectSchema>;

export const riskMetadataSchema = z.record(z.string(), z.unknown());
export type RiskMetadata = z.infer<typeof riskMetadataSchema>;

const ingestEventBaseFields = {
  event_id: z.string().min(1),
  agent_id: z.string().min(1),
  external_run_id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  status: ingestEventStatusSchema,
  risk_metadata: riskMetadataSchema,
} as const;

/**
 * Lifecycle events (`run.started`, `run.completed`): tool/action/resource/state may be null.
 */
export const runStartedEventSchema = z.object({
  ...ingestEventBaseFields,
  event_type: z.literal("run.started"),
  tool: z.string().min(1).nullable(),
  action: z.string().min(1).nullable(),
  resource_id: z.string().min(1).nullable(),
  before_state: stateObjectSchema,
  after_state: stateObjectSchema,
});
export type RunStartedEvent = z.infer<typeof runStartedEventSchema>;

export const runCompletedEventSchema = z.object({
  ...ingestEventBaseFields,
  event_type: z.literal("run.completed"),
  tool: z.string().min(1).nullable(),
  action: z.string().min(1).nullable(),
  resource_id: z.string().min(1).nullable(),
  before_state: stateObjectSchema,
  after_state: stateObjectSchema,
});
export type RunCompletedEvent = z.infer<typeof runCompletedEventSchema>;

/**
 * Step events require tool, action, and resource_id; before/after state may still be null
 * when a step has no meaningful snapshot (e.g. pure failure without read).
 */
export const workflowStepCompletedEventSchema = z.object({
  ...ingestEventBaseFields,
  event_type: z.literal("workflow.step.completed"),
  tool: z.string().min(1),
  action: z.string().min(1),
  resource_id: z.string().min(1),
  before_state: stateObjectSchema,
  after_state: stateObjectSchema,
});
export type WorkflowStepCompletedEvent = z.infer<
  typeof workflowStepCompletedEventSchema
>;

export const workflowStepFailedEventSchema = z.object({
  ...ingestEventBaseFields,
  event_type: z.literal("workflow.step.failed"),
  tool: z.string().min(1),
  action: z.string().min(1),
  resource_id: z.string().min(1),
  before_state: stateObjectSchema,
  after_state: stateObjectSchema,
});
export type WorkflowStepFailedEvent = z.infer<
  typeof workflowStepFailedEventSchema
>;

/** Discriminated union of all ingest event shapes → future `workflow_events` rows. */
export const ingestEventSchema = z.discriminatedUnion("event_type", [
  runStartedEventSchema,
  workflowStepCompletedEventSchema,
  workflowStepFailedEventSchema,
  runCompletedEventSchema,
]);
export type IngestEvent = z.infer<typeof ingestEventSchema>;
