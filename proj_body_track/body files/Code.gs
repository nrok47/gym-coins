/**
 * Body Composition Tracker v5 — CK
 *
 * ไฟล์นี้คู่กับ index.html (สร้างเป็นไฟล์ HTML ชื่อ "index" ใน Apps Script)
 *
 * ติดตั้ง:
 *   1. วางไฟล์นี้ทับ Code.gs
 *   2. เพิ่มไฟล์ใหม่: + > HTML > ตั้งชื่อ index > วางเนื้อหา index.html
 *   3. Run: setupTracker (ครั้งเดียว)
 *   4. Deploy > New deployment > Web app > Execute as: Me / Access: Only myself > Deploy
 *
 * เปลี่ยนจาก v4:
 *   - เพิ่มชีต Drinks บันทึกการดื่มทีละครั้งเป็น ml (แม่นกว่านับ "ครั้ง")
 *   - Log คอลัมน์ G เปลี่ยนเป็นสูตรรวม ml อัตโนมัติ ไม่ต้องกรอกเอง
 *   - เพิ่ม Web App สำหรับบันทึก/ดูผลจากมือถือ
 */

const CFG = {
  HEIGHT_M: 1.70,
  MILESTONE: 70.8,        // จุดต่ำสุดที่เพิ่งทำได้ (30 พ.ค. 69)
  TARGET_WEIGHT: 69.8,
  TARGET_VF: 10,
  BASELINE: 75.1,         // 4 ต.ค. 69 — ถอดจาก InBody: BMI 26.0 x 1.70^2 (ของเดิม 73.9 = 7 ส.ค. 69)
  // น้ำเปล่า: 2.5 ล./วัน พอแล้ว ไม่ต้อง 3 ล. — น้ำ% ในเครื่องชั่งเป็นเงาของไขมัน% ไม่ใช่สัญญาณขาดน้ำ
  WATER_TARGET_ML: 2500,
  WATER_BOTTLE_ML: 500,
  IF_CLOSE_HOUR: 18,      // ปิด eating window — IF 18/6 แบบ 12:00-18:00
  KCAL_PER_ML: 0.43,      // เบียร์ ~5% ราว 43 kcal/100ml (ค่า default ถ้าไม่ระบุชนิด)
  KCAL_BY_TYPE: { 'เบียร์': 0.43, 'ไวน์': 0.85, 'เหล้า': 2.30 },
  KCAL_PER_KG_FAT: 7700,
  L: 500
};

const LOG = 'Log', DRINKS = 'Drinks', CLINIC = 'Clinic', BLOOD = 'Blood', DASH = 'Dashboard',
      COINS = 'Coins', WATER = 'Water';

/* ═══════════════════════════ Coin RPG (ยุบจากแอพ gym-coins) ═══════════════════════════ */

/* ภารกิจ — auto = ระบบตรวจจากชีตให้ กดเองไม่ได้ | quota = โควตาต่อสัปดาห์ (ไม่ใช่รายวัน) */
const MISSIONS = [
  { id: 'm0', icon: '⚖️', name: 'ชั่งวันนี้',          desc: 'ระบบให้เองเมื่อบันทึกผลชั่ง', coin: 1, auto: true },
  { id: 'm9', icon: '💧', name: 'น้ำครบ 2.5 ลิตร',     desc: 'ระบบให้เองเมื่อยอดน้ำวันนี้ถึงเป้า', coin: 1, auto: true },
  { id: 'm8', icon: '🕖', name: 'ปิด window 18:00',    desc: 'มื้อสุดท้ายก่อน 18:00 — กดได้หลัง 18:00', coin: 2 },
  { id: 'm1', icon: '🚶', name: 'เดิน 7,000 ก้าว',    desc: 'ก้าวเดินขั้นต่ำ (Xiaomi Band)', coin: 1 },
  { id: 'm2', icon: '🏃', name: 'เดิน 10,000 ก้าว',   desc: 'ก้าวเดิน full day bonus',       coin: 2 },
  { id: 'm3', icon: '🧘', name: 'ขยับ 20 นาที',       desc: 'เดินเร็ว / ยืดเส้น / คาร์ดิโอเบาๆ', coin: 1 },
  { id: 'm7', icon: '🏋️', name: 'เวทเทรนนิ่ง',        desc: 'โควตา 3 ครั้ง/สัปดาห์ — ตัวกันกล้ามหายช่วง cut', coin: 2, quota: 3 },
  { id: 'm4', icon: '🏸', name: 'แบดมินตัน 1 session', desc: 'เล่นกับทีม SNOWITE',           coin: 3 },
  { id: 'm5', icon: '🚫', name: 'งดขนมหวาน 1 วัน',    desc: 'ไม่กินของหวาน/น้ำตาลทั้งวัน',  coin: 2 },
  { id: 'm6', icon: '🍺', name: 'ไม่ดื่ม 1 วัน',       desc: 'กดได้เมื่อวันนี้ไม่มีแถวในชีต Drinks', coin: 2 },
];

/* ของรางวัล — ของกินเหลือ 2 ช่องและตั้งราคาระดับ "เก็บทั้งเดือน"
 * ที่เหลือเป็นรางวัลที่ไม่ย้อนกลับมาทำลาย metric ตัวเอง */
const REWARDS = [
  { id: 'r1', icon: '🎮', name: 'เล่นเกมยาว 1 ชม.', cost: 15,  desc: 'ไม่ต้องรู้สึกผิด' },
  { id: 'r2', icon: '😴', name: 'วันพักเต็มวัน',    cost: 40,  desc: 'ไม่ออกกำลัง ไม่รู้สึกผิด streak ไม่ขาด' },
  { id: 'r3', icon: '💆', name: 'นวด 1 ชม.',        cost: 70,  desc: 'ให้รางวัลกล้ามที่ทำงาน' },
  { id: 'r4', icon: '🏸', name: 'ของเข้าชุดแบด',    cost: 90,  desc: 'ลูก / กริป / เอ็น' },
  { id: 'r5', icon: '🍗', name: 'ไก่ทอด',           cost: 90,  desc: 'เก็บ ~3 สัปดาห์ ถึงจะได้' },
  { id: 'r6', icon: '🍺', name: 'เบียร์เย็นๆ',      cost: 150, desc: 'เก็บทั้งเดือน = เดือนละครั้ง' },
];

function todayStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
}
function yesterdayStr_() {
  return Utilities.formatDate(new Date(Date.now() - 86400000), 'Asia/Bangkok', 'yyyy-MM-dd');
}
function weekKey_() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', "YYYY-'W'ww");
}

/* ประวัติ coin เก็บในชีต Coins (1 แถว = 1 รายการ ไม่จำกัดย้อนหลัง)
 * ยอด coin = ผลรวมคอลัมน์ C ไม่เก็บซ้ำที่อื่น จะได้ไม่มีทางเพี้ยนกัน
 * ScriptProperties เก็บแค่สถานะรายวัน (streak / ภารกิจที่กดไปแล้ววันนี้) */

function coinSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(COINS);
  if (!sh) {
    sh = ss.insertSheet(COINS);
    header_(sh, ['วันเวลา', 'รายการ', 'coin'], '#f57f17');
    sh.getRange('A2:A').setNumberFormat('d mmm yy HH:mm');
    sh.getRange('C2:C').setNumberFormat('+0;-0;0');
    sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 320); sh.setColumnWidth(3, 80);
    sh.setConditionalFormatRules([
      rule_(sh.getRange('C2:C'), 'lt', 0, '#ffebee', '#b71c1c'),
      rule_(sh.getRange('C2:C'), 'gt', 0, '#e8f5e9', '#1b5e20')
    ]);
    sh.getRange('A1').setNote('ยอด coin คือผลรวมคอลัมน์ C — แก้ยอดด้วยการเพิ่มแถวปรับยอด ไม่ต้องไปแก้แถวเก่า');
  }
  return sh;
}

/** ยอดคงเหลือ = ผลรวมคอลัมน์ coin ทั้งชีต */
// ponytail: อ่านทั้งคอลัมน์ทุกครั้ง — พอถึงหลักหมื่นแถวค่อยเก็บ balance cache ไว้ใน ScriptProperties
function coinBalance_() {
  const sh = coinSheet_();
  if (sh.getLastRow() < 2) return 0;
  return sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues()
    .reduce((s, r) => s + (Number(r[0]) || 0), 0);
}

function appendCoin_(desc, coin) {
  coinSheet_().appendRow([new Date(), desc, coin]);
  SpreadsheetApp.flush();
}

/** n รายการล่าสุด ใหม่อยู่บน */
function coinHistory_(n) {
  const sh = coinSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - n + 1);
  return sh.getRange(start, 1, last - start + 1, 3).getValues().reverse().map(r => ({
    date: r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Bangkok', 'd MMM') : '',
    desc: String(r[1]),
    coin: Number(r[2]) || 0
  }));
}

