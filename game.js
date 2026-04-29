/* ============================================================
   라스트 워 : 에어 컴뱃 — game.js  v3
   Phase 1: 데미지 팝업 · 화면 흔들림 · -/÷ 게이트 · Web Audio SFX
   Phase 2: 오프라인 방치 보상 · 일일 퀘스트
   Phase 3: 무한 모드 · 개인 최고기록
   Phase 4: 보스 레이저빔 · 미니언 소환 · 부상/병원 시스템
   ============================================================ */

(function () {
"use strict";

/* ============================================================
   §2.5  렌더링 — 순수 2D Canvas 모드
   Three.js 코드 완전 비활성화, 모든 드로잉은 Canvas 2D API
   ============================================================ */

/* Three.js 관련 전역 변수 — 2D 모드에서는 모두 null */
let _three = null;
const _allyMeshPool = [];
let _bGeoAlly=null, _bMatAlly=null, _bGeoEnemy=null, _bMatEnemy=null, _bGeoFever=null, _bMatFever=null;

/* ── 스텁 함수: 2D 모드에서는 아무것도 안 함 ── */
function to3D(x, y)              { return { x: 0, z: 0 }; }
function clearMesh(obj)          { if (obj) obj.mesh = null; }
function createBulletMesh3D()    { return null; }
function createAllyMesh()        { return null; }
function createEnemyMesh()       { return null; }
function createBossMesh()        { return null; }
function updateGameMeshes()      {}
function initThreeBackground()   {}
function updateThreeBackground() {}

/* ============================================================
   §1  유틸리티
   ============================================================ */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand  = (a, b) => a + Math.random() * (b - a);
const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* UI: 보상·자원 한글 표기 */
const RES_NAME = { gold: '골드', fuel: '항공유', alloy: '합금', gems: '다이아' };
function fmtRewardLine(bundle) {
  if (!bundle || !Object.keys(bundle).length) return '—';
  return Object.entries(bundle)
    .map(([k, v]) => (k === 'scout' ? `랜덤 영입 ${v}회` : `${RES_NAME[k] || k} +${v}`))
    .join(' · ');
}

function toast(msg, kind = "ok") {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  el.style.borderColor = kind === "err" ? "var(--red)" : kind === "warn" ? "#ff9a2e" : "var(--gold)";
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* loadState/newState보다 먼저 초기화되어야 함 (const는 호이스팅 안 됨) */
const RESOURCE_CAP = 999999999;
function formatResDisplay(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return "0";
  const c = Math.max(0, Math.min(RESOURCE_CAP, n));
  return c.toLocaleString("ko-KR");
}
function sanitizeSaveResources(s) {
  if (!s) return;
  for (const k of ["gold", "fuel", "alloy", "gems"]) {
    const x = Math.floor(Number(s[k]));
    s[k] = Number.isFinite(x) ? Math.max(0, Math.min(RESOURCE_CAP, x)) : 0;
  }
}

/* ============================================================
   §2  정적 데이터
   ============================================================ */
const TYPES = {
  interceptor: { key:"I", name:"요격기", color:"#4eb4ff", bullet:"#8af4ff" },
  bomber:      { key:"B", name:"전폭기", color:"#ffae61", bullet:"#ffd36a" },
  gunship:     { key:"G", name:"건쉽",   color:"#a67bff", bullet:"#d2b6ff" }
};
const COUNTER = { interceptor:"bomber", bomber:"gunship", gunship:"interceptor" };
const RARITY_ORDER = ["N","R","SR","UR"];
const RARITY_MULT  = { N:1, R:1.25, SR:1.6, UR:2.1 };

const PILOT_POOL = [
  { name:"블레이즈", type:"interceptor", rarity:"R"  },
  { name:"팔콘",    type:"interceptor", rarity:"N"  },
  { name:"사이렌",  type:"interceptor", rarity:"SR" },
  { name:"바이퍼",  type:"interceptor", rarity:"UR" },
  { name:"스톰",    type:"bomber",      rarity:"R"  },
  { name:"볼텍스",  type:"bomber",      rarity:"N"  },
  { name:"레이븐",  type:"bomber",      rarity:"SR" },
  { name:"퀘이사",  type:"bomber",      rarity:"UR" },
  { name:"타이탄",  type:"gunship",     rarity:"R"  },
  { name:"바스티온",type:"gunship",     rarity:"N"  },
  { name:"시지",    type:"gunship",     rarity:"SR" },
  { name:"가디언",  type:"gunship",     rarity:"UR" }
];

const STAGES = [
  { id:1, name:"제1구역 · 스카우트 드론",   enemyTier:1, waves:5,  boss:false, unlock:0,    rewards:{ gold:120, fuel:40,  alloy:10 } },
  { id:2, name:"제2구역 · 기계 편대",        enemyTier:2, waves:6,  boss:false, unlock:0,    rewards:{ gold:180, fuel:60,  alloy:15 } },
  { id:3, name:"제3구역 · 뇌우 전선",        enemyTier:3, waves:7,  boss:true,  unlock:200,  weather:"storm",    rewards:{ gold:280, fuel:90,  alloy:25, gems:2 } },
  { id:4, name:"제4구역 · 궤도 방어선",      enemyTier:4, waves:8,  boss:false, unlock:800,  rewards:{ gold:360, fuel:120, alloy:35 } },
  { id:5, name:"제5구역 · 외계 모함",        enemyTier:5, waves:10, boss:true,  unlock:2000, rewards:{ gold:560, fuel:180, alloy:60, gems:4 } },
  { id:6, name:"제6구역 · 천공의 지배자",    enemyTier:6, waves:12, boss:true,  unlock:5000, weather:"magnetic", rewards:{ gold:900, fuel:280, alloy:100, gems:8 } },
  { id:99, name:"∞ 무한 모드", enemyTier:1, waves:9999, boss:false, unlock:0, endless:true, rewards:{ gold:30, fuel:15, alloy:6 } }
];

const RESEARCH = [
  { key:"engine",    name:"엔진 연구",    desc:"기체 이동속도 +4%/레벨",              color:"var(--sky)"    },
  { key:"weapon",    name:"무기 연구",    desc:"기본 공격력 +6%/레벨",                color:"var(--red)"    },
  { key:"armor",     name:"장갑 연구",    desc:"피격 시 분대 손실 확률 감소 +3%/레벨", color:"var(--green)"  },
  { key:"formation", name:"편대 대형",    desc:"최대 편대 수 +1/레벨",                color:"var(--gold)"   }
];
const FORTRESS = [
  { key:"tower",   name:"관제탑",      desc:"요새 레벨 상한 해금",               color:"var(--gold)"   },
  { key:"deck",    name:"비행 갑판",   desc:"출격 시 기본 편대 수 +1/레벨",      color:"var(--sky)"    },
  { key:"lab",     name:"항공 연구소", desc:"연구 효율 +5%/레벨",               color:"var(--purple)" },
  { key:"factory", name:"부품 공장",   desc:"전투 종료 시 자원 획득 +8%/레벨",  color:"var(--green)"  }
];
const JET_SKINS = [
  { id:"default", name:"표준 도색",   price:0,    buff:{ atk:0  }, icon:"✈"  },
  { id:"desert",  name:"사막 위장",   price:300,  buff:{ atk:5  }, icon:"🛩"  },
  { id:"arctic",  name:"극지 위장",   price:400,  buff:{ hp:5   }, icon:"🌨"  },
  { id:"phantom", name:"팬텀 스텔스", price:900,  buff:{ atk:10 }, icon:"👻"  },
  { id:"phoenix", name:"피닉스",      price:1800, buff:{ atk:18 }, icon:"🔥"  }
];
const FORT_SKINS = [
  { id:"default", name:"군용 프레임", price:0,    buff:{}, icon:"🏰"  },
  { id:"steam",   name:"스팀펑크",    price:600,  buff:{ goldRate:8  }, icon:"⚙"   },
  { id:"cyber",   name:"사이버펑크",  price:1200, buff:{ goldRate:15 }, icon:"🌀"  },
  { id:"alien",   name:"외계 비행선", price:3000, buff:{ goldRate:30, atk:10 }, icon:"🛸" }
];
const SHOP_ITEMS = [
  { id:"fuelS",   name:"항공유 팩(소)",   detail:"요새·출격에 쓰는 항공유 100",        cost:10,  give:{ fuel:100  } },
  { id:"fuelL",   name:"항공유 팩(대)",   detail:"대량 항공유 600",                   cost:50,  give:{ fuel:600  } },
  { id:"alloyS",  name:"합금 팩(소)",     detail:"연구·치료에 쓰는 합금 60",         cost:15,  give:{ alloy:60  } },
  { id:"alloyL",  name:"합금 팩(대)",     detail:"합금 400",                        cost:80,  give:{ alloy:400 } },
  { id:"goldS",   name:"골드 꾸러미",     detail:"영웅 레벨업용 골드 2000",         cost:30,  give:{ gold:2000 } },
  { id:"starter", name:"에이스 보급",     detail:"랜덤 영입권 3회 (파일럿 추가)",     cost:200, give:{ scout:3   } }
];
const SEASON_PASS = [
  { tier:1, kills:10,  rewards:{ gold:300  } },
  { tier:2, kills:30,  rewards:{ fuel:200  } },
  { tier:3, kills:60,  rewards:{ alloy:120 } },
  { tier:4, kills:100, rewards:{ gems:20   } },
  { tier:5, kills:150, rewards:{ gold:1200, gems:30 } }
];

/* 일일 퀘스트 정의 */
const DAILY_QUEST_DEF = [
  { id:"dqKills", desc:"적 100기 격추",      goal:100, reward:{ gems:5  }, icon:"⚔" },
  { id:"dqScout", desc:"스카우트 1회 진행",  goal:1,   reward:{ gems:3  }, icon:"🎯" },
  { id:"dqFort",  desc:"요새 1회 업그레이드",goal:1,   reward:{ alloy:80 },icon:"🏰" },
  { id:"dqClear", desc:"스테이지 1회 클리어",goal:1,   reward:{ fuel:200 },icon:"✅" },
  { id:"dqGates", desc:"게이트 50회 통과",   goal:50,  reward:{ gold:500 },icon:"🚀" }
];

/* ============================================================
   §3  세이브 / 로드 (XOR 패킹 + FNV-1a 무결성 · 구버전 평문 마이그레이션)
   ============================================================ */
const SAVE_KEY = "lastwar_aircombat_v2";
const SAVE_WRAP_VER = 1;

const _saveKeyBytes = new Uint8Array([108, 97, 115, 116, 119, 97, 114, 95, 115, 52, 118, 101, 95, 107, 59, 33]);
const _saveSigSalt = "lastwar|fnv1a|wrap1";

function _fnv1aBytes(buf) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
function _xorU8(data, key) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}
function _u8ToB64(u8) {
  let bin = "";
  const chunk = 8192;
  for (let i = 0; i < u8.length; i += chunk)
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(bin);
}
function _b64ToU8(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function _packSave(stateObj) {
  const te = new TextEncoder();
  const json = JSON.stringify(stateObj);
  const jsonBytes = te.encode(json);
  const sigBytes = te.encode(json + _saveSigSalt);
  const sig = _fnv1aBytes(sigBytes);
  const enc = _xorU8(jsonBytes, _saveKeyBytes);
  return JSON.stringify({ v: SAVE_WRAP_VER, p: _u8ToB64(enc), s: sig });
}
function _unpackSave(wrappedStr) {
  const w = JSON.parse(wrappedStr);
  if (!w || w.v !== SAVE_WRAP_VER || typeof w.p !== "string" || typeof w.s !== "string") throw new Error("fmt");
  const raw = _xorU8(_b64ToU8(w.p), _saveKeyBytes);
  const td = new TextDecoder();
  const json = td.decode(raw);
  const te = new TextEncoder();
  if (_fnv1aBytes(te.encode(json + _saveSigSalt)) !== w.s) throw new Error("sig");
  return JSON.parse(json);
}

function newState() {
  const starters = ["블레이즈","타이탄","스톰"];
  const pilots = starters.map(n => {
    const base = PILOT_POOL.find(p => p.name === n);
    return { id:"p"+Math.random().toString(36).slice(2,8), name:base.name, type:base.type, rarity:base.rarity, level:1 };
  });
  const s = {
    gold:400, fuel:150, alloy:80, gems:30,
    ownedPilots: pilots,
    formation:   [pilots[0].id, pilots[1].id, pilots[2].id, null, null],
    research:    { engine:1, weapon:1, armor:1, formation:1 },
    fortress:    { tower:1, deck:1, lab:1, factory:1 },
    unlockedJetSkins:  ["default"],
    unlockedFortSkins: ["default"],
    equippedJetSkin:   "default",
    equippedFortSkin:  "default",
    seasonKills:0, claimedPass:[], totalKills:0, bestScore:0, stageCleared:0,
    /* Phase 2 */
    injuredPilots:0,
    dailyQuestDate:"",
    dailyProgress:{ dqKills:0, dqScout:0, dqFort:0, dqClear:0, dqGates:0 },
    dailyCompleted:[],
    /* Phase 3 */
    endlessBest:0,
    tutorialDone: false
  };
  sanitizeSaveResources(s);
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return newState();
    let payload;
    try {
      payload = _unpackSave(raw);
    } catch {
      let leg;
      try { leg = JSON.parse(raw); } catch { return newState(); }
      if (leg && typeof leg.gold === "number") payload = leg;
      else return newState();
    }
    const s = Object.assign(newState(), payload);
    if (typeof s.tutorialDone !== "boolean") s.tutorialDone = (s.bestScore | 0) > 50;
    delete s.rankHistory;
    delete s.v;
    delete s.p;
    delete s.s;
    sanitizeSaveResources(s);
    return s;
  } catch { return newState(); }
}
function saveState() {
  try { localStorage.setItem(SAVE_KEY, _packSave(S)); } catch (_) { /* 저장 실패 무시 (사파리 프라이빗 등) */ }
}

let S = loadState();

/* ============================================================
   §4  재화 · 파일럿 헬퍼
   ============================================================ */
function updateCurrency() {
  const set = (id, v) => {
    const el = $(id);
    if (el) el.textContent = formatResDisplay(v);
  };
  set("cGold", S.gold);
  set("cFuel", S.fuel);
  set("cAlloy", S.alloy);
  set("cGem", S.gems);
  /* 전투 중 미니 재화 바 (상단 칩과 동기화) */
  set("bcGold", S.gold);
  set("bcFuel", S.fuel);
  set("bcAlloy", S.alloy);
  set("bcGem", S.gems);
}
function canAfford(cost) {
  for (const k in cost) if ((S[k]||0) < cost[k]) return false;
  return true;
}
function pay(cost) {
  for (const k in cost) {
    const sub = Math.floor(Number(cost[k]) || 0);
    if (sub <= 0) continue;
    const cur = Math.floor(Number(S[k]) || 0);
    S[k] = Math.max(0, Math.min(RESOURCE_CAP, cur - sub));
  }
  sanitizeSaveResources(S);
  updateCurrency(); saveState();
}
function give(bundle) {
  if (!bundle) return;
  const addRes = (key, raw) => {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return;
    const cur = Math.floor(Number(S[key]) || 0);
    S[key] = Math.min(RESOURCE_CAP, cur + n);
  };
  addRes("gold", bundle.gold);
  addRes("fuel", bundle.fuel);
  addRes("alloy", bundle.alloy);
  addRes("gems", bundle.gems);
  if (bundle.scout) for (let i = 0; i < bundle.scout; i++) addRandomPilot();
  sanitizeSaveResources(S);
  updateCurrency();
  saveState();
  requestAnimationFrame(() => updateCurrency());
}
function pilotPower(p) { return Math.round((60 + p.level*22) * RARITY_MULT[p.rarity]); }
function pilotAtk(p)   { return (9 + p.level*2.2) * RARITY_MULT[p.rarity]; }
function pilotHp(p)    { return Math.round((30 + p.level*8) * RARITY_MULT[p.rarity]); }
function findPilot(id) { return S.ownedPilots.find(p => p.id === id); }
function addRandomPilot() {
  const r = Math.random();
  let rarity = "N";
  if (r > 0.55) rarity = "R";
  if (r > 0.85) rarity = "SR";
  if (r > 0.97) rarity = "UR";
  const options = PILOT_POOL.filter(p => p.rarity === rarity);
  const base = pick(options) || PILOT_POOL[0];
  const np = { id:"p"+Math.random().toString(36).slice(2,8), name:base.name, type:base.type, rarity:base.rarity, level:1 };
  S.ownedPilots.push(np);
  return np;
}

/* ============================================================
   §5  오디오 시스템 (Web Audio API)  [Phase 1]
   ============================================================ */
let _audioCtx = null;
let _soundOn  = true;

function ensureAudio() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  if (_audioCtx && _audioCtx.state === "suspended") _audioCtx.resume();
}

function playTone(type, freqStart, freqEnd, vol, dur, startOffset = 0) {
  if (!_audioCtx || !_soundOn) return;
  const t = _audioCtx.currentTime + startOffset;
  const o = _audioCtx.createOscillator();
  const g = _audioCtx.createGain();
  o.connect(g); g.connect(_audioCtx.destination);
  o.type = type;
  o.frequency.setValueAtTime(freqStart, t);
  if (freqEnd !== freqStart) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur * 0.9);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t); o.stop(t + dur + 0.01);
}

function playSfx(type) {
  if (!_audioCtx || !_soundOn) return;
  switch (type) {
    case "shoot":        playTone("square",   640, 280, 0.04, 0.06); break;
    case "hit_enemy":    playTone("triangle", 320, 140, 0.06, 0.10); break;
    case "explosion":    playTone("sawtooth", 200, 45,  0.09, 0.35); break;
    case "hit_ally":     playTone("sawtooth", 250, 90,  0.08, 0.18); break;
    case "gate_pos":
      playTone("sine", 440, 880, 0.05, 0.15);
      playTone("sine", 660, 1320, 0.04, 0.12, 0.08);
      break;
    case "gate_neg":     playTone("square",   320, 140, 0.05, 0.22); break;
    case "powerup":
      playTone("sine", 330, 330, 0.05, 0.07);
      playTone("sine", 440, 440, 0.05, 0.07, 0.08);
      playTone("sine", 660, 660, 0.05, 0.07, 0.16);
      playTone("sine", 880, 880, 0.06, 0.14, 0.24);
      break;
    case "boss_appear":
      playTone("square", 220, 220, 0.07, 0.12);
      playTone("square", 440, 440, 0.07, 0.12, 0.14);
      playTone("square", 220, 220, 0.07, 0.12, 0.28);
      playTone("square", 440, 440, 0.07, 0.18, 0.42);
      break;
    case "laser_charge": playTone("sine",     200, 1400, 0.05, 0.60); break;
    case "laser_fire":   playTone("sawtooth", 900,  900, 0.08, 0.32); break;
    case "gameover":     playTone("sawtooth", 280,  55,  0.09, 0.55); break;
    case "clear":
      playTone("sine", 440, 440, 0.06, 0.10);
      playTone("sine", 550, 550, 0.06, 0.10, 0.12);
      playTone("sine", 660, 660, 0.06, 0.10, 0.24);
      playTone("sine", 880, 880, 0.07, 0.28, 0.36);
      break;
    case "ui_click":     playTone("sine",     520,  520, 0.04, 0.07); break;
    case "level_up":
      playTone("sine", 440, 440, 0.06, 0.08);
      playTone("sine", 550, 550, 0.06, 0.08, 0.10);
      playTone("sine", 770, 770, 0.07, 0.18, 0.20);
      break;
  }
}

/* Sound toggle button */
const $soundBtn = $("btnSound");
$soundBtn.textContent = "🔊";
$soundBtn.addEventListener("click", () => {
  ensureAudio();
  _soundOn = !_soundOn;
  $soundBtn.textContent = _soundOn ? "🔊" : "🔇";
  toast(_soundOn ? "사운드 ON" : "사운드 OFF");
});

/* ============================================================
   §6  화면 흔들림 + 데미지 팝업  [Phase 1]
   ============================================================ */
const _shake = { frames:0, intensity:0 };
function triggerShake(intensity, frames) {
  _shake.intensity = Math.max(_shake.intensity, intensity);
  _shake.frames    = Math.max(_shake.frames, frames);
}

/* ── 액션 주스 전역 상태 ── */
let _hitstop = 0;

/* 피버 타임 */
const _fever = {
  gauge:0, maxGauge:100, active:false, timer:0, maxTimer:480,
  lines: Array.from({length:32}, () => ({ x:0, y:0, len:60, speed:14, alpha:0.5 }))
};

/* 편대·게이트 밸런스 */
const SQUAD_HARD_CAP        = 200;
const GATE_MULT_ABS_MAX     = 1.35; /* 곱하기 절대 상한 (표시·탄 조준용) */
const GATE_FIXED_DIVISOR    = 2;    /* 나누기 — 초반 전용, 후반은 % 페널티 */
const GATE_LATE_WAVE        = 10;   /* 이 웨이브부터 -/÷ % 페널티 */
const GATE_LATE_TIER        = 4;    /* 또는 이 적 티어 이상 */

let _lastBattleCurrencySync = 0;

function _triggerFeverIfFull() {
  if (_fever.gauge >= _fever.maxGauge && !_fever.active) {
    _fever.active = true; _fever.timer = _fever.maxTimer; _fever.gauge = 0;
    for (const l of _fever.lines) { l.x = Math.random()*W; l.y = Math.random()*H; l.len = 60+Math.random()*120; l.speed = 12+Math.random()*18; }
    toast("⚡ FEVER TIME!", "info"); triggerShake(5, 10);
  }
}

/** 편대 상한 초과분 → 피버 + 폭탄(궁극기) 쿨 일부 회복 */
function addSquadWithOverflowFever(n) {
  let add = Math.floor(n);
  if (add <= 0) return;
  const cap = B.maxSquad > 0 ? B.maxSquad : SQUAD_HARD_CAP;
  const room = Math.max(0, cap - B.squad);
  const toSquad = Math.min(add, room);
  B.squad += toSquad;
  add -= toSquad;
  if (add <= 0) return;
  _fever.gauge = Math.min(_fever.maxGauge, _fever.gauge + add * 0.55);
  _triggerFeverIfFull();
  if (B.player) B.player._bombCd = Math.max(0, (B.player._bombCd || 0) - Math.floor(add * 14));
}

/** 후반부 -/÷ 게이트: 순수 수치보다 «현재 병력 비율» 페널티를 우선 */
function _gateLatePenaltyActive() {
  const w = B.wave || 1;
  const t = B.stage?.enemyTier || 1;
  return w >= GATE_LATE_WAVE || t >= GATE_LATE_TIER;
}

/* 킬스트릭 어나운서 */
const _streak = { count:0, timer:0, showTimer:0, text:"", color:"#ffdd00" };

/* 융단 레이저 등 각성 무기 — 화면 주스(섬광·반전·쉐이크) */
const _awakeningJuice = { timer: 0, flash: 0 };
function fireAwakeningScreenJuice() {
  _awakeningJuice.timer = 62;
  _awakeningJuice.flash = 20;
  triggerShake(26, 68);
  playSfx("laser_fire");
}

/* 불릿타임 */
let _bulletTimeAlpha = 0;

/* 영웅 궁극기 컷신 */
const _ult = { active:false, phase:0, timer:0, beams:[], slowFrames:0 };

/* ════════════════════════════════════════════════════
   인게임 로그라이크 스킬 시스템
   ════════════════════════════════════════════════════ */
const SKILL_MAX_LEVEL = 3;
const SKILL_POOL = [
  { id:'dual_shot',    icon:'💥', name:'이중 사격',      descBase:'총알이 2갈래로 분리',          rarity:'rare',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _skillState.dualShot = true; } },
  { id:'triple_shot',  icon:'🔱', name:'트리플 샷',      descBase:'총알 3방향 동시 발사',          rarity:'rare',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _skillState.tripleShot = true; } },
  { id:'explosive',    icon:'💣', name:'폭발탄',          descBase:'명중 시 작은 폭발',            rarity:'rare',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _skillState.explosive = true; } },
  { id:'rapid_fire',   icon:'⚡', name:'연사 강화',       descBase:'발사 속도 대폭 증가',          rarity:'rare',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _skillState.rapidFire = true; } },
  { id:'giant_bullets',icon:'🔵', name:'거대 탄환',       descBase:'탄 크기·데미지 증가',          rarity:'epic',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _skillState.giantBullets = true; } },
  { id:'guided',       icon:'🎯', name:'유도 미사일',     descBase:'추적 탄 (각성: 레이저 시너지)', rarity:'epic',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _skillState.guided = true; _skillState.guidedTier = lv; } },
  { id:'heal_squad',   icon:'💚', name:'응급 치료',       descBase:'아군 증원',                    rarity:'rare',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { addSquadWithOverflowFever(4 + lv * 3); } },
  { id:'overdrive',    icon:'🔥', name:'오버드라이브',    descBase:'피버 게이지 충전',             rarity:'epic',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _fever.gauge = _fever.maxGauge; _triggerFeverIfFull(); } },
  { id:'shield',       icon:'🛡', name:'실드',            descBase:'피격 무효 스택',               rarity:'epic',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _skillState.shieldCount = (_skillState.shieldCount||0) + 1; } },
  { id:'emp',          icon:'⚡', name:'EMP',             descBase:'적탄 제거',                    rarity:'rare',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { for (const b of B.enemyBullets) clearMesh(b); B.enemyBullets=[]; } },
  { id:'damage_up',    icon:'⬆', name:'화력 강화',       descBase:'전체 데미지 (레벨당 +12%)',     rarity:'rare',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _skillState.damageMult = (_skillState.damageMult||1) * 1.12; } },
  { id:'multi_squad',  icon:'✈', name:'편대 증원',       descBase:'아군 추가 (레벨당 증가)',       rarity:'epic',   maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { addSquadWithOverflowFever(6 + lv * 5); } },
  { id:'laser_mode',   icon:'🔦', name:'레이저 모드',     descBase:'관통 레이저 (각성: 유도 시너지)', rarity:'legend', maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _skillState.laserMode = true; _skillState.laserTier = lv; } },
  { id:'time_warp',    icon:'⏱', name:'타임 워프',       descBase:'적 속도 감소',                 rarity:'legend', maxLevel: SKILL_MAX_LEVEL,
    pick(lv) { _skillState.timeWarpTimer = 1800 + lv * 240; } },
];
const _skillState = {
  dualShot: false, tripleShot: false, explosive: false, rapidFire: false,
  giantBullets: false, guided: false, guidedTier: 0, shieldCount: 0, damageMult: 1,
  laserMode: false, laserTier: 0, timeWarpTimer: 0,
  synergyCarpetLaser: false, _synergyToastShown: false, _synergyJuiceFired: false
};
let _skillLevels = {};
let _skillKillMilestone = 15; /* 처음 스킬 선택 기준 킬 */
let _skillPickerOpen = false;
let _adRewardApplied = false;   /* 이번 판 광고 보상 사용 여부 */
let _adNoAds = false;           /* 광고 제거 패키지 소유 여부 */
let _pendingRewards = null;     /* 광고 시청 후 지급할 보상 */

function _refreshSkillSynergy() {
  const need = SKILL_MAX_LEVEL;
  if ((_skillLevels.laser_mode|0) >= need && (_skillLevels.guided|0) >= need) {
    _skillState.synergyCarpetLaser = true;
    if (!_skillState._synergyToastShown) {
      _skillState._synergyToastShown = true;
      toast('✨ 각성: 융단 폭격 레이저!', 'ok');
      playSfx('powerup');
    }
    if (!_skillState._synergyJuiceFired) {
      _skillState._synergyJuiceFired = true;
      fireAwakeningScreenJuice();
    }
  } else {
    _skillState.synergyCarpetLaser = false;
  }
}

function _pickRandomSkills(n) {
  const eligible = SKILL_POOL.filter(sk => (_skillLevels[sk.id] || 0) < (sk.maxLevel ?? SKILL_MAX_LEVEL));
  if (!eligible.length) return [];
  const pool = eligible;
  const result = [];
  let filtered = pool.filter(s => s.rarity !== 'legend' || Math.random() < 0.18);
  for (let i = 0; i < n && filtered.length > 0; i++) {
    const idx = Math.floor(Math.random() * filtered.length);
    const sk = filtered.splice(idx, 1)[0];
    result.push(sk);
    filtered = filtered.filter(s => s.id !== sk.id);
  }
  while (result.length < n) {
    const rest = pool.filter(s => !result.some(r => r.id === s.id));
    if (!rest.length) break;
    result.push(pick(rest));
  }
  return result;
}

