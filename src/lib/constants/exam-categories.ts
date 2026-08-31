export interface ExamCategoryOption {
  id: string;
  label: string;
  subjects: string[];
}

export const EXAM_CATEGORIES: ExamCategoryOption[] = [
  {
    id: "A-Level",
    label: "A-Level",
    subjects: [
      "คณิตศาสตร์ 1",
      "คณิตศาสตร์ 2",
      "ภาษาอังกฤษ",
      "ฟิสิกส์",
      "เคมี",
      "ชีววิทยา",
      "ภาษาไทย",
      "สังคมศึกษา",
      "อื่น ๆ",
    ],
  },
  {
    id: "TGAT",
    label: "TGAT",
    subjects: ["TGAT1", "TGAT2", "TGAT3", "อื่น ๆ"],
  },
  {
    id: "TPAT",
    label: "TPAT",
    subjects: ["TPAT1", "TPAT2", "TPAT3", "TPAT4", "TPAT5", "อื่น ๆ"],
  },
  {
    id: "อื่น ๆ",
    label: "อื่น ๆ",
    subjects: ["อื่น ๆ"],
  },
];

export function getSubjectsForCategory(categoryId: string): string[] {
  const cat = EXAM_CATEGORIES.find((c) => c.id === categoryId);
  return cat ? cat.subjects : ["อื่น ๆ"];
}

export function displayCustomSubject(
  subject: string,
  customSubject?: string | null
): string {
  if (subject === "อื่น ๆ" && customSubject?.trim()) {
    return customSubject.trim();
  }
  return subject;
}

export function formatCustomStudyLabel(
  category: string,
  subject: string,
  customSubject?: string | null
): string {
  const effSubj = displayCustomSubject(subject, customSubject);
  if (category === "อื่น ๆ") {
    return effSubj;
  }
  return `${category} · ${effSubj}`;
}