/** สถานะรายวัน/รายสัปดาห์ — รีเซ็ตภารกิจ + เดิน streak เองเมื่อขึ้นวันใหม่ */
function coinDay_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('coinDay');
  const s = raw ? JSON.parse(raw)
                : { streak: 0, lastReset: '', doneMissions: [], weekKey: '', weekDone: {} };
  if (!s.weekDone) { s.weekKey = ''; s.weekDone = {}; }     // ของเก่าก่อนมีโควตารายสัปดาห์
  const t = todayStr_();
  let dirty = false;

  if (s.lastReset !== t) {
    // streak เดินได้เฉพาะเมื่อวันที่บันทึกไว้คือ "เมื่อวาน" จริงๆ — เว้นไปหลายวันแล้วมาเปิด = ขาด
    s.streak = (s.lastReset === yesterdayStr_() && s.doneMissions.length) ? s.streak + 1 : 0;
    s.doneMissions = [];
    s.lastReset = t;
    dirty = true;
  }
  const wk = weekKey_();
  if (s.weekKey !== wk) { s.weekKey = wk; s.weekDone = {}; dirty = true; }

  if (dirty) props.setProperty('coinDay', JSON.stringify(s));
  return s;
}

function putCoinDay_(s) {
  PropertiesService.getScriptProperties().setProperty('coinDay', JSON.stringify(s));
}

/** วันนี้มีบันทึกการดื่มในชีต Drinks ไหม — จุดเชื่อมระหว่างสองแอพ */
function drankToday_() {
  const sh = drinkSheet_();
  const t = todayStr_();
  return sh.getRange(2, 1, CFG.L - 1, 1).getValues()
    .some(r => r[0] instanceof Date && Utilities.formatDate(r[0], 'Asia/Bangkok', 'yyyy-MM-dd') === t);
}

/** ข้อมูลหน้า RPG + รายการภารกิจ/ของรางวัล (นิยามอยู่ฝั่ง server ฝั่งเดียว) */
function getCoinData(histN) {
  const s = coinDay_();
  return {
    coins: coinBalance_(), streak: s.streak,
    doneMissions: s.doneMissions,
    weekDone: s.weekDone,
    history: coinHistory_(histN || 10),
    histN: histN || 10,
    missions: MISSIONS, rewards: REWARDS
  };
}

/** ให้ coin ภารกิจ 1 ตัว — ใช้ร่วมกันทั้งกดเองและระบบให้เอง
 *  คืน true ถ้าให้จริง, false ถ้าเต็มโควตา/ทำไปแล้ว (ไม่ throw จะได้เรียกจาก addWeighIn ได้) */
function awardMission_(id) {
  const m = MISSIONS.filter(x => x.id === id)[0];
  if (!m) throw new Error('ไม่รู้จักภารกิจนี้');
  const s = coinDay_();
  if (m.quota) {
    if ((s.weekDone[id] || 0) >= m.quota) return false;
    s.weekDone[id] = (s.weekDone[id] || 0) + 1;
  } else {
    if (s.doneMissions.indexOf(id) > -1) return false;        // กันกดซ้ำ/สองเครื่อง
    s.doneMissions.push(id);
  }
  putCoinDay_(s);
  appendCoin_(m.icon + ' ' + m.name, m.coin);
  return true;
}

function completeMission(id) {
  const m = MISSIONS.filter(x => x.id === id)[0];
  if (!m) throw new Error('ไม่รู้จักภารกิจนี้');
  if (m.auto) throw new Error('ภารกิจนี้ระบบให้เอง กดเองไม่ได้ — ' + m.desc);
  if (id === 'm6' && drankToday_()) throw new Error('วันนี้มีบันทึกการดื่มในชีตแล้ว — ภารกิจนี้ไม่ผ่าน');
  // กดก่อนเวลาปิด window = ยังไม่รู้ว่าปิดได้จริง ต้องรอให้ผ่าน 18:00 ไปก่อน
  if (id === 'm8') {
    const h = Number(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'H'));
    if (h < CFG.IF_CLOSE_HOUR)
      throw new Error('ยังไม่ถึง ' + CFG.IF_CLOSE_HOUR + ':00 — กดได้เมื่อปิด window แล้วจริง');
  }
  awardMission_(id);
  return getCoinData();
}

function redeemReward(id) {
  const r = REWARDS.filter(x => x.id === id)[0];
  if (!r) throw new Error('ไม่รู้จักของรางวัลนี้');
  if (coinBalance_() < r.cost) throw new Error('coin ไม่พอ');
  appendCoin_('🏪 แลก ' + r.name, -r.cost);
  return getCoinData();
}

/** ตั้งยอด coin เอง — ลงเป็นแถวปรับยอด ประวัติเดิมไม่ถูกแตะ */
function setCoins(n) {
  const v = Math.round(Number(n));
  if (!isFinite(v) || v < 0) throw new Error('ใส่จำนวนเต็มไม่ติดลบ');
  const diff = v - coinBalance_();
  if (diff !== 0) appendCoin_('⚙️ ปรับยอดเป็น ' + v, diff);
  return getCoinData();
}

/* ═══════════════════════════ Web App ═══════════════════════════ */

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Body Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** ชีตที่ต้องมีข้อมูลเดิมอยู่แล้ว — ไม่สร้างให้ เพราะสร้างใหม่ = ข้อมูลหาย */
function mustSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('ยังไม่มีชีต "' + name + '" — เปิดชีตแล้วรันเมนู 📊 Body Tracker > ติดตั้ง / รีเซ็ตชีต');
  return sh;
}

/** ชีต Drinks — สร้างเองถ้ายังไม่มี (ชีตเวอร์ชันเก่ายังไม่มีชีตนี้)
 *  ponytail: สร้างตรงนี้แทนที่จะบังคับรัน setupTracker ซึ่งล้างชีต Log ทิ้งด้วย */
function drinkSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(DRINKS);
  if (!sh) buildDrinks_(sh = ss.insertSheet(DRINKS));
  return sh;
}

/** ชีต Water — สร้างเองถ้ายังไม่มี (ชีตเดิมไม่มี) เหมือน Drinks จะได้ไม่ต้องรัน setupTracker
 *  ที่ไม่ยุบรวมกับ Drinks: Drinks คือของที่ "เสียแคล" Water คือของที่ "ต้องให้ครบ" คนละทิศกัน */
function waterSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(WATER);
  if (!sh) buildWater_(sh = ss.insertSheet(WATER));
  return sh;
}

/** ยอดน้ำวันนี้ (ml) — นับทุกชนิดที่ไม่มีแคล (น้ำเปล่า/เกลือแร่/กาแฟดำ/ชา) */
function waterToday_() {
  const sh = waterSheet_();
  const t = todayStr_();
  return sh.getRange(2, 1, CFG.L - 1, 2).getValues()
    .filter(r => r[0] instanceof Date &&
      Utilities.formatDate(r[0], 'Asia/Bangkok', 'yyyy-MM-dd') === t)
    .reduce((s, r) => s + (Number(r[1]) || 0), 0);
}

/** หาแถวว่างถัดไปจากคอลัมน์วันที่ — ใช้ appendRow ไม่ได้เพราะ ARRAYFORMULA กิน getLastRow */
function nextRow_(sh) {
  return sh.getRange('A2:A' + CFG.L).getValues().filter(String).length + 2;
}

/** ตัวเลขในช่วงที่เป็นไปได้เท่านั้น — พิมพ์ 7390 แทน 73.90 แล้วปล่อยผ่าน
 *  จะลากเส้นเฉลี่ย/กราฟ/สัญญาณเตือนพังยาวโดยไม่มีอะไรฟ้อง */
function num_(v, label, min, max) {
  if (v === null || v === undefined || v === '') return '';
  const x = Number(v);
  if (!isFinite(x)) throw new Error(label + ': ต้องเป็นตัวเลข');
  if (x < min || x > max) throw new Error(label + ' = ' + x + ' อยู่นอกช่วง ' + min + '-' + max + ' พิมพ์ผิดหรือเปล่า');
  return x;
}

/** บันทึกผลชั่งจาก Web App */
function addWeighIn(d) {
  const sh = mustSheet_(LOG);
  const row = nextRow_(sh);
  const kg     = num_(d.kg,     'น้ำหนัก',       25, 250);
  const muscle = num_(d.muscle, 'กล้ามเนื้อ',    10, 120);
  const bone   = num_(d.bone,   'กระดูก',       0.5, 10);
  const fat    = num_(d.fat,    'ไขมัน%',         2, 70);
  const water  = num_(d.water,  'น้ำ%',          20, 80);
  const vf     = num_(d.vf,     'ไขมันช่องท้อง',  1, 60);
  sh.getRange(row, 1, 1, 6).setValues([[
    d.date ? new Date(d.date) : new Date(), muscle, bone, fat, water, vf
  ]]);
  if (kg !== '') sh.getRange(row, 15).setValue(kg);
  if (d.note) sh.getRange(row, 13).setValue(d.note);
  SpreadsheetApp.flush();
  if (!d.date || d.date === todayStr_()) awardMission_('m0');   // ชั่งวันนี้ = ระบบให้ coin เอง
  return getDashboardData();
}

/** บันทึกการดื่มจาก Web App */
function addDrink(d) {
  const sh = drinkSheet_();
  const row = sh.getRange('A2:A' + CFG.L).getValues().filter(String).length + 2;
  const type = CFG.KCAL_BY_TYPE[d.type] ? d.type : 'เบียร์';
  const ml = num_(d.ml, 'ปริมาณ (ml)', 1, 10000);
  if (ml === '') throw new Error('ยังไม่ได้ใส่ปริมาณ');
  sh.getRange(row, 1, 1, 6).setValues([[
    d.date ? new Date(d.date) : new Date(),
    ml, type, d.snack || 'ไม่มี', d.sodium ? 'ใช่' : '', d.note || ''
  ]]);
  SpreadsheetApp.flush();
  revokeNoDrink_(d.date);
  return getDashboardData();
}