function openSkillPicker() {
  if (_skillPickerOpen) return;
  _skillPickerOpen = true;
  B.paused = true; /* 게임 일시정지 */
  const el = document.getElementById('skillPicker');
  if (!el) return;
  el.classList.remove('hidden');
  const cards = document.getElementById('skillCards');
  cards.innerHTML = '';
  const chosen = _pickRandomSkills(3);
  if (!chosen.length) {
    _skillPickerOpen = false;
    B.paused = false;
    el.classList.add('hidden');
    _skillKillMilestone = B.kills + 20;
    return;
  }
  for (const sk of chosen) {
    const div = document.createElement('div');
    div.className = `skill-card rarity-${sk.rarity}`;
    const cur = _skillLevels[sk.id] || 0;
    const mx = sk.maxLevel ?? SKILL_MAX_LEVEL;
    const nextLv = cur + 1;
    div.innerHTML = `<div class="skill-card-icon">${sk.icon}</div>
      <div class="skill-card-name">${sk.name} <span style="opacity:.85;font-size:11px">Lv.${nextLv}/${mx}</span></div>
      <div class="skill-card-desc">${sk.descBase}${cur ? ` · 강화 ${cur}→${nextLv}` : ''}</div>`;
    div.addEventListener('click', () => selectSkill(sk));
    cards.appendChild(div);
  }
}
function selectSkill(sk) {
  const mx = sk.maxLevel ?? SKILL_MAX_LEVEL;
  const cur = _skillLevels[sk.id] || 0;
  if (cur >= mx) return;
  _skillLevels[sk.id] = cur + 1;
  sk.pick(_skillLevels[sk.id]);
  _refreshSkillSynergy();
  _skillPickerOpen = false;
  B.paused = false;
  const el = document.getElementById('skillPicker');
  if (el) el.classList.add('hidden');
  _skillKillMilestone += 20; /* 다음 스킬은 20킬 후 */
  toast(`✅ ${sk.name} Lv.${_skillLevels[sk.id]}!`, 'ok');
}

/* ═══════════════════════════════════════════════════════════
   BM / 광고 — 웹은 스텁, Unity·Godot 등에서는 이 객체만 SDK로 교체
   ═══════════════════════════════════════════════════════════ */
const GameMonetization = {
  hasNoAds() { return !!_adNoAds; },
  setNoAds(value) {
    _adNoAds = !!value;
    const adBtn = $('btnAdReward');
    if (adBtn && _adNoAds) adBtn.textContent = '✅ 광고 제거 패키지 보유 중';
  },
  /**
   * 보상형 광고 (예: AdMob Rewarded).
   * @param {string} placement - 예: 'gameover_triple', 'shop_bonus'
   * @returns {Promise<{ ok: boolean, cancelled?: boolean, error?: string }>}
   */
  async showRewardedAd(placement) {
    void placement;
    /* 웹 스텁: SDK 연동 시 이 블록만 플랫폼 코드로 교체 */
    await new Promise(r => setTimeout(r, 320));
    return { ok: true };
  },
};
if (typeof window !== "undefined") window.GameMonetization = GameMonetization;

/** 광고 완료 후 호출 — 실제 2배 추가 지급 (기존 1배 + 2배 = 표시상 3배) */
function applyRewardedBonusFromPending() {
  if (_adRewardApplied || !_pendingRewards) return;
  _adRewardApplied = true;
  const extra = {};
  Object.entries(_pendingRewards).forEach(([k, v]) => {
    const n = Math.floor(Number(v) || 0);
    if (n > 0) extra[k] = n * 2;
  });
  give(extra);
  updateCurrency();
  $("overRewards").innerHTML += ' <span style="color:#ffd76a;font-weight:900;">× 3배!</span>';
  const adBtn = $('btnAdReward');
  if (adBtn) { adBtn.textContent = '✅ 3배 보상 수령 완료!'; adBtn.disabled = true; }
  toast('🎉 보상 3배 획득!', 'ok');
  saveState();
}

async function requestRewardedBonusFlow() {
  if (GameMonetization.hasNoAds()) return;
  if (_adRewardApplied || !_pendingRewards) return;
  const res = await GameMonetization.showRewardedAd('gameover_triple');
  if (!res || !res.ok) {
    toast(res?.cancelled ? '광고가 취소되었습니다.' : (res?.error || '보상을 받을 수 없습니다.'), 'warn');
    return;
  }
  applyRewardedBonusFromPending();
}

/* 상점 함수 */
function shopBuy(item) {
  if (item === 'no_ads') {
    GameMonetization.setNoAds(true);
    toast('🎉 광고 제거 패키지 적용! 보상 3배 자동 지급됩니다.', 'ok');
  } else if (item === 'starter') {
    give({ gold:10000, gems:100 });
    const hasUr = S.ownedPilots.some(p => p.rarity === 'UR');
    if (!hasUr) {
      const base = pick(PILOT_POOL.filter(p => p.rarity === 'UR')) || PILOT_POOL[0];
      S.ownedPilots.push({ id: 'p' + Math.random().toString(36).slice(2, 8), name: base.name, type: base.type, rarity: 'UR', level: 1 });
    }
    updateCurrency();
    saveState();
    toast('스타터 패키지: 골드·다이아 지급' + (hasUr ? '' : ' (UR 영입)'), 'ok');
  } else if (item === 'season') {
    toast('🌟 시즌 패스 기능은 곧 출시됩니다!', 'warn');
  } else {
    const gemMap = { gem60:60, gem330:330, gem680:680, gem1400:1400 };
    if (gemMap[item]) {
      give({ gems: gemMap[item] }); updateCurrency();
      toast(`💎 ${gemMap[item]} 다이아 지급!`, 'ok');
    }
  }
}
function shopAdScout()  { toast('📺 광고 기능은 출시 후 활성화됩니다.', 'warn'); }
function shopAdGold()   { give({ gold: 5000 }); updateCurrency(); toast('💰 골드 5,000 획득!', 'ok'); }

/* 보스 화이트아웃 */
const _bossDeath = { dying:false, timer:0, whiteout:0, missionTimer:0 };

/* ── 킬 이벤트 공통 처리 (스트릭 + 피버 게이지 + 스킬 마일스톤) ── */
function _onKill() {
  _streak.count++;
  _streak.timer = 200;
  _fever.gauge = Math.min(_fever.maxGauge, _fever.gauge + 7);
  _triggerFeverIfFull();
  if      (_streak.count === 50) { _streak.text="GODLIKE!!!";   _streak.color=null;      _streak.showTimer=130; triggerShake(14,35); }
  else if (_streak.count === 30) { _streak.text="UNSTOPPABLE!"; _streak.color="#ff5500"; _streak.showTimer=110; triggerShake(8, 20); }
  else if (_streak.count === 10) { _streak.text="RAMPAGE!";     _streak.color="#ffdd00"; _streak.showTimer=100; triggerShake(5, 12); }
  else if (_streak.count > 50 && _streak.count % 10 === 0) { _streak.text="GODLIKE!!!"; _streak.color=null; _streak.showTimer=100; }
  /* 로그라이크 스킬 선택 마일스톤 */
  if (B.kills > 0 && B.kills >= _skillKillMilestone) {
    _skillKillMilestone = B.kills + 20; /* 다음 트리거 미리 갱신 */
    openSkillPicker();
  }
}
const _dmgTexts = [];

/* ── 3D 지형 배경 스크롤 상태 ── */
let _bgScroll = 0;
let _bgIslands = [], _bgShips = [], _bgClouds = [];
function addDmgText(x, y, dmg, crit = false, isBoss = false) {
  _dmgTexts.push({
    x: x + (Math.random()-0.5)*24,
    y,
    text:  isBoss ? `★${Math.round(dmg)}` : crit ? `${Math.round(dmg)} CRIT!` : `${Math.round(dmg)}`,
    color: isBoss ? "#ff4400" : crit ? "#ffd76a" : "#ffffff",
    size:  isBoss ? 20 : crit ? 18 : 13,
    vy:    isBoss ? -2.6 : crit ? -2.2 : -1.6,
    life:  isBoss ? 55 : crit ? 50 : 38,
    max:   isBoss ? 55 : crit ? 50 : 38,
    isBoss
  });
}
function updateDmgTexts() {
  for (let i = _dmgTexts.length-1; i>=0; i--) {
    const t = _dmgTexts[i];
    t.y  += t.vy;
    t.vy *= 0.96;
    t.life--;
    if (t.life <= 0) _dmgTexts.splice(i, 1);
  }
}
function drawDmgTexts() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  for (const t of _dmgTexts) {
    const alpha = t.life / t.max;
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${t.size}px sans-serif`;
    /* 외곽선으로 배경과 대비 확보 */
    ctx.strokeStyle = "rgba(0,0,0,0.90)";
    ctx.lineWidth   = t.text.includes("CRIT") ? 5 : 4;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    if (t.text.includes("CRIT"))  { ctx.shadowColor="#ffd76a"; ctx.shadowBlur=10; }
    else if (t.isBoss) { ctx.shadowColor="#ff4400"; ctx.shadowBlur=14; }
    ctx.fillText(t.text, t.x, t.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ============================================================
   §7  오프라인 방치 보상  [Phase 2]
   ============================================================ */
function checkOfflineRewards() {
  const lastLogin = parseInt(localStorage.getItem("lastwar_lastlogin")||"0");
  const now = Date.now();
  localStorage.setItem("lastwar_lastlogin", String(now));
  if (!lastLogin) return;
  const elapsedMin = Math.min((now - lastLogin) / 60000, 480); // 최대 8시간
  if (elapsedMin < 1) return;

  const goldRate  = S.fortress.factory * 3.0;
  const fuelRate  = S.fortress.deck    * 2.0;
  const alloyRate = S.fortress.lab     * 1.2;

  const g = Math.floor(elapsedMin * goldRate);
  const f = Math.floor(elapsedMin * fuelRate);
  const a = Math.floor(elapsedMin * alloyRate);

  S.gold  += g; S.fuel += f; S.alloy += a;
  sanitizeSaveResources(S);
  saveState();

  if (g+f+a > 0) {
    const h = Math.floor(elapsedMin/60), m = Math.floor(elapsedMin%60);
    const timeStr = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    // 모달로 보여주기
    window._pendingOffline = { g, f, a, timeStr };
  }
}

function showOfflineModal(data) {
  if (!data) return;
  const host = $("offlineRewards");
  host.innerHTML = "";
  const add = (label, val) => {
    if (!val) return;
    const sp = document.createElement("span");
    sp.className = "tag N";
    sp.textContent = `${label} +${val}`;
    host.appendChild(sp);
  };
  add("골드", data.g); add("항공유", data.f); add("합금", data.a);
  $("offlineTimeText").textContent = `${data.timeStr} 동안 기지가 자원을 생산했습니다.`;
  $("offlineModal").classList.add("show");
}

$("btnCloseOffline").addEventListener("click", () => {
  $("offlineModal").classList.remove("show");
  updateCurrency();
});

/* ============================================================
   §8  일일 퀘스트 시스템  [Phase 2]
   ============================================================ */
function resetDailyQuestsIfNeeded() {
  const today = new Date().toDateString();
  if (S.dailyQuestDate !== today) {
    S.dailyQuestDate  = today;
    S.dailyProgress   = { dqKills:0, dqScout:0, dqFort:0, dqClear:0, dqGates:0 };
    S.dailyCompleted  = [];
    saveState();
  }
}

function trackQuest(id, amount = 1) {
  resetDailyQuestsIfNeeded();
  if (S.dailyCompleted.includes(id)) return;
  S.dailyProgress[id] = (S.dailyProgress[id]||0) + amount;
  const def = DAILY_QUEST_DEF.find(q => q.id === id);
  if (def && S.dailyProgress[id] >= def.goal) {
    // 자동 완료 표시 (클레임은 수동)
    renderQuests();
  }
}

/* ============================================================
   §9  페이지 전환
   ============================================================ */
function showTitle() {
  $("titlePage").classList.remove("hidden");
  $("lobbyPage").classList.add("hidden");
  $("battlePage").classList.add("hidden");
  $("tabbar").classList.add("hidden");
}
const TUTORIAL_STEPS = [
  { title: '1. 출격', body: '출격에서 스테이지를 고릅니다. 잠긴 맵은 <b>최고 점수</b>로 열립니다. 무한은 끝없이 버티며 기록을 남깁니다.' },
  { title: '2. 편대', body: '편대 탭에서 빈 슬롯을 눌러 파일럿을 넣습니다. <b>앞줄</b>이 먼저 맞습니다. 요격 → 전폭 → 건쉽 상성이 있습니다.' },
  { title: '3. 전투', body: '좌우 이동으로 탄을 피하고 적을 격추합니다. <b>스페이스</b>는 광역(P 일시정지 · M 로비). 드롭·게이트로 강해집니다.' },
  { title: '4. 성장', body: '영웅·연구·요새·스킨·상점은 기지를 키웁니다. 진행은 <b>이 기기</b>에만 저장됩니다. (인터넷 대전 아님)' }
];
let _tutFromHelp = false;
let _tutStep = 0;
function openTutorial(fromHelp) {
  _tutFromHelp = !!fromHelp;
  _tutStep = 0;
  const m = $('tutorialModal');
  if (!m) return;
  const title = $('tutTitle');
  const body = $('tutBody');
  renderTutStep();
  m.classList.add('show');
}
function renderTutStep() {
  const sk = TUTORIAL_STEPS[_tutStep];
  if (!sk) return;
  const title = $('tutTitle');
  const body = $('tutBody');
  const nextBtn = $('btnTutNext');
  if (title) title.textContent = sk.title;
  if (body) body.innerHTML = sk.body;
  if (nextBtn) nextBtn.textContent = _tutStep >= TUTORIAL_STEPS.length - 1 ? '이해했습니다' : '다음';
}
function closeTutorial() {
  const m = $('tutorialModal');
  if (m) m.classList.remove('show');
  if (!_tutFromHelp) { S.tutorialDone = true; saveState(); }
  _tutFromHelp = false;
}

function showLobby(tab) {
  $("titlePage").classList.add("hidden");
  $("lobbyPage").classList.remove("hidden");
  $("battlePage").classList.add("hidden");
  $("tabbar").classList.remove("hidden");
  if (tab) setTab(tab);
  renderAll();
  if (!S.tutorialDone) setTimeout(() => openTutorial(false), 450);
}
function showBattle() {
  $("titlePage").classList.add("hidden");
  $("lobbyPage").classList.add("hidden");
  $("battlePage").classList.remove("hidden");
  $("tabbar").classList.add("hidden");
  resizeCanvas();
  initThreeBackground();
}
function setTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".section").forEach(s => s.classList.toggle("active", s.dataset.section === name));
}
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => { playSfx("ui_click"); setTab(t.dataset.tab); renderAll(); });
});

/* ============================================================
   §10  렌더링: 출격 탭
   ============================================================ */
function renderStages() {
  const host = $("stageList");
  host.innerHTML = "";
  STAGES.forEach(st => {
    const locked = !st.endless && S.bestScore < st.unlock;
    const el = document.createElement("div");
    el.className = "stage-card" + (locked ? " locked" : "") + (st.endless ? " endless-card" : "");
    const rewards = Object.entries(st.rewards).map(([k, v]) => `<span class="tag N res-tag">${RES_NAME[k] || k} +${v}</span>`).join(" ");
    const weatherTxt = st.weather === "storm" ? "뇌우" : st.weather === "magnetic" ? "자기장" : "맑음";
    el.innerHTML = `
      <div class="stage-card__head">
        <h3 class="stage-card__title">${st.name}</h3>
        <div class="stage-card__badges">${st.boss ? "<span class='tag tag-boss'>BOSS</span>" : ""}${st.endless ? "<span class='tag UR'>∞</span>" : ""}</div>
      </div>
      <p class="stage-card__meta">난이도 T${st.enemyTier} · ${st.endless ? "끝없음" : st.waves + "웨이브"} · ${weatherTxt}</p>
      <div class="stage-card__reward"><span class="reward-label">클리어 보너스</span><div class="reward">${rewards}</div></div>
      ${st.endless && S.endlessBest > 0 ? `<p class="stage-card__best">최고 웨이브 <b>${S.endlessBest}</b></p>` : ""}
      <div class="stage-card__actions">
        <button type="button" class="btn ${locked ? "ghost" : st.endless ? "gold" : "primary"} btn-block stage-go" ${locked ? "disabled" : ""}>
          ${locked ? `해제: 점수 ${st.unlock}` : st.endless ? "무한 출격" : "출격"}
        </button>
      </div>`;
    if (!locked) el.querySelector(".stage-go").addEventListener("click", e => { e.stopPropagation(); playSfx("ui_click"); startBattle(st); });
    host.appendChild(el);
  });
}

/* ============================================================
   §11  렌더링: 편대 탭
   ============================================================ */
function renderSquad() {
  const host = $("squadBoard");
  host.innerHTML = "";
  const labels = ["선봉 1", "선봉 2", "후위 1", "후위 2", "후위 3"];
  S.formation.forEach((pid, idx) => {
    const slot = document.createElement("div");
    slot.className = "squad-slot" + (pid ? " filled" : "");
    const p = pid ? findPilot(pid) : null;
    if (p) {
      const t = TYPES[p.type];
      slot.innerHTML = `
        <span class="squad-slot__ix">${idx + 1}</span>
        <div class="role"><span class="tag ${t.key}">${t.name}</span></div>
        <div class="name">${p.name}</div>
        <div class="squad-slot__rarity tag ${p.rarity}">${p.rarity}</div>
        <div class="lv">LV ${p.level}</div>`;
    } else {
      slot.innerHTML = `<span class="squad-slot__ix empty">${idx + 1}</span>
        <div class="squad-slot__empty"><span class="squad-slot__label">${labels[idx]}</span><span class="squad-slot__tap">탭하여 배치</span></div>`;
    }
    slot.addEventListener("click", () => openPilotModal(idx));
    host.appendChild(slot);
  });
  let power = 0;
  for (const pid of S.formation) if (pid) power += pilotPower(findPilot(pid));
  $("squadPower").textContent = power;
}

function openPilotModal(slotIdx) {
  const host = $("pilotPickList");
  $("slotInfo").textContent = `슬롯 ${slotIdx+1}에 배치할 파일럿 선택`;
  host.innerHTML = "";
  const items = [...S.ownedPilots].sort((a,b) => RARITY_ORDER.indexOf(b.rarity)-RARITY_ORDER.indexOf(a.rarity) || b.level-a.level);
  const empty = document.createElement("div"); empty.className = "p pilot-pick--empty";
  empty.innerHTML = `<span class="pilot-pick__empty-text">이 슬롯 비우기</span>`;
  empty.addEventListener("click", () => { S.formation[slotIdx]=null; saveState(); closePilotModal(); renderAll(); });
  host.appendChild(empty);
  for (const p of items) {
    const t = TYPES[p.type]; const used = S.formation.includes(p.id);
    const div = document.createElement("div");
    div.className = "p" + (used ? " active" : "");
    div.innerHTML = `<div class="row between pilot-pick__row1"><b>${p.name}</b><span class="tag ${p.rarity}">${p.rarity}</span></div>
      <div class="pilot-pick__row2"><span class="tag ${t.key}">${t.name}</span> <span class="pilot-pick__lv">Lv.${p.level}</span></div>
      <span class="pilot-pick__pow">전력 ${pilotPower(p)}</span>`;
    div.addEventListener("click", () => {
      const ex = S.formation.indexOf(p.id);
      if (ex >= 0) S.formation[ex] = null;
      S.formation[slotIdx] = p.id;
      saveState(); closePilotModal(); renderAll();
    });
    host.appendChild(div);
  }
  $("pilotModal").classList.add("show");
}
function closePilotModal() { $("pilotModal").classList.remove("show"); }
$("btnCloseModal").addEventListener("click", closePilotModal);
$("btnAutoSquad").addEventListener("click", () => {
  const sorted = [...S.ownedPilots].sort((a,b) => pilotPower(b)-pilotPower(a));
  S.formation = [0,1,2,3,4].map(i => sorted[i]?.id||null);
  saveState(); renderAll(); toast("전력 기준 자동 편성 완료");
});
$("btnClearSquad").addEventListener("click", () => { S.formation=[null,null,null,null,null]; saveState(); renderAll(); });

/* ============================================================
   §12  렌더링: 영웅 탭
   ============================================================ */
function renderHeroes() {
  const host = $("heroList"); host.innerHTML = "";
  const sorted = [...S.ownedPilots].sort((a,b) => RARITY_ORDER.indexOf(b.rarity)-RARITY_ORDER.indexOf(a.rarity)||b.level-a.level);
  for (const p of sorted) {
    const t = TYPES[p.type]; const cost = Math.floor(60 * p.level * RARITY_MULT[p.rarity]);
    const maxed = p.level >= 30;
    const el = document.createElement("div"); el.className = "hero" + (maxed ? " hero--max" : "");
    el.innerHTML = `
      <div class="avatar" style="background:linear-gradient(180deg,${t.color}55 0%,#0e1f39 100%);">${t.name[0]}</div>
      <div class="row between"><div class="name">${p.name}</div><span class="tag ${p.rarity}">${p.rarity}</span></div>
      <div class="meta"><span class="tag ${t.key}">${t.name}</span> · Lv.${p.level}${maxed ? " · <span class='hero-max-label'>MAX</span>" : ""}</div>
      <div class="stat-row"><span>공격 <b>${pilotAtk(p).toFixed(1)}</b></span><span>체력 <b>${pilotHp(p)}</b></span></div>
      <p class="hero-hint">골드로 스탯 상승 · 등급이 높을수록 비용↑</p>
      <div class="hero-actions"><button type="button" class="btn primary btn-block" ${maxed ? "disabled" : ""}>
        ${maxed ? "최대 레벨" : `레벨업 · ${cost.toLocaleString()} 골드`}</button></div>`;
    const btn = el.querySelector("button");
    if (!maxed) btn.addEventListener("click", () => {
      if (S.gold < cost) return toast("골드가 부족합니다","err");
      S.gold -= cost; sanitizeSaveResources(S); p.level += 1; saveState(); renderAll(); playSfx("level_up"); toast(`${p.name} LV ${p.level}!`);
    });
    host.appendChild(el);
  }
}

/* ============================================================
   §13  렌더링: 스카우트 탭
   ============================================================ */
function renderScoutEmpty() { $("scoutResult").innerHTML = ""; }
function pushScoutResult(p) {
  const div = document.createElement("div");
  div.className = "result result--" + p.rarity;
  div.innerHTML = `<div class="result__inner">
    <span class="tag ${p.rarity}">${p.rarity}</span>
    <div class="result__name">${p.name}</div>
    <small class="result__type">${TYPES[p.type].name}</small>
  </div>`;
  $("scoutResult").appendChild(div);
}
$("btnScout1").addEventListener("click", () => {
  ensureAudio();
  if (S.gems < 20) return toast("다이아가 부족합니다","err");
  S.gems -= 20; sanitizeSaveResources(S); renderScoutEmpty();
  const np = addRandomPilot(); pushScoutResult(np);
  saveState(); updateCurrency(); renderAll();
  playSfx(np.rarity==="UR"||np.rarity==="SR" ? "level_up" : "ui_click");
  toast(`${np.name} (${np.rarity}) 영입!`);
  trackQuest("dqScout");
});
$("btnScout10").addEventListener("click", () => {
  ensureAudio();
  if (S.gems < 180) return toast("다이아가 부족합니다","err");
  S.gems -= 180; sanitizeSaveResources(S); renderScoutEmpty();
  const results = [];
  for (let i=0; i<10; i++) results.push(addRandomPilot());
  if (!results.find(p => RARITY_ORDER.indexOf(p.rarity)>=2)) {
    const base = pick(PILOT_POOL.filter(p => p.rarity==="SR"));
    const np = { id:"p"+Math.random().toString(36).slice(2,8), name:base.name, type:base.type, rarity:base.rarity, level:1 };
    S.ownedPilots.push(np); results.push(np);
  }
  for (const p of results) pushScoutResult(p);
  saveState(); updateCurrency(); renderAll(); playSfx("level_up"); toast("10연 스카우트 완료!");
  trackQuest("dqScout");
});

/* ============================================================
   §14  렌더링: 연구 탭
   ============================================================ */
function researchCost(lv) { return { alloy: Math.floor(30 * Math.pow(1.4, lv-1)) }; }
function renderResearch() {
  const host = $("researchList"); host.innerHTML = "";
  for (const r of RESEARCH) {
    const lv = S.research[r.key]; const cost = researchCost(lv);
    const el = document.createElement("div");
    el.className = "up-card up-card--research";
    el.style.setProperty("--accent", r.color);
    el.innerHTML = `
      <div class="up-card__head row between">
        <div>
          <div class="up-card__name">${r.name}</div>
          <p class="up-card__desc">${r.desc}</p>
        </div>
        <div class="up-card__lv">Lv <b>${lv}</b></div>
      </div>
      <div class="progress" aria-label="성장"><div style="width:${Math.min(100, lv * 7)}%"></div></div>
      <button type="button" class="btn primary btn-block up-card__btn">다음 연구 · 합금 ${cost.alloy.toLocaleString()}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!canAfford(cost)) return toast("합금 부족","err");
      pay(cost); S.research[r.key]+=1; saveState(); renderAll(); playSfx("level_up"); toast(`${r.name} Lv.${S.research[r.key]}`);
    });
    host.appendChild(el);
  }
}

/* ============================================================
   §15  렌더링: 요새 탭
   ============================================================ */
function fortressCost(lv) {
  return { gold: Math.floor(120 * Math.pow(1.5,lv-1)), fuel: Math.floor(40 * Math.pow(1.4,lv-1)) };
}
function renderFortress() {
  const host = $("fortressList"); host.innerHTML = "";
  for (const f of FORTRESS) {
    const lv = S.fortress[f.key]; const cost = fortressCost(lv);
    const atCap = f.key !== "tower" && S.fortress[f.key] >= S.fortress.tower * 3;
    const el = document.createElement("div");
    el.className = "up-card up-card--fort";
    el.style.setProperty("--accent", f.color);
    const capHint = f.key === "tower" ? "비관제·갑판·연구·공장: 최대 Lv = 관제탑×3" : (atCap ? "관제탑을 먼저 올리면 이 건물도 더 올릴 수 있습니다." : "");
    el.innerHTML = `
      <div class="up-card__head row between">
        <div>
          <div class="up-card__name">${f.name}</div>
          <p class="up-card__desc">${f.desc}</p>
        </div>
        <div class="up-card__lv">Lv <b>${lv}</b></div>
      </div>
      <div class="progress" aria-label="성장"><div style="width:${Math.min(100, lv * 6)}%"></div></div>
      ${capHint ? `<p class="up-card__cap">${capHint}</p>` : ""}
      <button type="button" class="btn gold btn-block up-card__btn" ${atCap ? "disabled" : ""}>
        ${atCap ? "상한 도달" : `업그레이드 · ${cost.gold.toLocaleString()} 골드 / ${cost.fuel} 항공유`}</button>`;
    const btn = el.querySelector("button");
    if (!atCap) btn.addEventListener("click", () => {
      if (!canAfford(cost)) return toast("자원 부족","err");
      if (f.key !== "tower" && S.fortress[f.key] >= S.fortress.tower * 3) return toast("관제탑 레벨 상한 도달","err");
      pay(cost); S.fortress[f.key] += 1; saveState(); renderAll(); playSfx("level_up"); toast(`${f.name} Lv.${S.fortress[f.key]}`);
      trackQuest("dqFort");
    });
    host.appendChild(el);
  }
}

/* ============================================================
   §16  렌더링: 스킨 탭
   ============================================================ */
