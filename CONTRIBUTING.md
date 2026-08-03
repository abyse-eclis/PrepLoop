# Contributing

ขอบคุณที่สนใจร่วมพัฒนา PrepLoop 🎉

## เริ่มต้น

```bash
npm install
cp .env.example .env.local   # ใส่ค่า Supabase ของคุณ
npm run dev
```

## ก่อนเปิด Pull Request

รันให้ผ่านทั้งหมด:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## แนวทาง

- โครงสร้างแบบ feature-oriented (`src/features/*`) และ logic กลางใน `src/lib/*`
- Logic ที่คำนวณได้ (calculations, dates, schemas) ควรมี unit test
- อย่าแก้ Plan Version ที่เปิดใช้แล้ว — สร้างเวอร์ชันใหม่เสมอ
- ห้าม commit ไฟล์ข้อสอบจริง, secret หรือข้อมูลส่วนตัว
- ใช้ภาษาไทยเป็นหลักใน UI

## Commit

เขียน commit message ให้สื่อความหมายชัดเจน