/** บันทึกน้ำจาก Web App — ปุ่มเดียวจบ ไม่ต้องกรอกวันเวลา
 *  เก็บเวลาจริงด้วย เพราะอยากเห็นว่าน้ำไปกองช่วงไหน (กลางคืนเยอะ = ตื่นฉี่ = นอนเสีย) */
function addWater(d) {
  const sh = waterSheet_();
  const ml = num_(d.ml, 'ปริมาณ (ml)', 50, 2000);
  if (ml === '') throw new Error('ยังไม่ได้ใส่ปริมาณ');
  const row = sh.getRange('A2:A' + CFG.L).getValues().filter(String).length + 2;
  sh.getRange(row, 1, 1, 4).setValues([[
    new Date(), ml, d.type || 'น้ำเปล่า', d.note || ''
  ]]);
  SpreadsheetApp.flush();
  if (waterToday_() >= CFG.WATER_TARGET_ML) awardMission_('m9');   // ครบเป้า = ระบบให้ coin เอง
  return getWaterData();
}

/** ยอดน้ำวันนี้ + 7 วันล่าสุด สำหรับหน้าเว็บ */
function getWaterData() {
  const sh = waterSheet_();
  const rows = sh.getRange(2, 1, CFG.L - 1, 3).getValues()
    .filter(r => r[0] instanceof Date);
  const key = dt => Utilities.formatDate(dt, 'Asia/Bangkok', 'yyyy-MM-dd');
  const t = todayStr_();

  const byDay = {};
  rows.forEach(r => { byDay[key(r[0])] = (byDay[key(r[0])] || 0) + (Number(r[1]) || 0); });

  // 7 วันล่าสุดรวมวันนี้ เรียงเก่า→ใหม่ วันที่ไม่มีบันทึกคือ 0 (ไม่ใช่ข้ามไป)
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    last7.push({ date: Utilities.formatDate(d, 'Asia/Bangkok', 'd MMM'),
                 ml: byDay[key(d)] || 0 });
  }

  const todayRows = rows.filter(r => key(r[0]) === t).map(r => ({
    time: Utilities.formatDate(r[0], 'Asia/Bangkok', 'HH:mm'),
    ml: Number(r[1]) || 0,
    type: String(r[2] || '')
  })).reverse();

  const ml = byDay[t] || 0;
  return {
    ml: ml,
    target: CFG.WATER_TARGET_ML,
    bottle: CFG.WATER_BOTTLE_ML,
    pct: Math.min(1, ml / CFG.WATER_TARGET_ML),
    left: Math.max(0, CFG.WATER_TARGET_ML - ml),
    today: todayRows,
    last7: last7,
    avg7: Math.round(last7.reduce((s, d) => s + d.ml, 0) / 7)
  };
}

/** ถ้ากดภารกิจ "ไม่ดื่ม" ไปแล้ววันนี้ แต่มาบันทึกการดื่มทีหลัง ให้ยึด coin คืน */
function revokeNoDrink_(dateStr) {
  if (dateStr && dateStr !== todayStr_()) return;
  const s = coinDay_();
  const i = s.doneMissions.indexOf('m6');
  if (i === -1) return;
  const m = MISSIONS.filter(x => x.id === 'm6')[0];
  s.doneMissions.splice(i, 1);
  putCoinDay_(s);
  appendCoin_('↩️ ยกเลิก ' + m.name + ' (มีบันทึกการดื่ม)', -m.coin);
}

/** ดึงตัวเลขสรุปให้หน้าเว็บ — คำนวณใน GAS ทั้งหมด ไม่พึ่งสูตรในชีต */
function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = mustSheet_(LOG);
  const drinks = drinkSheet_();

  // อ่านทีเดียวทั้งบล็อก ลด API call (ถึงคอลัมน์ O = น้ำหนักที่เครื่องแสดง)
  const rows = log.getRange(2, 1, CFG.L - 1, 15).getValues()
    .filter(r => r[0] instanceof Date && (Number(r[14]) || (r[1] && r[3])));

  const pts = rows.map(r => {
    // น้ำหนักที่ชั่งได้จริงมาก่อนเสมอ — ค่าคำนวณจาก lean/(1-ไขมัน%) เป็นแค่ทางสำรอง
    // เพราะ %ไขมันเป็นค่าที่เครื่องประมาณเอาจากน้ำหนัก ย้อนกลับมาหาน้ำหนักอีกทีจะสะสมความคลาดเคลื่อน
    const raw = Number(r[14]);
    const lean = Number(r[1]) + Number(r[2]);
    return {
      t: r[0].getTime(),
      date: Utilities.formatDate(r[0], 'Asia/Bangkok', 'd MMM'),
      w: raw ? +raw.toFixed(2) : +(lean / (1 - Number(r[3]) / 100)).toFixed(2),
      vf: Number(r[5]) || null
    };
  }).sort((a, b) => a.t - b.t);

  // เฉลี่ยเคลื่อนที่ตาม "เวลาจริง" 7 วันย้อนหลัง — ไม่ใช่ 3 ครั้งล่าสุด
  // ชั่งถี่บ้างห่างบ้าง ค่าเฉลี่ยต่อจำนวนครั้งจึงเทียบข้ามช่วงไม่ได้ ต้องยึดหน้าต่างเวลา
  // ชั่งห่างกันมากจะเหลือจุดเดียวในหน้าต่าง — ยังคำนวณให้ แต่ตั้งธง sparse ไว้เตือนว่าอย่าเพิ่งเชื่อ
  const WIN = 7 * 86400000;
  const ma = pts.map(p => {
    const win = pts.filter(q => q.t <= p.t && p.t - q.t < WIN);
    return +(win.reduce((s, q) => s + q.w, 0) / win.length).toFixed(2);
  });
  // ชั่งกี่วัน (นับวันไม่ซ้ำ) ใน 14 วันล่าสุด — ต่ำกว่า 5 ถือว่าข้อมูลบางเกินจะอ่านทิศทาง
  const days14 = {};
  pts.filter(p => Date.now() - p.t <= 14 * 86400000)
     .forEach(p => days14[Utilities.formatDate(new Date(p.t), 'Asia/Bangkok', 'yyyy-MM-dd')] = 1);
  const weighDays14 = Object.keys(days14).length;
  const sparse = weighDays14 < 5;

  const n = pts.length;
  const lastW = n ? pts[n - 1].w : null;
  const lastMA = ma.filter(v => v !== null).slice(-1)[0] || null;
  const lastVF = n ? pts[n - 1].vf : null;

  // อัตราเปลี่ยน กก./สัปดาห์ จากเส้นเฉลี่ย 6 จุดล่าสุด (least squares เทียบเวลาจริง)
  let rate = null;
  const tail = [];
  for (let i = 0; i < n; i++) if (ma[i] !== null) tail.push({ t: pts[i].t, v: ma[i] });
  const seg = tail.slice(-6);
  if (seg.length >= 3) {
    const t0 = seg[0].t;
    const xs = seg.map(p => (p.t - t0) / 86400000);   // เป็นวัน
    const ys = seg.map(p => p.v);
    const mx = xs.reduce((a, b) => a + b) / xs.length;
    const my = ys.reduce((a, b) => a + b) / ys.length;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
    if (den > 0) rate = +(num / den * 7).toFixed(3);
  }

  // สัญญาณไหลขึ้น — ดูจากเส้นเฉลี่ย 7 วัน ย้อนหลัง 3 ค่า
  // ชั่งไม่ถี่พอ = ไม่ตัดสิน ดีกว่าเตือนผิดจากค่าที่แกว่งเอง
  let alert = { level: 'none', msg: 'ข้อมูลไม่พอ' };
  if (sparse) {
    alert = { level: 'none',
      msg: '14 วันล่าสุดชั่งแค่ ' + weighDays14 + ' วัน — ชั่งทุกวันก่อน ค่อยอ่านทิศทางได้' };
  } else if (tail.length >= 3) {
    const [c, b, a] = [tail[tail.length - 1].v, tail[tail.length - 2].v, tail[tail.length - 3].v];
    if (c > b && b > a) alert = { level: 'red', msg: 'เส้นเฉลี่ยขึ้น 3 ครั้งติด — หยุดแล้วหาสาเหตุ' };
    else if (c > b)     alert = { level: 'yellow', msg: 'ขึ้น 1 ครั้ง — จับตาครั้งหน้า' };
    else                alert = { level: 'green', msg: 'ทิศทางปกติ' };
  }

  // สรุปการดื่ม 7 / 30 วันล่าสุด — kcal คิดตามชนิด (เบียร์/ไวน์/เหล้า ต่างกันเยอะ)
  const dRows = drinks.getRange(2, 1, CFG.L - 1, 3).getValues().filter(r => r[0] instanceof Date);
  const now = Date.now();
  const within = days => dRows.filter(r => now - r[0].getTime() <= days * 86400000);
  const sumMl   = days => within(days).reduce((s, r) => s + (Number(r[1]) || 0), 0);
  const sumKcal = days => within(days).reduce(
    (s, r) => s + (Number(r[1]) || 0) * (CFG.KCAL_BY_TYPE[r[2]] || CFG.KCAL_PER_ML), 0);
  const ml7 = sumMl(7), ml30 = sumMl(30), kcal30 = sumKcal(30);

  return {
    lastWeight: lastW,
    ma3: lastMA,
    bmi: lastW ? +(lastW / (CFG.HEIGHT_M * CFG.HEIGHT_M)).toFixed(1) : null,
    vf: lastVF,
    lastDate: n ? pts[n - 1].date : '-',
    toMilestone: lastMA ? +(lastMA - CFG.MILESTONE).toFixed(2) : null,
    toTarget: lastMA ? +(lastMA - CFG.TARGET_WEIGHT).toFixed(2) : null,
    progress: lastMA
      ? Math.max(0, Math.min(1, (CFG.BASELINE - lastMA) / (CFG.BASELINE - CFG.TARGET_WEIGHT)))
      : 0,
    rate: rate,
    weeksToMilestone: (rate && rate < 0 && lastMA)
      ? +((lastMA - CFG.MILESTONE) / -rate).toFixed(1) : null,
    alert: alert,
    sparse: sparse, weighDays14: weighDays14,
    ml7: ml7, ml30: ml30,
    kcal7: Math.round(sumKcal(7)),
    kcal30: Math.round(kcal30),
    fatFromDrink30: +(kcal30 / CFG.KCAL_PER_KG_FAT).toFixed(2),
    waterToday: waterToday_(),
    waterTarget: CFG.WATER_TARGET_ML,
    cfg: { milestone: CFG.MILESTONE, target: CFG.TARGET_WEIGHT, vfTarget: CFG.TARGET_VF },
    series: pts.map((p, i) => ({ date: p.date, w: p.w, ma: ma[i] })).slice(-15)
  };
}

