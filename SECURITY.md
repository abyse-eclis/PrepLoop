# Security Policy

## Reporting

หากพบช่องโหว่ด้านความปลอดภัย กรุณาเปิด issue แบบส่วนตัว หรือติดต่อผู้ดูแล repository
อย่าเปิดเผยรายละเอียดต่อสาธารณะก่อนได้รับการแก้ไข

## หลักการด้านความปลอดภัยของ PrepLoop

- เปิด Row Level Security (RLS) ทุกตารางที่มีข้อมูลผู้ใช้ ผู้ใช้เข้าถึงได้เฉพาะข้อมูลของตนเอง
- ตรวจ ownership ฝั่ง server ทุกครั้ง ไม่เชื่อ `user_id` ที่ส่งมาจาก client
- เรียก Anthropic API จากฝั่ง server เท่านั้น
- ไม่ expose secret ใด ๆ (service role key, Anthropic API key, private file URL) ใน client bundle
- ไฟล์แหล่งเรียนเก็บใน private storage bucket เปิดผ่าน signed URL อายุสั้นเท่านั้น
- จำกัดชนิดไฟล์ (PDF, PNG, JPEG, JSON) และขนาดไฟล์ ตรวจทั้ง client และ server
- Sanitize ชื่อไฟล์เพื่อป้องกัน path traversal
- Validate ทุก input ด้วย Zod
- ไม่ commit ไฟล์ข้อสอบจริง, API key หรือข้อมูลส่วนตัวลง repository สาธารณะ

## ขอบเขต MVP

ระบบนี้ออกแบบสำหรับผู้ใช้คนเดียว (single-user) แม้จะมี authentication และ RLS
ยังไม่รองรับ multi-tenant หรือการแชร์ข้อมูลระหว่างผู้ใช้
