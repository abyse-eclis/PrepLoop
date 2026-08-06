const SUBJECT_LABELS: Record<string, string> = {
  MATHEMATICS: "คณิตศาสตร์",
  MATH: "คณิตศาสตร์",
  MULTI_SUBJECT: "หลายวิชา",
  A_LEVEL_ENGLISH: "A-Level ภาษาอังกฤษ",
  A_LEVEL_MATH_1: "A-Level คณิตศาสตร์ 1",
  A_LEVEL_MATH_2: "A-Level คณิตศาสตร์ 2",
  TGAT1: "TGAT1 การสื่อสารภาษาอังกฤษ",
  TGAT2: "TGAT2 การคิดอย่างมีเหตุผล",
  TGAT3: "TGAT3 สมรรถนะการทำงาน",
  TPAT3: "TPAT3 ความถนัดด้านวิทยาศาสตร์ เทคโนโลยี และวิศวกรรมศาสตร์",
  PHYSICS: "ฟิสิกส์",
  PHY: "ฟิสิกส์",
  CHEMISTRY: "เคมี",
  BIOLOGY: "ชีววิทยา",
  ENGLISH: "ภาษาอังกฤษ",
  THAI: "ภาษาไทย",
  SOCIAL: "สังคมศึกษา",
};

export function subjectLabel(code: string | null | undefined): string {
  if (!code) return "ไม่ระบุวิชา";
  const label = SUBJECT_LABELS[code];
  if (label) return label;
  if (process.env.NODE_ENV === "development") {
    console.warn(`[subjects] missing display label for ${code}`);
  }
  return code
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => (/^(tgat|tpat|alevel|level|math)\d*$/i.test(part) ? part.toUpperCase() : part[0]!.toUpperCase() + part.slice(1)))
    .join(" ");
}

export function subjectOptions(codes: string[]): Array<{ value: string; label: string }> {
  return codes.map((code) => ({ value: code, label: subjectLabel(code) }));
}