/** เช็คตรรกะ coin — Run ตัวนี้ใน editor, ผ่าน = ไม่มี exception
 *  แถวที่เทสเขียนลงชีต Coins จะถูกลบคืนหมดตอนจบ ยอดกลับเท่าเดิม */
function testCoinLogic() {
  const props = PropertiesService.getScriptProperties();
  const backup = props.getProperty('coinDay');
  const sh = coinSheet_();
  const rowsBefore = sh.getLastRow();
  const base = coinBalance_();
  const eq = (a, b, msg) => { if (a !== b) throw new Error(msg + ' — ได้ ' + a + ' ควรเป็น ' + b); };
  try {
    // ช่วงค่าที่ยอมรับ
    eq(num_('', 'x', 1, 9), '', 'ค่าว่างต้องผ่านเป็นค่าว่าง');
    eq(num_('73.90', 'น้ำหนัก', 25, 250), 73.9, 'ตัวเลขในช่วงต้องผ่าน');
    try { num_(7390, 'น้ำหนัก', 25, 250); throw new Error('ค่านอกช่วงหลุดผ่าน'); } catch (e) {
      if (e.message.indexOf('นอกช่วง') === -1) throw e;
    }

    const fresh = () => props.setProperty('coinDay', JSON.stringify(
      { streak: 3, lastReset: todayStr_(), doneMissions: [], weekKey: weekKey_(), weekDone: {} }));
    fresh();

    eq(completeMission('m1').coins, base + 1, 'ทำภารกิจแล้ว coin ไม่เพิ่ม');
    eq(completeMission('m1').coins, base + 1, 'กดซ้ำแล้ว coin เพิ่มอีก');
    eq(completeMission('m5').coins, base + 3, 'ภารกิจที่สองบวกผิด');

    // โควตารายสัปดาห์ — เวทเทรนนิ่ง 3 ครั้ง/สัปดาห์ ครั้งที่ 4 ต้องไม่ได้ coin
    eq(completeMission('m7').coins, base + 5, 'เวทครั้งที่ 1 บวกผิด');
    completeMission('m7'); completeMission('m7');
    eq(completeMission('m7').coins, base + 9, 'เกินโควตาสัปดาห์แล้วยังได้ coin อีก');

    // ภารกิจ auto ต้องกดเองไม่ได้ — ทั้ง "ชั่งวันนี้" และ "น้ำครบ"
    ['m0', 'm9'].forEach(id => {
      try { completeMission(id); throw new Error('ภารกิจ auto ' + id + ' กดเองได้'); } catch (e) {
        if (e.message.indexOf('ระบบให้เอง') === -1) throw e;
      }
    });

    // ปิด window: ก่อน 18:00 ต้องกดไม่ได้ / หลัง 18:00 ต้องได้ coin
    // เทสตามเวลาจริง เพราะถ้า mock เวลาแล้วผ่าน ก็ยังไม่รู้ว่าของจริงผ่าน
    const hNow = Number(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'H'));
    const b8 = coinBalance_();
    if (hNow < CFG.IF_CLOSE_HOUR) {
      try { completeMission('m8'); throw new Error('ยังไม่ถึงเวลาปิด window แต่กดได้'); } catch (e) {
        if (e.message.indexOf('ยังไม่ถึง') === -1) throw e;
      }
      eq(coinBalance_(), b8, 'กดไม่ผ่านแต่ coin ขยับ');
    } else {
      eq(completeMission('m8').coins, b8 + 2, 'หลังเวลาปิด window แล้วยังไม่ได้ coin');
    }
    // ราคาของรางวัลอ่านจาก REWARDS ไม่ hardcode — ปรับราคาแล้วเทสไม่พังตาม
    const cost = REWARDS.filter(x => x.id === 'r6')[0].cost;
    eq(setCoins(cost - 1).coins, cost - 1, 'ปรับยอดผิด');
    try { redeemReward('r6'); throw new Error('coin ไม่พอแต่แลกได้'); } catch (e) {
      if (e.message.indexOf('coin ไม่พอ') === -1) throw e;
    }
    eq(setCoins(cost).coins, cost, 'ปรับยอดขึ้นผิด');
    eq(redeemReward('r6').coins, 0, 'หักค่าของรางวัลผิด');
    eq(getCoinData(3).history.length, 3, 'ตัดจำนวนประวัติผิด');
    eq(getCoinData(3).history[0].coin, -cost, 'ประวัติไม่ได้เรียงใหม่อยู่บน');

    // ต่อจากเมื่อวานและเมื่อวานทำภารกิจ → streak +1 และภารกิจวันนี้เคลียร์
    props.setProperty('coinDay', JSON.stringify(
      { streak: 3, lastReset: yesterdayStr_(), doneMissions: ['m1'], weekKey: weekKey_(), weekDone: {} }));
    const d = getCoinData();
    eq(d.streak, 4, 'streak ไม่เดินทั้งที่ต่อจากเมื่อวาน');
    eq(d.doneMissions.length, 0, 'ภารกิจไม่รีเซ็ตตอนขึ้นวันใหม่');

    // เว้นไปหลายวันแล้วเปิดแอพ → streak ต้องขาด ไม่ใช่ +1
    props.setProperty('coinDay', JSON.stringify(
      { streak: 9, lastReset: '2000-01-01', doneMissions: ['m1'], weekKey: weekKey_(), weekDone: {} }));
    eq(getCoinData().streak, 0, 'เว้นหลายวันแล้ว streak ยังเดินต่อ');
  } finally {
    if (sh.getLastRow() > rowsBefore) sh.deleteRows(rowsBefore + 1, sh.getLastRow() - rowsBefore);
    backup ? props.setProperty('coinDay', backup) : props.deleteProperty('coinDay');
  }
  eq2_(coinBalance_(), base);
  Logger.log('ผ่านหมด — ยอดกลับเป็น ' + base);
}

function eq2_(a, b) {
  if (a !== b) throw new Error('ยอด coin ไม่กลับที่เดิม: ' + a + ' ≠ ' + b);
}

