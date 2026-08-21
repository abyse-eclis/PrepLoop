/** Keep this value aligned with `experimental.serverActions.bodySizeLimit`. */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORT_SIZE_LABEL = "4 MB";

export function importTextSize(raw: string): number {
  return new TextEncoder().encode(raw).byteLength;
}

export function importTooLargeMessage(): string {
  return `ไฟล์มีขนาดใหญ่เกินกว่าที่ระบบรองรับ กรุณาใช้ไฟล์ขนาดไม่เกิน ${MAX_IMPORT_SIZE_LABEL}`;
}
