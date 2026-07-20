import "server-only";

import { z } from "zod";

const optionalString = (schema: z.ZodString) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.optional(),
  );

const obsidianEnvironmentSchema = z
  .object({
    GITHUB_TOKEN: optionalString(z.string().trim().min(20).max(512)),
    OBSIDIAN_REPO: optionalString(
      z
        .string()
        .trim()
        .max(200)
        .regex(
          /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
          "OBSIDIAN_REPO must use owner/repository format",
        ),
    ),
    OBSIDIAN_BRANCH: optionalString(z.string().trim().min(1).max(255)),
    OBSIDIAN_VAULT_NAME: optionalString(
      z
        .string()
        .trim()
        .min(1)
        .max(255)
        .refine(
          (value) => !value.includes("/") && !value.includes("\\"),
          "OBSIDIAN_VAULT_NAME must be a single folder name",
        ),
    ),
  })
  .superRefine((value, context) => {
    const configured = [
      value.GITHUB_TOKEN,
      value.OBSIDIAN_REPO,
      value.OBSIDIAN_VAULT_NAME,
    ].filter(Boolean).length;

    if (configured !== 0 && configured !== 3) {
      context.addIssue({
        code: "custom",
        message:
          "GitHub token, Obsidian repository and vault name must be configured together",
      });
    }
  });

const parsedEnvironment = obsidianEnvironmentSchema.safeParse({
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  OBSIDIAN_REPO: process.env.OBSIDIAN_REPO,
  OBSIDIAN_BRANCH: process.env.OBSIDIAN_BRANCH,
  OBSIDIAN_VAULT_NAME: process.env.OBSIDIAN_VAULT_NAME,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid Obsidian environment variables: ${parsedEnvironment.error.issues
      .map((issue) => issue.message)
      .join("; ")}`,
  );
}

export const obsidianEnv = Object.freeze({
  ...parsedEnvironment.data,
  OBSIDIAN_BRANCH: parsedEnvironment.data.OBSIDIAN_BRANCH ?? "main",
});

export function isObsidianConfigured(): boolean {
  return Boolean(
    obsidianEnv.GITHUB_TOKEN &&
      obsidianEnv.OBSIDIAN_REPO &&
      obsidianEnv.OBSIDIAN_VAULT_NAME,
  );
}