/* ═══════════════════════════ ติดตั้งชีต ═══════════════════════════ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📊 Body Tracker')
    .addItem('ติดตั้ง / รีเซ็ตชีต', 'setupTracker')
    .addItem('บันทึกวันนี้ (ในชีต)', 'gotoNextRow')
    .addItem('สร้างชีต Dashboard ใหม่ (ไม่แตะ Log)', 'rebuildDashboardOnly')
    .addItem('อัปเดต baseline ในชีต Dashboard', 'refreshBaselineInSheet')
    .addToUi();
}

function setupTracker() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Bangkok');

  const log = resetSheet_(ss, LOG);
  const drinks = resetSheet_(ss, DRINKS);
  const clinic = resetSheet_(ss, CLINIC);
  const blood = resetSheet_(ss, BLOOD);
  const dash = resetSheet_(ss, DASH);

  buildDrinks_(drinks);
  buildLog_(log);
  waterSheet_();   // สร้างถ้ายังไม่มี — ไม่ล้าง ประวัติน้ำต้องอยู่ยาวเหมือน Coins
  buildClinic_(clinic);
  buildBlood_(blood);
  buildDashboard_(dash, log);
  coinSheet_();   // สร้างถ้ายังไม่มี — ไม่ล้าง ประวัติ coin ต้องอยู่ยาว

  ss.getSheets().forEach(s => {
    if ([LOG, DRINKS, CLINIC, BLOOD, DASH, COINS, WATER].indexOf(s.getName()) === -1) ss.deleteSheet(s);
  });

  ss.setActiveSheet(dash);
  SpreadsheetApp.getUi().alert('ติดตั้งเสร็จ — ถ้าจะใช้หน้าเว็บ ให้ Deploy เป็น Web app อีกที');
}

function resetSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (sh) {
    sh.clear();
    sh.getCharts().forEach(c => sh.removeChart(c));
    sh.clearConditionalFormatRules();
  } else {
    sh = ss.insertSheet(name);
  }
  return sh;
}

function header_(sh, headers, bg) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground(bg || '#37474f')
    .setFontColor('#ffffff').setVerticalAlignment('middle').setWrap(true);
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 48);
}

function rule_(range, op, val, bg, fc) {
  let b = SpreadsheetApp.newConditionalFormatRule();
  if (op === 'gt')  b = b.whenNumberGreaterThan(val);
  if (op === 'gte') b = b.whenNumberGreaterThanOrEqualTo(val);
  if (op === 'lt')  b = b.whenNumberLessThan(val);
  if (op === 'lte') b = b.whenNumberLessThanOrEqualTo(val);
  if (op === 'eq')  b = b.whenNumberEqualTo(val);
  if (bg) b = b.setBackground(bg);
  if (fc) b = b.setFontColor(fc);
  return b.setRanges([range]).build();
}

/* ─────────────────────────── ชีต Drinks ─────────────────────────── */

function buildDrinks_(sh) {
  header_(sh, ['วันที่', 'ปริมาณ (ml)', 'ชนิด', 'กับแกล้ม', 'โซเดียมสูง', 'บันทึก'], '#6a1b9a');

  // ข้อมูลที่จำได้ — ก่อน 6 พ.ค. 69 ไม่ได้ดื่ม จึงไม่มีแถว
  sh.getRange(2, 1, 2, 6).setValues([
    [new Date(2026, 7, 3), 1000, 'เบียร์', 'ไม่มี', '', 'กระป๋องยาว 2'],
    [new Date(2026, 7, 6), 500,  'เบียร์', 'ไม่มี', '', 'กระป๋องยาว 1']
  ]);

  sh.getRange('A2:A' + CFG.L).setNumberFormat('d mmm yy');
  sh.getRange('B2:B' + CFG.L).setNumberFormat('0');

  const list = (col, items) => sh.getRange(col + '2:' + col + CFG.L).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(items, true)
      .setAllowInvalid(true).build());
  list('C', Object.keys(CFG.KCAL_BY_TYPE));
  list('D', ['ไม่มี', 'ถั่ว/นัท', 'ปิ้งย่าง', 'ของทอด', 'มื้อเต็ม', 'อื่นๆ']);

  sh.setConditionalFormatRules([
    rule_(sh.getRange('B2:B' + CFG.L), 'gte', 1500, '#ffcdd2', '#b71c1c'),
    rule_(sh.getRange('B2:B' + CFG.L), 'gte', 1000, '#fff9c4', '#f57f17')
  ]);

  sh.setColumnWidths(1, 5, 120);
  sh.setColumnWidth(5, 260);
  sh.getRange('A1').setNote('บันทึกทีละครั้งที่ดื่ม ชีต Log จะรวม ml ให้เองตามช่วงระหว่างการชั่ง');
}

/* ─────────────────────────── ชีต Water ─────────────────────────── */

function buildWater_(sh) {
  header_(sh, ['วันเวลา', 'ปริมาณ (ml)', 'ชนิด', 'บันทึก'], '#0277bd');

  sh.getRange('A2:A' + CFG.L).setNumberFormat('d mmm yy HH:mm');
  sh.getRange('B2:B' + CFG.L).setNumberFormat('0');

  sh.getRange('C2:C' + CFG.L).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['น้ำเปล่า', 'น้ำเกลือแร่', 'กาแฟดำ', 'ชาไม่หวาน'], true)
      .setAllowInvalid(true).build());

  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 280);
  sh.getRange('A1').setNote(
    'บันทึกทีละขวด เป้า ' + CFG.WATER_TARGET_ML + ' ml/วัน — นับของที่ไม่มีแคลทั้งหมด ' +
    'เกลือแร่กับกาแฟดำนับด้วยเพราะช่วงอดดื่มได้');
  sh.getRange('B1').setNote(
    'เป้า 2.5 ล. ไม่ใช่ 3 ล. — น้ำ% ในเครื่องชั่งเป็นเงาของไขมัน% ไม่ใช่สัญญาณขาดน้ำ ' +
    'ดื่มเกินแค่ทำให้ตื่นฉี่กลางคืน');
}

/* ─────────────────────────── ชีต Log ─────────────────────────── */
/*  กรอกเอง: A วันที่ | B กล้ามเนื้อ | C กระดูก | D ไขมัน% | E น้ำ% | F VF
 *  สูตร:    G ml | H น้ำหนัก | I BMI | J เฉลี่ย 7 วัน | K Δ | L ไขมันจากเครื่องดื่ม | N เป้า
 */

