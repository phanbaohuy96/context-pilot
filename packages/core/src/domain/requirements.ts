import { z } from "zod";

export const requirementCategorySchema = z.enum([
  "BUSINESS_GOAL",
  "USER_ROLE",
  "WORKFLOW",
  "FEATURE",
  "CONSTRAINT",
  "OPEN_QUESTION",
  "RISK",
  "ASSUMPTION",
]);

export type RequirementCategory = z.infer<typeof requirementCategorySchema>;

export const extractedRequirementSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: requirementCategorySchema,
  priority: z.string().optional(),
  evidenceMessageIds: z.array(z.string()).default([]),
});

export const requirementExtractionSchema = z.object({
  requirements: z.array(extractedRequirementSchema),
});

export type ExtractedRequirement = z.infer<typeof extractedRequirementSchema>;
export type RequirementExtraction = z.infer<typeof requirementExtractionSchema>;
