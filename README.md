# PrepLoop

**Adaptive Study Planner** — เว็บวางแผนและติดตามการติวสอบ ที่ปรับแผนได้เมื่อทำตามไม่ไหวหรือพบจุดอ่อน

PrepLoop รับข้อมูลและแผนที่ถูกสร้างโดย ChatGPT (เป็น JSON) มาแสดงเป็นตารางเรียนตั้งแต่วันเริ่มต้นจนถึงวันสอบ
ผู้ใช้กรอกเวลาเรียนและผลจริงเอง ระบบคำนวณความสำเร็จรายวัน/สัปดาห์/เดือน สร้างงานทบทวน
และเมื่อจำเป็นจึงเรียก Claude Haiku เพื่อสร้าง **Recovery Plan** เป็นเวอร์ชันใหม่ (เวอร์ชันเดิมแก้ไม่ได้ เก็บประวัติเสมอ)

> ระบบนี้เป็นแบบผู้ใช้คนเดียว (single-user) ใน MVP แต่มี authentication + RLS เพื่อป้องกันข้อมูล

## Features

- 🔐 Supabase email/password auth + middleware ป้องกัน route + RLS ทุกตาราง
- 📥 Import JSON 3 ประเภท (Workspace Config / Learning Source Catalog / Full Study Plan) พร้อม validate ด้วย Zod และ preview
- 📄 อัปโหลดไฟล์แหล่งเรียนแบบ private (PDF/PNG/JPEG/JSON) เปิดผ่าน signed URL
- 🗓️ หน้า **Today** ใช้ง่ายที่สุด: กรอกเวลาหลายช่วง (เช่น `09:13–12:00` = 167 นาที), เริ่ม/พัก/เรียนต่อ/เรียนเสร็จ
- ⏭️ **งานค้าง / เรียนย้อนหลัง (carry-over)** — รายการของวันก่อนที่ยังเรียนไม่ครบถูกยกมาแสดงในหน้า Today
  จัดกลุ่มตามวันที่ตามแผน บอกว่าค้างมากี่วันและค้างอีกกี่นาที · `planned date` ไม่ถูกแก้ เวลาที่กรอกลงเป็นวันนี้
  (สถานะกลายเป็น “เรียนย้อนหลังแล้ว”) · ข้ามเวอร์ชันแผนได้ — งานค้างจาก v1 ยังโผล่หลังเปิดใช้ Recovery v2
- ⏭️ **ข้าม / ไม่เรียนแล้ว (skip)** — ตารางเปลี่ยนบ่อยจนงานค้างไม่ต้องเรียนแล้ว กด “ข้าม” รายตัว
  หรือ “ข้ามทั้งวัน” ก็ได้ · รายการที่ข้ามจะหลุดออกจากงานค้าง **และไม่ถูกนับในเป้าหมาย/Task %/Weighted %**
  (ข้ามแล้วไม่ตัดคะแนน) · เลิกข้ามได้ที่กล่อง “รายการที่ข้ามไว้” ในหน้า Today
- 🧮 คำนวณ Time / Task / Weighted completion, คะแนน pass/fail, accuracy, trend
- ♻️ **Immutable Plan Versions** — เปลี่ยนแผนต้องสร้างเวอร์ชันใหม่ พร้อม parent, effective range และ text diff
- 🤖 **Claude Haiku Recovery** พร้อม **mock fallback** เมื่อไม่มี API key (แจ้งชัดเจนว่าเป็น mock)
- 🔁 Review system แบบ spaced repetition (same day / 1 / 3 / 7 วัน / ปลายสัปดาห์ / ปลายเดือน)
- 📊 หน้า Progress รายวัน/สัปดาห์/เดือน (คำนวณจากข้อมูลจริง ไม่ใช้ chart library หนัก)
- 🕓 กรอกข้อมูลย้อนหลังได้ (ตั้งแต่ 1 ส.ค. 2026) สรุปคำนวณใหม่อัตโนมัติ
- ✍️ **Prompt Generator** ภาษาไทย ล็อกเฉพาะบทที่เรียนจบแล้ว (ไม่เรียก API)
- 🌙 Dark mode เท่านั้น, responsive (desktop/tablet/mobile)

## Screenshots

> _(placeholder — เพิ่มภาพหน้าจอ /today, /plan, /progress ภายหลัง)_

## Tech Stack

- **Next.js 15** (App Router) + **TypeScript** (strict)
- **Tailwind CSS** + UI primitives สไตล์ shadcn/ui (dark-only)
- **Supabase**: Auth, PostgreSQL, Storage
- **Zod** สำหรับ validation ของ form / API / JSON import
- **Anthropic SDK** (`@anthropic-ai/sdk`) — เรียกฝั่ง server เท่านั้น
- **Vitest** สำหรับ unit tests
- Deploy บน **Vercel**

## Local Setup

```bash
git clone <repo>
cd PrepLoop
npm install
cp .env.example .env.local   # ใส่ค่าจริงของคุณ
npm run dev                  # http://localhost:3000
```

Scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest
npm run build       # production build
```

## Supabase Setup

1. สร้าง Supabase project ใหม่
2. รัน migration (ตามลำดับ) ในไฟล์ `supabase/migrations/`:
   - `0001_init.sql` — ตาราง, index, foreign keys, triggers
   - `0002_rls.sql` — เปิด RLS + policies (ownership ผ่าน workspace)
   - `0003_storage.sql` — สร้าง bucket `study-sources` (private) + storage policies

   วิธีรัน:
   - **Supabase CLI**: `supabase db push` หรือ `supabase migration up`
   - หรือคัดลอกเนื้อหาแต่ละไฟล์ไปวางใน **SQL Editor** ของ dashboard แล้ว run ตามลำดับ

3. เปิดใช้ **Email/Password** provider ใน Authentication → Providers
   (ปิด email confirmation ได้เพื่อความสะดวกในการทดสอบ)

### Environment Variables

| ตัวแปร | คำอธิบาย |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role (server-only, ห้าม expose) |
| `ANTHROPIC_API_KEY` | (ไม่บังคับ) ไม่ใส่ = mock recovery |
| `ANTHROPIC_REVIEW_MODEL` | model สำหรับวิเคราะห์และสร้างแบบทบทวน (ค่าเริ่มต้น `claude-haiku-4-5-20251001`) |
| `ANTHROPIC_RECOVERY_MODEL` | ชื่อ model เช่น `claude-haiku-4-5-20251001` |
| `NEXT_PUBLIC_APP_URL` | URL ของแอป |
| `MAX_UPLOAD_SIZE_MB` / `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB` | ขนาดไฟล์สูงสุด |

### Storage Setup

- Bucket ชื่อ `study-sources` (private) ถูกสร้างโดย `0003_storage.sql` และ hardened เพิ่มใน `0004_source_files.sql`
- อัปโหลดหลายไฟล์พร้อมกันผ่าน server action ที่ validate MIME + นามสกุล + size, คำนวณ SHA-256 (dedupe เนื้อหาซ้ำ) และ cleanup object หาก DB insert ล้มเหลว
- storage key = `workspaces/{workspaceId}/learning-sources/{uuid}.{ext}` (ไม่ใช้ชื่อไฟล์ผู้ใช้เป็น key) — เก็บ `original_file_name`/`display_name` ไว้ในฐานข้อมูลเพื่อแสดงผล
- storage RLS ดึง workspace id จาก path ด้วย `storage_workspace_id()` และตรวจ `owns_workspace()`
- เปิด/ดาวน์โหลดไฟล์ผ่าน signed URL อายุ 10 นาที

### RLS Note

ทุกตารางข้อมูลผู้ใช้เปิด RLS และตรวจ ownership ผ่านฟังก์ชัน `owns_workspace(workspace_id)`
ตาราง immutable (เช่น `study_plan_versions`, `*_config_versions`, `import_history`) มีเฉพาะ policy
SELECT/INSERT/DELETE — ไม่มี update flow ในระดับ application สำหรับเนื้อหาเวอร์ชัน

### Anthropic Setup

- Recovery และ Review endpoint เรียก Claude จากฝั่ง server เท่านั้น
- อ่านชื่อ model จาก `ANTHROPIC_RECOVERY_MODEL` และ `ANTHROPIC_REVIEW_MODEL` (อย่า hardcode)
- ถ้าไม่ตั้ง `ANTHROPIC_API_KEY` ระบบจะใช้ **mock recovery** แบบ rule-based และแสดงป้าย “MOCK (ไม่ใช่ AI จริง)”

## Vercel Deployment

1. Import repository เข้า Vercel
2. ตั้งค่า Environment Variables ตามตารางด้านบน
3. Deploy (Next.js ถูกตรวจจับอัตโนมัติ)
4. ตั้ง `NEXT_PUBLIC_APP_URL` ให้ตรงกับ domain จริง

## JSON Import Examples

ดูตัวอย่างในโฟลเดอร์ [`examples/`](./examples):

- `workspace-config.example.json`
- `learning-source-catalog.example.json`
- `study-plan.example.json` (7 วัน)
- `recovery-plan.example.json`

ลำดับการใช้งาน: Import Workspace Config → Import Learning Source → (อัปโหลดไฟล์) → Import Study Plan → เปิดใช้ Plan V1 ที่หน้า `/plan`

ข้อมูลย้อนหลังวันที่ 1–2 ส.ค. 2026 กรอกได้ที่หน้า `/history` (เลือกวันที่ แล้วเพิ่ม session/ผลสอบ)

## Known MVP Limitations

- ผู้ใช้คนเดียว ไม่รองรับ multi-tenant / การแชร์ / social features
- ไม่มี AI chatbot และไม่สร้างโจทย์ผ่าน API (ใช้ Prompt Generator ให้ไป copy เอง)
- ไม่เรียก Claude ทุกครั้งที่เปิดหน้า — เรียกเฉพาะตอนขอ Recovery
- Timer เป็นแบบ Start/Pause/Resume/Complete + กรอกเวลาเอง ไม่มี real-time timer ละเอียด
- งานค้างมองย้อนหลังสูงสุด 30 วัน และแสดงไม่เกิน 60 รายการ (ที่เก่ากว่านั้นดูได้ที่หน้า `/history`)
- Diff ของแผนเป็น text list ไม่ใช่ visual diff
- Progress ใช้ card + progress bar ไม่มี chart library
- Config แก้ผ่านการ import เวอร์ชันใหม่เท่านั้น ไม่มี form แก้ทีละช่อง
- Rate limit ของ recovery เป็นแบบ in-memory ง่าย ๆ (ต่อ instance)

## License

[MIT](./LICENSE)