function buildLog_(sh) {
  const L = CFG.L;

  header_(sh, [
    'วันที่', 'กล้ามเนื้อ (กก.)', 'กระดูก (กก.)', 'ไขมัน (%) อ้างอิง', 'น้ำ (%) อ้างอิง',
    'ไขมันช่องท้อง', 'เบียร์ (ml ตั้งแต่ชั่งครั้งก่อน)',
    '◆ น้ำหนัก (กก.)', 'BMI', '◆ เฉลี่ย 7 วัน (กก.)', 'Δ เฉลี่ย', 'ไขมันจากเครื่องดื่ม (กก.)',
    'บันทึก', 'เป้า', 'น้ำหนักที่เครื่องแสดง (กก.)'
  ]);

  // ── ข้อมูลจริงจากแอป 21 จุด ──
  const hist = [
    [new Date(2026, 1, 15), 52.28, 2.80, 23.1, 52.7, 11, ''],
    [new Date(2026, 1, 23), 52.76, 2.82, 23.3, 52.5, 11, ''],
    [new Date(2026, 1, 28), 52.12, 2.79, 23.0, 52.7, 11, ''],
    [new Date(2026, 2, 10), 52.80, 2.83, 23.2, 52.6, 11, ''],
    [new Date(2026, 2, 19), 52.34, 2.80, 22.7, 52.9, 11, ''],
    [new Date(2026, 2, 26), 52.76, 2.82, 22.9, 52.8, 11, ''],
    [new Date(2026, 3, 2),  52.36, 2.80, 22.4, 53.1, 11, ''],
    [new Date(2026, 3, 10), 52.56, 2.81, 22.6, 53.0, 11, ''],
    [new Date(2026, 3, 19), 53.27, 2.85, 23.5, 52.4, 12, 'ช่วงสงกรานต์ — สูงสุดของครึ่งปีแรก'],
    [new Date(2026, 3, 30), 52.49, 2.81, 22.8, 52.9, 11, 'ฟื้นจากสงกรานต์ได้ภายใน 11 วัน'],
    [new Date(2026, 4, 13), 52.28, 2.80, 22.5, 53.1, 11, 'หลังจุดที่กลับมาดื่ม (6 พ.ค.)'],
    [new Date(2026, 4, 30), 52.30, 2.80, 22.2, 53.3, 11, '★ จุดต่ำสุดของปี'],
    [new Date(2026, 5, 3),  52.47, 2.81, 22.2, 53.3, 11, 'จุดกลับตัว — ขาขึ้นเริ่มจากตรงนี้'],
    [new Date(2026, 5, 23), 52.45, 2.81, 23.1, 52.6, 12, ''],
    [new Date(2026, 5, 28), 52.40, 2.80, 22.6, 53.0, 11, ''],
    [new Date(2026, 6, 1),  52.39, 2.80, 22.5, 53.1, 11, ''],
    [new Date(2026, 6, 2),  52.48, 2.81, 22.7, 53.0, 12, ''],
    [new Date(2026, 6, 9),  52.58, 2.81, 23.1, 52.7, 12, ''],
    [new Date(2026, 6, 14), 52.82, 2.83, 23.4, 52.5, 12, ''],
    [new Date(2026, 6, 19), 52.96, 2.83, 23.1, 52.7, 12, ''],
    [new Date(2026, 7, 7),  53.02, 2.84, 24.4, 51.8, 12, 'จุดตั้งต้นรอบกู้ร่าง']
  ];

  sh.getRange(2, 1, hist.length, 6).setValues(hist.map(r => r.slice(0, 6)));
  sh.getRange(2, 13, hist.length, 1).setValues(hist.map(r => [r[6]]));

  // G: รวม ml จากชีต Drinks ในช่วงระหว่างการชั่งครั้งก่อนกับครั้งนี้
  //    SUMIFS ใช้ ARRAYFORMULA ไม่ได้ จึงเขียนสูตรลงทีละแถวแบบ batch เดียว
  const gFormulas = [];
  for (let r = 2; r <= L; r++) {
    const prev = r === 2 ? 'DATE(2000,1,1)' : 'A' + (r - 1);
    gFormulas.push(['=IF(A' + r + '="","",SUMIFS(Drinks!$B:$B,Drinks!$A:$A,">"&' + prev +
      ',Drinks!$A:$A,"<="&A' + r + '))']);
  }
  sh.getRange(2, 7, gFormulas.length, 1).setFormulas(gFormulas);

  // H: น้ำหนักที่กรอกเอง (คอลัมน์ O) มาก่อน ถ้าไม่มีค่อยคำนวณจาก lean/(1-ไขมัน%)
  sh.getRange('H2').setFormula(
    '=ARRAYFORMULA(IF(O2:O' + L + '<>"",O2:O' + L + ',' +
    'IF((B2:B' + L + '="")+(D2:D' + L + '=""),"",' +
    'ROUND((B2:B' + L + '+C2:C' + L + ')/(1-D2:D' + L + '/100),2))))');
  sh.getRange('I2').setFormula(
    '=ARRAYFORMULA(IF(H2:H' + L + '="","",ROUND(H2:H' + L + '/' +
    (CFG.HEIGHT_M * CFG.HEIGHT_M).toFixed(4) + ',1)))');
  // J: เฉลี่ยน้ำหนักย้อนหลัง 7 วันตามวันที่จริง (ไม่ใช่ 3 ครั้งล่าสุด)
  //    AVERAGEIFS ใช้ใน ARRAYFORMULA ไม่ได้ จึงเขียนทีละแถวแบบ batch เดียวเหมือนคอลัมน์ G
  const jFormulas = [];
  for (let r = 2; r <= L; r++) {
    jFormulas.push(['=IF(A' + r + '="","",IFERROR(ROUND(AVERAGEIFS($H$2:$H$' + L +
      ',$A$2:$A$' + L + ',">"&A' + r + '-7,$A$2:$A$' + L + ',"<="&A' + r + '),2),""))']);
  }
  sh.getRange(2, 10, jFormulas.length, 1).setFormulas(jFormulas);
  sh.getRange('K3').setFormula(
    '=ARRAYFORMULA(IF((J3:J' + L + '="")+(J2:J' + (L - 1) + '=""),"",' +
    'ROUND(J3:J' + L + '-J2:J' + (L - 1) + ',2)))');
  sh.getRange('L2').setFormula(
    '=ARRAYFORMULA(IF(G2:G' + L + '="","",ROUND(G2:G' + L + '*' +
    CFG.KCAL_PER_ML + '/' + CFG.KCAL_PER_KG_FAT + ',3)))');
  sh.getRange('N2').setFormula(
    '=ARRAYFORMULA(IF(H2:H' + L + '="","",' + CFG.TARGET_WEIGHT + '))');

  sh.getRange('A2:A' + L).setNumberFormat('d mmm yy');
  sh.getRange('B2:C' + L).setNumberFormat('0.00');
  sh.getRange('D2:E' + L).setNumberFormat('0.0');
  sh.getRange('F2:F' + L).setNumberFormat('0');
  sh.getRange('G2:G' + L).setNumberFormat('0');
  sh.getRange('H2:H' + L).setNumberFormat('0.00');
  sh.getRange('O2:O' + L).setNumberFormat('0.00');
  sh.getRange('I2:I' + L).setNumberFormat('0.0');
  sh.getRange('J2:K' + L).setNumberFormat('0.00');
  sh.getRange('L2:L' + L).setNumberFormat('0.000');
  sh.getRange('H1:K1').setBackground('#1b5e20');   // ตัวชี้วัดหลัก
  sh.getRange('D1:E1').setBackground('#78909c');   // ค่าอ้างอิง
  sh.getRange('G1').setBackground('#6a1b9a');
  sh.getRange('L1').setBackground('#546e7a');
  sh.hideColumns(14);

  sh.setConditionalFormatRules([
    rule_(sh.getRange('F2:F' + L), 'gt',  CFG.TARGET_VF, '#ffcdd2', '#b71c1c'),
    rule_(sh.getRange('F2:F' + L), 'lte', CFG.TARGET_VF, '#c8e6c9', '#1b5e20'),
    rule_(sh.getRange('H2:H' + L), 'lte', CFG.MILESTONE, '#c8e6c9', '#1b5e20'),
    rule_(sh.getRange('K2:K' + L), 'lt',  0, '#e8f5e9', '#1b5e20'),
    rule_(sh.getRange('K2:K' + L), 'gt',  0, '#ffebee', '#b71c1c'),
    rule_(sh.getRange('G2:G' + L), 'gte', 2000, '#ffcdd2', '#b71c1c'),
    rule_(sh.getRange('G2:G' + L), 'gte', 1000, '#fff9c4', '#f57f17')
  ]);

  sh.setColumnWidths(1, 12, 100);
  sh.setColumnWidth(15, 150);
  sh.setColumnWidth(7, 130);
  sh.setColumnWidth(13, 300);
  sh.getRange('D1').setNote(
    'ไขมัน% กับ น้ำ% มาจากค่าความต้านทานตัวเดียวกันของเครื่อง จึงเคลื่อนสวนทางกันเสมอ ' +
    'ใช้ประกอบได้ แต่อย่าใช้ตัดสินความคืบหน้ารายครั้ง');
  sh.getRange('G1').setNote('คำนวณอัตโนมัติจากชีต Drinks — ห้ามพิมพ์ทับ');
  sh.getRange('O1').setNote('กรอกตัวเลขที่ตาชั่งขึ้นตรงๆ — ถ้าเว้นว่าง ระบบจะคำนวณน้ำหนักจากกล้ามเนื้อ+กระดูก+ไขมัน% ให้แทน');
  sh.getRange('J1').setNote('เฉลี่ยน้ำหนักย้อนหลัง 7 วัน — ใช้ตัวนี้ตัดสินทิศทาง ไม่ใช่ค่ารายครั้ง');
}

/* ─────────────────────────── ชีต Clinic ─────────────────────────── */

function buildClinic_(sh) {
  header_(sh, ['วันที่', 'น้ำหนัก (กก.)', 'ไขมัน (%)', 'กล้ามเนื้อ (กก.)', 'ไขมันช่องท้อง', 'BMR', 'สถานที่', 'บันทึก'], '#00695c');

  sh.getRange(2, 1, 3, 8).setValues([
    [new Date(2026, 0, 15), 69.95, 17.7, 54.6, 9,    '',   '', 'ร่างทอง — ค่าน่าจะคลาดเคลื่อนจาก hydration ปลาย cut'],
    [new Date(2026, 2, 11), 71.9,  '',   53.1, 10.5, '',   'คลินิก ศอ.10', ''],
    [new Date(2026, 4, 6),  72.24, 21.2, 53.0, '',   1559, 'คลินิก ศอ.10', 'ดีที่สุดของปีตามเครื่องคลินิก']
  ]);

  sh.getRange('A2:A100').setNumberFormat('d mmm yy');
  sh.getRange('B2:F100').setNumberFormat('0.00');
  sh.setColumnWidths(1, 8, 115);
  sh.setColumnWidth(8, 320);
  sh.getRange('A1').setNote(
    'เครื่องคนละตัวกับที่บ้าน สอบเทียบต่างกัน เทียบกันเองข้ามครั้งได้ ' +
    'แต่ห้ามเอาไปต่อเป็นเส้นเดียวกับชีต Log');
}

/* ─────────────────────────── ชีต Blood ─────────────────────────── */

function buildBlood_(sh) {
  header_(sh, ['วันที่', 'TG', 'LDL', 'HDL', 'CHO', 'SBP', 'DBP', 'สถานที่ตรวจ', 'บันทึก'], '#4e342e');

  sh.getRange(2, 1, 3, 9).setValues([
    [new Date(2024, 10, 1), 287, '',  '', '',  '',  '',  '', 'จุดเริ่มต้น — TG วิกฤต'],
    [new Date(2025, 6, 1),  '',  178, '', '',  '',  '',  '', 'LDL สูงสุด'],
    [new Date(2026, 4, 6),  162, 162, 34, 245, 125, 73, 'Lifestyle Medicine Clinic ศอ.10', 'TG ลดจาก 287 ระหว่างช่วงงดดื่ม']
  ]);

  sh.getRange('A2:A200').setNumberFormat('d mmm yy');
  sh.getRange('B2:G200').setNumberFormat('0');

  // เกณฑ์อ้างอิงทั่วไป ใช้ดูทิศทางเท่านั้น การแปลผลเป็นหน้าที่ของคลินิก
  sh.setConditionalFormatRules([
    rule_(sh.getRange('B2:B200'), 'gt', 150, '#ffcdd2', '#b71c1c'),
    rule_(sh.getRange('C2:C200'), 'gt', 130, '#ffcdd2', '#b71c1c'),
    rule_(sh.getRange('D2:D200'), 'lt', 40,  '#ffcdd2', '#b71c1c'),
    rule_(sh.getRange('E2:E200'), 'gt', 200, '#ffcdd2', '#b71c1c'),
    rule_(sh.getRange('F2:F200'), 'gt', 120, '#fff3e0', '#e65100')
  ]);

  sh.setColumnWidths(1, 9, 105);
  sh.setColumnWidth(8, 220);
  sh.setColumnWidth(9, 280);
  sh.getRange('A1').setNote('สีเป็นเกณฑ์อ้างอิงทั่วไปเพื่อดูเทรนด์ ไม่ใช่การแปลผล ให้ยึดตามคลินิก');
}

