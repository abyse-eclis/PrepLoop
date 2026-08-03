import type { AssessmentType } from "@/lib/schemas/common";

export interface PromptGeneratorInput {
  subject: string;
  courseCode?: string | null;
  assessmentType: AssessmentType;
  completedLessons: Array<{ lessonNumber: string; title: string }>;
  coveredTopics: string[];
  questionCount: number;
  difficultyDistribution?: { easy: number; medium: number; hard: number };
  passingPercentage: number;
}

/**
 * Build a detailed Thai prompt that locks question generation to lessons the
 * learner has ALREADY completed. This does NOT call any API — it produces text
 * the user can copy into ChatGPT/Claude.
 */
export function buildAssessmentPrompt(input: PromptGeneratorInput): string {
  const {
    subject,
    courseCode,
    assessmentType,
    completedLessons,
    coveredTopics,
    questionCount,
    difficultyDistribution,
    passingPercentage,
  } = input;

  if (completedLessons.length === 0) {
    return [
      "ไม่สามารถสร้างชุดข้อสอบได้ เนื่องจากยังไม่มีบทเรียนที่เรียนจบในขอบเขตนี้",
      "กรุณาบันทึกความคืบหน้าการเรียนก่อน แล้วจึงสร้าง Prompt อีกครั้ง",
    ].join("\n");
  }

  const lessonList = completedLessons
    .map((l) => `- คลิป ${l.lessonNumber}: ${l.title}`)
    .join("\n");

  const topicList =
    coveredTopics.length > 0
      ? coveredTopics.map((t) => `- ${t}`).join("\n")
      : "- (ใช้เฉพาะหัวข้อที่ปรากฏในบทเรียนด้านบนเท่านั้น)";

  const diff = difficultyDistribution ?? { easy: 40, medium: 40, hard: 20 };

  const typeLabel: Record<AssessmentType, string> = {
    diagnostic: "แบบทดสอบวินิจฉัย (Diagnostic)",
    quiz: "แบบทดสอบย่อย (Quiz)",
    exercise: "แบบฝึกหัด (Exercise)",
    mock: "ข้อสอบเสมือนจริง (Mock)",
  };

  return `คุณคือผู้ช่วยออกข้อสอบภาษาไทยที่เข้มงวดเรื่องขอบเขตเนื้อหา

# บริบท
- วิชา: ${subject}${courseCode ? `\n- คอร์ส: ${courseCode}` : ""}
- ประเภทชุดข้อสอบ: ${typeLabel[assessmentType]}
- จำนวนข้อ: ${questionCount}
- เกณฑ์ผ่าน: ${passingPercentage}%
- สัดส่วนความยาก: ง่าย ${diff.easy}% / กลาง ${diff.medium}% / ยาก ${diff.hard}%

# บทเรียนที่ผู้เรียน "เรียนจบแล้ว" (ใช้ได้เท่านี้เท่านั้น)
${lessonList}

# หัวข้อที่ครอบคลุม
${topicList}

# ข้อห้ามเด็ดขาด
1. ใช้เฉพาะเนื้อหาจากบทเรียนที่ระบุว่าเรียนจบแล้วเท่านั้น
2. ห้ามใช้บทเรียน/คลิปที่อยู่หลังช่วงที่เรียนจบ
3. ห้ามใช้สูตรหรือวิธีการจากคอร์ส/บทถัดไปที่ยังไม่ได้เรียน
4. ห้ามเดาเนื้อหาย่อยที่ไม่มีในบริบทด้านบน
5. หากข้อมูลไม่พอสำหรับสร้างข้อที่น่าเชื่อถือ ให้แจ้งชัดเจนว่า "ไม่สามารถสร้างข้อนี้ได้" แทนการเดา
6. ทุกข้อต้องระบุบทเรียนหรือหัวข้ออ้างอิงกำกับ
7. ตรวจสอบขอบเขตของทุกข้อก่อนส่งคำตอบ

# รูปแบบผลลัพธ์
- แยกเป็น 2 ส่วนชัดเจน:
  ## ส่วนที่ 1: โจทย์ (Question Section)
  - แสดงโจทย์ทั้งหมด ${questionCount} ข้อ โดยไม่มีเฉลยแทรก
  - แต่ละข้อกำกับ [อ้างอิง: คลิป/หัวข้อ] และ [ความยาก]
  ## ส่วนที่ 2: เฉลยละเอียด (Detailed Solutions Section)
  - วางเฉลยทั้งหมดไว้ท้ายชุด
  - เฉลยทีละขั้นตอน อธิบายวิธีคิด
  - ระบุคำตอบสุดท้ายให้ชัดเจน
- เพิ่ม Scoring Guide และเกณฑ์ผ่าน (${passingPercentage}%) ท้ายสุด

เริ่มสร้างชุดข้อสอบตามเงื่อนไขข้างต้น`;
}