function typePreviewColor(id) {
  const map = { default:"#1c3252",desert:"#7a5a2a",arctic:"#3c6a8a",phantom:"#432a6a",phoenix:"#7a2a2a",steam:"#6a4a20",cyber:"#2a6a7a",alien:"#5a2a7a" };
  return map[id]||"#1c3252";
}
function renderSkins() {
  const jetHost=$("jetSkinList"); const fortHost=$("fortSkinList");
  jetHost.innerHTML=""; fortHost.innerHTML="";
  for (const sk of JET_SKINS) {
    const owned=S.unlockedJetSkins.includes(sk.id); const equipped=S.equippedJetSkin===sk.id;
    const el = document.createElement("div"); el.className="skin"+(equipped?" active":"");
    const jetBuff = [sk.buff.atk ? `공격 +${sk.buff.atk}%` : "", sk.buff.hp ? `체력 +${sk.buff.hp}%` : ""].filter(Boolean).join(" · ") || "보너스 없음";
    el.innerHTML=`<div class="preview" style="background:linear-gradient(180deg,${typePreviewColor(sk.id)} 0%,#050d1e 100%);">${sk.icon}</div>
      <div class="row between skin-row-title"><b>${sk.name}</b>${owned?"<span class='tag R'>보유</span>":"<span class='tag N'>잠김</span>"}</div>
      <p class="skin-buff">${jetBuff}</p>
      <button type="button" class="btn ${owned?(equipped?"ghost":"primary"):"gold"} btn-block skin-btn">
        ${owned?(equipped?"장착 중":"이 스킨 장착"):(sk.price===0?"무료 해제":`구매 · ${sk.price} 다이아`)}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!owned) {
        if (S.gems<sk.price) return toast("다이아 부족","err");
        S.gems-=sk.price; sanitizeSaveResources(S); S.unlockedJetSkins.push(sk.id); saveState(); updateCurrency(); renderAll(); toast("구매 완료"); return;
      }
      S.equippedJetSkin=sk.id; saveState(); renderAll(); toast("스킨 장착");
    });
    jetHost.appendChild(el);
  }
  for (const sk of FORT_SKINS) {
    const owned=S.unlockedFortSkins.includes(sk.id); const equipped=S.equippedFortSkin===sk.id;
    const el = document.createElement("div"); el.className="skin"+(equipped?" active":"");
    const fBuff = [sk.buff.goldRate ? `전투·오프라인 자원 +${sk.buff.goldRate}%` : "", sk.buff.atk ? `아군 화력 +${sk.buff.atk}%` : ""].filter(Boolean).join(" · ") || "도색 전용";
    el.innerHTML=`<div class="preview" style="background:linear-gradient(180deg,${typePreviewColor(sk.id)} 0%,#050d1e 100%);">${sk.icon}</div>
      <div class="row between skin-row-title"><b>${sk.name}</b>${owned?"<span class='tag R'>보유</span>":"<span class='tag N'>잠김</span>"}</div>
      <p class="skin-buff">${fBuff}</p>
      <button type="button" class="btn ${owned?(equipped?"ghost":"primary"):"gold"} btn-block skin-btn">
        ${owned?(equipped?"이 외형 적용 중":"이 외형 적용"):(sk.price===0?"기본":`구매 · ${sk.price} 다이아`)}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!owned) {
        if (S.gems<sk.price) return toast("다이아 부족","err");
        S.gems-=sk.price; sanitizeSaveResources(S); S.unlockedFortSkins.push(sk.id); saveState(); updateCurrency(); renderAll(); toast("구매 완료"); return;
      }
      S.equippedFortSkin=sk.id; saveState(); renderAll(); toast("요새 스킨 장착");
    });
    fortHost.appendChild(el);
  }
}

/* ============================================================
   §17  렌더링: 상점 / 시즌패스 탭
   ============================================================ */
function renderShop() {
  const host = $("shopList"); host.innerHTML = "";
  for (const it of SHOP_ITEMS) {
    const el = document.createElement("div");
    el.className = "card shop-item";
    el.innerHTML = `
      <div class="shop-item__name">${it.name}</div>
      <p class="shop-item__detail">${it.detail}</p>
      <p class="shop-item__gets"><span class="label-tiny">획득</span> ${fmtRewardLine(it.give)}</p>
      <div class="shop-item__row row between">
        <span class="shop-item__price">다이아 <b>${it.cost}</b></span>
        <span class="label-tiny muted">1회 구매</span>
      </div>
      <button type="button" class="btn primary btn-block">교환</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (S.gems < it.cost) return toast("다이아 부족", "err");
      S.gems -= it.cost; sanitizeSaveResources(S); give(it.give); saveState(); updateCurrency(); toast("교환 완료"); playSfx("powerup");
    });
    host.appendChild(el);
  }
  const passHost = $("passList"); passHost.innerHTML = "";
  for (const p of SEASON_PASS) {
    const claimed = S.claimedPass.includes(p.tier); const unlocked = S.seasonKills >= p.kills;
    const el = document.createElement("div");
    el.className = "card pass-card" + (unlocked && !claimed ? " pass-card--ready" : "");
    el.innerHTML = `
      <div class="pass-card__head row between">
        <span class="pass-tier">시즌 ${p.tier}</span>
        <span class="tag N">${p.kills}기 격추</span>
      </div>
      <p class="pass-reward-line">${fmtRewardLine(p.rewards)}</p>
      <div class="progress pass-progress" aria-label="시즌 진행"><div style="width:${Math.min(100, (S.seasonKills / p.kills) * 100)}%"></div></div>
      <p class="pass-foot">${S.seasonKills}/${p.kills} 격추</p>
      <button type="button" class="btn ${claimed ? "ghost" : (unlocked ? "gold" : "ghost")} btn-block" ${claimed || !unlocked ? "disabled" : ""}>
        ${claimed ? "수령 완료" : (unlocked ? "보상 받기" : "목표 미달")}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!unlocked || claimed) return;
      give(p.rewards); S.claimedPass.push(p.tier); saveState(); renderAll(); playSfx("level_up"); toast("시즌 보상 획득");
    });
    passHost.appendChild(el);
  }
}

/* ============================================================
   §18  렌더링: 병원 탭  [Phase 4]
   ============================================================ */
function renderHospital() {
  const host = $("hospitalContent"); if (!host) return;
  host.innerHTML = "";

  /* 현황 카드 */
  const summary = document.createElement("div"); summary.className = "card hospital-card";
  const totalPilots = S.ownedPilots.length;
  const healthy = Math.max(0, totalPilots - S.injuredPilots);
  const healCost = S.injuredPilots * 50;
  summary.innerHTML = `
    <div class="hospital-intro">
      <h3 class="hospital-title">부상 · 치료</h3>
      <p class="hospital-lead">패배 시 일부가 부상 처리됩니다. 부상이 있으면 <b>출격 시 편대</b>가 줄어듭니다.</p>
    </div>
    <div class="hospital-stat-grid">
      <div class="hospital-stat hospital-stat--ok"><span class="hospital-stat__n">${healthy}</span><span class="hospital-stat__l">작전 가능</span></div>
      <div class="hospital-stat hospital-stat--bad"><span class="hospital-stat__n">${S.injuredPilots}</span><span class="hospital-stat__l">치료 필요</span></div>
      <div class="hospital-stat"><span class="hospital-stat__n">${totalPilots}</span><span class="hospital-stat__l">전원</span></div>
    </div>`;

  if (S.injuredPilots > 0) {
    const healBtn = document.createElement("button");
    healBtn.className = "btn gold btn-block";
    healBtn.textContent = `전원 치료 · 합금 ${healCost.toLocaleString()}`;
    healBtn.addEventListener("click", () => {
      if (S.alloy < healCost) return toast("합금 부족","err");
      S.alloy -= healCost; sanitizeSaveResources(S); S.injuredPilots = 0;
      saveState(); renderAll(); playSfx("level_up"); toast("파일럿 전원 치료 완료!");
    });
    summary.appendChild(healBtn);

    /* 1명씩 치료 */
    const healOneBtn = document.createElement("button");
    healOneBtn.className = "btn primary btn-block hospital-btn-secondary";
    healOneBtn.textContent = `1명만 치료 · 합금 50`;
    healOneBtn.addEventListener("click", () => {
      if (S.alloy < 50) return toast("합금 부족","err");
      S.alloy -= 50; sanitizeSaveResources(S); S.injuredPilots = Math.max(0, S.injuredPilots-1);
      saveState(); renderAll(); playSfx("ui_click"); toast("파일럿 1명 치료 완료");
    });
    summary.appendChild(healOneBtn);
  } else {
    const ok = document.createElement("p");
    ok.className = "hospital-all-ok";
    ok.textContent = "전원 작전 가능 — 부상자 없음";
    summary.appendChild(ok);
  }
  host.appendChild(summary);

  /* 출격 페널티 안내 */
  const note = document.createElement("div"); note.className = "card hospital-help";
  note.innerHTML = `<h4 class="hospital-help__t">요약</h4>
    <ul class="hospital-help__ul">
      <li>미션 실패 시 격추·손실에 비례해 부상이 쌓입니다 (최대 5명).</li>
      <li>1명당 합금 50 · 전원 치료는 <b>부상 인원×50</b> 합금.</li>
      <li>치료 전에는 출격 시 초기 <b>편대</b>가 줄어듭니다 (편성 화면에서 확인).</li>
    </ul>`;
  host.appendChild(note);
}

/* ============================================================
   §19  렌더링: 일일 퀘스트 탭  [Phase 2]
   ============================================================ */
function renderQuests() {
  const host = $("questContent"); if (!host) return;
  host.innerHTML = "";
  resetDailyQuestsIfNeeded();

  /* 날짜 헤더 */
  const header = document.createElement("div"); header.className="card";
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,"0")}.${String(today.getDate()).padStart(2,"0")}`;
  const pending = DAILY_QUEST_DEF.filter(q => !S.dailyCompleted.includes(q.id) && S.dailyProgress[q.id]>=q.goal).length;
  header.innerHTML = `<div class="quest-header">
    <div class="row between quest-header__line">
      <b class="quest-header__t">오늘의 목표</b>
      <span class="tag N quest-date">${dateStr}</span>
    </div>
    <p class="quest-header__sub">날짜가 바뀌면 초기화됩니다. ${pending > 0 ? `<span class="quest-pending">수령 가능 ${pending}건</span>` : ""}</p>
  </div>`;
  host.appendChild(header);

  for (const q of DAILY_QUEST_DEF) {
    const progress  = S.dailyProgress[q.id]||0;
    const completed = S.dailyCompleted.includes(q.id);
    const unlocked  = progress >= q.goal;
    const pct       = Math.min(100, (progress/q.goal)*100);
    const el = document.createElement("div"); el.className="quest-card" + (completed?" quest-card--done":"") + (unlocked && !completed ? " quest-card--ready" : "");
    el.innerHTML = `
      <div class="quest-card__top row between">
        <div class="row quest-card__info">
          <span class="quest-ico" aria-hidden="true">${q.icon}</span>
          <div>
            <div class="quest-title">${q.desc}</div>
            <div class="quest-reward">보상: ${fmtRewardLine(q.reward)}</div>
          </div>
        </div>
        <span class="quest-count">${Math.min(progress,q.goal)} / ${q.goal}</span>
      </div>
      <div class="progress quest-progress"><div style="width:${pct}%"></div></div>
      <button type="button" class="btn ${completed?"ghost":(unlocked?"gold":"ghost")} btn-block quest-btn" ${completed||!unlocked?"disabled":""}>
        ${completed?"완료":(unlocked?"보상 받기":"진행 중")}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!unlocked||completed) return;
      give(q.reward); S.dailyCompleted.push(q.id); saveState(); renderAll(); playSfx("level_up"); toast(`퀘스트 완료 · ${fmtRewardLine(q.reward)}`);
    });
    host.appendChild(el);
  }
}

/* ============================================================
   §20  전체 렌더 호출
   ============================================================ */
function renderAll() {
  updateCurrency();
  renderStages(); renderSquad(); renderHeroes();
  renderResearch(); renderFortress(); renderSkins(); renderShop();
  renderHospital(); renderQuests();
  const hospitalTab = document.querySelector(".tab[data-tab='hospital']");
  if (hospitalTab) hospitalTab.querySelector(".tb-ico").textContent = "🏥";
  const questTab = document.querySelector(".tab[data-tab='quests']");
  if (questTab) questTab.querySelector(".tb-ico").textContent = "📋";
}

/* ============================================================
   §21  타이틀 버튼
   ============================================================ */
$("btnStart").addEventListener("click",    () => { ensureAudio(); playSfx("ui_click"); showLobby("sortie"); });
$("btnContinue").addEventListener("click", () => { ensureAudio(); playSfx("ui_click"); showLobby("sortie"); });
$("btnReset").addEventListener("click",    () => {
  ensureAudio();
  if (!confirm("모든 진행 데이터를 초기화할까요?")) return;
  localStorage.removeItem(SAVE_KEY); S=loadState(); renderAll(); toast("데이터 초기화 완료");
});
$("btnQuickPlay").addEventListener("click", () => { ensureAudio(); playSfx("ui_click"); startBattle(STAGES[0]); });

/* ============================================================
   §22  Canvas + 전투 상태 B
   ============================================================ */
const canvas = $("game");
const ctx = canvas.getContext("2d", { alpha: false });
ctx.imageSmoothingEnabled = false;
let W = 0, H = 0;

const _touchUi = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);

function resizeCanvas() {
  const wrap = $("battleWrap");
  const dpr = Math.min(window.devicePixelRatio || 1, _touchUi ? 2 : 1.75);
  const cw = wrap.clientWidth;
  const ch = wrap.clientHeight;
  canvas.style.width  = cw + "px";
  canvas.style.height = ch + "px";
  canvas.width  = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  W = cw;
  H = ch;
}
let _vvResizeT = 0;
function _onResize() {
  if (!$("battlePage").classList.contains("hidden")) {
    resizeCanvas();
    /* 캔버스 리사이즈 후 플레이어 Y 재계산 */
    if (B.running) B.player.y = _playerBaseY();
  }
}
window.addEventListener("resize", _onResize);
/* 모바일 화면 회전 */
window.addEventListener("orientationchange", () => setTimeout(_onResize, 200));
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    clearTimeout(_vvResizeT);
    _vvResizeT = setTimeout(_onResize, 80);
  });
}

const B = {
  running:false, paused:false, over:false,
  stage:null, wave:1, maxWaves:5, waveTimer:0,
  spawnTick:0, gateTick:0,
  score:0, kills:0, squad:1, maxSquad:20, weaponLv:1,
  keys:{},
  player:{ x:0, y:0, w:36, h:44, speed:18, fireCd:0, _bombCd:0 },
  bullets:[], enemies:[], enemyBullets:[],
  gates:[], powerups:[], particles:[],
  luckyTransports:[], luckySpawnAcc:0, invincibleTimer:0, luckyRoulette:null,
  stars:[], clouds:[],
  weather:"clear",
  boss:null, bossPending:false,
  baseAtk:10, startFormation:[],
  sessionKills:0, sessionGates:0
};

/* ============================================================
   §23  전투 시작
   ============================================================ */
function startBattle(stage) {
  // 부상자가 있으면 출격 편대 감소
  const injuryPenalty = Math.min(S.injuredPilots, 3);

  B.stage       = stage;
  B.maxWaves    = stage.waves;
  B.wave        = 1;
  B.waveTimer   = 0; B.spawnTick=0; B.gateTick=0;
  B.score       = 0; B.kills=0;
  B.over        = false; B.paused=false;
  B.boss        = null; B.bossPending=false;
  /* 이전 전투의 잔존 3D 메쉬 정리 */
  if (B.enemies)      for (const e of B.enemies)      clearMesh(e);
  if (B.bullets)      for (const b of B.bullets)      clearMesh(b);
  if (B.enemyBullets) for (const b of B.enemyBullets) clearMesh(b);
  if (B.boss)         clearMesh(B.boss);
  B.bullets=[]; B.enemies=[]; B.enemyBullets=[];
  B.gates=[]; B.powerups=[]; B.particles=[];
  B.luckyTransports=[]; B.luckySpawnAcc=0; B.invincibleTimer=0; B.luckyRoulette=null;
  B.sessionKills=0; B.sessionGates=0;
  _awakeningJuice.timer = 0; _awakeningJuice.flash = 0;
  _dmgTexts.length = 0;
  /* 액션 주스 상태 초기화 */
  _hitstop=0; _bulletTimeAlpha=0;
  _fever.gauge=0; _fever.active=false; _fever.timer=0;
  _streak.count=0; _streak.timer=0; _streak.showTimer=0;
  _ult.active=false; _ult.timer=0; _ult.beams.length=0; _ult.slowFrames=0;
  _bossDeath.dying=false; _bossDeath.timer=0; _bossDeath.whiteout=0; _bossDeath.missionTimer=0;
  /* 스킬 상태 리셋 */
  Object.assign(_skillState, { dualShot:false, tripleShot:false, explosive:false, rapidFire:false,
    giantBullets:false, guided:false, guidedTier:0, shieldCount:0, damageMult:1, laserMode:false, laserTier:0, timeWarpTimer:0,
    synergyCarpetLaser:false, _synergyToastShown:false, _synergyJuiceFired:false });
  _skillLevels = {};
  _skillKillMilestone = 15;
  _skillPickerOpen = false;
  _adRewardApplied = false;
  const sp = document.getElementById('skillPicker');
  if (sp) sp.classList.add('hidden');
  /* 광고 3배 보상 버튼 초기화 */
  const ab = document.getElementById('btnAdReward');
  if (ab) { ab.disabled = false; ab.textContent = GameMonetization.hasNoAds() ? '✅ 3배 보상 자동 지급 (광고 제거)' : '📺 광고 시청 → 보상 3배!'; }

  if (stage.endless) stage.enemyTier = 1; // reset for endless

  B.weather = stage.weather || (Math.random()<0.25 ? pick(["storm","magnetic"]) : "clear");

  const placed = S.formation.filter(Boolean);
  B.startFormation = placed.map(id => findPilot(id));
  const base = 1 + (S.fortress.deck-1) + placed.length - injuryPenalty;
  B.maxSquad = SQUAD_HARD_CAP;
  B.squad    = Math.min(B.maxSquad, Math.max(1, base));
  B.weaponLv = 1;
  B.baseAtk  = 9 + (S.research.weapon-1)*0.6;
  B.evolutionLv  = 0;
  B.evoTargets   = [];
  B.evoSpawnTick = 0;

  showBattle();
  B.player.x=W/2; B.player.y=_playerBaseY(); B.player.fireCd=0; B.player._bombCd=0;
  B.running=true;
  _spdWinStart = 0;
  _spdTickCount = 0;
  $("gameOverPanel").classList.remove("show");
  $("bossPanel").classList.remove("show");
  setWeatherText();

  /* 터치 기기 첫 플레이 힌트 */
  if (window._showTouchHintOnce) {
    window._showTouchHintOnce = false;
    const hint = $("touchHint");
    if (hint) {
      hint.classList.remove("hidden");
      setTimeout(() => hint.classList.add("hidden"), 3200);
    }
  }

  initBgObjects();
  refreshBattleHud();
  updateCurrency();

  if (injuryPenalty > 0) toast(`부상자 ${injuryPenalty}명 — 초기 편대 감소`, "warn");
}

function setWeatherText() {
  const el=$("weatherIndicator");
  if      (B.weather==="storm")    el.textContent="⛈ 뇌우 — 탄속 +10%";
  else if (B.weather==="magnetic") el.textContent="🌀 자기장 — 이동 감소";
  else                             el.textContent="🌤 맑음";
}
function refreshBattleHud() {
  $("bStage").textContent  = B.stage.id===99?"∞":B.stage.id;
  $("bWave").textContent   = B.stage.endless ? B.wave : B.wave+" / "+B.maxWaves;
  $("bSquad").textContent  = `${B.squad}/${B.maxSquad}`;
  $("bKills").textContent  = B.kills;
  $("bScore").textContent  = Math.floor(B.score);
  $("bWeapon").textContent = B.weaponLv;
  if ((B.invincibleTimer | 0) > 0 && B.squad > 0) {
    $("bHp").textContent = "무적 " + Math.ceil(B.invincibleTimer / 60) + "s";
  } else {
    $("bHp").textContent = B.squad > 0 ? "정상" : "전멸";
  }
  const evoEl=$("bEvo");
  if (evoEl) {
    const evoNames=["기본","EVO 1","EVO MAX","ULTIMATE"];
    evoEl.textContent = evoNames[Math.min(B.evolutionLv||0, evoNames.length-1)];
    evoEl.style.color = ["#8ab8d8","#ffd76a","#ff9a40","#ff5540"][Math.min(B.evolutionLv||0,3)];
  }
  /* 전투 중 재화 표시 — 매 프레임 toLocaleString 방지, 약 5Hz로 동기화 */
  if (B.running) {
    const t = performance.now();
    if (t - _lastBattleCurrencySync > 200) {
      _lastBattleCurrencySync = t;
      updateCurrency();
    }
  }
}

/* ============================================================
   §24  키보드 / 포인터 입력
   ============================================================ */
window.addEventListener("keydown", e => {
  ensureAudio();
  B.keys[e.key]=true; B.keys[e.code]=true;
  if (e.code==="Space") e.preventDefault();
  if ((e.key==="p"||e.key==="P") && B.running) B.paused=!B.paused;
  if ((e.key==="m"||e.key==="M") && !$("battlePage").classList.contains("hidden")) returnToLobby();
});
window.addEventListener("keyup", e => { B.keys[e.key]=false; B.keys[e.code]=false; });

let dragging=false;
canvas.addEventListener("pointerdown", e => { e.preventDefault(); ensureAudio(); dragging=true; movePlayerTo(e); }, { passive:false });
canvas.addEventListener("pointermove", e => { e.preventDefault(); if(dragging) movePlayerTo(e); }, { passive:false });
canvas.addEventListener("pointerup",   e => { e.preventDefault(); dragging=false; }, { passive:false });
canvas.addEventListener("pointercancel", () => { dragging = false; });
canvas.addEventListener("pointerleave",() => dragging=false);
canvas.addEventListener("contextmenu", e => e.preventDefault());
/* 터치 기기: 멀티터치 줌 방지 */
canvas.addEventListener("touchstart",  e => e.preventDefault(), { passive:false });
function movePlayerTo(e) {
  const r=canvas.getBoundingClientRect();
  const scaleX = W / r.width; /* DPR 보정 */
  B.player.x = clamp((e.clientX - r.left) * scaleX, 20, W-20);
}

$("btnBPause").addEventListener("click",    () => { if(B.running) B.paused=!B.paused; });
$("btnBHome").addEventListener("click",     () => returnToLobby());
$("btnOverHome").addEventListener("click",  () => returnToLobby());
$("btnOverRetry").addEventListener("click", () => startBattle(B.stage));
$("btnBossStart").addEventListener("click", () => { $("bossPanel").classList.remove("show"); B.bossPending=false; });
/* 광고 3배 보상 버튼 */
const _adBtn = $("btnAdReward");
if (_adBtn) _adBtn.addEventListener("click", () => {
  if (GameMonetization.hasNoAds()) return;
  requestRewardedBonusFlow();
});

function returnToLobby() {
  B.running=false;
  _spdWinStart = 0;
  _spdTickCount = 0;
  showLobby();
}

/* ============================================================
   §25  스폰 함수들
   ============================================================ */
function spawnEnemy(forceTier) {
  const cap = forceTier != null ? MAX_ENEMIES_ON_SCREEN + 8 : MAX_ENEMIES_ON_SCREEN;
  if (B.enemies.length >= cap) return;
  const tier = forceTier || (B.stage.endless ? (1+Math.floor(B.wave/4)) : B.stage.enemyTier);
  const roll=Math.random();
  let type="raider";
  if (roll>0.58) type="bomber";
  if (roll>0.76) type="sniper";
  if (roll>0.87) type="scout";
  if (roll>0.93) type="gunboat";
  if (roll>0.985) type="rammer";
  const pf=({
    raider:  { atype:"interceptor", hpMul:1.0,  speed:2.8, fireBase:60,   size:36, bMul:2.8 },
    bomber:  { atype:"bomber",      hpMul:1.8,  speed:1.8, fireBase:80,   size:44, bMul:2.6 },
    sniper:  { atype:"gunship",     hpMul:0.9,  speed:2.2, fireBase:110,  size:34, bMul:3.5 },
    scout:   { atype:"interceptor", hpMul:0.55, speed:4.2, fireBase:42,   size:26, bMul:2.2 },
    gunboat: { atype:"bomber",      hpMul:2.8,  speed:1.2, fireBase:44,   size:54, bMul:2.4 },
    rammer:  { atype:"bomber",      hpMul:9.0,  speed:0.5, fireBase:9999, size:60, bMul:1.0 }
  })[type];
  const hp=Math.floor((18+tier*6+Math.max(0,(B.wave||1)-1)*2)*pf.hpMul);
  if (type==="rammer") {
    const e = {
      x:40+Math.random()*(W-80), y:-70,
      w:pf.size, h:pf.size+14,
      hp, maxHp:hp,
      speed:pf.speed, fireCd:9999, fireBase:9999,
      phase:0, tier, kind:"rammer", atype:pf.atype,
      chargeTimer:180, charging:false, vx:0, vy:0
    };
    B.enemies.push(e);
    return;
  }
  const en = {
    x:40+Math.random()*(W-80), y:-40,
    w:pf.size, h:pf.size+8,
    hp, maxHp:hp,
    speed:pf.speed+tier*0.12+Math.random()*0.4,
    fireCd:pf.fireBase+Math.random()*40, fireBase:pf.fireBase,
    phase:Math.random()*Math.PI*2,
    tier, kind:type, atype:pf.atype
  };
  B.enemies.push(en);
}

function spawnBoss() {
  const tier=B.stage.enemyTier;
  const hp=400+tier*250;
  B.boss = {
    x:W/2, y:-120,
    w:180, h:110,
    hp, maxHp:hp,
    vx:1.6, vy:0.6,
    fireCd:60, atype:"bomber",
    name:"거대 폭격함 T"+tier,
    /* 레이저 빔 [Phase 4] */
    laserCd:200, laserState:null, laserX:0, laserFrames:0,
    /* 미니언 소환 [Phase 4] */
    spawnedMinions:false
  };
  $("bossName").textContent=B.boss.name;
  $("bossPanel").classList.add("show");
  B.bossPending=true;
  playSfx("boss_appear");
  triggerShake(12, 20);
}

/* 마이너스 / 나누기 게이트 포함 [Phase 1] */
function spawnGatePair() {
  const pad=60, gap=24;
  const width=(W-pad*2-gap)/2;
  const leftX=pad+width/2, rightX=W-pad-width/2;
  const makeGate = x => {
    const roll=Math.random();
    const tier = B.stage?.enemyTier || 1;
    const wave = B.wave || 1;
    const stageIdForScale = (B.stage && B.stage.id && B.stage.id < 90) ? B.stage.id : 1 + Math.min(10, Math.floor((wave - 1) / 2));
    let op, value, growth=0;
    if      (roll < 0.30) {
      op = "+";
      const w = Math.max(1, wave);
      value = 12 + Math.floor(Math.random() * 22) + tier * 4 + Math.floor((w - 1) * 3);
      growth = 1;
    }
    else if (roll < 0.55) {
      op = "x";
      const w = Math.max(1, wave);
      /* 더하기/빼기 유지 요청 — 곱하기만 웨이브별 상한·약화 */
      let lo, hi;
      if (w <= 3)       { lo = 1.10; hi = Math.min(GATE_MULT_ABS_MAX, 1.10 + 0.24); }
      else if (w <= 7)  { lo = 1.03; hi = 1.12; }
      else              { lo = 1.015; hi = 1.08; }
      value = Math.min(GATE_MULT_ABS_MAX, lo + Math.random() * (hi - lo));
      value = Math.round(value * 1000) / 1000;
      growth = 0.05;
    }
    else if (roll < 0.75) {
      op = "-";
      const w = Math.max(1, wave);
      const r = 12 + Math.floor(Math.random() * 26);
      /* 웨이브가 높을수록 빼기 폭이 커짐 (선형 + 가속 항) */
      const wavePen = Math.floor((w - 1) * (20 + w * 1.15));
      const waveCurve = Math.floor(Math.pow(Math.max(0, w - 1), 1.45) * 6);
      value = r
        + Math.floor(tier * 8)
        + wavePen + waveCurve
        + Math.floor(stageIdForScale * 6);
    }
    else {
      op = "÷";
      value = GATE_FIXED_DIVISOR;
      growth = 0;
    }
    return { x, y:-30, w:width, h:62, op, value, growth, applied:false };
  };
  B.gates.push(makeGate(leftX), makeGate(rightX));
}

function spawnPowerup(x, y) {
  const tier = B.stage?.enemyTier || 1;
  const wave = B.wave || 1;
  const mult = 1 + (tier - 1) * 0.1 + (wave - 1) * 0.05;
  const r = Math.random();
  let kind, amount = 0;
  if      (r < 0.20) kind = "weapon";
  else if (r < 0.33) kind = "shield";
  else if (r < 0.44) kind = "bomb";
  else if (r < 0.58) kind = "gold";
  else if (r < 0.72) kind = "fuel";
  else if (r < 0.86) kind = "alloy";
  else if (r < 0.92) kind = "gem";
  else               kind = "score";

  if (kind === "gold")  amount = Math.max(25, Math.floor(55 * mult));
  if (kind === "fuel") amount = Math.max(15, Math.floor(35 * mult));
  if (kind === "alloy")amount = Math.max(8,  Math.floor(18 * mult));
  if (kind === "gem")  amount = tier >= 5 && Math.random() < 0.35 ? 2 : 1;
  if (kind === "score")amount = Math.max(60, Math.floor(120 * mult));

  B.powerups.push({ x, y, w:26, h:26, kind, amount, vy:2 });
}