/* ─────────────────────────── Dashboard (ในชีต) ─────────────────────────── */

/* ป้ายของแถวที่ถูกอ้างจากที่อื่น — ตัวเชื่อมระหว่าง buildDashboard_ กับ refreshBaselineInSheet
 * ถ้าจะเปลี่ยนข้อความ เปลี่ยนที่นี่ที่เดียว */
const DASH_LBL = {
  ma:       '◆ เฉลี่ย 7 วัน ล่าสุด (กก.)',
  progress: 'ความคืบหน้า'
};

/** โครงแผงสรุป — 1 รายการ = 1 แถว เรียงจากบนลงล่าง เริ่มที่แถว 3
 *
 *  v เป็นฟังก์ชันจะได้ R('key') มาใช้อ้างแถวอื่น ห้ามพิมพ์ 'B11' ตรงๆ
 *  เหตุผล: เวอร์ชันก่อนฝัง B3/B8/B11/B21 ไว้ในสูตร แทรกแถวใหม่ทีเดียวพังทั้งแผง
 *  และพังแบบเงียบ (สูตรยังคำนวณได้ แค่ชี้ผิดช่อง) — testDashboardSpec() จับเคสนี้
 */
function dashSpec_(last) {
  return [
    { key: 'ma',   label: DASH_LBL.ma,              v: '=' + last('J'), fmt: '0.00', band: 'green' },
    { key: 'w',    label: '   น้ำหนักครั้งล่าสุด',    v: '=' + last('H'), fmt: '0.00', band: 'green' },
    { key: 'bmi',  label: '   BMI',                  v: '=' + last('I'), band: 'green' },
    {},
    { key: 'ms',   label: 'เป้าระยะแรก (เคยทำได้ 30 พ.ค.)', v: CFG.MILESTONE },
    { key: 'toMs', label: '   เหลืออีกถึงเป้าแรก (กก.)',
      v: R => '=IFERROR(ROUND(' + R('ma') + '-' + CFG.MILESTONE + ',2),"-")', fmt: '0.00' },
    { key: 'tg',   label: 'เป้าปลายทาง',             v: CFG.TARGET_WEIGHT },
    { key: 'toTg', label: '   เหลืออีกถึงเป้าปลาย (กก.)',
      v: R => '=IFERROR(ROUND(' + R('ma') + '-' + CFG.TARGET_WEIGHT + ',2),"-")', fmt: '0.00' },
    { key: 'progress', label: DASH_LBL.progress,
      v: R => '=IFERROR(MAX(0,(' + CFG.BASELINE + '-' + R('ma') + ')/(' +
              CFG.BASELINE + '-' + CFG.TARGET_WEIGHT + ')),0)', fmt: '0.0%' },
    {},
    { key: 'rate', label: 'อัตราเปลี่ยน (กก./สัปดาห์)',
      v: '=IFERROR(ROUND(SLOPE(S2:S7,R2:R7)*7,3),"-")', fmt: '0.000' },
    { key: 'eta',  label: 'คาดถึงเป้าระยะแรก (สัปดาห์)',
      v: R => '=IF(N(' + R('rate') + ')>=0,"ยังไม่ลด",IFERROR(ROUND(' +
              R('toMs') + '/-' + R('rate') + ',1),"-"))' },
    {},
    { key: 'alert', label: '⚠ สัญญาณไหลขึ้น (จากเส้นเฉลี่ย)',
      v: '=IF(COUNT(S2:S4)<3,"ข้อมูลไม่พอ",IF(AND(S2>S3,S3>S4),' +
         '"🔴 เส้นเฉลี่ยขึ้น 3 ครั้งติด — หยุดแล้วหาสาเหตุ",' +
         'IF(S2>S3,"🟡 ขึ้น 1 ครั้ง — จับตาครั้งหน้า","🟢 ทิศทางปกติ")))' },
    {},
    { key: 'vf',    label: '◆ ไขมันช่องท้อง', v: '=' + last('F'), band: 'pink' },
    { key: 'vfTg',  label: '   เป้าหมาย',      v: CFG.TARGET_VF,   band: 'pink' },
    {},
    { key: 'ml30',  label: '🍺 เครื่องดื่ม 30 วันล่าสุด (ml)',
      v: '=IFERROR(SUMIFS(Drinks!$B:$B,Drinks!$A:$A,">="&TODAY()-30),0)', band: 'purple' },
    { key: 'kcal30', label: '   คิดเป็น kcal (ประมาณจากอัตราเบียร์)',
      v: R => '=ROUND(' + R('ml30') + '*' + CFG.KCAL_PER_ML + ',0)', band: 'purple' },
    { key: 'fat30',  label: '   คิดเป็นไขมัน (กก.)',
      v: R => '=ROUND(' + R('kcal30') + '/' + CFG.KCAL_PER_KG_FAT + ',2)',
      fmt: '0.00', band: 'purple' },
    {},
    // น้ำ — ยอดรายวันมาจากคอลัมน์ helper U/V (SUMIFS รายวัน 7 วันเขียนในสูตรเดียวไม่ได้)
    { key: 'wToday', label: '💧 น้ำวันนี้ (ml)',
      v: '=IFERROR(SUMIFS(Water!$B:$B,Water!$A:$A,">="&TODAY(),Water!$A:$A,"<"&TODAY()+1),0)',
      band: 'blue' },
    { key: 'wTg',    label: '   เป้า (ml)', v: CFG.WATER_TARGET_ML, band: 'blue' },
    { key: 'wPct',   label: '   วันนี้ได้กี่ % ของเป้า',
      v: R => '=IFERROR(' + R('wToday') + '/' + R('wTg') + ',0)', fmt: '0%', band: 'blue' },
    { key: 'wAvg7',  label: '   เฉลี่ย 7 วัน (ml/วัน)',
      v: '=IFERROR(ROUND(AVERAGE(V2:V8),0),0)', band: 'blue' },
    { key: 'wHit7',  label: '   7 วันนี้ถึงเป้ากี่วัน',
      v: R => '=IFERROR(COUNTIF(V2:V8,">="&' + R('wTg') + ')&" / 7","-")', band: 'blue' },
    {},
    { key: 'tgLast', label: 'TG ล่าสุด',
      v: '=IFERROR(LOOKUP(2,1/(Blood!$B$2:$B$200<>""),Blood!$B$2:$B$200),"-")' },
    { key: 'bloodAt', label: 'ตรวจเลือดครั้งล่าสุด',
      v: '=IFERROR(LOOKUP(2,1/(Blood!$A$2:$A$200<>""),Blood!$A$2:$A$200),"-")', fmt: 'd mmm yy' }
  ];
}

/** แปลงโครงเป็นเลขแถวจริง + ตัวอ้าง R('key') ที่คืน 'B<แถว>' */
function dashResolve_(spec) {
  const rowOf = {};
  spec.forEach((r, i) => {
    if (!r.key) return;
    if (rowOf[r.key]) throw new Error('key ซ้ำในแผง Dashboard: ' + r.key);
    rowOf[r.key] = i + 3;                 // แถว 1 = หัวข้อ, แถว 2 ว่าง, แผงเริ่มแถว 3
  });
  const R = k => {
    if (!rowOf[k]) throw new Error('แผง Dashboard อ้าง key ที่ไม่มีจริง: ' + k);
    return 'B' + rowOf[k];
  };
  const values = spec.map(r => [
    r.label || '',
    typeof r.v === 'function' ? r.v(R) : (r.v === undefined ? '' : r.v)
  ]);
  return { rowOf: rowOf, R: R, values: values };
}

/** หาแถวจากป้ายในคอลัมน์ A — ใช้กับชีตที่สร้างไว้แล้ว (เลขแถวอาจไม่ตรงกับ spec ปัจจุบัน) */
function dashRowByLabel_(sh, label) {
  const col = sh.getRange('A1:A80').getValues();
  for (let i = 0; i < col.length; i++)
    if (String(col[i][0]).trim() === String(label).trim()) return i + 1;
  throw new Error('หาแถว "' + label + '" ในชีต ' + DASH + ' ไม่เจอ — ชีตอาจเป็นเวอร์ชันเก่า');
}

