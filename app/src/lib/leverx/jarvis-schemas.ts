import { z } from "zod";

export const JarvisEventTypeSchema = z.enum([
  "welcome",
  "enabled",
  "disabled",
  "startup",
  "running",
  "analyzing_trades",
  "analyzing_markets",
  "closing_position",
  "repaying_debt",
  "opening_position",
  "idle",
  "cycle_complete",
  "account_required",
  "no_funds",
  "low_balance",
  "executor_required",
  "skipped",
  "error",
]);

export type JarvisEventType = z.infer<typeof JarvisEventTypeSchema>;

export const JarvisRiskProfileSchema = z.enum([
  "conservative",
  "balanced",
  "aggressive",
]);
export type JarvisRiskProfile = z.infer<typeof JarvisRiskProfileSchema>;

export const JarvisGuardrailsSchema = z.object({
  max_leverage: z.number().int().min(1).max(10),
  max_portfolio_pct: z.number().int().min(1).max(100),
  max_open_positions: z.number().int().min(1).max(10),
  risk_profile: JarvisRiskProfileSchema,
  dry_run: z.boolean(),
});
export type JarvisGuardrails = z.infer<typeof JarvisGuardrailsSchema>;

export const JarvisEventRecordSchema = z.object({
  id: z.string(),
  user_address: z.string(),
  account_id: z.string(),
  event_type: JarvisEventTypeSchema,
  message: z.string(),
  metadata: z.record(z.unknown()).nullable(),
  read: z.boolean(),
  created_at_ms: z.string(),
});

export type JarvisEventRecord = z.infer<typeof JarvisEventRecordSchema>;

export const JarvisStatusResponseSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  user_address: z.string(),
  account_id: z.string(),
  last_run_at_ms: z.number().nullable(),
  next_run_at_ms: z.number().nullable(),
  unread_count: z.number(),
  guardrails: JarvisGuardrailsSchema,
  last_decision_at_ms: z.number().nullable().optional(),
});

export type JarvisStatusResponse = z.infer<typeof JarvisStatusResponseSchema>;

export const JarvisSettingsResponseSchema = z.object({
  enabled: z.boolean(),
  user_address: z.string(),
  account_id: z.string(),
  guardrails: JarvisGuardrailsSchema,
});

export type JarvisSettingsResponse = z.infer<typeof JarvisSettingsResponseSchema>;

export const JarvisUpdateSettingsBodySchema = z.object({
  owner: z.string().min(1),
  account_id: z.string().min(1),
  max_leverage: z.number().int().min(1).max(10).optional(),
  max_portfolio_pct: z.number().int().min(1).max(100).optional(),
  max_open_positions: z.number().int().min(1).max(10).optional(),
  risk_profile: JarvisRiskProfileSchema.optional(),
  dry_run: z.boolean().optional(),
});

export type JarvisUpdateSettingsBody = z.infer<typeof JarvisUpdateSettingsBodySchema>;

export const JarvisUnreadPayloadSchema = z.object({
  unread_count: z.number(),
});

export type JarvisUnreadPayload = z.infer<typeof JarvisUnreadPayloadSchema>;

export const JarvisMarkReadResponseSchema = z.object({
  updated: z.number(),
});
