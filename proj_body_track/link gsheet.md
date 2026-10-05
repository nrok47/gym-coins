google docs
https://docs.google.com/spreadsheets/d/1mq6XwARBkNg3dk-7_9FgOumrz4oymGkNUnN2MsTf9XU/edit?gid=1779562902#gid=1779562902

เว็บแอป
URL
https://script.google.com/macros/s/AKfycbyKbiPjTzC_zTMn9ZI42xizLba2p2U6ayUciIyqQIt1EEBuL6DlDWU3O8FZi5-C2Q/exec

รหัสสคริปต์ Apps Script
1U-e0qJGA0vA1H6DBy3TEHT6X2-axiJrVQrTzfQbCdyyjAH8vh9DVwSpv

## deploy (clasp)

โฟลเดอร์ `body files/` เป็น clasp project แล้ว (.clasp.json + appsscript.json)

```
cd "body files"
npx clasp push -f
npx clasp create-deployment -i AKfycbyKbiPjTzC_zTMn9ZI42xizLba2p2U6ayUciIyqQIt1EEBuL6DlDWU3O8FZi5-C2Q -d "ข้อความ version"
```

ต้องใช้ deployment id เดิมเสมอ URL จะได้ไม่เปลี่ยน (อย่า `clasp deploy` เปล่าๆ — ได้ URL ใหม่ + กิน version quota)

deploy ล่าสุด: **5 ต.ค. 69 — @7** "v9 ชีต Water + ปุ่มกดน้ำ + ภารกิจปิด window 18:00 + baseline 75.1"
ก่อนหน้า: 8 ส.ค. 69 @4 "v8 streak fix + รางวัลไม่ใช่อาหาร + เวทรายสัปดาห์ + เฉลี่ย 7 วัน"

## กติกา coin (สรุป)

- ภารกิจรายวันกดได้วันละครั้ง, เวทเทรนนิ่งเป็นโควตา 3 ครั้ง/สัปดาห์
- "ชั่งวันนี้" ระบบให้เอง กดไม่ได้ — ได้เมื่อบันทึกผลชั่งของวันนี้
- "น้ำครบ 2.5 ลิตร" ระบบให้เอง กดไม่ได้ — ได้เมื่อยอดในชีต Water ของวันนี้ถึง 2,500 ml
- "ปิด window 18:00" กดเองได้ แต่ก่อน 18:00 (เวลาไทย) จะโดนปฏิเสธ
- streak เดินต่อเฉพาะเมื่อเมื่อวานทำภารกิจ ≥1 อย่าง เว้นวันเมื่อไหร่ = 0
- ได้จริงราว 4-9 coin/วัน → ~170/เดือน ราคาเบียร์ 150 = ประมาณเดือนละครั้ง

## โครงชีต

| ชีต | ใคร/อะไรเขียน |
|-----|---------------|
| Log | แท็บ "ชั่ง" ในเว็บแอป + กรอกมือ |
| Water | แท็บ "น้ำ" (ปุ่มกด +500/+250/เกลือแร่/กาแฟดำ) — สร้างเองครั้งแรกที่เปิดแท็บ |
| Drinks | แท็บ "ดื่ม" |
| Coins | แท็บ "ภารกิจ" (append อย่างเดียว) — ยอด coin = ผลรวมคอลัมน์ C |
| Clinic / Blood | กรอกมือ |
| Dashboard | สูตร + กราฟ |

## v9 — 5 ต.ค. 69 (รอบ IF 18/6)

เหตุ: 4 ต.ค. 69 ชั่งใหม่ได้ BMI 26.0 / ไขมัน 24.6% / VF 12 / น้ำ 51.7% / กล้ามเนื้อ 53.77
→ น้ำหนัก **75.1 กก.** (ถอดจาก BMI x 1.70^2 ตรงกับ lean/(1-ไขมัน%))
เทียบ: baseline เดิม 73.9 (7 ส.ค.) · จุดต่ำสุดที่เคยทำได้ 70.8 (30 พ.ค.) · เครื่องคลินิก 72.24 (6 พ.ค.)

เพิ่ม:
- `CFG.BASELINE` 73.9 → **75.1** (progress bar จะไม่ติดลบ)
- `CFG.WATER_TARGET_ML = 2500` / `IF_CLOSE_HOUR = 18`
- ชีต **Water** + `addWater()` / `getWaterData()` / `waterToday_()` — สร้างเองแบบ lazy เหมือน Drinks
- แท็บ "น้ำ" ในเว็บแอป: หลอดความคืบหน้า + ปุ่มกด 4 ปุ่ม + กราฟ 7 วัน + รายการวันนี้
- ภารกิจ `m9` น้ำครบ (auto) และ `m8` ปิด window 18:00 (กดก่อนเวลาไม่ได้)
- เมนู "อัปเดต baseline ในชีต Dashboard" = `refreshBaselineInSheet()` เขียนแค่ B11

**ทำไมเป้าน้ำ 2.5 ล. ไม่ใช่ 3 ล.** — Gemini แนะ 3 ล. เพราะอ่านว่า "น้ำ 51.7% ต่ำกว่าเกณฑ์"
แต่ผู้ชายปกติ total body water 50-60% → 51.7% ไม่ได้ขาดน้ำ มันเป็นเงาของไขมัน 24.6%
(โน้ตใน D1 ของชีต Log เขียนไว้เองแล้วตั้งแต่ ส.ค.: ไขมัน% กับ น้ำ% มาจากค่าความต้านทานตัวเดียวกัน
จึงเคลื่อนสวนทางกันเสมอ) ไขมันลง เลข % จะขึ้นเอง

**ยังไม่ได้รัน `testCoinLogic`** — `clasp run-function` ใช้ไม่ได้กับ project นี้ (ไม่มี GCP project ผูก
ขึ้น NOT_FOUND) ต้องเปิด editor กด Run เอง 1 ครั้ง · syntax ผ่าน `node --check` ทั้ง Code.gs และ <script> ใน index.html