/* ============================================================
   §26  사격 로직
   ============================================================ */
function formationAtkBonus() {
  let bonus=0;
  for (const p of B.startFormation) if (p) bonus+=pilotAtk(p);
  return bonus;
}
function spawnEvoTarget() {
  const tier=B.stage.enemyTier||1;
  const evo=B.evolutionLv||0;
  const baseHp=50+tier*20+evo*40;
  const r=38+evo*8;
  B.evoTargets=B.evoTargets||[];
  B.evoTargets.push({
    x:rand(r+20, W-r-20), y:-r-20,
    r, hp:baseHp, maxHp:baseHp,
    _pulse:0
  });
}

function playerShoot() {
  const atkBonus=formationAtkBonus();
  const allies=B._allies.slice(0, MAX_SHOOT_ALLIES);  /* 발사 아군 상한 */
  const emitN = Math.max(1, allies.length);
  /* 발사 기체 수는 상한 고정 — 인원은 데미지 스케일로만 반영 (성능 일정) */
  const dmgScale = B.squad > emitN ? B.squad / emitN : 1.0;
  const baseDmg=(B.baseAtk*(1+(B.weaponLv-1)*0.35)+atkBonus*0.25)*dmgScale;
  const bspeed=10+B.weaponLv*0.7;
  for (const ally of allies) {
    const type=ally.meta.type;
    if (type==="interceptor") {
      B.bullets.push({ x:ally.x-5, y:ally.y-16, w:4, h:12, v:bspeed+1.5, vx:0, dmg:baseDmg*0.9, atype:"interceptor", color:TYPES.interceptor.bullet });
      B.bullets.push({ x:ally.x+5, y:ally.y-16, w:4, h:12, v:bspeed+1.5, vx:0, dmg:baseDmg*0.9, atype:"interceptor", color:TYPES.interceptor.bullet });
    } else if (type==="bomber") {
      B.bullets.push({ x:ally.x, y:ally.y-18, w:8, h:16, v:bspeed-1, vx:0, dmg:baseDmg*1.4, atype:"bomber", color:TYPES.bomber.bullet, splash:36 });
    } else {
      B.bullets.push({ x:ally.x-6, y:ally.y-16, w:5, h:14, v:bspeed, vx:0, dmg:baseDmg, atype:"gunship", color:TYPES.gunship.bullet });
      B.bullets.push({ x:ally.x+6, y:ally.y-16, w:5, h:14, v:bspeed, vx:0, dmg:baseDmg, atype:"gunship", color:TYPES.gunship.bullet });
      if (B.weaponLv>=3) B.bullets.push({ x:ally.x, y:ally.y-22, w:5, h:14, v:bspeed+0.5, vx:0, dmg:baseDmg*1.2, atype:"gunship", color:TYPES.gunship.bullet });
    }
  }
  /* ── 진화 레벨별 추가 탄막 ── */
  const evo=B.evolutionLv, px=B.player.x, py=B.player.y;
  if (evo>=1) {
    /* EVO 1: 좌우 사선 로켓 */
    for (const [sx,ox] of [[-1,-28],[1,28]]) {
      B.bullets.push({ x:px+ox, y:py-18, w:5, h:14, v:bspeed, vx:sx*2.2, dmg:baseDmg*0.55, atype:"interceptor", color:"#ffd76a" });
      B.bullets.push({ x:px+ox, y:py-18, w:5, h:14, v:bspeed, vx:sx*4.0, dmg:baseDmg*0.45, atype:"interceptor", color:"#ffe084" });
    }
  }
  if (evo>=2) {
    /* EVO 2: 5방향 부채꼴 (EVO MAX 스타일) */
    for (const vx of [-5,-2.5,0,2.5,5]) {
      B.bullets.push({ x:px, y:py-22, w:6, h:15, v:bspeed-0.5, vx, dmg:baseDmg*0.50, atype:"bomber", color:"#ff9a40" });
    }
  }
  if (evo>=3) {
    /* EVO 3 ULTIMATE: 거대 부채꼴 (image 3 스타일) */
    for (let i=-7; i<=7; i++) {
      B.bullets.push({ x:px, y:py-25, w:7, h:18, v:bspeed+1, vx:i*3.8, dmg:baseDmg*0.55, atype:"interceptor", color:"#ff6040" });
    }
  }
  /* ── 로그라이크 스킬 효과 적용 ── */
  const dmgMult = _skillState.damageMult || 1;
  const bw = _skillState.giantBullets ? 12 : 6;
  const bh = _skillState.giantBullets ? 20 : 14;
  const bdmg = _skillState.giantBullets ? baseDmg * 1.5 * dmgMult : baseDmg * dmgMult;

  if (_skillState.dualShot) {
    const dualCap = Math.min(allies.length, 6);
    const dualAllies = allies.slice(0, dualCap);
    const dualScale = allies.length > dualCap ? allies.length / dualCap : 1;
    for (const ally of dualAllies) {
      B.bullets.push({ x:ally.x-14, y:ally.y-16, w:bw, h:bh, v:bspeed+2, vx:-1, dmg:bdmg*0.6*dualScale, atype:"interceptor", color:"#d4a0ff", render:"skill" });
      B.bullets.push({ x:ally.x+14, y:ally.y-16, w:bw, h:bh, v:bspeed+2, vx:1,  dmg:bdmg*0.6*dualScale, atype:"interceptor", color:"#ffd6a0", render:"skill" });
    }
  }
  if (_skillState.tripleShot) {
    const triCap = Math.min(allies.length, 5);
    const triAllies = allies.slice(0, triCap);
    const triScale = allies.length > triCap ? allies.length / triCap : 1;
    for (const ally of triAllies) {
      for (const vx of [-3.5, 0, 3.5]) {
        B.bullets.push({ x:ally.x, y:ally.y-16, w:bw, h:bh, v:bspeed, vx, dmg:bdmg*0.5*triScale, atype:"interceptor", color:"#7ad8c4", render:"skill" });
      }
    }
  }
  if (_skillState.laserMode) {
    /* 레이저: 화면 전체 높이를 관통하는 긴 총알 */
    B.bullets.push({ x:px, y:py-H, w:10, h:H, v:bspeed, vx:0, dmg:baseDmg*2*dmgMult, atype:"gunship", color:"#7ee8ff", splash:20, render:"laser", _dmgBoosted:true });
  }
  if (_skillState.synergyCarpetLaser) {
    const lanes = 7;
    const carpetDmg = baseDmg * 2.35 * dmgMult;
    for (let i = 0; i < lanes; i++) {
      const phase = (B.wave || 1) * 0.31 + i * 1.9;
      const lx = ((i + 0.5) / lanes) * W + Math.sin(performance.now() * 0.0028 + phase) * 26;
      const bh = Math.min(H * 0.52, 440);
      B.bullets.push({
        x: lx, y: py - H * 0.04, w: 15, h: bh, v: bspeed * 1.12, vx: 0,
        dmg: carpetDmg, atype: "bomber", color: "#ffb14a", splash: 48, render: "carpetLaser", _dmgBoosted: true
      });
    }
  }
  if (dmgMult !== 1 && !_skillState.dualShot && !_skillState.tripleShot) {
    /* 데미지 배율만 적용: 기존 총알 데미지 소급 강화 */
    for (const b of B.bullets) { if (!b._dmgBoosted) { b.dmg *= dmgMult; b._dmgBoosted = true; } }
  }

  playSfx("shoot");
}
/* 성능: 아군 수와 무관하게 연산·탄 수 일정 (표시·충돌·발사 모두 상한) */
const MAX_LOGIC_ALLIES  = 24;
const MAX_VISUAL_ALLIES = 18;
const MAX_SHOOT_ALLIES  = 8;
/* 성능: 웨이브가 높아져도 프레임 유지 (동시 객체·연산 상한) */
const MAX_ENEMIES_ON_SCREEN = 36;
const MAX_ALLY_BULLETS      = 380;
const MAX_ENEMY_BULLETS     = 280;
const MAX_PARTICLES_LIVE    = 200;
/* 무기 LV 상한 (HUD 숫자·파워업 누적) */
const WEAPON_LV_CAP     = 999;

function getAllyPositions(limit) {
  if (B.squad<=0) return [];
  const n = Math.min(B.squad, limit ?? MAX_LOGIC_ALLIES);
  const leader={ x:B.player.x, y:B.player.y, meta:{ type:B.startFormation[0]?.type||"interceptor" } };
  const positions=[leader];
  const types=["interceptor","bomber","gunship"];
  for (let i=1; i<n; i++) {
    const row=1+(i%4), side=i%2===0?-1:1, col=Math.floor(i/4)+1;
    const fallback=B.startFormation[i%B.startFormation.length];
    const t=fallback?fallback.type:types[i%types.length];
    positions.push({ x:B.player.x+side*(20+col*22), y:B.player.y+row*20, meta:{ type:t } });
  }
  return positions;
}
let _lastAllyX = -1, _lastAllySquad = -1;
function cacheAllyPositions() {
  const px = Math.round(B.player.x);
  const sq = B.squad;
  if (px === _lastAllyX && sq === _lastAllySquad) return;
  _lastAllyX = px; _lastAllySquad = sq;
  B._allies = getAllyPositions(MAX_LOGIC_ALLIES);
}
function enemyShoot(e) {
  /* 적 탄속 = (적 낙하속 e.speed+1.2) × bMul + 티어·날씨 — playerShoot의 v와 같은 «프레임당 px» 기준 */
  const tierBonus = B.stage.enemyTier * 0.3;
  const stormAdd  = B.weather==="storm" ? 0.5 : 0;
  const eMovePerTick = (e.speed || 2.8) + 1.2;
  const bMul      = e.bMul || 2.6;
  const bspeed    = eMovePerTick * bMul + tierBonus + stormAdd;
  const aim = (e.inHold && typeof e.aimAngle === "number") ? e.aimAngle : 0;
  const sa = Math.sin(aim), ca = Math.cos(aim);
  const pushBullet = (ox, oy, spreadX, w, h, dmg, color) => {
    /* 기체 bank(aim) 방향으로 날아감 — 탄 도중에 방향 바꿈 없음 */
    const vx = sa * bspeed * 0.42 + ca * spreadX;
    const vy = ca * bspeed * 0.92 - sa * spreadX;
    B.enemyBullets.push({ x:e.x+ox, y:e.y+oy, w, h, vx, vy, dmg, color });
  };

  if (e.kind==="bomber") {
    for (const dx of [-0.6,0,0.6])
      pushBullet(0, 12, dx*1.2, 7, 14, 11, "#ffae61");
  } else if (e.kind==="sniper") {
    pushBullet(0, 12, 0, 5, 18, 14, "#d2b6ff");
  } else if (e.kind==="scout") {
    pushBullet(0, 10, 0, 4, 14, 7, "#70ff90");
  } else if (e.kind==="gunboat") {
    for (const dx of [-1.4,-0.5,0,0.5,1.4])
      pushBullet(dx*12, 12, dx*0.8, 8, 15, 15, "#ff9a61");
  } else {
    pushBullet(0, 12, 0, 6, 13, 9, "#ff87a5");
  }
}
function bossShoot() {
  const e=B.boss;
  const tier = B.stage?.enemyTier||1;
  /* 보스 탄속 = 보스 이동속도(약 1.5)의 4배 + 티어 보너스 → 탄환이 확실히 빠름 */
  const bvy = 6.0 + tier*0.4;
  const count=9;
  for (let i=0;i<count;i++) {
    const t=i/(count-1); const dx=(t-0.5)*3.2;
    B.enemyBullets.push({ x:e.x+dx*30, y:e.y+50, w:6, h:14, vx:dx*1.0, vy:bvy, dmg:14, color:"#ff6a8f" });
  }
}

/* ============================================================
   §27  충돌 · 폭발 · 아군 손실
   ============================================================ */
function intersects(a, b) {
  return Math.abs(a.x-b.x)*2 < (a.w+b.w) && Math.abs(a.y-b.y)*2 < (a.h+b.h);
}
function addExplosion(x, y, color) {
  const cols = [color, "#ff00aa", "#00f5ff", "#ffe600", "#a855f7", "#ffffff"];
  const load = B.particles.length;
  const n = load > 140 ? 8 : load > 85 ? 16 : 28;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 3.5 + Math.random() * 6.5;
    const life = 28 + Math.random() * 38;
    B.particles.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life, maxLife: life,
      color: pick(cols),
      neon: Math.random() > 0.35,
      sizeMul: 1.1 + Math.random() * 0.9
    });
  }
}

/** 융단 레이저 등으로 격추 시 — 파티클·크기 대폭 증가 */
function addSynergyKillExplosion(x, y) {
  const cols = ["#ff00cc", "#00fff7", "#ffee00", "#ffffff", "#9040ff", "#00ff88"];
  const load = B.particles.length;
  const n = load > 140 ? 20 : load > 85 ? 40 : 72;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = (4 + Math.random() * 10) * 3.1;
    const life = 48 + Math.random() * 72;
    B.particles.push({
      x: x + (Math.random() - 0.5) * 28,
      y: y + (Math.random() - 0.5) * 28,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life, maxLife: life,
      color: pick(cols),
      neon: true,
      sizeMul: 2.2 + Math.random() * 2.2
    });
  }
}

/** 폭발탄 스킬: 주변 적에게 직격 데미지 비례 추가 피해 (인덱스 보정 반환) */
function skillExplosiveAoE(hitX, hitY, primaryEnemyIdx, directDmg, bulletHadSplash) {
  if (!_skillState.explosive || bulletHadSplash || directDmg <= 0) return primaryEnemyIdx;
  const R = 52, R2 = R * R, frac = 0.34;
  addExplosion(hitX, hitY, "#ff8030");
  let pi = primaryEnemyIdx;
  const maxAoe = B.enemies.length > 24 ? 12 : 22;
  let aoeHits = 0;
  for (let ei = B.enemies.length - 1; ei >= 0; ei--) {
    if (pi >= 0 && ei === pi) continue;
    if (aoeHits >= maxAoe) break;
    const o = B.enemies[ei];
    const dx = o.x - hitX, dy = o.y - hitY;
    if (dx * dx + dy * dy > R2) continue;
    aoeHits++;
    const sd = directDmg * frac;
    o.hp -= sd;
    addDmgText(o.x, o.y - o.h / 2 - 4, sd, false);
    if (o.hp <= 0) {
      const ot = o.tier || 1, oatype = o.atype;
      clearMesh(o);
      B.enemies.splice(ei, 1);
      B.kills++; B.sessionKills++; S.totalKills++; S.seasonKills++;
      B.score += 70 + ot * 12;
      if (Math.random() < 0.12) spawnPowerup(hitX, hitY);
      addExplosion(o.x, o.y, TYPES[oatype].color);
      playSfx("explosion"); triggerShake(3, 5);
      trackQuest("dqKills"); _onKill();
      if (ei < pi) pi--;
    }
  }
  return pi;
}

/** 확률 난입: 황금 수송기 (격추 시 럭키 룰렛) */
function trySpawnLuckyTransport() {
  if (!B.running || B.luckyTransports.length > 0) return;
  B.luckySpawnAcc = (B.luckySpawnAcc | 0) + 1;
  if (B.luckySpawnAcc < 420) return;
  B.luckySpawnAcc = 0;
  if (Math.random() > 0.36) return;
  const tier = B.stage?.enemyTier || 1;
  const hp = 920 + tier * 480 + (B.wave | 0) * 110;
  B.luckyTransports.push({
    x: -90,
    y: rand(H * 0.18, H * 0.56),
    w: 108, h: 40,
    vx: 3.4 + Math.random() * 1.6,
    hp, maxHp: hp
  });
  toast("✨ 황금 수송기가 코스를 가로지릅니다!", "ok");
  playSfx("level_up");
}
function startLuckyRoulette() {
  B.luckyRoulette = { t: 60, spin: 0, idx: Math.floor(Math.random() * 3) };
  B.paused = true;
  playSfx("powerup");
  triggerShake(16, 32);
}
function loseAlly(x, y) {
  if (B.squad<=0) return;
  if ((B.invincibleTimer | 0) > 0) {
    addExplosion(x, y, "#00fff2");
    playSfx("powerup");
    return;
  }
  if ((_skillState.shieldCount | 0) > 0) {
    _skillState.shieldCount--;
    addExplosion(x, y, "#8af4ff");
    playSfx("powerup");
    toast("🛡 실드로 피해 흡수!", "info");
    return;
  }
  const dodge=0.04*(S.research.armor-1);
  if (Math.random()<dodge) { addExplosion(x,y,"#9ee7ff"); return; }
  B.squad-=1;
  addExplosion(x,y,"#66d1ff");
  playSfx("hit_ally");
  triggerShake(5, 10);
  if (B.squad<=0) { B.over=true; endBattle(false); }
}
function applyGate(g) {
  if (g.applied) return;
  g.applied=true;
  const wasSquad=B.squad;
  if      (g.op==="+") addSquadWithOverflowFever(Math.floor(g.value));
  else if (g.op==="x") {
    const mult = Math.min(GATE_MULT_ABS_MAX, Math.max(1, Number(g.value) || 1));
    const target = Math.floor(B.squad * mult);
    const gain = Math.max(0, target - B.squad);
    if (gain > 0) addSquadWithOverflowFever(gain);
  }
  else if (g.op==="-") {
    if (_gateLatePenaltyActive()) {
      B.squad = Math.max(1, Math.floor(B.squad * 0.5));
    } else {
      B.squad = Math.max(1, B.squad - Math.floor(g.value));
    }
  }
  else if (g.op==="÷") {
    if (_gateLatePenaltyActive()) {
      B.squad = Math.max(1, Math.floor(B.squad * 0.5));
    } else {
      B.squad = Math.max(1, Math.floor(B.squad / GATE_FIXED_DIVISOR));
    }
  }
  B.squad = Math.max(0, Math.min(B.squad, B.maxSquad));
  addExplosion(g.x,g.y, (g.op==="-"||g.op==="÷") ? "#ff6a8f" : "#8f95ff");
  B.score+=20;
  playSfx((g.op==="-"||g.op==="÷") ? "gate_neg" : "gate_pos");
  if (g.op==="-"||g.op==="÷") triggerShake(4, 8);
  B.sessionGates++;
  trackQuest("dqGates");
}
function damageMultiplier(at, dt) {
  if (COUNTER[at]===dt) return 1.35;
  if (COUNTER[dt]===at) return 0.75;
  return 1.0;
}

/* ============================================================
   §28  업데이트 루프
   ============================================================ */
function useBomb() {
  const p = B.player;
  if (!B.running || B.paused || p._bombCd || _ult.active) return;
  p._bombCd = 360;
  _ult.active = true; _ult.timer = 80; _ult.slowFrames = 50; _ult.beams = [];
  triggerShake(8, 12); playSfx("explosion");
  for (let i = 0; i < 8; i++) addExplosion(Math.random()*W, Math.random()*H, "#ffd76a");
}

