/**
 * Plan version lifecycle + immutability rules.
 *
 * A plan version is only editable while it is a `draft`. Once activated it is
 * immutable — the application never UPDATEs or DELETEs an active/archived
 * version; changing the plan means creating a NEW version with a
 * parent_version_id.
 */
export type PlanVersionStatus =
  | "draft" // being previewed before activation — editable
  | "active" // currently in effect — immutable
  | "superseded" // replaced by a newer version — immutable
  | "archived"; // manually archived — immutable

const EDITABLE: ReadonlySet<PlanVersionStatus> = new Set(["draft"]);

export function isPlanVersionEditable(status: PlanVersionStatus): boolean {
  return EDITABLE.has(status);
}

/**
 * Throw if a mutation is attempted on an immutable plan version.
 * Call this in any server action that would modify plan version content.
 */
export function assertPlanVersionImmutable(status: PlanVersionStatus): void {
  if (!isPlanVersionEditable(status)) {
    throw new Error(
      `ไม่สามารถแก้ไข Plan Version ที่มีสถานะ "${status}" ได้ — ต้องสร้างเวอร์ชันใหม่แทน`
    );
  }
}

export const PLAN_VERSION_STATUS_LABELS: Record<PlanVersionStatus, string> = {
  draft: "ฉบับร่าง",
  active: "ใช้งานอยู่",
  superseded: "ถูกแทนที่",
  archived: "เก็บถาวร",
};
