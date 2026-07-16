import { z } from "zod";

export const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
export const FLASHCARD_ID_PATTERN = /^f(?:0[1-9]|[1-9][0-9]|1[0-4][0-9]|150)$/;

export const profileIdSchema = z.string().regex(PROFILE_ID_PATTERN);
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const branchIdSchema = z.enum([
  "market",
  "feed",
  "orders",
  "sessions",
  "monitoring",
  "incident",
  "capacity",
  "risk",
  "interview",
]);

export const flashcardSchema = z.object({
  id: z.string().regex(FLASHCARD_ID_PATTERN),
  branch: branchIdSchema,
  prompt: z.string().min(1).max(160),
  answer: z.string().min(1).max(1_200),
  deepDive: z.string().min(1).max(1_200),
});

export const flashcardCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  generatedFrom: z.string().min(1),
  cards: z.array(flashcardSchema).length(150),
});

export const flashDraftSchema = z.object({
  text: z.string().max(1_200),
  updatedAt: z.union([isoTimestampSchema, z.literal("")]),
});

export const recallVerdictSchema = z.enum(["strong", "developing", "needs-work"]);

export const flashAttemptSchema = z.object({
  id: z.string().min(1).max(100),
  cardId: z.string().regex(FLASHCARD_ID_PATTERN),
  answer: z.string().trim().min(20).max(1_200),
  createdAt: isoTimestampSchema,
  rubricVersion: z.union([z.literal(1), z.literal(2)]),
  wordCount: z.number().int().min(4).max(500),
  coverageScore: z.number().int().min(0).max(60),
  structureScore: z.number().int().min(0).max(25),
  specificityScore: z.number().int().min(0).max(15),
  score: z.number().int().min(0).max(100),
  verdict: recallVerdictSchema,
  resolved: z.boolean(),
  matched: z.array(z.string().min(1).max(80)).max(8),
  missing: z.array(z.string().min(1).max(80)).max(8),
});

export const progressStateSchema = z
  .object({
    uiVersion: z.number().int().min(1).max(100).optional(),
    xp: z.number().int().min(0).max(100_000_000).optional(),
    displayName: z.string().max(80).optional(),
    profileObjective: z.string().max(160).optional(),
    flashDrafts: z.record(z.string(), flashDraftSchema).optional(),
    flashAttempts: z.array(flashAttemptSchema).max(200).optional(),
    selectedFlashAttempt: z.string().max(100).optional(),
    flashActiveId: z.union([z.string().regex(FLASHCARD_ID_PATTERN), z.literal("")]).optional(),
    flashRecent: z.array(z.string().regex(FLASHCARD_ID_PATTERN)).max(6).optional(),
    flashIndex: z.number().int().min(0).max(100_000).optional(),
    flashRevealed: z.boolean().optional(),
    flashRewardClaims: z.array(z.string().min(1).max(80)).max(1_000).optional(),
  })
  .catchall(z.unknown());

export const profileStateResponseSchema = z.object({
  profile: profileIdSchema,
  state: progressStateSchema.nullable(),
  revision: z.number().int().min(0),
  updatedAt: isoTimestampSchema.nullable(),
});

export const stateWriteRequestSchema = z.object({
  profile: profileIdSchema,
  revision: z.number().int().min(0),
  state: progressStateSchema,
});

export const recallValidationRequestSchema = z.object({
  cardId: z.string().regex(FLASHCARD_ID_PATTERN),
  answer: z.string().trim().min(20).max(1_200),
});

export const recallValidationResponseSchema = flashAttemptSchema.omit({
  id: true,
  createdAt: true,
});

export const apiErrorSchema = z.object({
  error: z.string().min(1),
  message: z.string().optional(),
  requestId: z.string().optional(),
  revision: z.number().int().min(0).optional(),
  updatedAt: isoTimestampSchema.optional(),
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("getops-api"),
  version: z.string().min(1),
  database: z.enum(["ready", "not-checked"]).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type BranchId = z.infer<typeof branchIdSchema>;
export type FlashAttempt = z.infer<typeof flashAttemptSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type FlashcardCatalog = z.infer<typeof flashcardCatalogSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ProfileStateResponse = z.infer<typeof profileStateResponseSchema>;
export type ProgressState = z.infer<typeof progressStateSchema>;
export type RecallValidationRequest = z.infer<typeof recallValidationRequestSchema>;
export type RecallValidationResponse = z.infer<typeof recallValidationResponseSchema>;
export type StateWriteRequest = z.infer<typeof stateWriteRequestSchema>;

export function stateEtag(profile: string, revision: number): string {
  return `"state-${profile}-r${revision}"`;
}