function update() {
  if (!B.running || B.bossPending) return;

  /* 럭키 룰렛(일시정지 중에도 타이머만 진행) */
  if (B.luckyRoulette) {
    B.luckyRoulette.t--;
    B.luckyRoulette.spin += 0.5;
    if (B.luckyRoulette.t <= 0) {
      const idx = B.luckyRoulette.idx;
      B.luckyRoulette = null;
      B.paused = false;
      if (idx === 0) {
        addSquadWithOverflowFever(50);
        toast("🎰 LUCKY! 아군 +50기 즉시!", "ok");
      } else if (idx === 1) {
        B.invincibleTimer = 600;
        toast("🎰 LUCKY! 10초 무적!", "ok");
      } else {
        give({ gold: 1000 });
        updateCurrency();
        saveState();
        toast("🎰 LUCKY! 골드 +1000", "ok");
      }
      playSfx("clear");
      triggerShake(12, 22);
    }
    return;
  }

  if (B.paused) { _spdWinStart = 0; _spdTickCount = 0; return; }

  /* 힛스탑 — 큰 타격 시 N프레임 일시 정지 */
  if (_hitstop > 0) { _hitstop--; return; }

  /* 스피드핵 완화: 벽시계 대비 전투 틱이 과도하면 일시정지 (rAF 다중 호출 등) */
  if (!document.hidden) {
    if (!_spdWinStart) _spdWinStart = Date.now();
    _spdTickCount++;
    const el = Date.now() - _spdWinStart;
    if (el >= 1600) {
      const maxAllowed = Math.floor(el / 9) + 35;
      if (_spdTickCount > maxAllowed) {
        B.paused = true;
        toast("⚠ 비정상 게임 속도가 감지되어 일시정지했습니다.", "warn");
      }
      _spdWinStart = Date.now();
      _spdTickCount = 0;
    }
  } else {
    _spdWinStart = 0;
    _spdTickCount = 0;
  }

  /* 총알·파티클 수 상한 (성능 보호) */
  if (B.bullets.length > MAX_ALLY_BULLETS)       B.bullets.splice(0, B.bullets.length - MAX_ALLY_BULLETS);
  if (B.enemyBullets.length > MAX_ENEMY_BULLETS) B.enemyBullets.splice(0, B.enemyBullets.length - MAX_ENEMY_BULLETS);
  if (B.particles.length > MAX_PARTICLES_LIVE)   B.particles.splice(0, B.particles.length - MAX_PARTICLES_LIVE);

  /* 피버 타임 갱신 */
  if (_fever.active) {
    _fever.timer--;
    if (_fever.timer <= 0) _fever.active = false;
    for (const l of _fever.lines) {
      l.y += l.speed;
      if (l.y > H + l.len) { l.y = -l.len * 1.5; l.x = Math.random() * W; }
    }
  }

  /* 스트릭 타임아웃 */
  if (_streak.timer > 0) { _streak.timer--; if (_streak.timer === 0) _streak.count = 0; }
  if (_streak.showTimer > 0) _streak.showTimer--;

  if (_awakeningJuice.timer > 0) _awakeningJuice.timer--;
  if (_awakeningJuice.flash > 0) _awakeningJuice.flash--;
  if ((B.invincibleTimer | 0) > 0) B.invincibleTimer--;

  /* 불릿타임 — 아군 2기 이하일 때 슬로우 */
  const squadLow = B.squad <= 2 && B.squad > 0;
  if (squadLow) _bulletTimeAlpha = Math.min(0.55, _bulletTimeAlpha + 0.025);
  else          _bulletTimeAlpha = Math.max(0,    _bulletTimeAlpha - 0.04);
  const btScale = 1 - _bulletTimeAlpha * 0.68; /* 불릿타임 중 적 탄/이동 스케일 */

  /* 타임 워프 — 적 기체·적 탄환 속도 감소 (~30%) */
  if (_skillState.timeWarpTimer > 0) _skillState.timeWarpTimer--;
  const timeWarpMul = _skillState.timeWarpTimer > 0 ? 0.7 : 1;

  /* 궁극기 슬로우 타이머 */
  if (_ult.slowFrames > 0) {
    _ult.slowFrames--;
  }
  /* 궤도 포격 빔 갱신 */
  if (_ult.active) {
    _ult.timer--;
    for (let i = _ult.beams.length-1; i >= 0; i--) {
      const bm = _ult.beams[i];
      bm.y += bm.speed;
      bm.life--;
      /* 빔이 적에게 닿으면 대량 피해 */
      for (let j = B.enemies.length-1; j >= 0; j--) {
        const en = B.enemies[j];
        if (Math.abs(en.x - bm.x) < 28 && bm.y > en.y - en.h/2 && bm.y < en.y + en.h/2) {
          en.hp -= 120;
          addDmgText(en.x, en.y - en.h/2 - 5, 120, true);
          if (en.hp <= 0) {
            addExplosion(en.x, en.y, "#ffdd00");
            clearMesh(en);
            B.enemies.splice(j, 1);
            B.kills++; B.sessionKills++; S.totalKills++; S.seasonKills++;
            B.score += 200; triggerShake(4, 6);
            _onKill();
          }
        }
      }
      if (B.boss && Math.abs(B.boss.x - bm.x) < 60) {
        B.boss.hp -= 80; addDmgText(B.boss.x, B.boss.y - 20, 80, true);
        _hitstop = 2;
      }
      if (bm.life <= 0 || bm.y > H + 40) _ult.beams.splice(i, 1);
    }
    /* 새 빔 생성 (발동 초반 80프레임) */
    if (_ult.timer > 0 && _ult.timer % 4 === 0 && _ult.beams.length < 18) {
      _ult.beams.push({ x: Math.random() * W, y: -40, speed: 22, life: 40 });
    }
    if (_ult.timer <= 0 && _ult.beams.length === 0) _ult.active = false;
  }

  /* 보스 화이트아웃 타이머 */
  if (_bossDeath.missionTimer > 0) _bossDeath.missionTimer--;

  /* 이 프레임의 아군 위치를 한 번만 계산 (캐시) */
  cacheAllyPositions();

  /* 플레이어 이동 */
  const p=B.player;
  const speedMul=B.weather==="magnetic"?0.85:1;
  const s=p.speed*speedMul*(1+(S.research.engine-1)*0.04);
  /* 좌우 이동만 허용 (상하 고정) */
  if (B.keys.ArrowLeft ||B.keys.a||B.keys.A) p.x-=s;
  if (B.keys.ArrowRight||B.keys.d||B.keys.D) p.x+=s;
  p.x=clamp(p.x,20,W-20);
  /* Y는 화면 하단 고정 */
  p.y = _playerBaseY();

  /* 3D 지형 배경 스크롤 */
  scrollBgObjects(2.8);

  /* 황금 수송기: 스폰 + 이동 + 아군 탄 충돌 */
  trySpawnLuckyTransport();
  for (let li = B.luckyTransports.length - 1; li >= 0; li--) {
    const lt = B.luckyTransports[li];
    lt.x += lt.vx;
    const luckyTrail = B.particles.length > 110 ? 0.12 : 0.5;
    if (Math.random() < luckyTrail) {
      const L = 22 + Math.random() * 18;
      B.particles.push({
        x: lt.x + (Math.random() - 0.5) * lt.w * 0.45,
        y: lt.y + (Math.random() - 0.5) * lt.h * 0.35,
        vx: (Math.random() - 0.5) * 1.4,
        vy: (Math.random() - 0.5) * 1.4,
        life: L, maxLife: L,
        color: pick(["#ffe066", "#ffd700", "#fffacd", "#ffec80"]),
        neon: true,
        sizeMul: 1.35
      });
    }
    if (lt.x > W + 150) { B.luckyTransports.splice(li, 1); continue; }
    let broke = false;
    for (let j = B.bullets.length - 1; j >= 0; j--) {
      const b = B.bullets[j];
      if (!intersects(lt, b)) continue;
      lt.hp -= b.dmg;
      addDmgText(lt.x, lt.y - lt.h / 2 - 4, b.dmg, Math.random() < 0.08);
      clearMesh(b);
      B.bullets.splice(j, 1);
      playSfx("hit_enemy");
      if (lt.hp <= 0) {
        addSynergyKillExplosion(lt.x, lt.y);
        B.score += 500;
        startLuckyRoulette();
        B.luckyTransports.splice(li, 1);
        broke = true;
        break;
      }
    }
    if (broke) continue;
  }

  /* 자동 사격 — 총알이 너무 많으면 스킵해 성능 보호 */
  if (p.fireCd>0) p.fireCd--;
  const maxBulletsForFire = Math.min(330, 230 + Math.min(B.weaponLv, 99) * 3);
  const baseFireInt = Math.max(3, 10 - B.weaponLv);
  const fireInt = _skillState.rapidFire ? Math.max(2, Math.floor(baseFireInt * 0.62)) : baseFireInt;
  if (p.fireCd<=0 && B.bullets.length < maxBulletsForFire) { playerShoot(); p.fireCd = fireInt; }
  else if (p.fireCd<=0) p.fireCd=2; /* 캡 초과 시 짧게 대기 */

  /* ── 궁극기 (Space 또는 모바일 폭탄 버튼) ── */
  if (B.keys.Space && !p._bombCd && !_ult.active) useBomb();
  if (p._bombCd) p._bombCd--;

  /* 무한 모드: 동적 난이도 */
  if (B.stage.endless) B.stage.enemyTier = 1+Math.floor(B.wave/4);

  /* 웨이브 진행 */
  B.waveTimer++;
  if (!B.boss && B.waveTimer>20) {
    B.spawnTick++;
    const spawnRate=Math.max(10,44-B.wave*2-B.stage.enemyTier*2);
    if (B.spawnTick>=spawnRate) {
      spawnEnemy();
      /* 웨이브/티어가 오를수록 동시 다중 스폰 */
      const extraCount=Math.floor((B.wave-1)/5)+Math.floor((B.stage.enemyTier-1)/2);
      const room = MAX_ENEMIES_ON_SCREEN - B.enemies.length;
      const maxExtra = room > 8 ? 2 : room > 4 ? 1 : 0;
      for (let ex = 0; ex < Math.min(extraCount, maxExtra); ex++) spawnEnemy();
      B.spawnTick=0;
    }
    B.gateTick++;
    if (B.gateTick>=260) { spawnGatePair(); B.gateTick=0; }

    /* 진화 목표 (업그레이드 타겟) 스폰 */
    B.evoSpawnTick = (B.evoSpawnTick||0) + 1;
    const evoInterval = Math.max(600, 900 - B.stage.enemyTier*40);
    if (B.evoSpawnTick >= evoInterval && (B.evoTargets||[]).length === 0) {
      spawnEvoTarget();
      B.evoSpawnTick = 0;
    }
    if (B.waveTimer > 480+B.wave*30) {
      B.wave++; B.waveTimer=0;
      if (!B.stage.endless) {
        if (B.wave>B.maxWaves) {
          B.stage.boss ? spawnBoss() : endBattle(true);
        } else if (B.stage.boss && B.wave===B.maxWaves) spawnBoss();
      }
    }
  }

  /* 진화 목표 이동 & 충돌 */
  if (B.evoTargets && B.evoTargets.length) {
    for (let i=B.evoTargets.length-1; i>=0; i--) {
      const et=B.evoTargets[i];
      et.y+=1.2;
      et._pulse=(et._pulse||0)+0.08;
      for (let j=B.bullets.length-1; j>=0; j--) {
        const b=B.bullets[j];
        const dx=b.x-et.x, dy=b.y-et.y;
        if (Math.abs(dx)>et.r+6||Math.abs(dy)>et.r+8) continue;
        et.hp-=b.dmg;
        addDmgText(et.x+(rand(-14,14)|0), et.y-et.r-8, Math.ceil(b.dmg), false, "#ffd76a");
        clearMesh(b);
        B.bullets.splice(j,1);
        playSfx("hit_enemy");
        if (et.hp<=0) {
          triggerShake(9,16);
          playSfx("level_up");
          B.evolutionLv=Math.min(3,B.evolutionLv+1);
          B.weaponLv=Math.min(WEAPON_LV_CAP,B.weaponLv+10);
          const evNames=["EVO 1","EVO MAX","EVO ULTIMATE"];
          toast(`기체 진화! ${evNames[B.evolutionLv-1]||"ULTIMATE"} 달성!`,"gold");
          const evoBurst = B.particles.length > 100 ? 10 : 26;
          for (let p = 0; p < evoBurst; p++) addExplosion(et.x + rand(-30, 30), et.y + rand(-30, 30), "#ffd76a");
          B.evoTargets.splice(i,1);
          break;
        }
      }
      if (i<B.evoTargets.length && B.evoTargets[i] && et.y>H+80) B.evoTargets.splice(i,1);
    }
  }

  /* 아군 총알 이동 (+ 유도 미사일: 가장 가까운 적 쪽으로 vx 보정) */
  const guidedHeavy = _skillState.guided && (B.bullets.length > 170 || B.enemies.length > 24);
  for (let i=B.bullets.length-1;i>=0;i--) {
    const b=B.bullets[i];
    if (_skillState.guided && b.render !== "laser" && !b.noGuide) {
      if (guidedHeavy && (i + B.waveTimer) % 2 === 1) {
        /* 고부하 시 유도 연산 프레임 번갈아 적용 */
      } else {
        let best = 1e18, tx = 0, ty = -1;
        const en = B.enemies;
        const step = guidedHeavy && en.length > 14 ? 2 : 1;
        for (let ei = 0; ei < en.length; ei += step) {
          const e = en[ei];
          const dx = e.x - b.x, dy = e.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) { best = d2; tx = dx; ty = dy; }
        }
        if (B.boss) {
          const dx = B.boss.x - b.x, dy = B.boss.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) { best = d2; tx = dx; ty = dy; }
        }
        const bestDist = Math.sqrt(best);
        if (best < 1e17 && bestDist > 8) {
          const len = bestDist || 1;
          const steer = b.render === "carpetLaser" ? 0.16 : 0.11;
          const wantVx = (tx / len) * (b.render === "carpetLaser" ? 4.8 : 3.4);
          b.vx = (b.vx || 0) + (wantVx - (b.vx || 0)) * steer;
          b.vx = Math.max(-12, Math.min(12, b.vx));
        }
      }
    }
    b.y-=b.v;
    if (b.vx) b.x+=b.vx;
    if (b.y<-20||b.x<-40||b.x>W+40) {
      clearMesh(b);
      B.bullets.splice(i,1);
    }
  }

  /* 적 총알 이동 (직진, 유도 없음) */
  const stormMul=B.weather==="storm"?1.1:1.0;
  const btSpeed = btScale; /* 불릿타임 슬로우 */
  for (let i=B.enemyBullets.length-1;i>=0;i--) {
    const b=B.enemyBullets[i];
    b.x+=b.vx*stormMul*btSpeed*timeWarpMul; b.y+=b.vy*stormMul*btSpeed*timeWarpMul;
    if (b.y>H+20||b.x<-20||b.x>W+20) {
      clearMesh(b);
      B.enemyBullets.splice(i,1); continue;
    }
      let hit=false;
    /* 아군 히트박스: 간단한 X 범위 체크 먼저 → 통과 시 Y 체크 (최적화) */
    const bx=b.x, by=b.y;
    for (const ally of B._allies) {
      if (Math.abs(bx - ally.x) < 19 && Math.abs(by - ally.y) < 22) {
        loseAlly(ally.x,ally.y); clearMesh(b); B.enemyBullets.splice(i,1); hit=true; break;
      }
    }
    if (hit) continue;
  }

  /* 게이트 처리 */
  for (let i=B.gates.length-1;i>=0;i--) {
    const g=B.gates[i]; g.y+=2.2;
    for (let j=B.bullets.length-1;j>=0;j--) {
      const b=B.bullets[j];
      if (!intersects(g,b)) continue;
      /* +/x: 공격하면 값 증가 → 더 좋아짐 | -/÷: 공격하면 값 감소 → 덜 빼짐 */
      if      (g.op==="+") g.value = Math.min(1e15, g.value + 2.5);
      else if (g.op==="x") g.value = Math.min(GATE_MULT_ABS_MAX, g.value + 0.06);
      else if (g.op==="-") {
        const tk = B.stage?.enemyTier || 1;
        g.value = Math.max(0, g.value - (4 + tk * 0.45));
      }  /* 값이 커질수록·티어가 높을수록 탄으로 더 많이 깎임 */
      /* ÷는 고정 배율 — 탄으로 수치 변경 없음 */
      clearMesh(b);
      B.bullets.splice(j,1); B.score+=1;
    }
    if (g.y>H+60) { B.gates.splice(i,1); continue; }
    if (!g.applied && intersects(g,B.player)) applyGate(g);
  }

  /* 적 처리 */
  const fireLineY = _enemyFireLineY();
  for (let i=B.enemies.length-1;i>=0;i--) {
    const e=B.enemies[i];

    /* ── 돌격기(rammer) 전용 2단계 로직 ── */
    if (e.kind==="rammer") {
      if (!e.charging) {
        /* 1단계: 아군 전열 앞(보이지 않는 선)까지 내려와 호버링 + 카운트다운 */
        if (e.y < fireLineY) {
          e.y += 2.35 * timeWarpMul;
        } else {
          e.phase = (e.phase||0) + 0.06;
          e.y = fireLineY + Math.sin(e.phase) * 7;
          e.chargeTimer--;
          /* 경고 파티클 (붉은 연기) */
          const rCh = B.particles.length > 90 ? 10 : 5;
          if (e.chargeTimer > 0 && e.chargeTimer % rCh === 0) {
            B.particles.push({ x:e.x+(Math.random()-0.5)*e.w*0.5, y:e.y+e.h*0.45,
              vx:(Math.random()-0.5)*2, vy:-1.8-Math.random()*2,
              life:18+Math.random()*12, color:pick(["#ff4400","#cc2200","#ff7700"]) });
          }
          /* 2단계 돌진 전환 */
          if (e.chargeTimer <= 0) {
            e.charging = true;
            const dx=B.player.x-e.x, dy=B.player.y-e.y;
            const dist=Math.max(1, Math.hypot(dx,dy));
            const spd=20+Math.random()*4;
            e.vx=dx/dist*spd; e.vy=dy/dist*spd;
            triggerShake(5,10);
            playSfx("boss_appear");
          }
        }
      } else {
        /* 2단계: 급강하 돌진 — 매 프레임 플레이어 쪽으로 속도 유도 */
        const targetSpd = Math.hypot(e.vx, e.vy) || 22;
        const dx = B.player.x - e.x, dy = B.player.y - e.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / dist, uy = dy / dist;
        const nvx = e.vx * 0.88 + ux * targetSpd * 0.12;
        const nvy = e.vy * 0.88 + uy * targetSpd * 0.12;
        const n = Math.hypot(nvx, nvy);
        if (n > 0.01) { e.vx = nvx / n * targetSpd; e.vy = nvy / n * targetSpd; }
        e.x += e.vx * timeWarpMul; e.y += e.vy * timeWarpMul;
        /* 붉은 애프터버너 파티클 궤적 */
        const heavyP = B.particles.length > 100;
        if (Math.random() < (heavyP ? 0.35 : 0.88)) {
          const pc = heavyP ? 1 : 4;
          for (let p = 0; p < pc; p++) {
            B.particles.push({
              x:e.x-e.vx*(p*0.28)+(Math.random()-0.5)*e.w*0.4,
              y:e.y-e.vy*(p*0.28)+(Math.random()-0.5)*e.h*0.3,
              vx:(Math.random()-0.5)*2.5, vy:(Math.random()-0.5)*2.5,
              life:16+Math.random()*18,
              color:pick(["#ff1100","#ff4400","#ff7700","#ffaa00","#ffdd00"])
            });
          }
        }
        /* 플레이어와 충돌 → 치명적 피해 */
        if (intersects(e,B.player)) {
          const damage=Math.max(5, Math.floor(B.squad*0.30));
          const crashN = B.particles.length > 95 ? 16 : 70;
          for (let p = 0; p < crashN; p++) {
            B.particles.push({ x:e.x+(Math.random()-0.5)*130, y:e.y+(Math.random()-0.5)*90,
              vx:(Math.random()-0.5)*14, vy:(Math.random()-0.5)*14,
              life:40+Math.random()*30,
              color:pick(["#ff0000","#ff3300","#ff6600","#ff9900","#ffdd00","#cc0044"]) });
          }
          B.squad=Math.max(0, B.squad-damage);
          clearMesh(e);
          B.enemies.splice(i,1);
          triggerShake(18,30);
          playSfx("explosion");
          addDmgText(B.player.x, B.player.y-30, damage, true);
          if (B.squad<=0) { B.over=true; endBattle(false); }
          continue;
        }
      }
      /* 총알 충돌 (돌진 중 무적 — 총알만 제거, 피해 없음) */
      let ramKilled=false;
      for (let j=B.bullets.length-1;j>=0;j--) {
        const b=B.bullets[j];
        if (!intersects(e,b)) continue;
        if (e.charging) {
          clearMesh(b);
          B.bullets.splice(j,1); continue; /* 무적: 튕김 */
        }
        const synKill = b.render === "carpetLaser";
        const mul=damageMultiplier(b.atype,e.atype);
        const crit=Math.random()<0.08;
        const actualDmg=b.dmg*mul*(crit?2.0:1.0);
        e.hp-=actualDmg;
        addDmgText(e.x, e.y-e.h/2-5, actualDmg, crit);
        i = skillExplosiveAoE(e.x, e.y, i, actualDmg, !!b.splash);
        clearMesh(b);
        B.bullets.splice(j,1);
        playSfx("hit_enemy");
        if (e.hp<=0) {
          clearMesh(e);
          B.enemies.splice(i,1);
          B.kills++; B.sessionKills++;
          S.totalKills++; S.seasonKills++;
          B.score+=220+e.tier*35;
          spawnPowerup(e.x,e.y);
          if (synKill) {
            addSynergyKillExplosion(e.x, e.y);
            triggerShake(12, 22);
          } else {
            addExplosion(e.x,e.y,"#ff3300");
            if (B.particles.length < 120) {
              addExplosion(e.x-25,e.y+15,"#ff6600");
              addExplosion(e.x+25,e.y-15,"#ffaa00");
            }
          }
          playSfx("explosion"); triggerShake(synKill ? 10 : 9, synKill ? 20 : 18);
          trackQuest("dqKills"); _onKill();
          ramKilled=true; break;
        }
      }
      if (ramKilled||i>=B.enemies.length) continue;
      if (e.y>H+90||e.x<-130||e.x>W+130) { clearMesh(e); B.enemies.splice(i,1); }
      continue;
    }

    /* ── 일반 적: 전열 선까지 전진 → 선에서 기체를 돌려 플레이어 조준 사격 ── */
    e.phase += 0.035;
    if (!e.inHold) {
      e.x += Math.sin(e.phase) * 1.8 * timeWarpMul;
      e.y += (e.speed + 1.85) * btSpeed * 1.22 * timeWarpMul;
      if (e.y >= fireLineY) {
        e.y = fireLineY;
        if (!e.inHold) {
          e.inHold = true;
          e.aimAngle = 0;
          e.fireCd = Math.floor(e.fireBase * 0.35 + Math.random() * 28);
        }
      }
    } else {
      e.x += Math.sin(e.phase) * 0.42 * timeWarpMul;
      const dx = B.player.x - e.x, dy = B.player.y - e.y;
      /* 선에서 조준 bank (스프라이트·미러에 맞춘 방향) */
      const targetAim = Math.atan2(dx, dy);
      e.aimAngle = (e.aimAngle || 0) + (targetAim - (e.aimAngle || 0)) * 0.14;
      e.aimAngle = Math.max(-0.72, Math.min(0.72, e.aimAngle));
    }
    e.fireCd--;
    if (e.fireCd <= 0 && e.inHold) {
      enemyShoot(e);
      e.fireCd = e.fireBase + Math.random() * 30;
    }

    let killed=false;
    for (let j=B.bullets.length-1;j>=0;j--) {
      const b=B.bullets[j];
      if (!intersects(e,b)) continue;
      const synKill = b.render === "carpetLaser";
      const mul=damageMultiplier(b.atype,e.atype);
      const crit=Math.random()<0.08;
      const actualDmg=b.dmg*mul*(crit?2.0:1.0);
      e.hp-=actualDmg;
      addDmgText(e.x, e.y-e.h/2-5, actualDmg, crit);
      if (b.splash) {
        const R = b.splash, R2 = R * R;
        let spl = 0;
        for (const o of B.enemies) {
          if (o === e) continue;
          const dx = o.x - b.x, dy = o.y - b.y;
          if (dx * dx + dy * dy > R2) continue;
          o.hp -= b.dmg * 0.5;
          addDmgText(o.x, o.y - o.h / 2 - 5, b.dmg * 0.5, false);
          if (++spl >= 16) break;
        }
        addExplosion(b.x, b.y, "#ffd76a");
      }
      i = skillExplosiveAoE(e.x, e.y, i, actualDmg, !!b.splash);
      clearMesh(b);
      B.bullets.splice(j,1);
      playSfx("hit_enemy");
      if (e.hp<=0) {
        clearMesh(e);
        B.enemies.splice(i,1);
        B.kills++; B.sessionKills++;
        S.totalKills++; S.seasonKills++;
        B.score+=70+e.tier*12;
        if (Math.random()<0.12) spawnPowerup(e.x,e.y);
        if (synKill) {
          addSynergyKillExplosion(e.x, e.y);
          triggerShake(11, 20);
        } else {
          addExplosion(e.x,e.y,TYPES[e.atype].color);
        }
        playSfx("explosion"); triggerShake(synKill ? 9 : 3, synKill ? 14 : 5);
        trackQuest("dqKills"); _onKill();
        killed=true; break;
      }
    }
    if (killed||i>=B.enemies.length) continue;
    if (intersects(e,B.player)) { clearMesh(e); B.enemies.splice(i,1); loseAlly(B.player.x,B.player.y); addExplosion(e.x,e.y,"#ff7d92"); continue; }
    if (e.y>H+40) { clearMesh(e); B.enemies.splice(i,1); }
  }

  /* 보스 업데이트 [Phase 4] */
  if (B.boss) {
    const e=B.boss;
    if (e.y<90) e.y+=1.2*timeWarpMul; else e.x+=e.vx*timeWarpMul;
    if (e.x<100||e.x>W-100) e.vx*=-1;
    e.fireCd--;
    if (e.fireCd<=0) { bossShoot(); e.fireCd=70; }

    /* 레이저 빔 */
    e.laserCd--;
    if (e.laserCd<=0 && !e.laserState) {
      e.laserState="charging"; e.laserX=e.x; e.laserFrames=60;
      e.laserCd=200+Math.random()*100;
      playSfx("laser_charge");
    }
    if (e.laserState==="charging") {
      e.laserFrames--;
      if (e.laserFrames<=0) { e.laserState="firing"; e.laserFrames=35; playSfx("laser_fire"); triggerShake(9,18); }
    }
    if (e.laserState==="firing") {
      e.laserFrames--;
      const allies=B._allies;
      for (const ally of allies) if (Math.abs(ally.x-e.laserX)<20) loseAlly(ally.x,ally.y);
      if (e.laserFrames<=0) e.laserState=null;
    }

    /* 50% HP → 미니언 소환 */
    if (!e.spawnedMinions && e.hp<e.maxHp*0.5) {
      e.spawnedMinions=true;
      for (let i=0;i<4;i++) spawnEnemy(e.tier);
      toast("보스가 미니언을 소환했다!","warn"); playSfx("boss_appear"); triggerShake(7,12);
    }

    /* 보스 총알 충돌 */
    for (let j=B.bullets.length-1;j>=0;j--) {
      const b=B.bullets[j];
      if (!intersects(e,b)) continue;
      const mul=damageMultiplier(b.atype,e.atype);
      const crit=Math.random()<0.08; const actualDmg=b.dmg*mul*(crit?2:1);
      e.hp-=actualDmg; addDmgText(e.x,e.y-e.h/2-10,actualDmg,crit,true);
      skillExplosiveAoE(e.x, e.y, -1, actualDmg, !!b.splash);
      clearMesh(b);
      B.bullets.splice(j,1); playSfx("hit_enemy");
      /* 보스에 큰 피해 → 힛스탑 */
      if (actualDmg > 50) _hitstop = Math.min(4, Math.floor(actualDmg / 60));
      /* 체력 15% 이하 → 보스 직전 줌인 + 불릿타임 */
      if (e.hp <= e.maxHp * 0.15 && !e._preDeathZoom && !_bossDeath.dying) {
        e._preDeathZoom = true;
        _bulletTimeAlpha = 0.85;
        triggerShake(8, 15);
        toast("⚡ 보스 격추 직전!", "warn");
      }
      if (e.hp<=0 && !_bossDeath.dying) {
        /* 보스 화이트아웃 연출 시작 */
        _bossDeath.dying = true;
        _bossDeath.timer = 210;
        _bossDeath.whiteout = 0;
        e.dyingVY = 0;
        _bulletTimeAlpha = 0;
        triggerShake(14, 20); playSfx("explosion");
      }
    }
    /* 보스 화이트아웃 연출 진행 */
    if (_bossDeath.dying) {
      _bossDeath.timer--;
      e.dyingVY = (e.dyingVY || 0) + 0.35;
      e.y += e.dyingVY;
      /* 연쇄 소형 폭발 */
      if (_bossDeath.timer % 7 === 0) {
        const ex = e.x + (Math.random()-0.5)*e.w*1.2;
        const ey = e.y + (Math.random()-0.5)*e.h*0.8;
        addExplosion(ex, ey, Math.random() > 0.5 ? "#ff3300" : "#ffaa00");
        triggerShake(5, 5);
      }
      /* 화이트아웃 단계 (마지막 50프레임) */
      if (_bossDeath.timer <= 50) {
        _bossDeath.whiteout = 1 - (_bossDeath.timer / 50);
      }
      /* 연출 완료 → 실제 삭제 */
      if (_bossDeath.timer <= 0) {
        addExplosion(e.x,e.y,"#ffffff"); addExplosion(e.x-50,e.y+20,"#ffd36a"); addExplosion(e.x+50,e.y-20,"#ffd36a");
        clearMesh(e);
        B.boss=null; B.score+=900; B.kills+=10; S.totalKills+=10; S.seasonKills+=10;
        _bossDeath.dying = false; _bossDeath.whiteout = 1;
        _bossDeath.missionTimer = 160;
        endBattle(true);
      }
      if (!B.boss) { /* endBattle이 이미 호출됨 */ }
      return; /* 보스 죽어가는 중엔 나머지 로직 건너뜀 */
    }
    if (B.boss && intersects(e,B.player)) loseAlly(B.player.x,B.player.y);
  }
  for (let i=B.powerups.length-1;i>=0;i--) {
    const pu=B.powerups[i]; pu.y+=pu.vy;
    if (pu.y>H+20) { B.powerups.splice(i,1); continue; }
    if (intersects(pu,B.player)) {
      if      (pu.kind==="weapon") B.weaponLv=Math.min(WEAPON_LV_CAP,B.weaponLv+5);
      else if (pu.kind==="shield") addSquadWithOverflowFever(5);
      else if (pu.kind==="bomb")   { for(const e of B.enemies) e.hp-=30; if(B.boss) B.boss.hp-=80; triggerShake(6,10); }
      else if (pu.kind==="gold")   { const a=Math.max(1, Math.floor(Number(pu.amount)||40)); give({ gold:a }); toast(`💰 골드 +${formatResDisplay(a)} (보유 ${formatResDisplay(S.gold)})`,"ok"); }
      else if (pu.kind==="fuel")   { const a=Math.max(1, Math.floor(Number(pu.amount)||25)); give({ fuel:a }); toast(`⛽ 항공유 +${formatResDisplay(a)} (보유 ${formatResDisplay(S.fuel)})`,"ok"); }
      else if (pu.kind==="alloy")  { const a=Math.max(1, Math.floor(Number(pu.amount)||12)); give({ alloy:a }); toast(`⚙ 합금 +${formatResDisplay(a)} (보유 ${formatResDisplay(S.alloy)})`,"ok"); }
      else if (pu.kind==="gem")    { const a=Math.max(1, Math.floor(Number(pu.amount)||1)); give({ gems:a }); toast(`💎 다이아 +${formatResDisplay(a)} (보유 ${formatResDisplay(S.gems)})`,"ok"); }
      else if (pu.kind==="score")  B.score += pu.amount || 80;
      addExplosion(pu.x,pu.y,"#ffd76a"); playSfx("powerup"); B.powerups.splice(i,1);
    }
  }

  /* 파티클 + 데미지 텍스트 */
  for (let i=B.particles.length-1;i>=0;i--) {
    const f=B.particles[i]; f.x+=f.vx; f.y+=f.vy; f.life--;
    if (f.life<=0) B.particles.splice(i,1);
  }
  if (B.particles.length > MAX_PARTICLES_LIVE) B.particles.splice(0, B.particles.length - MAX_PARTICLES_LIVE);
  updateDmgTexts();

  B.score+=0.08;
  if (B.squad<=0) { B.over=true; endBattle(false); }

  /* 무한 모드 최고기록 갱신 */
  if (B.stage.endless && B.wave > S.endlessBest) {
    S.endlessBest=B.wave; saveState();
  }

  refreshBattleHud();
}

/* ============================================================
   §29  전투 종료  [Phase 4: 부상 시스템]
   ============================================================ */
function endBattle(win) {
  B.running=false;
  _spdWinStart = 0;
  _spdTickCount = 0;
  /* 잔존 3D 메쉬 일괄 정리 (메모리 누수 방지) */
  for (const e of B.enemies)      clearMesh(e);
  for (const b of B.bullets)      clearMesh(b);
  for (const b of B.enemyBullets) clearMesh(b);
  if (B.boss) clearMesh(B.boss);
  /* 아군 풀은 풀이므로 visible=false 처리만 */
  for (const m of _allyMeshPool) { if (m) m.visible = false; }
  $("gameOverPanel").classList.add("show");
  $("overScore").textContent=Math.floor(B.score);
  $("overKills").textContent=B.kills;
  $("overWave").textContent=B.wave;

  if (win) {
    $("overTitle").textContent="미션 클리어"; $("overTitle").style.color="var(--gold)";
    $("overSub").textContent=B.stage.id===99 ? `∞ 웨이브 ${B.wave} 도달!` : `${B.stage.name} 클리어!`;
    playSfx("clear");
    trackQuest("dqClear");
    if (B.stage.endless) toast(`무한 모드 웨이브 ${B.wave} — 최고기록 ${S.endlessBest}!`);
  } else {
    $("overTitle").textContent="미션 실패"; $("overTitle").style.color="var(--red)";
    $("overSub").textContent="모든 아군이 격추되었습니다.";
    playSfx("gameover"); triggerShake(14, 25);
    /* 부상자 발생 */
    const newInjured=Math.min(2, Math.max(0, Math.floor(B.sessionKills/3)));
    S.injuredPilots=clamp(S.injuredPilots+newInjured, 0, 5);
    if (newInjured>0) toast(`파일럿 ${newInjured}명 부상 발생 — 병원 탭에서 치료하세요`, "warn");
  }

  /* 퀘스트 킬 카운트 반영 */
  S.dailyProgress.dqKills=(S.dailyProgress.dqKills||0)+B.sessionKills;
  S.dailyProgress.dqGates=(S.dailyProgress.dqGates||0)+B.sessionGates;

  const mult=win?1:0.4;
  const bonus=1+(S.fortress.factory-1)*0.08;
  /* 무한 모드: 웨이브가 높을수록 기본 보상·점수 환급 증가 (이전엔 30골드 고정으로 너무 빈약) */
  const endlessMult = B.stage.endless ? Math.max(1, 1 + B.wave * 0.14 + Math.sqrt(B.wave) * 0.35) : 1;
  const rew={
    gold:  Math.floor((B.stage.rewards.gold  * endlessMult * mult * bonus) + (B.score * 0.12 * mult)),
    fuel:  Math.floor((B.stage.rewards.fuel  ||0) * endlessMult * mult * bonus),
    alloy: Math.floor((B.stage.rewards.alloy ||0) * endlessMult * mult * bonus),
    gems:  Math.floor((B.stage.rewards.gems  ||0) * mult * (B.stage.endless ? Math.min(3, 1 + Math.floor(B.wave / 25)) : 1))
  };
  /* 광고 제거 패키지 보유 시 자동 3배 */
  if (GameMonetization.hasNoAds()) { Object.keys(rew).forEach(k => rew[k] *= 3); }
  _pendingRewards = rew;
  give(rew);
  if (win&&S.stageCleared<B.stage.id) S.stageCleared=B.stage.id;
  if (B.score>S.bestScore) S.bestScore=Math.floor(B.score);
  {
    const r2 = Object.fromEntries(Object.entries(rew).filter(([, v]) => v > 0));
    $("overRewards").innerHTML = Object.keys(r2).length ? fmtRewardLine(r2) : "—";
  }
  /* 광고 3배 버튼 표시 제어 */
  const adBtn = $('btnAdReward');
  if (adBtn) {
    if (GameMonetization.hasNoAds()) {
      adBtn.textContent = '✅ 3배 자동 지급 완료 (광고 제거 패키지)';
      adBtn.disabled = true;
    } else {
      adBtn.textContent = '📺 광고 시청 → 보상 3배!';
      adBtn.disabled = false;
    }
  }
  saveState(); updateCurrency();
}

/* ============================================================
   §30  그리기
   ============================================================ */
/* ============================================================
   아군 · P-38 라이트닝 스타일 (상향 비행, 이중 붐, 프로펠러)
   ============================================================ */
