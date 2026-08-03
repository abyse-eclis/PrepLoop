import { z } from "zod";
import { workspaceConfigSchema } from "./workspace-config";
import { learningSourceCatalogSchema } from "./learning-source";
import { studyPlanSchema } from "./study-plan";
import { recoveryPlanSchema } from "./recovery";

export * from "./common";
export * from "./workspace-config";
export * from "./learning-source";
export * from "./study-plan";
export * from "./recovery";

export type ImportType =
  | "workspace_config"
  | "learning_source"
  | "study_plan";

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  workspace_config: "Workspace Config",
  learning_source: "Learning Source Catalog",
  study_plan: "Full Study Plan",
};

export function schemaForImportType(type: ImportType): z.ZodTypeAny {
  switch (type) {
    case "workspace_config":
      return workspaceConfigSchema;
    case "learning_source":
      return learningSourceCatalogSchema;
    case "study_plan":
      return studyPlanSchema;
  }
}

export interface ParseIssue {
  path: string;
  message: string;
}

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  issues: ParseIssue[];
}

/**
 * Parse raw JSON text against a schema, returning structured issues with
 * the failing path — never persist partial data on failure.
 */
export function parseJsonWithSchema<S extends z.ZodTypeAny>(
  raw: string,
  schema: S
): ParseResult<z.infer<S>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      ok: false,
      issues: [
        {
          path: "(root)",
          message: `JSON ไม่ถูกต้อง: ${(e as Error).message}`,
        },
      ],
    };
  }
  return validateWithSchema(parsed, schema);
}

export function validateWithSchema<S extends z.ZodTypeAny>(
  value: unknown,
  schema: S
): ParseResult<z.infer<S>> {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, data: result.data, issues: [] };
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.length ? issue.path.join(".") : "(root)",
      message: issue.message,
    })),
  };
}
