import type { ImportType } from "@/lib/schemas";

/**
 * Heuristically detect which import type a parsed JSON object represents,
 * based on its root fields. Used to warn users when the selected type does not
 * match the pasted/uploaded JSON. Pure + shared between client and server.
 */
export function detectImportType(value: unknown): ImportType | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;

  // Execution history: explicit type marker, or a records[] array.
  if (obj.type === "execution_history_reference") return "execution_history";
  if (Array.isArray(obj.records) && !("days" in obj) && !("courses" in obj)) {
    return "execution_history";
  }

  // Study plan: has days[] plus a start/end range.
  if (Array.isArray(obj.days) && "startDate" in obj && "endDate" in obj) {
    return "study_plan";
  }

  // Learning source catalog: has courses[] or catalogName / assessmentSources.
  if (
    Array.isArray(obj.courses) ||
    "catalogName" in obj ||
    Array.isArray(obj.assessmentSources)
  ) {
    return "learning_source";
  }

  // Workspace config: has a workspace object with core config fields.
  if (
    obj.workspace &&
    typeof obj.workspace === "object" &&
    !Array.isArray(obj.workspace)
  ) {
    const ws = obj.workspace as Record<string, unknown>;
    if ("dailyTargetMinutes" in ws || "startDate" in ws || "timezone" in ws) {
      return "workspace_config";
    }
  }
  if (Array.isArray(obj.examEvents)) return "workspace_config";

  return null;
}