function buildDashboard_(sh, log) {
  const L = CFG.L;
  const last = c => 'IFERROR(LOOKUP(2,1/(Log!$' + c + '$2:$' + c + '$' + L + '<>""),Log!$' + c + '$2:$' + c + '$' + L + '),"")';

  sh.getRange('A1').setValue('สรุปความคืบหน้า').setFontSize(16).setFontWeight('bold');

  sh.getRange('R1').setValue('helper น้ำหนัก — อย่าลบ');
  sh.getRange('R2').setFormula(
    '=IFERROR(QUERY(Log!A2:J' + L + ',"select A,J where J is not null order by A desc limit 6",0),"")');

  // helper น้ำ: U = วันที่ย้อนหลัง 7 วัน (เก่า→ใหม่) · V = ยอด ml ของวันนั้น
  sh.getRange('U1').setValue('helper น้ำ — อย่าลบ');
  const uv = [];
  for (let i = 6; i >= 0; i--) {
    const r = uv.length + 2;
    uv.push(['=TODAY()-' + i,
      '=IFERROR(SUMIFS(Water!$B:$B,Water!$A:$A,">="&U' + r + ',Water!$A:$A,"<"&U' + r + '+1),0)']);
  }
  sh.getRange(2, 21, uv.length, 2).setFormulas(uv);
  sh.getRange('U2:U8').setNumberFormat('d mmm yy');

  const spec = dashSpec_(last);
  const d = dashResolve_(spec);
  sh.getRange(3, 1, d.values.length, 2).setValues(d.values);
  sh.getRange(3, 1, d.values.length, 1).setFontWeight('bold');

  const BAND = { green: '#e8f5e9', pink: '#fce4ec', purple: '#f3e5f5', blue: '#e1f5fe' };
  spec.forEach((r, i) => {
    if (r.fmt)  sh.getRange(i + 3, 2).setNumberFormat(r.fmt);
    if (r.band) sh.getRange(i + 3, 1, 1, 2).setBackground(BAND[r.band]);
  });

  sh.getRange(d.R('ma')).setFontSize(22).setFontColor('#1b5e20');
  sh.setColumnWidth(1, 280);
  sh.setColumnWidth(2, 340);

  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .setGradientMaxpointWithValue('#2e7d32', SpreadsheetApp.InterpolationType.NUMBER, '1')
      .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setRanges([sh.getRange(d.R('progress'))]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .setGradientMaxpointWithValue('#0277bd', SpreadsheetApp.InterpolationType.NUMBER, '1')
      .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setRanges([sh.getRange(d.R('wPct'))]).build()
  ]);

  sh.insertChart(sh.newChart().asLineChart()
    .addRange(log.getRange('A1:A' + L))
    .addRange(log.getRange('H1:H' + L))
    .addRange(log.getRange('J1:J' + L))
    .addRange(log.getRange('N1:N' + L))
    .setPosition(2, 4, 0, 0)
    .setOption('title', '◆ น้ำหนัก — เส้นเข้มคือเฉลี่ย 7 วัน ใช้ตัวนี้ตัดสิน')
    .setOption('width', 620).setOption('height', 300)
    .setOption('interpolateNulls', true)
    .setOption('series', {
      0: { color: '#90caf9', lineWidth: 1, pointSize: 4 },
      1: { color: '#0d47a1', lineWidth: 3, pointSize: 0 },
      2: { color: '#9e9e9e', lineWidth: 1, lineDashStyle: [4, 4], pointSize: 0 }
    })
    .build());

  sh.insertChart(sh.newChart().asComboChart()
    .addRange(log.getRange('A1:A' + L))
    .addRange(log.getRange('F1:F' + L))
    .addRange(log.getRange('G1:G' + L))
    .setPosition(18, 4, 0, 0)
    .setOption('title', 'ไขมันช่องท้อง เทียบกับปริมาณเบียร์ (ml)')
    .setOption('width', 620).setOption('height', 280)
    .setOption('interpolateNulls', true)
    .setOption('series', {
      0: { type: 'line', color: '#c62828', pointSize: 6, targetAxisIndex: 0 },
      1: { type: 'bars', color: '#8e24aa', targetAxisIndex: 1 }
    })
    .setOption('vAxes', { 0: { title: 'Visceral Fat' }, 1: { title: 'เบียร์ (ml)' } })
    .build());

  sh.insertChart(sh.newChart().asColumnChart()
    .addRange(sh.getRange('U2:U8'))
    .addRange(sh.getRange('V2:V8'))
    .setPosition(34, 4, 0, 0)
    .setOption('title', '💧 น้ำ 7 วันล่าสุด (ml/วัน) — เป้า ' + CFG.WATER_TARGET_ML)
    .setOption('width', 620).setOption('height', 240)
    .setOption('legend', { position: 'none' })
    .setOption('series', { 0: { color: '#0288d1' } })
    .build());
}

/** เช็คว่าแผง Dashboard ไม่มีใครฝังเลขแถวไว้ในสูตร — เคสที่พังเงียบที่สุด
 *  Run ตัวนี้ใน editor ได้เลย ไม่แตะชีต */
function testDashboardSpec() {
  const spec = dashSpec_(c => 'LAST(' + c + ')');

  // 1. สูตรต้องอ้างแถวผ่าน R('key') เท่านั้น ห้ามมีช่องแบบ B11 ฝังในซอร์ส
  spec.forEach(r => {
    if (typeof r.v !== 'function') return;
    // จับเฉพาะคอลัมน์ B = คอลัมน์ของแผงเอง (U/V/R/S เป็น helper คงที่ อ้างตรงๆ ได้)
    const m = r.v.toString().match(/B\d+/);
    if (m) throw new Error('แถว "' + r.label + '" ฝังช่อง ' + m[0] +
      ' ไว้ในสูตร — ต้องใช้ R(key) แทน');
  });

  // 2. ทุก key ที่ถูกอ้างต้องมีจริง (dashResolve_ จะ throw เองถ้าไม่มี)
  const d = dashResolve_(spec);

  // 3. เคสที่รู้ว่าต้องเจอ — อ้าง key ที่ไม่มีต้อง throw ไม่ใช่คืนค่าเงียบๆ
  try { d.R('ไม่มีคีย์นี้'); throw new Error('อ้าง key ที่ไม่มีแล้วไม่ throw'); } catch (e) {
    if (e.message.indexOf('ไม่มีจริง') === -1) throw e;
  }

  // 4. เคสที่รู้ว่าต้องเจอ — key ซ้ำต้อง throw
  try {
    dashResolve_([{ key: 'x' }, { key: 'x' }]);
    throw new Error('key ซ้ำแล้วไม่ throw');
  } catch (e) {
    if (e.message.indexOf('ซ้ำ') === -1) throw e;
  }

  // 5. ป้ายที่ refreshBaselineInSheet ไปหาในชีต ต้องมีอยู่ในแผงจริง และไม่ซ้ำกับแถวอื่น
  const labels = spec.map(r => r.label);
  [DASH_LBL.ma, DASH_LBL.progress].forEach(lbl => {
    const n = labels.filter(x => x === lbl).length;
    if (n !== 1) throw new Error('DASH_LBL ไม่ตรงกับแผง (เจอ ' + n + ' แถว): ' + lbl);
  });

  Logger.log('ผ่านหมด — ' + Object.keys(d.rowOf).length + ' แถวมีคีย์ · ' +
    'ความคืบหน้าอยู่แถว ' + d.rowOf.progress + ' · น้ำวันนี้แถว ' + d.rowOf.wToday);
}

/** สร้างแผง Dashboard ใหม่ทั้งชีต โดยไม่แตะ Log / Drinks / Water / Coins
 *  ใช้ตัวนี้เวลาเพิ่มแถวใหม่ในแผง (เช่นแถวน้ำ) — ห้ามใช้ setupTracker ซึ่งล้าง Log
 *  Dashboard เป็นชีตที่สร้างใหม่ได้ฟรี เพราะไม่มีข้อมูลของตัวเอง มีแต่สูตรที่ชี้ไปชีตอื่น */
function rebuildDashboardOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = mustSheet_(LOG);
  waterSheet_();                       // ต้องมีก่อน ไม่งั้นสูตรน้ำขึ้น #REF!
  const dash = resetSheet_(ss, DASH);
  buildDashboard_(dash, log);
  ss.setActiveSheet(dash);
  SpreadsheetApp.getUi().alert(
    'สร้างชีต Dashboard ใหม่แล้ว — Log ' + (nextRow_(log) - 2) + ' แถวไม่ถูกแตะ');
}

/** เขียนสูตรความคืบหน้าในชีต Dashboard ใหม่ตาม CFG.BASELINE ปัจจุบัน
 *  มีแยกเพราะ setupTracker สร้าง Log ใหม่จาก hist 21 จุด = ผลชั่งหลัง 7 ส.ค. 69 หายหมด
 *  ห้ามบอกให้รัน setupTracker เพื่อแก้ตัวเลขเดียว หน้าเว็บคำนวณจาก CFG สดอยู่แล้ว ไม่ต้องรันอะไร
 *  หาแถวจากป้ายไม่ใช่เลขแถว — ชีตที่สร้างด้วยเวอร์ชันเก่าก็ยังแก้ได้ */
function refreshBaselineInSheet() {
  const sh = mustSheet_(DASH);
  const maRef = 'B' + dashRowByLabel_(sh, DASH_LBL.ma);
  const row = dashRowByLabel_(sh, DASH_LBL.progress);
  sh.getRange(row, 2)
    .setFormula('=IFERROR(MAX(0,(' + CFG.BASELINE + '-' + maRef + ')/(' +
      CFG.BASELINE + '-' + CFG.TARGET_WEIGHT + ')),0)')
    .setNumberFormat('0.0%');
  SpreadsheetApp.getUi().alert('อัปเดต baseline เป็น ' + CFG.BASELINE + ' กก. แล้ว (แถว ' + row + ')');
}

/** ไปแถวว่างถัดไปในชีต Log */
function gotoNextRow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(LOG);
  if (!log) { SpreadsheetApp.getUi().alert('ยังไม่ได้ติดตั้ง — รัน "ติดตั้ง / รีเซ็ตชีต" ก่อน'); return; }
  const row = nextRow_(log);
  log.getRange(row, 1).setValue(new Date());
  ss.setActiveSheet(log);
  log.setActiveRange(log.getRange(row, 2));
}
