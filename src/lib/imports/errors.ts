/** Central error model for imports + time input. */
export type AppErrorCode =
  | "PARSE_ERROR"
  | "UNKNOWN_IMPORT_TYPE"
  | "SCHEMA_MISMATCH"
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "WORKSPACE_ACCESS_DENIED"
  | "RLS_DENIED"
  | "DATABASE_CONSTRAINT_ERROR"
  | "DUPLICATE_IMPORT"
  | "PARTIAL_IMPORT"
  | "TIME_RANGE_INVALID"
  | "TIME_RANGE_OVERLAP"
  | "UNKNOWN";

export interface PgLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const USER_MESSAGE: Record<AppErrorCode, string> = {
  PARSE_ERROR: "ไฟล์ JSON ไม่ถูกต้อง กรุณาตรวจสอบรูปแบบไฟล์",
  UNKNOWN_IMPORT_TYPE: "ไม่รู้จักรูปแบบไฟล์นี้ กรุณาตรวจสอบประเภทข้อมูล",
  SCHEMA_MISMATCH: "ประเภทที่เลือกไม่ตรงกับข้อมูลในไฟล์",
  VALIDATION_ERROR: "ข้อมูลในไฟล์ไม่ผ่านการตรวจสอบ",
  AUTH_REQUIRED: "กรุณาเข้าสู่ระบบก่อนดำเนินการ",
  WORKSPACE_ACCESS_DENIED:
    "ไม่สามารถเขียนข้อมูลใน Workspace นี้ได้ เนื่องจากบัญชีนี้ไม่มีสิทธิ์ กรุณาตรวจสอบสมาชิก Workspace หรือเข้าสู่ระบบใหม่",
  RLS_DENIED:
    "ไม่สามารถบันทึกข้อมูลได้ เนื่องจากบัญชีนี้ไม่มีสิทธิ์เขียนข้อมูลใน Workspace กรุณาตรวจสอบสิทธิ์หรือเข้าสู่ระบบใหม่",
  DATABASE_CONSTRAINT_ERROR:
    "ไม่สามารถบันทึกข้อมูลได้ เนื่องจากข้อมูลขัดกับข้อกำหนดของฐานข้อมูล",
  DUPLICATE_IMPORT: "พบข้อมูลซ้ำ ระบบได้ข้ามรายการที่ซ้ำแล้ว",
  PARTIAL_IMPORT: "นำเข้าไม่สมบูรณ์ ระบบได้ยกเลิกการบันทึกบางส่วนแล้ว",
  TIME_RANGE_INVALID: "ช่วงเวลาไม่ถูกต้อง",
  TIME_RANGE_OVERLAP: "ช่วงเวลาซ้อนกัน",
  UNKNOWN: "เกิดข้อผิดพลาด กรุณาลองใหม่",
};

export function userMessageFor(code: AppErrorCode): string {
  return USER_MESSAGE[code];
}

/** Map a Postgres / Supabase error to an application error code. */
export function classifyPgError(err: PgLikeError | null): AppErrorCode {
  if (!err) return "UNKNOWN";
  const msg = (err.message ?? "").toLowerCase();
  if (err.code === "42501" || msg.includes("row-level security")) {
    return "RLS_DENIED";
  }
  if (err.code === "23505") return "DUPLICATE_IMPORT";
  if (err.code === "23503" || err.code === "23502" || err.code === "23514") {
    return "DATABASE_CONSTRAINT_ERROR";
  }
  return "DATABASE_CONSTRAINT_ERROR";
}