function drawAllyJet(x, y, w, h, type, isLeader) {
  const c = ({
    interceptor: { wing:"#162a45", wingEdge:"#00f5ff", body:"#243d5c", accent:"#00e5ff", cockpit:"#66ffff", flame:"#ff00aa", glow:"rgba(0,245,255,0.45)" },
    bomber:      { wing:"#3d2818", wingEdge:"#ff2a8a", body:"#5c3842", accent:"#ff6a00", cockpit:"#ffd0e0", flame:"#ffaa00", glow:"rgba(255,42,138,0.4)" },
    gunship:     { wing:"#241840", wingEdge:"#c94bff", body:"#3a2858", accent:"#e8b0ff", cockpit:"#f0d8ff", flame:"#9d4edd", glow:"rgba(201,75,255,0.42)" }
  })[type] || { wing:"#162a45", wingEdge:"#00f5ff", body:"#243d5c", accent:"#00e5ff", cockpit:"#66ffff", flame:"#ff00aa", glow:"rgba(0,245,255,0.45)" };

  const tBlink = performance.now() * 0.004;
  ctx.save();
  ctx.translate(x, y);

  const wingGrad = ctx.createLinearGradient(-w, -h * 0.2, w, h * 0.3);
  wingGrad.addColorStop(0, c.wing);
  wingGrad.addColorStop(0.5, "#0a1528");
  wingGrad.addColorStop(1, c.wing);
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(-w * 0.92, -h * 0.03);
  ctx.lineTo(w * 0.92, -h * 0.03);
  ctx.lineTo(w * 0.70, h * 0.20);
  ctx.lineTo(-w * 0.70, h * 0.20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c.wingEdge;
  ctx.lineWidth = 1.8;
  ctx.shadowBlur = 10;
  ctx.shadowColor = c.accent;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(0,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(-w * 0.86, -h * 0.02);
  ctx.lineTo(w * 0.86, -h * 0.02);
  ctx.lineTo(w * 0.78, h * 0.05);
  ctx.lineTo(-w * 0.78, h * 0.05);
  ctx.closePath();
  ctx.fill();

  const mSlots = [];
  for (let r = 0; r < 14; r++) {
    const yy = -h * 0.14 + (r / 13) * h * 0.34;
    const xin = w * (0.34 + (r % 4) * 0.048 + Math.floor(r / 4) * 0.028);
    mSlots.push([-xin, yy], [xin, yy]);
  }
  const mCount = Math.min(Math.max(0, (B.weaponLv || 1) - 1), mSlots.length);
  const mRad = mCount > 18 ? w * 0.017 : w * 0.024;
  for (let i = 0; i < mCount; i++) {
    const [mx, my] = mSlots[i];
    ctx.fillStyle = "#2a3a48";
    ctx.fillRect(mx - mRad, my - h * 0.11, mRad * 2, h * 0.14);
    ctx.fillStyle = "#ff3366";
    ctx.shadowBlur = 6;
    ctx.shadowColor = "#ff0044";
    ctx.beginPath();
    ctx.arc(mx, my - h * 0.11, mRad, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  const boomGrad = ctx.createLinearGradient(0, -h * 0.6, 0, h * 0.6);
  boomGrad.addColorStop(0, c.body);
  boomGrad.addColorStop(0.5, "#080c14");
  boomGrad.addColorStop(1, c.body);
  ctx.fillStyle = boomGrad;
  ctx.fillRect(-w * 0.298, -h * 0.57, w * 0.118, h * 1.10);
  ctx.fillRect( w * 0.180, -h * 0.57, w * 0.118, h * 1.10);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(-w * 0.290, -h * 0.55, w * 0.040, h * 1.07);
  ctx.fillRect( w * 0.188, -h * 0.55, w * 0.040, h * 1.07);

  for (const sx of [-1, 1]) {
    ctx.fillStyle = "#0a1018";
    ctx.beginPath();
    ctx.arc(sx * w * 0.24, -h * 0.55, w * 0.085, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = c.accent;
    ctx.beginPath();
    ctx.arc(sx * w * 0.24, -h * 0.55, w * 0.085, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#020408";
    ctx.beginPath();
    ctx.arc(sx * w * 0.24, -h * 0.55, w * 0.052, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = c.body;
  ctx.fillRect(-w * 0.095, -h * 0.56, w * 0.190, h * 0.88);
  ctx.fillStyle = c.accent;
  ctx.globalAlpha = 0.35 + Math.sin(tBlink) * 0.08;
  ctx.fillRect(-w * 0.095, -h * 0.25, w * 0.190, h * 0.04);
  ctx.globalAlpha = 1;

  const cg = ctx.createRadialGradient(0, -h * 0.22, 0, 0, -h * 0.22, w * 0.1);
  cg.addColorStop(0, "#ffffff");
  cg.addColorStop(0.4, c.cockpit);
  cg.addColorStop(1, "#103040");
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.22, w * 0.078, h * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c.wingEdge;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = c.accent;
  ctx.fillRect(-w * 0.30, -h * 0.25, w * 0.118, h * 0.032);
  ctx.fillRect( w * 0.182, -h * 0.25, w * 0.118, h * 0.032);

  ctx.fillStyle = c.wing;
  ctx.beginPath();
  ctx.moveTo(-w * 0.29, h * 0.44);
  ctx.lineTo(-w * 0.53, h * 0.57);
  ctx.lineTo(-w * 0.30, h * 0.54);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo( w * 0.29, h * 0.44);
  ctx.lineTo( w * 0.53, h * 0.57);
  ctx.lineTo( w * 0.30, h * 0.54);
  ctx.closePath();
  ctx.fill();

  const fCore = 0.85 + Math.sin(tBlink * 1.7) * 0.15;
  ctx.fillStyle = c.flame;
  ctx.shadowBlur = 20;
  ctx.shadowColor = c.flame;
  ctx.beginPath();
  ctx.ellipse(-w * 0.24, h * 0.57, w * 0.050 * fCore, h * 0.16 * fCore, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse( w * 0.24, h * 0.57, w * 0.050 * fCore, h * 0.16 * fCore, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.ellipse(-w * 0.24, h * 0.50, w * 0.018, h * 0.048, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse( w * 0.24, h * 0.50, w * 0.018, h * 0.048, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isLeader) {
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#ffe600";
    ctx.fillStyle = "rgba(255,240,100,0.95)";
    ctx.font = "700 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("★", 0, -h * 0.74);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

/* ============================================================
   아군 · 고속 경량 렌더 (그라디언트/애니메이션 없음, 추가 편대용)
   ============================================================ */
function drawAllyJetFast(x, y, w, h, type) {
  const c = ({
    interceptor: { wing:"#162a45", edge:"#00e5ff", body:"#1e3350", cockpit:"#8fffff", flame:"#ff1493" },
    bomber:      { wing:"#3d2018", edge:"#ff2a6a", body:"#503040", cockpit:"#ffd0f0", flame:"#ff9500" },
    gunship:     { wing:"#221840", edge:"#d060ff", body:"#342050", cockpit:"#eec8ff", flame:"#b84dff" }
  })[type] || { wing:"#162a45", edge:"#00e5ff", body:"#1e3350", cockpit:"#8fffff", flame:"#ff1493" };
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = c.wing;
  ctx.beginPath();
  ctx.moveTo(-w * 0.90, -h * 0.03);
  ctx.lineTo(w * 0.90, -h * 0.03);
  ctx.lineTo( w * 0.68, h * 0.18);
  ctx.lineTo(-w * 0.68, h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c.edge;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = c.body;
  ctx.fillRect(-w * 0.29, -h * 0.52, w * 0.11, h * 1.00);
  ctx.fillRect( w * 0.18, -h * 0.52, w * 0.11, h * 1.00);
  ctx.fillRect(-w * 0.09, -h * 0.52, w * 0.18, h * 0.84);
  ctx.fillStyle = c.cockpit;
  ctx.beginPath();
  ctx.arc(0, -h * 0.20, w * 0.065, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.flame;
  ctx.shadowBlur = 12;
  ctx.shadowColor = c.flame;
  ctx.beginPath();
  ctx.ellipse(-w * 0.23, h * 0.53, w * 0.042, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse( w * 0.23, h * 0.53, w * 0.042, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

/* ============================================================
   오프스크린 스프라이트 캐시 — 비리더 아군 드로잉용
   매 프레임 캔버스 경로 연산 대신 drawImage 한 번으로 처리
   ============================================================ */
const _allyCache = {};  /* key: "interceptor_28" → OffscreenCanvas */
function _getAllySprite(type, sz) {
  const key = "neo4_" + type + "_" + sz;
  if (_allyCache[key]) return _allyCache[key];
  const pad = 4;
  const oc = document.createElement("canvas");
  oc.width  = Math.ceil(sz * 2) + pad * 2;
  oc.height = Math.ceil(sz * 1.36) + pad * 2;
  const oc2 = oc.getContext("2d");
  oc2.translate(oc.width / 2, oc.height / 2);
  const c = ({
    interceptor: { wing:"#162a45", edge:"#00e5ff", body:"#1e3350", cockpit:"#8fffff", flame:"#ff1493" },
    bomber:      { wing:"#3d2018", edge:"#ff2a6a", body:"#503040", cockpit:"#ffd0f0", flame:"#ff9500" },
    gunship:     { wing:"#221840", edge:"#d060ff", body:"#342050", cockpit:"#eec8ff", flame:"#b84dff" }
  })[type] || { wing:"#162a45", edge:"#00e5ff", body:"#1e3350", cockpit:"#8fffff", flame:"#ff1493" };
  const w = sz, h = sz * 1.36;
  oc2.fillStyle = c.wing;
  oc2.beginPath();
  oc2.moveTo(-w * 0.90, -h * 0.03);
  oc2.lineTo(w * 0.90, -h * 0.03);
  oc2.lineTo( w * 0.68, h * 0.18);
  oc2.lineTo(-w * 0.68, h * 0.18);
  oc2.closePath();
  oc2.fill();
  oc2.strokeStyle = c.edge;
  oc2.lineWidth = 1.2;
  oc2.stroke();
  oc2.fillStyle = c.body;
  oc2.fillRect(-w * 0.29, -h * 0.52, w * 0.11, h * 1.00);
  oc2.fillRect( w * 0.18, -h * 0.52, w * 0.11, h * 1.00);
  oc2.fillRect(-w * 0.09, -h * 0.52, w * 0.18, h * 0.84);
  oc2.fillStyle = c.cockpit;
  oc2.beginPath();
  oc2.arc(0, -h * 0.20, w * 0.065, 0, Math.PI * 2);
  oc2.fill();
  oc2.fillStyle = c.flame;
  oc2.beginPath();
  oc2.ellipse(-w * 0.23, h * 0.53, w * 0.042, h * 0.12, 0, 0, Math.PI * 2);
  oc2.fill();
  oc2.beginPath();
  oc2.ellipse( w * 0.23, h * 0.53, w * 0.042, h * 0.12, 0, 0, Math.PI * 2);
  oc2.fill();
  _allyCache[key] = oc;
  return oc;
}
/* 스프라이트를 drawImage로 배치 — save/restore 없이 빠름 */
function drawAllySprite(x, y, type, sz) {
  const img = _getAllySprite(type, sz);
  ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
}

/* ============================================================
   적군 · 벡터 제로 스타일 — 좌표계에서 X축 대칭(캔버스: scale(1,-1), 위·아래 반전)
   ============================================================ */
function drawEnemyJet(x, y, w, h, kind, extraYaw = 0) {
  const kindMap = { raider:"interceptor", bomber:"bomber", sniper:"gunship", scout:"interceptor", gunboat:"bomber", rammer:"bomber" };
  const type = kindMap[kind] || "interceptor";
  const typeData = {
    interceptor: { body:"#2a1540", wing:"#1a0a28", neon:"#ff3366", stripe:"#ff0066", guns:2 },
    bomber:      { body:"#3a2010", wing:"#281808", neon:"#ff6600", stripe:"#ff3300", guns:4 },
    gunship:     { body:"#152040", wing:"#0a1028", neon:"#00f5ff", stripe:"#8844ff", guns:3 }
  };
  const c = typeData[type] || typeData.interceptor;
  const t = performance.now() * 0.003;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);
  ctx.rotate(Math.PI + extraYaw);

  ctx.shadowBlur = 18;
  ctx.shadowColor = c.neon;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.30, w * 0.50, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  const wingG = ctx.createLinearGradient(-w, 0, w, h * 0.2);
  wingG.addColorStop(0, c.wing);
  wingG.addColorStop(0.5, "#060212");
  wingG.addColorStop(1, c.wing);
  ctx.fillStyle = wingG;
  ctx.beginPath();
  ctx.moveTo(-w * 0.88, -h * 0.04);
  ctx.lineTo(w * 0.88, -h * 0.04);
  ctx.lineTo( w * 0.66, h * 0.22);
  ctx.lineTo(-w * 0.66, h * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c.neon;
  ctx.lineWidth = 1.8;
  ctx.shadowBlur = 14;
  ctx.shadowColor = c.neon;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,40,120,0.08)";
  ctx.beginPath();
  ctx.moveTo(-w * 0.82, -h * 0.03);
  ctx.lineTo(w * 0.82, -h * 0.03);
  ctx.lineTo(w * 0.75, h * 0.05);
  ctx.lineTo(-w * 0.75, h * 0.05);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#120818";
  const gunOffsets = [-0.60, -0.44, 0.44, 0.60];
  for (let i = 0; i < c.guns; i++) {
    ctx.fillRect(gunOffsets[i] * w - w * 0.024, -h * 0.05, w * 0.048, h * 0.19);
    ctx.fillStyle = "#0a040c";
    ctx.fillRect(gunOffsets[i] * w - w * 0.012, -h * 0.06, w * 0.024, h * 0.06);
    ctx.fillStyle = "#120818";
  }

  const bodyG = ctx.createLinearGradient(-w * 0.15, -h * 0.55, w * 0.12, h * 0.40);
  bodyG.addColorStop(0, "#602040");
  bodyG.addColorStop(0.45, c.body);
  bodyG.addColorStop(1, "#050208");
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.09, w * 0.18, h * 0.50, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0c0818";
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.52, w * 0.16, w * 0.165, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c.neon;
  ctx.lineWidth = 2;
  ctx.shadowBlur = 10;
  ctx.shadowColor = c.neon;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.52, w * 0.16, w * 0.165, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const pa = -performance.now() * 0.026;
  ctx.save();
  ctx.translate(0, -h * 0.56);
  ctx.rotate(pa);
  ctx.fillStyle = "rgba(30,10,40,0.92)";
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate(i * Math.PI * 2 / 3);
    ctx.beginPath();
    ctx.ellipse(0, -w * 0.165, w * 0.042, w * 0.135, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  if (type !== "gunship") {
    for (const sx of [-1, 1]) {
      ctx.fillStyle = c.stripe;
      ctx.shadowBlur = 8;
      ctx.shadowColor = c.stripe;
      ctx.beginPath();
      ctx.arc(sx * w * 0.42, h * 0.07, w * 0.078, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  } else {
    for (const sx of [-1, 1]) {
      ctx.fillStyle = "#6a30a0";
      ctx.beginPath();
      ctx.arc(sx * w * 0.66, h * 0.10, w * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.neon;
      ctx.beginPath();
      ctx.arc(sx * w * 0.66, h * 0.10, w * 0.038, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = c.wing;
  ctx.beginPath();
  ctx.moveTo(-w * 0.12, h * 0.44);
  ctx.lineTo(-w * 0.35, h * 0.58);
  ctx.lineTo(-w * 0.14, h * 0.54);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo( w * 0.12, h * 0.44);
  ctx.lineTo( w * 0.35, h * 0.58);
  ctx.lineTo( w * 0.14, h * 0.54);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.body;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.28);
  ctx.lineTo(w * 0.06, h * 0.52);
  ctx.lineTo(-w * 0.06, h * 0.52);
  ctx.closePath();
  ctx.fill();

  const eg = ctx.createLinearGradient(0, h * 0.44, 0, h * 0.85);
  eg.addColorStop(0, `rgba(255,60,140,${0.75 + Math.sin(t * 2) * 0.12})`);
  eg.addColorStop(0.5, "rgba(120,0,180,0.5)");
  eg.addColorStop(1, "rgba(0,240,255,0)");
  ctx.fillStyle = eg;
  ctx.shadowBlur = 22;
  ctx.shadowColor = "#ff00aa";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.55, w * 0.055 * (0.88 + Math.sin(t) * 0.1), h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

/* ============================================================
   카운트다운 자폭 돌격기 — 검붉은 중폭격기 스타일
   ============================================================ */
function drawRammerJet(x, y, w, h, e) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI); /* 아래를 향해 비행 */

  /* 돌진 중: 붉은 글로우 오라 */
  if (e.charging) {
    const pt = performance.now()*0.010;
    const grd = ctx.createRadialGradient(0,0,0, 0,0, w*1.3);
    grd.addColorStop(0, `rgba(255,30,0,${0.45+Math.sin(pt)*0.18})`);
    grd.addColorStop(1,  "rgba(160,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0,0, w*1.3,0,Math.PI*2); ctx.fill();
  } else {
    /* 대기 중: 주황빛 경고 펄스 */
    const pt = performance.now()*0.006;
    const grd = ctx.createRadialGradient(0,0,0, 0,0, w*1.0);
    grd.addColorStop(0, `rgba(255,100,0,${0.20+Math.sin(pt)*0.12})`);
    grd.addColorStop(1,  "rgba(120,20,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0,0, w*1.0,0,Math.PI*2); ctx.fill();
  }

  /* 그림자 */
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath(); ctx.ellipse(0,h*0.34, w*0.58,h*0.08,0,0,Math.PI*2); ctx.fill();

  /* ─ 주날개 (후퇴익, 날카로운 형태) ─ */
  ctx.fillStyle = "#2a0808";
  ctx.beginPath();
  ctx.moveTo(-w*1.02, h*0.07);
  ctx.lineTo(-w*0.48, -h*0.18);
  ctx.lineTo( w*0.48, -h*0.18);
  ctx.lineTo( w*1.02,  h*0.07);
  ctx.lineTo( w*0.68,  h*0.30);
  ctx.lineTo(-w*0.68,  h*0.30);
  ctx.closePath(); ctx.fill();
  /* 날개 위협 무늬 */
  ctx.fillStyle = "#880000";
  for (const sx of [-1,1]) {
    ctx.beginPath();
    ctx.moveTo(sx*w*0.92, h*0.10);
    ctx.lineTo(sx*w*0.50, -h*0.14);
    ctx.lineTo(sx*w*0.42,  h*0.10);
    ctx.closePath(); ctx.fill();
  }
  /* 날개 가장자리 붉은 선 */
  ctx.strokeStyle="#cc1010"; ctx.lineWidth=2.5;
  ctx.beginPath();
  ctx.moveTo(-w*1.02,h*0.07); ctx.lineTo(-w*0.48,-h*0.18);
  ctx.moveTo( w*1.02,h*0.07); ctx.lineTo( w*0.48,-h*0.18);
  ctx.stroke();

  /* ─ 쌍 붐 (동체 보조 지지대) ─ */
  ctx.fillStyle = "#1e0606";
  for (const sx of [-1,1]) {
    ctx.beginPath();
    ctx.moveTo(sx*w*0.28,-h*0.56); ctx.lineTo(sx*w*0.18,-h*0.56);
    ctx.lineTo(sx*w*0.16, h*0.52); ctx.lineTo(sx*w*0.26, h*0.52);
    ctx.closePath(); ctx.fill();
  }

  /* ─ 엔진 카울링 (좌우 2개) ─ */
  for (const sx of [-1,1]) {
    ctx.fillStyle = "#1a0202";
    ctx.beginPath(); ctx.ellipse(sx*w*0.23,-h*0.52, w*0.13,w*0.14,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="#cc1010"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(sx*w*0.23,-h*0.52, w*0.13,w*0.14,0,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle="#070000";
    ctx.beginPath(); ctx.ellipse(sx*w*0.23,-h*0.52, w*0.08,w*0.09,0,0,Math.PI*2); ctx.fill();
  }

  /* ─ 프로펠러 (역방향 고속 회전) ─ */
  const pa = -performance.now()*(e.charging?0.045:0.026);
  for (const sx of [-1,1]) {
    ctx.save(); ctx.translate(sx*w*0.23,-h*0.57); ctx.rotate(pa*sx);
    ctx.fillStyle = "rgba(35,5,5,0.92)";
    for (let i=0;i<3;i++) {
      ctx.save(); ctx.rotate(i*Math.PI*2/3);
      ctx.beginPath(); ctx.ellipse(0,-w*0.155, w*0.040,w*0.130,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ─ 중앙 동체 ─ */
  const bg = ctx.createLinearGradient(-w*0.18,-h*0.60, w*0.14,h*0.45);
  bg.addColorStop(0,"#6a1010"); bg.addColorStop(0.45,"#3a0808"); bg.addColorStop(1,"#0d0303");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-w*0.17,-h*0.60); ctx.lineTo(w*0.17,-h*0.60);
  ctx.lineTo( w*0.21, h*0.46); ctx.lineTo(-w*0.21, h*0.46);
  ctx.closePath(); ctx.fill();
  /* 동체 측면 하이라이트 */
  ctx.fillStyle = "rgba(200,50,50,0.22)";
  ctx.beginPath(); ctx.ellipse(-w*0.05,-h*0.18, w*0.055,h*0.22,-0.2,0,Math.PI*2); ctx.fill();

  /* 동체 리벳 패널 */
  ctx.strokeStyle="rgba(0,0,0,0.45)"; ctx.lineWidth=0.8;
  for (let i=-1;i<=1;i++) { ctx.beginPath(); ctx.moveTo(i*w*0.06,-h*0.55); ctx.lineTo(i*w*0.06,h*0.42); ctx.stroke(); }

  /* ─ 조종석 (적색 경고등) ─ */
  const ct = performance.now()*0.004;
  const cg = ctx.createRadialGradient(0,-h*0.22,0, 0,-h*0.22,w*0.10);
  cg.addColorStop(0, e.charging
    ? `rgba(255,${50+Math.sin(ct*4)*30},50,0.98)`
    : `rgba(255,${160+Math.sin(ct*2)*60},${e.chargeTimer<60?50:160},0.95)`);
  cg.addColorStop(0.45,"#aa0808");
  cg.addColorStop(1,"rgba(80,0,0,0)");
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.ellipse(0,-h*0.22, w*0.085*(0.88+Math.sin(ct)*0.14),h*0.10,0,0,Math.PI*2); ctx.fill();

  /* ─ 꼬리 날개 ─ */
  ctx.fillStyle = "#260606";
  ctx.beginPath(); ctx.moveTo(-w*0.20,h*0.43); ctx.lineTo(-w*0.52,h*0.58); ctx.lineTo(-w*0.22,h*0.54); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo( w*0.20,h*0.43); ctx.lineTo( w*0.52,h*0.58); ctx.lineTo( w*0.22,h*0.54); ctx.closePath(); ctx.fill();
  /* 수직 꼬리 */
  ctx.fillStyle = "#3a0808";
  ctx.beginPath(); ctx.moveTo(0,h*0.28); ctx.lineTo(w*0.06,h*0.52); ctx.lineTo(-w*0.06,h*0.52); ctx.closePath(); ctx.fill();

  /* ─ 엔진 배기 불꽃 (돌진 시 더 크게) ─ */
  const ft = performance.now()*0.006;
  for (const sx of [-1,1]) {
    const fl = (e.charging ? 2.0 : 0.85) + Math.sin(ft*3.5+sx)*0.18;
    const fg = ctx.createLinearGradient(sx*w*0.23,h*0.42, sx*w*0.23,h*(e.charging?0.95:0.78));
    fg.addColorStop(0, e.charging?"rgba(255,40,0,0.95)":"rgba(255,140,30,0.88)");
    fg.addColorStop(0.4, e.charging?"rgba(255,100,0,0.75)":"rgba(255,60,10,0.60)");
    fg.addColorStop(1,"rgba(200,30,0,0)");
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.ellipse(sx*w*0.23,h*(e.charging?0.62:0.56), w*0.068*fl,h*(e.charging?0.30:0.18)*fl,0,0,Math.PI*2); ctx.fill();
    /* 내부 코어 */
    ctx.fillStyle = e.charging?"rgba(255,230,200,0.90)":"rgba(255,200,100,0.70)";
    ctx.beginPath(); ctx.ellipse(sx*w*0.23,h*(e.charging?0.50:0.48), w*0.026,h*0.058,0,0,Math.PI*2); ctx.fill();
  }

  ctx.restore();
}

/* ============================================================
   3D 지형 배경 — 섬·배·구름·파도 스크롤  (위에서 내려다보는 원근감)
   ============================================================ */
function initBgObjects() {
  _bgScroll = 0;
  _bgIslands = [];
  _bgShips   = [];
  _bgClouds  = [];
  for (let i = 0; i < 7; i++)
    _bgIslands.push({ x:rand(60,W-60), y:rand(-H*2.8,-H*0.4), w:rand(80,185), h:rand(55,140), seed:Math.random()*999 });
  for (let i = 0; i < 6; i++)
    _bgShips.push({ x:rand(30,W-30), y:rand(-H*2.2,-H*0.3), size:rand(14,28), angle:rand(0.1,0.9) });
  for (let i = 0; i < 11; i++)
    _bgClouds.push({ x:rand(0,W), y:rand(-H,H), w:rand(80,200), h:rand(24,55), spd:rand(0.6,2.0) });
}

function scrollBgObjects(spd) {
  _bgScroll += spd;
  for (const o of _bgIslands) {
    o.y += spd;
    if (o.y > H + 175) { o.y = rand(-H*0.6,-120); o.x = rand(60,W-60); o.w = rand(80,185); o.h = rand(55,140); o.seed = Math.random()*999; }
  }
  for (const o of _bgShips) {
    o.y += spd * 0.82;
    if (o.y > H + 70) { o.y = rand(-200,-50); o.x = rand(30,W-30); }
  }
  for (const c of _bgClouds) {
    c.y += c.spd;
    if (c.y > H + 90) { c.y = rand(-100,-20); c.x = rand(0,W); }
  }
}

function drawIsland(isl) {
  /* 해수면 그림자 */
  ctx.fillStyle = "rgba(0,28,55,0.26)";
  ctx.beginPath(); ctx.ellipse(isl.x+7, isl.y+9, isl.w*0.53, isl.h*0.46, 0,0,Math.PI*2); ctx.fill();
  /* 해변 (sandy shore) */
  ctx.fillStyle = "#c8b458";
  ctx.beginPath(); ctx.ellipse(isl.x, isl.y, isl.w*0.50, isl.h*0.50, 0,0,Math.PI*2); ctx.fill();
  /* 식생 (초록 내부) */
  ctx.fillStyle = "#2a7a20";
  ctx.beginPath(); ctx.ellipse(isl.x, isl.y, isl.w*0.36, isl.h*0.36, 0,0,Math.PI*2); ctx.fill();
  /* 짙은 식생 */
  ctx.fillStyle = "#1a5218";
  ctx.beginPath(); ctx.ellipse(isl.x - isl.w*0.06, isl.y - isl.h*0.06, isl.w*0.22, isl.h*0.22, 0,0,Math.PI*2); ctx.fill();
  /* 산/언덕 (대형 섬) */
  if (isl.w > 120) {
    ctx.fillStyle = "#5a6840";
    ctx.beginPath(); ctx.ellipse(isl.x, isl.y - isl.h*0.10, isl.w*0.16, isl.h*0.21, 0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#8a9878";
    ctx.beginPath(); ctx.arc(isl.x, isl.y - isl.h*0.20, isl.w*0.075, 0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.60)"; /* 산 정상 눈 */
    ctx.beginPath(); ctx.arc(isl.x, isl.y - isl.h*0.22, isl.w*0.032, 0,Math.PI*2); ctx.fill();
  }
  /* 해안 거품 링 */
  ctx.strokeStyle = "rgba(210,245,255,0.55)"; ctx.lineWidth = 2.5; ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.ellipse(isl.x, isl.y, isl.w*0.54, isl.h*0.54, 0,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
}

function drawShipBg(ship) {
  ctx.save(); ctx.translate(ship.x, ship.y);
  /* 해수면 그림자 */
  ctx.fillStyle = "rgba(0,20,40,0.20)";
  ctx.beginPath(); ctx.ellipse(4, 5, ship.size*1.3, ship.size*0.38, ship.angle, 0,Math.PI*2); ctx.fill();
  ctx.rotate(ship.angle);
  /* 선체 */
  ctx.fillStyle = "#58687a";
  ctx.beginPath(); ctx.moveTo(-ship.size,-ship.size*0.28); ctx.lineTo(ship.size*1.3,0); ctx.lineTo(-ship.size,ship.size*0.28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#44586a";
  ctx.fillRect(-ship.size*0.6,-ship.size*0.18, ship.size*0.85,ship.size*0.36);
  /* 항적 */
  ctx.strokeStyle="rgba(200,238,255,0.28)"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(ship.size*1.2,0); ctx.lineTo(ship.size*3,ship.size*0.5); ctx.moveTo(ship.size*1.2,0); ctx.lineTo(ship.size*3,-ship.size*0.5); ctx.stroke();
  ctx.restore();
}

/* ── 진화 목표 렌더링 ── */
function drawEvoTargets() {
  if (!B.evoTargets || !B.evoTargets.length) return;
  const t = Date.now()*0.001;
  const evColors = ["#ffd76a","#ff9a40","#ff5540","#ff40ff"];
  const evNames  = ["EVO 1","EVO MAX","EVO ULTIMATE","EVO∞"];
  for (const et of B.evoTargets) {
    const evo = B.evolutionLv||0;
    const col = evColors[Math.min(evo, evColors.length-1)];
    const pulse = 1 + Math.sin(et._pulse||t)*0.12;
    const r = et.r * pulse;

    /* 외곽 글로우 */
    const grd = ctx.createRadialGradient(et.x,et.y,0,et.x,et.y,r*2.2);
    grd.addColorStop(0,  `rgba(255,220,80,0.70)`);
    grd.addColorStop(0.4,`rgba(255,140,30,0.45)`);
    grd.addColorStop(1,  `rgba(255,80,10,0.00)`);
    ctx.fillStyle=grd;
    ctx.beginPath(); ctx.arc(et.x,et.y,r*2.2,0,Math.PI*2); ctx.fill();

    /* 바디 원 */
    ctx.fillStyle="rgba(30,14,0,0.85)";
    ctx.beginPath(); ctx.arc(et.x,et.y,r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=col; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(et.x,et.y,r,0,Math.PI*2); ctx.stroke();

    /* HP 링 */
    const frac=Math.max(0,et.hp/et.maxHp);
    ctx.strokeStyle="#333"; ctx.lineWidth=6;
    ctx.beginPath(); ctx.arc(et.x,et.y,r-4,-Math.PI/2,-Math.PI/2+Math.PI*2,false); ctx.stroke();
    ctx.strokeStyle=col; ctx.lineWidth=5;
    ctx.beginPath(); ctx.arc(et.x,et.y,r-4,-Math.PI/2,-Math.PI/2+Math.PI*2*frac,false); ctx.stroke();

    /* 숫자 (HP) */
    ctx.textAlign="center"; ctx.lineJoin="round";
    const numStr=Math.ceil(et.hp).toString();
    ctx.font=`900 ${numStr.length>3?22:26}px sans-serif`;
    ctx.strokeStyle="rgba(0,0,0,0.90)"; ctx.lineWidth=6;
    ctx.strokeText(numStr,et.x,et.y+9);
    ctx.fillStyle="#ffffff"; ctx.fillText(numStr,et.x,et.y+9);

    /* "진화 목표" 라벨 */
    ctx.font="700 12px sans-serif";
    ctx.strokeStyle="rgba(0,0,0,0.80)"; ctx.lineWidth=4;
    ctx.strokeText("★진화 목표★",et.x,et.y-r-10);
    ctx.fillStyle=col; ctx.fillText("★진화 목표★",et.x,et.y-r-10);

    /* 다음 EVO 이름 */
    const nextName=evNames[Math.min(evo, evNames.length-1)];
    ctx.font="600 10px sans-serif";
    ctx.strokeStyle="rgba(0,0,0,0.70)"; ctx.lineWidth=3;
    ctx.strokeText(nextName, et.x, et.y+r+14);
    ctx.fillStyle="#ffe084"; ctx.fillText(nextName, et.x, et.y+r+14);
  }
}

function drawBG() {
  ctx.clearRect(0, 0, W, H);

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  if (B.weather === "storm") {
    sky.addColorStop(0, "#0a0618");
    sky.addColorStop(0.45, "#12082a");
    sky.addColorStop(1, "#1a0a32");
  } else if (B.stage?.enemyTier >= 5) {
    sky.addColorStop(0, "#08051c");
    sky.addColorStop(0.4, "#140828");
    sky.addColorStop(1, "#1e0538");
  } else {
    sky.addColorStop(0, "#050a20");
    sky.addColorStop(0.35, "#0c1535");
    sky.addColorStop(1, "#180840");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const t = performance.now() * 0.0004;
  ctx.strokeStyle = "rgba(0, 245, 255, 0.07)";
  ctx.lineWidth = 1;
  const gridY = 48 + (_bgScroll % 48);
  for (let y = gridY; y < H; y += 48) {
    const pers = 0.3 + (y / H) * 0.7;
    ctx.globalAlpha = 0.04 + pers * 0.1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y + Math.sin(y * 0.01 + t) * 6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let gx = 0; gx < W; gx += 72) {
    ctx.strokeStyle = "rgba(255, 0, 170, 0.04)";
    ctx.beginPath();
    ctx.moveTo(gx + Math.sin(t + gx * 0.02) * 8, 0);
    ctx.lineTo(gx * 0.9 + W * 0.05, H);
    ctx.stroke();
  }

  const horizon = H * 0.42;
  const hg = ctx.createLinearGradient(0, horizon - 40, 0, H);
  hg.addColorStop(0, "rgba(0, 255, 200, 0.05)");
  hg.addColorStop(0.5, "rgba(80, 0, 120, 0.12)");
  hg.addColorStop(1, "rgba(255, 0, 120, 0.08)");
  ctx.fillStyle = hg;
  ctx.fillRect(0, horizon - 40, W, H - horizon + 40);

  const waveRows = 18;
  const scrollOff = _bgScroll % 72;
  for (let row = -1; row < waveRows + 1; row++) {
    const tt = row / waveRows;
    const perspT = tt * tt;
    const yy = horizon + perspT * (H - horizon) + scrollOff * perspT * 0.4;
    if (yy < horizon - 20 || yy > H) continue;
    const depthAlpha = 0.03 + perspT * 0.16;
    const waveW = 10 + perspT * 48;
    const waveH = 2 + perspT * 7;
    const cols = Math.ceil(W / (waveW * 3.4)) + 2;
    for (let ci = 0; ci < cols; ci++) {
      const xx = ci * waveW * 3.4 + ((row % 2) * waveW * 1.7);
      const hue = (200 + perspT * 80 + ci * 3) % 360;
      ctx.fillStyle = `hsla(${hue},90%,55%,${depthAlpha})`;
      ctx.beginPath();
      ctx.ellipse(xx, yy, waveW, waveH, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const isl of _bgIslands) drawIsland(isl);
  for (const ship of _bgShips) drawShipBg(ship);

  for (const cl of _bgClouds) {
    ctx.fillStyle = "rgba(120, 60, 255, 0.06)";
    ctx.beginPath();
    ctx.ellipse(cl.x + 8, cl.y + 12, cl.w * 0.50, cl.h * 0.50, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cl of _bgClouds) {
    ctx.fillStyle = "rgba(200, 220, 255, 0.08)";
    ctx.beginPath();
    ctx.ellipse(cl.x, cl.y, cl.w * 0.50, cl.h * 0.50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0, 255, 255, 0.04)";
    ctx.beginPath();
    ctx.ellipse(cl.x - cl.w * 0.14, cl.y - cl.h * 0.1, cl.w * 0.28, cl.h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (B.weather === "magnetic") {
    ctx.strokeStyle = "rgba(200, 100, 255, 0.14)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const base = (i * H / 8 + _bgScroll * 0.7) % H;
      ctx.beginPath();
      ctx.moveTo(0, base);
      ctx.lineTo(W, (base + 120 + Math.sin(i) * 40) % H);
      ctx.stroke();
    }
  }
  if (B.weather === "storm" && Math.random() < 0.012) {
    const lx = rand(W * 0.1, W * 0.9);
    ctx.strokeStyle = "rgba(0, 255, 255, 0.55)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#00ffff";
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    for (let seg = 0; seg < 8; seg++) ctx.lineTo(lx + rand(-22, 22), seg * H / 7);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/* drawJet은 drawAllyJet / drawEnemyJet 으로 대체됨 */

function drawBoss(e) {
  /* ─── 대형 4발 폭격기 (이미지 5-6 스타일) ─── */
  ctx.save();
  ctx.translate(e.x, e.y);

  /* 그림자 */
  ctx.fillStyle="rgba(0,0,0,0.32)";
  ctx.beginPath(); ctx.ellipse(0,e.h*0.44, e.w*0.56,e.h*0.07, 0,0,Math.PI*2); ctx.fill();

  /* 주날개 */
  const wingG=ctx.createLinearGradient(0,-e.h*0.18,0,e.h*0.20);
  wingG.addColorStop(0,"#3d6030"); wingG.addColorStop(0.5,"#2a4a20"); wingG.addColorStop(1,"#162a10");
  ctx.fillStyle=wingG;
  ctx.beginPath();
  ctx.moveTo(-e.w*0.50,-e.h*0.20); ctx.lineTo( e.w*0.50,-e.h*0.20);
  ctx.lineTo( e.w*0.46, e.h*0.16); ctx.lineTo(-e.w*0.46, e.h*0.16);
  ctx.closePath(); ctx.fill();
  /* 날개끝 클로 */
  for (const sx of [-1,1]) {
    ctx.fillStyle="#192e12";
    ctx.beginPath();
    ctx.moveTo(sx*e.w*0.44,-e.h*0.22); ctx.lineTo(sx*e.w*0.50,-e.h*0.06);
    ctx.lineTo(sx*e.w*0.44, e.h*0.13); ctx.lineTo(sx*e.w*0.36, e.h*0.15);
    ctx.closePath(); ctx.fill();
    /* 날개끝 포탑 */
    ctx.fillStyle="#0c1c0a";
    ctx.beginPath(); ctx.arc(sx*e.w*0.44,-e.h*0.06, e.w*0.055, 0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="#3a6828"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(sx*e.w*0.44,-e.h*0.06, e.w*0.055, 0,Math.PI*2); ctx.stroke();
  }

  /* 4발 엔진 */
  const exs=[-0.33,-0.14,0.14,0.33];
  const ey0=-e.h*0.24;
  for (const ex of exs) {
    const ex2=ex*e.w*2;
    ctx.fillStyle="#1a2a14";
    ctx.beginPath(); ctx.ellipse(ex2,ey0, e.w*0.09,e.w*0.10, 0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="#487028"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.ellipse(ex2,ey0, e.w*0.09,e.w*0.10, 0,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle="#060d04";
    ctx.beginPath(); ctx.ellipse(ex2,ey0, e.w*0.055,e.w*0.065, 0,0,Math.PI*2); ctx.fill();
  }
  /* 프로펠러 */
  const pa=-performance.now()*0.022;
  for (let i=0;i<4;i++) {
    const ex2=exs[i]*e.w*2;
    ctx.save(); ctx.translate(ex2,ey0-e.w*0.095); ctx.rotate(pa*(i%2===0?1:-1));
    ctx.fillStyle="rgba(20,40,14,0.90)";
    for (let j=0;j<3;j++) {
      ctx.save(); ctx.rotate(j*Math.PI*2/3);
      ctx.beginPath(); ctx.ellipse(0,-e.w*0.138, e.w*0.036,e.w*0.112, 0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* 중앙 동체 */
  const bodyG=ctx.createLinearGradient(-e.w*0.14,-e.h*0.52, e.w*0.12,e.h*0.44);
  bodyG.addColorStop(0,"#567e3c"); bodyG.addColorStop(0.4,"#3a5a28"); bodyG.addColorStop(1,"#0e1e0a");
  ctx.fillStyle=bodyG;
  ctx.beginPath();
  ctx.moveTo(-e.w*0.15,-e.h*0.52); ctx.lineTo(e.w*0.15,-e.h*0.52);
  ctx.lineTo( e.w*0.18, e.h*0.45); ctx.lineTo(-e.w*0.18,e.h*0.45);
  ctx.closePath(); ctx.fill();
  /* 리벳 패널 */
  ctx.strokeStyle="rgba(0,0,0,0.42)"; ctx.lineWidth=1;
  for (let i=-2;i<=2;i++) { ctx.beginPath(); ctx.moveTo(i*e.w*0.04,-e.h*0.48); ctx.lineTo(i*e.w*0.04,e.h*0.42); ctx.stroke(); }
  ctx.fillStyle="rgba(120,200,80,0.18)";
  ctx.beginPath(); ctx.ellipse(-e.w*0.04,-e.h*0.10, e.w*0.06,e.h*0.28, -0.2,0,Math.PI*2); ctx.fill();

  /* 포탑 3개 */
  const turrets=[{x:0,y:-e.h*0.28,r:e.w*0.055},{x:-e.w*0.14,y:e.h*0.05,r:e.w*0.040},{x:e.w*0.14,y:e.h*0.05,r:e.w*0.040}];
  for (const t of turrets) {
    ctx.fillStyle="#0a140a"; ctx.beginPath(); ctx.arc(t.x,t.y,t.r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#3a6028"; ctx.beginPath(); ctx.arc(t.x,t.y,t.r*0.6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#0a0e08"; ctx.fillRect(t.x-t.r*0.18,t.y-t.r*1.5,t.r*0.36,t.r);
  }

  /* 코어 에너지 오브 */
  const ct2=performance.now()*0.003;
  const cg=ctx.createRadialGradient(0,e.h*0.10,0, 0,e.h*0.10,e.w*0.12);
  cg.addColorStop(0,"rgba(255,240,180,0.98)"); cg.addColorStop(0.4,"rgba(255,120,30,0.80)"); cg.addColorStop(1,"rgba(180,60,10,0)");
  ctx.fillStyle=cg;
  ctx.beginPath(); ctx.arc(0,e.h*0.10, e.w*0.10*(0.88+Math.sin(ct2)*0.14), 0,Math.PI*2); ctx.fill();

  /* 꼬리 날개 */
  ctx.fillStyle="#223618";
  ctx.beginPath(); ctx.moveTo(-e.w*0.16,e.h*0.37); ctx.lineTo(-e.w*0.40,e.h*0.52); ctx.lineTo(-e.w*0.18,e.h*0.50); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo( e.w*0.16,e.h*0.37); ctx.lineTo( e.w*0.40,e.h*0.52); ctx.lineTo( e.w*0.18,e.h*0.50); ctx.closePath(); ctx.fill();

  /* 4발 배기 불꽃 */
  const ft=performance.now()*0.005;
  for (let i=0;i<4;i++) {
    const ex2=exs[i]*e.w*2;
    const fl=0.82+Math.sin(ft*3+i)*0.20;
    const fg=ctx.createLinearGradient(ex2,e.h*0.24, ex2,e.h*0.68);
    fg.addColorStop(0,"rgba(255,220,100,0.92)"); fg.addColorStop(0.4,"rgba(255,110,30,0.75)"); fg.addColorStop(1,"rgba(255,40,10,0)");
    ctx.fillStyle=fg;
    ctx.beginPath(); ctx.ellipse(ex2,e.h*0.38, e.w*0.054*fl,e.h*0.17*fl, 0,0,Math.PI*2); ctx.fill();
  }

  ctx.restore();

  /* HP 바 */
  const pct=Math.max(0,e.hp/e.maxHp);
  const bx=W/2-200, by=14, bw=400, bh=13;
  ctx.fillStyle="rgba(8,10,18,0.82)"; ctx.fillRect(bx-3,by-3,bw+6,bh+6);
  ctx.fillStyle="#0a1008"; ctx.fillRect(bx,by,bw,bh);
  const barG=ctx.createLinearGradient(bx,0,bx+bw*pct,0);
  barG.addColorStop(0,pct>0.5?"#50e040":(pct>0.25?"#ffaa00":"#ff3030"));
  barG.addColorStop(1,pct>0.5?"#30b020":(pct>0.25?"#cc7700":"#cc1010"));
  ctx.fillStyle=barG; ctx.fillRect(bx,by,bw*pct,bh);
  ctx.strokeStyle="rgba(80,180,60,0.50)"; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);
  ctx.fillStyle="#fff"; ctx.font="700 13px sans-serif"; ctx.textAlign="center";
  ctx.fillText(`⚠ ${e.name}  HP ${Math.max(0,Math.ceil(e.hp))} / ${e.maxHp} ⚠`, W/2, 44);

  /* 레이저 경고 / 발사 */
  if (e.laserState==="charging") {
    const alpha=0.22+0.78*(1-e.laserFrames/60);
    ctx.strokeStyle=`rgba(255,50,50,${alpha})`; ctx.lineWidth=4; ctx.setLineDash([14,8]);
    ctx.beginPath(); ctx.moveTo(e.laserX,e.y+52); ctx.lineTo(e.laserX,H); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle=`rgba(255,60,60,${alpha*0.14})`; ctx.fillRect(e.laserX-22,e.y+52,44,H-e.y-52);
    ctx.strokeStyle=`rgba(255,100,100,${alpha})`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(e.laserX,e.y+52, 18*(2-alpha), 0,Math.PI*2); ctx.stroke();
  }
  if (e.laserState==="firing") {
    const lg=ctx.createLinearGradient(e.laserX,e.y,e.laserX,H);
    lg.addColorStop(0,"rgba(255,80,80,1.0)"); lg.addColorStop(1,"rgba(255,50,50,0.0)");
    ctx.fillStyle=lg; ctx.fillRect(e.laserX-14,e.y+52,28,H-e.y-52);
    ctx.fillStyle="rgba(255,245,245,0.95)"; ctx.fillRect(e.laserX-3,e.y+52,6,H-e.y-52);
    const pf=ctx.createRadialGradient(e.laserX,H,0,e.laserX,H,44);
    pf.addColorStop(0,"rgba(255,200,200,0.90)"); pf.addColorStop(1,"rgba(255,50,50,0)");
    ctx.fillStyle=pf; ctx.beginPath(); ctx.arc(e.laserX,H,44,0,Math.PI*2); ctx.fill();
  }
}

function drawAllyBulletShape(ctx, b, fever, lowFx) {
  const cheap = !!lowFx;
  const x = b.x, y = b.y, hw = b.w / 2, hh = b.h / 2;
  if (b.render === "laser") {
    const g = ctx.createLinearGradient(x - b.w / 2, y, x + b.w / 2, y + b.h);
    g.addColorStop(0, "rgba(0, 255, 255, 0.15)");
    g.addColorStop(0.4, "#a0ffff");
    g.addColorStop(0.55, "#00f5ff");
    g.addColorStop(1, "rgba(120, 0, 255, 0.2)");
    ctx.fillStyle = g;
    if (!cheap) {
      ctx.shadowBlur = 24;
      ctx.shadowColor = "#00ffff";
    }
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillRect(b.x - 3, b.y - b.h / 2, 6, b.h);
    return;
  }
  if (b.render === "carpetLaser") {
    const top = b.y - b.h / 2, left = b.x - b.w / 2;
    const g = ctx.createLinearGradient(left, top, left + b.w, top + b.h);
    g.addColorStop(0, "rgba(255, 240, 100, 0.95)");
    g.addColorStop(0.25, "#ff6600");
    g.addColorStop(0.55, "#ff0044");
    g.addColorStop(1, "rgba(180, 0, 255, 0.35)");
    ctx.fillStyle = g;
    if (!cheap) {
      ctx.shadowBlur = 35;
      ctx.shadowColor = "#ff0088";
    }
    ctx.fillRect(left, top, b.w, b.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(b.x - 3, top, 6, b.h);
    return;
  }
  const core = b.color || "#8af4ff";
  let g;
  if (fever) {
    g = ctx.createLinearGradient(x, y - hh - 4, x, y + hh + 2);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.3, "#00ffe0");
    g.addColorStop(0.65, "#ff00aa");
    g.addColorStop(1, "#1a0040");
  } else if (b.render === "skill") {
    g = ctx.createLinearGradient(x, y - hh - 2, x + (b.vx || 0) * 2, y + hh);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, core);
    g.addColorStop(0.75, "#ff00cc");
    g.addColorStop(1, "rgba(20, 0, 40, 0.5)");
  } else {
    g = ctx.createLinearGradient(x, y - hh - 3, x, y + hh + 3);
    g.addColorStop(0, "#f0ffff");
    g.addColorStop(0.2, core);
    g.addColorStop(0.75, "#0088ff");
    g.addColorStop(1, "rgba(60, 0, 80, 0.5)");
  }
  ctx.fillStyle = g;
  if (!cheap) {
    ctx.shadowBlur = fever || b.render === "skill" ? 14 : 8;
    ctx.shadowColor = core;
  }
  ctx.beginPath();
  ctx.moveTo(x, y - hh - 2);
  ctx.lineTo(x + hw + 1.5, y + 0.5);
  ctx.lineTo(x, y + hh + 1.5);
  ctx.lineTo(x - hw - 1.5, y + 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = fever ? "rgba(255,255,255,0.5)" : "rgba(0,255,255,0.35)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawEnemyBulletShape(ctx, b, lowFx) {
  const cheap = !!lowFx;
  const x = b.x, y = b.y, hw = b.w / 2, hh = b.h / 2;
  const c = b.color || "#ff3366";
  const g = ctx.createLinearGradient(x, y - hh - 1, x, y + hh + 1);
  g.addColorStop(0, "#fff5ff");
  g.addColorStop(0.35, "#ff00aa");
  g.addColorStop(0.72, c);
  g.addColorStop(1, "rgba(40, 0, 30, 0.85)");
  ctx.fillStyle = g;
  if (!cheap) {
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#ff0066";
  }
  ctx.beginPath();
  ctx.moveTo(x, y - hh);
  ctx.lineTo(x + hw * 0.95, y);
  ctx.lineTo(x, y + hh);
  ctx.lineTo(x - hw * 0.95, y);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,180,220,0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawGoldLuckyTransport(t) {
  const x = t.x, y = t.y, w = t.w, h = t.h;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.01);
  ctx.save();
  ctx.shadowBlur = 32 * pulse;
  ctx.shadowColor = "#ffe08a";
  const hull = ctx.createLinearGradient(x - w, y - h, x + w, y + h);
  hull.addColorStop(0, "#4a3200");
  hull.addColorStop(0.35, "#ffd54f");
  hull.addColorStop(0.6, "#fffde7");
  hull.addColorStop(1, "#c6a000");
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.52, y);
  ctx.lineTo(x + w * 0.2, y - h * 0.42);
  ctx.lineTo(x + w * 0.55, y - h * 0.08);
  ctx.lineTo(x + w * 0.55, y + h * 0.08);
  ctx.lineTo(x + w * 0.2, y + h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#00fff2";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.shadowBlur = 14;
  ctx.shadowColor = "#ff00cc";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(x - w * 0.08, y - h * 0.52, w * 0.22, h * 0.28);
  ctx.shadowBlur = 0;
  const bw = w * 0.92, bh = 6, bx = x - bw / 2, by = y + h * 0.52;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(bx, by, bw, bh);
  const hpw = Math.max(0, t.hp / t.maxHp);
  const hpG = ctx.createLinearGradient(bx, 0, bx + bw * hpw, 0);
  hpG.addColorStop(0, "#00ffcc");
  hpG.addColorStop(1, "#ffff00");
  ctx.fillStyle = hpG;
  ctx.fillRect(bx, by, bw * hpw, bh);
  ctx.font = "700 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineWidth = 3;
  ctx.strokeText("LUCKY", x, y - h * 0.62);
  ctx.fillText("LUCKY", x, y - h * 0.62);
  ctx.restore();
}

function draw() {
  ctx.save();
  /* 화면 흔들림 */
  if (_shake.frames > 0) {
    ctx.translate((Math.random()-0.5)*_shake.intensity*1.5, (Math.random()-0.5)*_shake.intensity*1.5);
    _shake.frames--;
    if (_shake.frames<=0) _shake.intensity=0;
  }

  /* ── 배경 ── */
  drawBG();

  const _drawLowFx = B.bullets.length > 130 || B.enemyBullets.length > 95 || B.particles.length > 70;
  /* ── 아군 총알 (그라디언트· 형광 단색 대체) ── */
  for (const b of B.bullets) drawAllyBulletShape(ctx, b, _fever.active, _drawLowFx);

  /* ── 아군 전투기 ─────────────────────────────────
     성능 최적화:
     · 비리더는 drawAllyJetFast (경량 버전)
     · 최대 MAX_VISUAL_ALLIES까지만 그림 (실제 인원은 무제한, 데미지 스케일로 보정)
     · 글로우는 리더(0번)에만 적용
     ─────────────────────────────────────────────── */
  const _allyDraw = B._allies || [];
  const _sq = B.squad || 0;
  const _evoScale = _sq >= 55 ? 1.26 : _sq >= 30 ? 1.16 : _sq >= 10 ? 1.06 : 1.0;
  const _drawLimit = Math.min(_allyDraw.length, MAX_VISUAL_ALLIES);

  for (let i = 0; i < _drawLimit; i++) {
    const a = _allyDraw[i];
    const sz = 28 * _evoScale;
    const type = a.meta?.type || "interceptor";
    if (i === 0) {
      ctx.save();
      ctx.shadowBlur = _sq >= 40 ? 22 : _sq >= 15 ? 14 : 10;
      ctx.shadowColor = type === "bomber" ? "#ff00aa" : type === "gunship" ? "#a855f7" : "#00f5ff";
      drawAllyJet(a.x, a.y, sz, sz * 1.36, type, true);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      drawAllySprite(a.x, a.y, type, sz);
    }
  }

  /* 황금 수송기 (럭키 드롭) */
  for (const lt of B.luckyTransports) drawGoldLuckyTransport(lt);
  for (const e of B.enemies) {
    let yaw = 0;
    if (e.kind === "rammer" && e.charging) {
      yaw = Math.atan2(e.vx, e.vy) * 0.55;
      yaw = Math.max(-0.88, Math.min(0.88, yaw));
    } else if (e.inHold && typeof e.aimAngle === "number") {
      yaw = e.aimAngle;
    }
    drawEnemyJet(e.x, e.y, e.w, e.h, e.kind, yaw);
  }

  /* ── 보스 ── */
  if (B.boss) {
    const e = B.boss;
    /* 거대 폭격함 몸체 */
    ctx.save();
    const bx = e.x, by = e.y;
    /* 날개 */
    ctx.fillStyle = "#0d1a2e";
    ctx.beginPath();
    ctx.moveTo(bx-90, by-30); ctx.lineTo(bx+90, by-30);
    ctx.lineTo(bx+110, by+20); ctx.lineTo(bx-110, by+20);
    ctx.closePath(); ctx.fill();
    /* 동체 */
    const hullG = ctx.createLinearGradient(bx-35,by-40,bx+35,by+40);
    hullG.addColorStop(0,"#1a2a40"); hullG.addColorStop(1,"#0a1020");
    ctx.fillStyle = hullG;
    ctx.fillRect(bx-35, by-50, 70, 90);
    /* 엔진 글로우 */
    ctx.fillStyle = "#ff4400";
    ctx.shadowColor="#ff4400"; ctx.shadowBlur=18;
    [-30,0,30].forEach(dx=>{
      ctx.beginPath(); ctx.arc(bx+dx, by-55, 9, 0, Math.PI*2); ctx.fill();
    });
    ctx.shadowBlur = 0;
    /* 포탑 */
    ctx.fillStyle = "#ff3300";
    [[-50,by+5],[50,by+5],[-30,by+20],[30,by+20]].forEach(([dx,dy])=>{
      ctx.beginPath(); ctx.arc(bx+dx, dy, 7, 0, Math.PI*2); ctx.fill();
    });
    ctx.restore();
  }

  /* ── 적 총알 ── */
  for (const b of B.enemyBullets) drawEnemyBulletShape(ctx, b, _drawLowFx);

  /* ── 게이트 ── */
  for (const g of B.gates) {
    const isNeg=(g.op==="-"||g.op==="÷");
    const col=isNeg?"#ff5a6e":g.op==="+"?"#4eb4ff":"#a67bff";
    ctx.fillStyle=isNeg?"rgba(255,90,110,0.32)":(g.op==="+"?"rgba(78,180,255,0.28)":"rgba(166,123,255,0.32)");
    ctx.strokeStyle=col; ctx.lineWidth=3;
    ctx.fillRect(g.x-g.w/2,g.y-g.h/2,g.w,g.h);
    ctx.strokeRect(g.x-g.w/2,g.y-g.h/2,g.w,g.h);
    let v;
    if (g.op === "+" || g.op === "-" || g.op === "÷") v = Math.floor(g.value);
    else v = (g.value >= 10 ? g.value.toFixed(1) : g.value.toFixed(2));
    const opDisp = g.op==="x" ? "×" : g.op;
    const label=`${opDisp}${v}`;
    const fontSize=label.length>6?18:24;
    ctx.font=`900 ${fontSize}px sans-serif`; ctx.textAlign="center"; ctx.lineJoin="round";
    ctx.strokeStyle="rgba(0,0,0,0.88)"; ctx.lineWidth=5;
    ctx.strokeText(label,g.x,g.y+8); ctx.fillStyle="#ffffff"; ctx.fillText(label,g.x,g.y+8);
    ctx.font="600 11px sans-serif"; ctx.strokeStyle="rgba(0,0,0,0.70)"; ctx.lineWidth=3;
    const lateNeg = _gateLatePenaltyActive() && isNeg;
    const sub = isNeg
      ? (g.op === "-" ? (lateNeg ? "즉시 -50%" : "감소") : (lateNeg ? "즉시 -50%" : "절반"))
      : (g.op === "+" ? "증가" : "곱하기");
    ctx.strokeText(sub,g.x,g.y+g.h/2-6); ctx.fillStyle=col; ctx.fillText(sub,g.x,g.y+g.h/2-6);
  }

  /* ── 진화 타겟 ── */
  drawEvoTargets();

  /* ── 아군 수 뱃지 (대편대일 때만 — 소수 편대에 ×만 노출되지 않게) ── */
  if (B.squad > MAX_VISUAL_ALLIES) {
    ctx.save();
    const badge = `×${formatResDisplay(B.squad)} (표시 ${MAX_VISUAL_ALLIES})`;
    ctx.font="700 13px sans-serif"; ctx.textAlign="center"; ctx.lineJoin="round";
    ctx.strokeStyle="rgba(0,0,0,0.85)"; ctx.lineWidth=4;
    ctx.strokeText(badge,B.player.x,B.player.y+75);
    ctx.fillStyle="#ffd76a"; ctx.fillText(badge,B.player.x,B.player.y+75);
    ctx.restore();
  }

  /* ── 적 HP 바 + 카운트다운 (2D 오버레이) ── */
  for (const e of B.enemies) {
    if (e.kind==="rammer") {
      ctx.save(); ctx.textAlign="center"; ctx.lineJoin="round";
      if (!e.charging) {
        const secs=Math.ceil(e.chargeTimer/60);
        const pulse=0.88+Math.sin(performance.now()*0.012)*0.14;
        ctx.font=`900 ${Math.round(24*pulse)}px sans-serif`;
        ctx.strokeStyle="rgba(0,0,0,0.90)"; ctx.lineWidth=5;
        ctx.strokeText(`⚠ ${secs}`,e.x,e.y-e.h/2-20);
        ctx.fillStyle=secs<=1?"#ff2020":secs<=2?"#ff7700":"#ffdd00";
        ctx.fillText(`⚠ ${secs}`,e.x,e.y-e.h/2-20);
      } else {
        ctx.font=`900 ${Math.round(20+Math.sin(performance.now()*0.016)*3)}px sans-serif`;
        ctx.strokeStyle="rgba(0,0,0,0.90)"; ctx.lineWidth=4;
        ctx.strokeText("⚡ 돌격!",e.x,e.y-e.h/2-18);
        ctx.fillStyle="#ff3300"; ctx.fillText("⚡ 돌격!",e.x,e.y-e.h/2-18);
      }
      ctx.restore();
      const hw=52;
      ctx.fillStyle="rgba(0,0,0,0.65)"; ctx.fillRect(e.x-hw/2,e.y-e.h/2-12,hw,6);
      ctx.fillStyle="#ff3030"; ctx.fillRect(e.x-hw/2,e.y-e.h/2-12,hw*(e.hp/e.maxHp),6);
    } else {
      ctx.fillStyle="rgba(0,0,0,0.60)"; ctx.fillRect(e.x-16,e.y-e.h/2-9,32,4);
      const ehpCol=e.hp/e.maxHp>0.5?"#44cc30":(e.hp/e.maxHp>0.25?"#ffaa00":"#ff3030");
      ctx.fillStyle=ehpCol; ctx.fillRect(e.x-16,e.y-e.h/2-9,32*(e.hp/e.maxHp),4);
    }
  }

  /* ── 보스 HP 바 + 레이저 오버레이 (2D) ── */
  if (B.boss) {
    const e=B.boss;
    const pct=Math.max(0,e.hp/e.maxHp);
    const bx=W/2-200,by=14,bw=400,bh=13;
    ctx.fillStyle="rgba(8,10,18,0.82)"; ctx.fillRect(bx-3,by-3,bw+6,bh+6);
    ctx.fillStyle="#220800"; ctx.fillRect(bx,by,bw,bh);
    const barG=ctx.createLinearGradient(bx,0,bx+bw*pct,0);
    barG.addColorStop(0,"#ff3300"); barG.addColorStop(0.5,"#ff7700"); barG.addColorStop(1,"#ffcc00");
    ctx.fillStyle=barG; ctx.fillRect(bx,by,bw*pct,bh);
    ctx.strokeStyle="#cc3300"; ctx.lineWidth=1.5; ctx.strokeRect(bx,by,bw,bh);
    ctx.textAlign="center"; ctx.font="600 10px sans-serif";
    ctx.fillStyle="#ffddbb"; ctx.fillText(`${e.name}  HP ${Math.ceil(e.hp)}/${e.maxHp}`,W/2,by+bh+12);
    if (e.laserState==="charging") {
      ctx.save(); ctx.strokeStyle=`rgba(255,80,0,${0.3+(1-e.laserFrames/60)*0.5})`; ctx.lineWidth=3;
      ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(e.laserX,e.y+e.h/2); ctx.lineTo(e.laserX,H); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
    if (e.laserState==="firing") {
      const lg=ctx.createLinearGradient(e.laserX,e.y,e.laserX,H);
      lg.addColorStop(0,"rgba(255,120,0,0.95)"); lg.addColorStop(1,"rgba(255,60,0,0)");
      ctx.fillStyle=lg; ctx.fillRect(e.laserX-22,e.y,44,H-e.y);
      const pf=ctx.createRadialGradient(e.laserX,H,0,e.laserX,H,44);
      pf.addColorStop(0,"rgba(255,200,200,0.90)"); pf.addColorStop(1,"rgba(255,50,50,0)");
      ctx.fillStyle=pf; ctx.beginPath(); ctx.arc(e.laserX,H,44,0,Math.PI*2); ctx.fill();
    }
  }

  /* ── 파워업 (2D: 텍스트 레이블) ── */
  const _puStyle = {
    weapon:["#ffd76a","W"], shield:["#8af4ff","S"], bomb:["#ff6a8f","B"],
    gold:["#e8b050","G"], fuel:["#5eb8ff","U"], alloy:["#aeb8c8","A"],
    gem:["#9ee7ff","◆"], score:["#d8c8ff","+"]
  };
  for (const pu of B.powerups) {
    const st = _puStyle[pu.kind] || ["#b8ffcc","?"];
    ctx.fillStyle = st[0];
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, pu.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "900 13px sans-serif";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.80)";
    ctx.lineWidth = 3;
    ctx.strokeText(st[1], pu.x, pu.y + 4.5);
    ctx.fillStyle = "#001018";
    ctx.fillText(st[1], pu.x, pu.y + 4.5);
  }

  /* 파티클 (폭발 효과) — 네온 글로우 */
  ctx.save();
  const _pCap = MAX_PARTICLES_LIVE;
  if (B.particles.length > _pCap) B.particles.splice(0, B.particles.length - _pCap);
  const _pBlur = B.particles.length <= 55;
  for (const f of B.particles) {
    const maxL = f.maxLife || 40;
    const a = Math.max(0, f.life / maxL);
    const sz = (3.2 + a * 9) * (f.sizeMul || 1);
    ctx.globalAlpha = Math.min(1, a * 1.08);
    if (_pBlur) {
      if (f.neon) {
        ctx.shadowBlur = 18;
        ctx.shadowColor = f.color;
      } else {
        ctx.shadowBlur = 6;
        ctx.shadowColor = f.color;
      }
    }
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, sz * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* ── 데미지 팝업 ── */
  drawDmgTexts();

  /* ═══════════════════════════════════════════════════
     액션 주스 레이어 (스크린 좌표)
     ═══════════════════════════════════════════════════ */

  /* ①-b 각성 레이저 — 섬광 + 색 반전 펄스 */
  if (_awakeningJuice.flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, _awakeningJuice.flash / 20) * 0.92;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (_awakeningJuice.timer > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "difference";
    ctx.globalAlpha = 0.16 + 0.14 * Math.sin(performance.now() * 0.04);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* ①-c 럭키 룰렛 풀스크린 */
  if (B.luckyRoulette) {
    const R = B.luckyRoulette;
    ctx.save();
    const vg = ctx.createLinearGradient(0, 0, W, H);
    vg.addColorStop(0, "rgba(20,0,40,0.92)");
    vg.addColorStop(0.5, "rgba(0,20,50,0.88)");
    vg.addColorStop(1, "rgba(40,0,30,0.90)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.24;
    const labels = ["+50기", "무적10s", "G+1000"];
    const n = 3;
    for (let i = 0; i < n; i++) {
      const a0 = R.spin + (i / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = a0 + (Math.PI * 2) / n;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      const hue = (i * 120 + R.spin * 52) % 360;
      const wg = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      wg.addColorStop(0, `hsla(${hue},100%,70%,0.98)`);
      wg.addColorStop(1, `hsla(${(hue + 55) % 360},95%,42%,0.85)`);
      ctx.fillStyle = wg;
      ctx.fill();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((a0 + a1) / 2);
      ctx.textAlign = "center";
      ctx.font = "900 12px sans-serif";
      ctx.fillStyle = "#0a0214";
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.strokeText(labels[i], r * 0.58, 4);
      ctx.fillText(labels[i], r * 0.58, 4);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#0c0222";
    ctx.fill();
    ctx.strokeStyle = "#00fff2";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = "900 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#ff00aa";
    ctx.fillText("LUCKY SPIN", cx, cy + 5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ff3366";
    ctx.beginPath();
    ctx.moveTo(cx + r + 2, cy - 10);
    ctx.lineTo(cx + r + 40, cy);
    ctx.lineTo(cx + r + 2, cy + 10);
    ctx.fill();
    ctx.restore();
  }

  /* ① 불릿타임 — 청흑 반투명 오버레이 */
  if (_bulletTimeAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = _bulletTimeAlpha * 0.6;
    ctx.fillStyle = "#001838";
    ctx.fillRect(0,0,W,H);
    if (_bulletTimeAlpha > 0.3) {
      ctx.globalAlpha = (_bulletTimeAlpha - 0.3) * 0.6;
      ctx.font = "700 14px sans-serif"; ctx.textAlign="center"; ctx.lineJoin="round";
      ctx.strokeStyle="rgba(0,0,0,0.8)"; ctx.lineWidth=3;
      ctx.fillStyle="#00cfff";
      ctx.strokeText("BULLET TIME", W/2, H*0.12);
      ctx.fillText("BULLET TIME", W/2, H*0.12);
    }
    ctx.restore();
  }

  /* ② 피버 타임 스피드라인 */
  if (_fever.active) {
    ctx.save();
    const fp = _fever.timer / _fever.maxTimer;
    for (const l of _fever.lines) {
      ctx.globalAlpha = 0.30 * fp;
      ctx.strokeStyle = fp > 0.5 ? "#00ffee" : "#ff8800";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(l.x, l.y - l.len); ctx.lineTo(l.x, l.y); ctx.stroke();
    }
    /* 피버 가장자리 글로우 */
    ctx.globalAlpha = fp * 0.30;
    const edgeGrad = ctx.createLinearGradient(0,0,0,H);
    edgeGrad.addColorStop(0, "#00ffee88"); edgeGrad.addColorStop(0.5, "transparent"); edgeGrad.addColorStop(1, "#00ffee88");
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0,0, 12, H); ctx.fillRect(W-12,0, 12, H);
    ctx.globalAlpha = 1;
    /* FEVER TIME 텍스트 */
    ctx.globalAlpha = 0.90 * fp;
    ctx.font = "900 16px sans-serif"; ctx.textAlign = "right"; ctx.lineJoin = "round";
    ctx.strokeStyle="rgba(0,0,0,0.85)"; ctx.lineWidth=4;
    ctx.strokeText(`⚡ FEVER  ${Math.ceil(_fever.timer/60)}s`, W-10, 22);
    ctx.fillStyle="#00ffee"; ctx.fillText(`⚡ FEVER  ${Math.ceil(_fever.timer/60)}s`, W-10, 22);
    ctx.restore();
  }

  /* ③ 피버 탄환 — Three.js 총알 머티리얼 교체로 처리 (2D 덧그리기 불필요) */

  /* ④ 궁극기 궤도 포격 빔 (2D 오버레이, 3D 씬에 별도 빔 없음) */
  if (_ult.active && _ult.beams.length > 0) {
    ctx.save();
    for (const bm of _ult.beams) {
      const lp = bm.life / 40;
      ctx.globalAlpha = lp * 0.90;
      ctx.strokeStyle = "#fffde0"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(bm.x, -60); ctx.lineTo(bm.x, bm.y+60); ctx.stroke();
      ctx.strokeStyle = "#ffdd00"; ctx.lineWidth = 12;
      ctx.globalAlpha = lp * 0.22;
      ctx.beginPath(); ctx.moveTo(bm.x, -60); ctx.lineTo(bm.x, bm.y+60); ctx.stroke();
      ctx.globalAlpha = lp * 0.88;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(bm.x, bm.y, 7, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  /* ⑤ 궁극기 컷인 패널 (발동 초반 40프레임) */
  if (_ult.active && _ult.timer > 40) {
    ctx.save();
    const tp = Math.min(1, (_ult.timer - 40) / 40);
    const slideX = (1-tp) * W * 0.5;
    ctx.globalAlpha = tp;
    /* 배경 슬래시 패널 */
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.beginPath();
    ctx.moveTo(slideX + W*0.04, H*0.30); ctx.lineTo(slideX + W, H*0.30);
    ctx.lineTo(slideX + W - W*0.04, H*0.56); ctx.lineTo(slideX, H*0.56);
    ctx.closePath(); ctx.fill();
    /* 컬러 띠 */
    ctx.fillStyle = "#ffdd00";
    ctx.fillRect(slideX, H*0.296, W, 4);
    ctx.fillRect(slideX, H*0.564, W, 4);
    /* 조종사 실루엣 (픽셀 아트 스타일) */
    ctx.fillStyle = "#ffe066";
    ctx.font = "900 44px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("✈", slideX + W*0.24, H*0.50);
    /* 스킬명 텍스트 */
    ctx.font = "900 20px sans-serif"; ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(0,0,0,0.90)"; ctx.lineWidth = 5;
    ctx.strokeText("ORBITAL STRIKE", slideX + W*0.36, H*0.435);
    ctx.fillStyle = "#ffffff"; ctx.fillText("ORBITAL STRIKE", slideX + W*0.36, H*0.435);
    ctx.font = "700 13px sans-serif";
    ctx.strokeText("에어 컴뱃 궁극기", slideX + W*0.36, H*0.520);
    ctx.fillStyle = "#ffdd66"; ctx.fillText("에어 컴뱃 궁극기", slideX + W*0.36, H*0.520);
    ctx.restore();
  }

  /* ⑥ 킬스트릭 어나운서 */
  if (_streak.showTimer > 0) {
    ctx.save();
    const sp = _streak.showTimer / 130;
    const bounce = 1 + Math.sin(sp * Math.PI) * 0.18;
    ctx.globalAlpha = Math.min(1, sp * 4);
    ctx.translate(W/2, H * 0.43);
    ctx.scale(bounce, bounce);
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    const fsize = _streak.text.length > 10 ? 32 : 40;
    ctx.font = `900 ${fsize}px sans-serif`;
    if (_streak.color === null) {
      /* GODLIKE: 무지개 */
      const hue = (performance.now() * 0.35) % 360;
      ctx.fillStyle = `hsl(${hue},100%,65%)`;
    } else {
      ctx.fillStyle = _streak.color;
    }
    ctx.strokeStyle = "rgba(0,0,0,0.95)"; ctx.lineWidth = 7;
    ctx.strokeText(_streak.text, 0, 0); ctx.fillText(_streak.text, 0, 0);
    /* 킬 카운트 */
    ctx.globalAlpha *= 0.8; ctx.font = "700 14px sans-serif"; ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 3;
    ctx.strokeText(`${_streak.count} KILLS`, 0, 26); ctx.fillText(`${_streak.count} KILLS`, 0, 26);
    ctx.restore();
  }

  /* ⑦ 보스 화이트아웃 */
  if (_bossDeath.whiteout > 0) {
    ctx.save();
    ctx.globalAlpha = _bossDeath.whiteout;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    /* MISSION COMPLETE는 화이트아웃이 끝나갈 때 */
    if (_bossDeath.missionTimer > 0 && _bossDeath.whiteout < 0.6) {
      const mp = Math.min(1, (160 - _bossDeath.missionTimer) / 40);
      ctx.save();
      ctx.globalAlpha = mp;
      ctx.textAlign = "center"; ctx.lineJoin = "round";
      ctx.font = "900 32px sans-serif";
      ctx.strokeStyle = "rgba(0,0,0,0.90)"; ctx.lineWidth = 6;
      ctx.strokeText("✈  MISSION COMPLETE", W/2, H*0.42);
      ctx.fillStyle = "#ffe066"; ctx.fillText("✈  MISSION COMPLETE", W/2, H*0.42);
      ctx.restore();
    }
    /* 서서히 fade out */
    _bossDeath.whiteout = Math.max(0, _bossDeath.whiteout - 0.008);
  }

  /* ⑧ 피버 게이지 바 (화면 좌하단) */
  {
    const gw = 90, gh = 7, gx = 8, gy = H - 28;
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(gx-1, gy-1, gw+2, gh+2);
    const fp = _fever.active ? 1 : _fever.gauge / _fever.maxGauge;
    ctx.fillStyle = _fever.active ? "#00ffee" : "#4eb4ff";
    ctx.fillRect(gx, gy, gw * fp, gh);
    ctx.font = "600 9px sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = _fever.active ? "#00ffee" : "#7ad0ff";
    ctx.fillText(_fever.active ? "FEVER!" : "FEVER", gx, gy - 3);
  }

  /* 스테이지명 배너 (전투 시작 시 잠깐 표시) */
  if (B.waveTimer < 120 && B.wave===1 && !B.paused) {
    const alpha = Math.min(1, (120-B.waveTimer)/30);
    ctx.save();
    ctx.globalAlpha = alpha * 0.92;
    ctx.textAlign="center"; ctx.lineJoin="round";
    ctx.font="900 30px sans-serif";
    ctx.strokeStyle="rgba(0,0,0,0.90)"; ctx.lineWidth=7;
    ctx.strokeText(B.stage.id===99?"∞ 무한 모드":B.stage.name, W/2, H*0.35);
    ctx.fillStyle="#ffe066";
    ctx.fillText(B.stage.id===99?"∞ 무한 모드":B.stage.name, W/2, H*0.35);
    ctx.font="700 16px sans-serif";
    ctx.strokeStyle="rgba(0,0,0,0.80)"; ctx.lineWidth=5;
    const sub=`웨이브 ${B.maxWaves||"∞"} · ${B.stage.weather&&B.stage.weather!=="clear"?`날씨: ${B.stage.weather==="storm"?"뇌우":"자기폭풍"} ·`:""} Tier ${B.stage.enemyTier}`;
    ctx.strokeText(sub, W/2, H*0.35+30);
    ctx.fillStyle="#a8d8ff"; ctx.fillText(sub, W/2, H*0.35+30);
    ctx.restore();
  }

  /* 웨이브 번호 배너 */
  if (!B.stage.endless && B.wave>1 && B.waveTimer < 90) {
    const alpha = Math.min(1, (90-B.waveTimer)/25);
    ctx.save();
    ctx.globalAlpha = alpha * 0.88;
    ctx.textAlign="center"; ctx.lineJoin="round";
    ctx.font="900 24px sans-serif";
    ctx.strokeStyle="rgba(0,0,0,0.90)"; ctx.lineWidth=6;
    ctx.strokeText(`웨이브 ${B.wave} / ${B.maxWaves}`, W/2, 56);
    ctx.fillStyle="#4eb4ff";
    ctx.fillText(`웨이브 ${B.wave} / ${B.maxWaves}`, W/2, 56);
    ctx.restore();
  }

  /* 일시정지 */
  if (B.paused) {
    ctx.fillStyle="rgba(0,0,0,0.58)"; ctx.fillRect(0,0,W,H);
    ctx.textAlign="center"; ctx.lineJoin="round";
    ctx.font="900 42px sans-serif";
    ctx.strokeStyle="rgba(0,0,0,0.90)"; ctx.lineWidth=6;
    ctx.strokeText("일시정지 (P)",W/2,H/2);
    ctx.fillStyle="#ffffff"; ctx.fillText("일시정지 (P)",W/2,H/2);
    ctx.font="700 20px sans-serif";
    ctx.strokeStyle="rgba(0,0,0,0.80)"; ctx.lineWidth=4;
    ctx.strokeText("M키 또는 로비 버튼으로 복귀",W/2,H/2+44);
    ctx.fillStyle="#a8d8ff"; ctx.fillText("M키 또는 로비 버튼으로 복귀",W/2,H/2+44);
  }

  /* ── 화면 비네트 — 3D 씬을 가리지 않도록 매우 약하게 (외곽만 살짝) ── */
  const vig = ctx.createRadialGradient(W/2,H/2, H*0.55, W/2,H/2, H*0.95);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = vig;
  ctx.fillRect(0,0,W,H);

  ctx.restore(); // shake 복원
}

/* ============================================================
   §31  게임 루프 — 1rAF ≈ 1 update(물리 1틱), ~60Hz로 설계된 수치 유지
   (고정 시뮬 다중 스텝은 아·적·탄 상대속도를 어긋나게 하므로 쓰지 않음)
   ============================================================ */
let _lastFrameTime = 0;
let _spdWinStart = 0;
let _spdTickCount = 0;
function loop(ts) {
  if (document.hidden) { requestAnimationFrame(loop); return; }
  if (ts - _lastFrameTime < 14) { requestAnimationFrame(loop); return; }
  _lastFrameTime = ts;

  update();
  const onBattle = $("battlePage") && !$("battlePage").classList.contains("hidden");
  if (onBattle) { updateGameMeshes(); updateThreeBackground(); draw(); }
  requestAnimationFrame(loop);
}

/* ============================================================
   §32  타이틀 아트 애니메이션
   ============================================================ */
function drawTitleArt() {
  const el=$("titleArt"); if (!el) return;
  el.innerHTML="";
  const tc=document.createElement("canvas");
  tc.width=el.clientWidth; tc.height=el.clientHeight;
  tc.style.width="100%"; tc.style.height="100%";
  el.appendChild(tc);
  const tctx=tc.getContext("2d");
  let t=0;
  function tick() {
    if (!el.isConnected) return;
    const tp = $('titlePage');
    if (tp && tp.classList.contains('hidden')) return;
    t += 0.02;
    tctx.clearRect(0,0,tc.width,tc.height);
    const g=tctx.createLinearGradient(0,0,0,tc.height);
    g.addColorStop(0,"#0e1f3a"); g.addColorStop(1,"#050b19");
    tctx.fillStyle=g; tctx.fillRect(0,0,tc.width,tc.height);
    tctx.strokeStyle="rgba(78,180,255,0.25)"; tctx.lineWidth=1;
    for (let i=0;i<24;i++) {
      const y=((i*20+t*120)%tc.height);
      tctx.beginPath(); tctx.moveTo(0,y); tctx.lineTo(tc.width,y+10); tctx.stroke();
    }
    const jTypes=["interceptor","bomber","gunship","interceptor","bomber"];
    for (let i=0;i<5;i++) {
      const x=tc.width/2+Math.sin(t+i)*110+(i-2)*30;
      const y=tc.height/2+Math.cos(t*0.8+i)*30+i*6;
      tctx.save(); tctx.translate(x,y); tctx.scale(0.9,0.9);
      drawJetMini(tctx,jTypes[i]); tctx.restore();
    }
    tctx.fillStyle="rgba(255,200,87,0.9)"; tctx.font="800 22px sans-serif"; tctx.textAlign="center";
    tctx.fillText("Air Squadron · Dogfight · Fortress",tc.width/2,tc.height-18);
    requestAnimationFrame(tick);
  }
  tick();
}
function drawJetMini(c, type) {
  /* 타이틀 애니메이션용 소형 P-38 */
  const col=TYPES[type]?.color||"#4eb4ff";
  /* 날개 */
  c.fillStyle = col+"88";
  c.beginPath(); c.moveTo(-22,-2); c.lineTo(22,-2); c.lineTo(18,10); c.lineTo(-18,10); c.closePath(); c.fill();
  /* 붐 */
  c.fillStyle = col+"bb";
  c.fillRect(-14,-18,6,28); c.fillRect(8,-18,6,28);
  /* 포드 */
  c.fillStyle = "#d8eeff";
  c.beginPath(); c.ellipse(0,-4, 5,14, 0,0,Math.PI*2); c.fill();
  /* 조종석 */
  c.fillStyle = "#40c4ff";
  c.beginPath(); c.ellipse(0,-8, 3,5, 0,0,Math.PI*2); c.fill();
  /* 배기 불꽃 */
  c.fillStyle = "rgba(255,200,60,0.80)";
  c.beginPath(); c.ellipse(-11,14, 3,6, 0,0,Math.PI*2); c.fill();
  c.beginPath(); c.ellipse( 11,14, 3,6, 0,0,Math.PI*2); c.fill();
  /* 꼬리 */
  c.fillStyle = col+"99";
  c.beginPath(); c.moveTo(-14,8); c.lineTo(-20,18); c.lineTo(-13,16); c.closePath(); c.fill();
  c.beginPath(); c.moveTo( 14,8); c.lineTo( 20,18); c.lineTo( 13,16); c.closePath(); c.fill();
}

/* ============================================================
   §33  초기화
   ============================================================ */
/* ─── 모바일 좌우 조작 버튼 ─── */
function bindMobileCtrl(id, key) {
  const el = $(id); if (!el) return;
  const start = e => { e.preventDefault(); ensureAudio(); B.keys[key] = true; };
  const end   = e => { e.preventDefault(); B.keys[key] = false; };
  /* Pointer Events만 사용 — touch+pointer 이중 등록 방지 */
  el.addEventListener("pointerdown", start, { passive:false });
  el.addEventListener("pointerup",   end,   { passive:false });
  el.addEventListener("pointercancel", end);
  el.addEventListener("pointerleave", end);
  el.addEventListener("mousedown",  start);
  el.addEventListener("mouseup",    end);
  el.addEventListener("mouseleave", end);
}
bindMobileCtrl("btnMoveLeft",  "ArrowLeft");
bindMobileCtrl("btnMoveRight", "ArrowRight");

/* 모바일 폭탄 버튼 */
const _btnBomb = $("btnBomb");
if (_btnBomb) {
  const _bombFire = e => { e.preventDefault(); ensureAudio(); useBomb(); };
  _btnBomb.addEventListener("pointerdown", _bombFire, { passive: false });
  _btnBomb.addEventListener("mousedown",  _bombFire);
}

if (_touchUi) window._showTouchHintOnce = true;

/* 터치 기기 플레이어 Y 오프셋: 모바일 컨트롤 위에 플레이어 위치 */
function _playerBaseY() {
  return _touchUi ? H - 105 : H - 90;
}

/* 적 전투기가 전진 후 정위치하는 보이지 않는 전열선 (아군 바로 앞) */
function _enemyFireLineY() {
  return _playerBaseY() - 100;
}

function init() {
  resetDailyQuestsIfNeeded();
  checkOfflineRewards();
  updateCurrency();
  renderAll();
  showTitle();
  drawTitleArt();
  requestAnimationFrame(loop);
  /* 오프라인 보상 모달 (딜레이) */
  if (window._pendingOffline) {
    setTimeout(() => showOfflineModal(window._pendingOffline), 800);
    window._pendingOffline = null;
  }
  /* 첫 상호작용 시 오디오 활성화 */
  document.addEventListener("click",   ensureAudio, { once:true });
  document.addEventListener("keydown", ensureAudio, { once:true });
  const tNext = $('btnTutNext');
  if (tNext) tNext.addEventListener('click', () => {
    if (_tutStep < TUTORIAL_STEPS.length - 1) { _tutStep++; renderTutStep(); } else { closeTutorial(); }
  });
  const tSk = $('btnTutSkip');
  if (tSk) tSk.addEventListener('click', () => closeTutorial());
  const tHelp = $('btnHelp');
  if (tHelp) tHelp.addEventListener('click', () => { ensureAudio(); playSfx('ui_click'); openTutorial(true); });
}
init();
window.addEventListener("beforeunload", saveState);

/* 개발자 도구 분석 난이도 상승(완전 차단 불가) — 창 크기 휴리스틱 + debugger */
(function _devtoolsProbe() {
  let streak = 0;
  setInterval(() => {
    const dw = window.outerWidth - window.innerWidth;
    const dh = window.outerHeight - window.innerHeight;
    if (dw > 185 || dh > 185) {
      streak++;
      if (streak >= 3) {
        streak = 0;
        debugger;
      }
    } else streak = Math.max(0, streak - 1);
  }, 1600);
})();

})();
