/* ============================================================
   라스트 워 : 에어 컴뱃 — game.js  v3
   Phase 1: 데미지 팝업 · 화면 흔들림 · -/÷ 게이트 · Web Audio SFX
   Phase 2: 오프라인 방치 보상 · 일일 퀘스트
   Phase 3: 무한 모드 · 개인 최고기록
   Phase 4: 보스 레이저빔 · 미니언 소환 · 부상/병원 시스템
   ============================================================ */

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

function toast(msg, kind = "ok") {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  el.style.borderColor = kind === "err" ? "var(--red)" : kind === "warn" ? "#ff9a2e" : "var(--gold)";
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2200);
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
  { id:99, name:"∞ 무한 모드 · ENDLESS",    enemyTier:1, waves:9999, boss:false, unlock:0, endless:true, rewards:{ gold:30, fuel:15, alloy:6 } }
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
  { id:"fuelS",   name:"항공유 소 (100)",    cost:10,  give:{ fuel:100  } },
  { id:"fuelL",   name:"항공유 대 (600)",    cost:50,  give:{ fuel:600  } },
  { id:"alloyS",  name:"합금 소 (60)",        cost:15,  give:{ alloy:60  } },
  { id:"alloyL",  name:"합금 대 (400)",       cost:80,  give:{ alloy:400 } },
  { id:"goldS",   name:"골드 (2000)",         cost:30,  give:{ gold:2000 } },
  { id:"starter", name:"에이스 팩 (파일럿×3)", cost:200, give:{ scout:3   } }
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
   §3  세이브 / 로드
   ============================================================ */
const SAVE_KEY = "lastwar_aircombat_v2";

function newState() {
  const starters = ["블레이즈","타이탄","스톰"];
  const pilots = starters.map(n => {
    const base = PILOT_POOL.find(p => p.name === n);
    return { id:"p"+Math.random().toString(36).slice(2,8), name:base.name, type:base.type, rarity:base.rarity, level:1 };
  });
  return {
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
    endlessBest:0
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return newState();
    return Object.assign(newState(), JSON.parse(raw));
  } catch { return newState(); }
}
function saveState() { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }

let S = loadState();

/* ============================================================
   §4  재화 · 파일럿 헬퍼
   ============================================================ */
function updateCurrency() {
  $("cGold").textContent  = Math.floor(S.gold);
  $("cFuel").textContent  = Math.floor(S.fuel);
  $("cAlloy").textContent = Math.floor(S.alloy);
  $("cGem").textContent   = Math.floor(S.gems);
}
function canAfford(cost) {
  for (const k in cost) if ((S[k]||0) < cost[k]) return false;
  return true;
}
function pay(cost) {
  for (const k in cost) S[k] -= cost[k];
  updateCurrency(); saveState();
}
function give(bundle) {
  if (bundle.gold)  S.gold  += bundle.gold;
  if (bundle.fuel)  S.fuel  += bundle.fuel;
  if (bundle.alloy) S.alloy += bundle.alloy;
  if (bundle.gems)  S.gems  += bundle.gems;
  if (bundle.scout) for (let i=0; i<bundle.scout; i++) addRandomPilot();
  updateCurrency(); saveState();
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

/* 킬스트릭 어나운서 */
const _streak = { count:0, timer:0, showTimer:0, text:"", color:"#ffdd00" };

/* 불릿타임 */
let _bulletTimeAlpha = 0;

/* 영웅 궁극기 컷신 */
const _ult = { active:false, phase:0, timer:0, beams:[], slowFrames:0 };

/* ════════════════════════════════════════════════════
   인게임 로그라이크 스킬 시스템
   ════════════════════════════════════════════════════ */
const SKILL_POOL = [
  { id:'dual_shot',    icon:'💥', name:'이중 사격',      desc:'총알이 2갈래로 분리',          rarity:'rare',   apply: () => { _skillState.dualShot   = true; } },
  { id:'triple_shot',  icon:'🔱', name:'트리플 샷',      desc:'총알 3방향 동시 발사',          rarity:'rare',   apply: () => { _skillState.tripleShot = true; } },
  { id:'explosive',    icon:'💣', name:'폭발탄',          desc:'명중 시 작은 폭발 발생',        rarity:'rare',   apply: () => { _skillState.explosive  = true; } },
  { id:'rapid_fire',   icon:'⚡', name:'연사 강화',       desc:'발사 속도 +40%',                rarity:'rare',   apply: () => { _skillState.rapidFire  = true; } },
  { id:'giant_bullets',icon:'🔵', name:'거대 탄환',       desc:'탄환 크기 2배 · 데미지 +50%',  rarity:'epic',   apply: () => { _skillState.giantBullets = true; } },
  { id:'guided',       icon:'🎯', name:'유도 미사일',     desc:'추적 미사일 추가 발사',          rarity:'epic',   apply: () => { _skillState.guided     = true; } },
  { id:'heal_squad',   icon:'💚', name:'응급 치료',       desc:'아군 3명 즉시 회복',            rarity:'rare',   apply: () => { B.squad = Math.min(B.squad+3, 999); } },
  { id:'overdrive',    icon:'🔥', name:'오버드라이브',    desc:'피버 게이지 즉시 충전',          rarity:'epic',   apply: () => { _fever.gauge = _fever.maxGauge; } },
  { id:'shield',       icon:'🛡', name:'실드',            desc:'다음 피격 1회 무효화',           rarity:'epic',   apply: () => { _skillState.shieldCount = (_skillState.shieldCount||0)+1; } },
  { id:'emp',          icon:'⚡', name:'EMP',             desc:'현재 적 총알 전부 제거',         rarity:'rare',   apply: () => { B.enemyBullets=[]; } },
  { id:'damage_up',    icon:'⬆', name:'화력 강화',       desc:'전체 데미지 +30%',              rarity:'rare',   apply: () => { _skillState.damageMult = (_skillState.damageMult||1)*1.30; } },
  { id:'multi_squad',  icon:'✈', name:'편대 증원',       desc:'아군 5명 즉시 추가',            rarity:'epic',   apply: () => { B.squad = Math.min(B.squad+5, 999); } },
  { id:'laser_mode',   icon:'🔦', name:'레이저 모드',     desc:'총알이 레이저 빔으로 변경',      rarity:'legend', apply: () => { _skillState.laserMode  = true; } },
  { id:'time_warp',    icon:'⏱', name:'타임 워프',       desc:'적 이동속도 30% 감소 (30s)',    rarity:'legend', apply: () => { _skillState.timeWarpTimer = 1800; } },
];
const _skillState = {
  dualShot: false, tripleShot: false, explosive: false, rapidFire: false,
  giantBullets: false, guided: false, shieldCount: 0, damageMult: 1,
  laserMode: false, timeWarpTimer: 0
};
let _skillKillMilestone = 15; /* 처음 스킬 선택 기준 킬 */
let _skillPickerOpen = false;
let _adRewardApplied = false;   /* 이번 판 광고 보상 사용 여부 */
let _adNoAds = false;           /* 광고 제거 패키지 소유 여부 */
let _pendingRewards = null;     /* 광고 시청 후 지급할 보상 */

function _pickRandomSkills(n) {
  const pool = [...SKILL_POOL];
  const result = [];
  /* 레전드 스킬은 15% 확률로만 포함 */
  const filtered = pool.filter(s => s.rarity !== 'legend' || Math.random() < 0.15);
  for (let i = 0; i < n && filtered.length > 0; i++) {
    const idx = Math.floor(Math.random() * filtered.length);
    result.push(filtered.splice(idx, 1)[0]);
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
  for (const sk of chosen) {
    const div = document.createElement('div');
    div.className = `skill-card rarity-${sk.rarity}`;
    div.innerHTML = `<div class="skill-card-icon">${sk.icon}</div>
      <div class="skill-card-name">${sk.name}</div>
      <div class="skill-card-desc">${sk.desc}</div>`;
    div.addEventListener('click', () => selectSkill(sk));
    cards.appendChild(div);
  }
}
function selectSkill(sk) {
  sk.apply();
  _skillPickerOpen = false;
  B.paused = false;
  const el = document.getElementById('skillPicker');
  if (el) el.classList.add('hidden');
  _skillKillMilestone += 20; /* 다음 스킬은 20킬 후 */
  toast(`✅ ${sk.name} 적용!`, 'ok');
}

/* 상점 함수 */
function shopBuy(item) {
  if (item === 'no_ads') {
    _adNoAds = true;
    toast('🎉 광고 제거 패키지 적용! 보상 3배 자동 지급됩니다.', 'ok');
    document.getElementById('btnAdReward') && (document.getElementById('btnAdReward').textContent = '✅ 광고 제거 패키지 보유 중');
  } else if (item === 'starter') {
    const urPilots = S.pilots.filter(p => p.rarity === 'UR');
    if (urPilots.length > 0) {
      toast('✅ 스타터 패키지 수령! UR 파일럿 + 자원 지급.', 'ok');
      give({ gold:10000, gems:100 });
      updateCurrency();
    }
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
  if (_fever.gauge >= _fever.maxGauge && !_fever.active) {
    _fever.active = true; _fever.timer = _fever.maxTimer; _fever.gauge = 0;
    for (const l of _fever.lines) { l.x = Math.random()*W; l.y = Math.random()*H; l.len = 60+Math.random()*120; l.speed = 12+Math.random()*18; }
    toast("⚡ FEVER TIME!", "info"); triggerShake(5, 10);
  }
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
function showLobby(tab) {
  $("titlePage").classList.add("hidden");
  $("lobbyPage").classList.remove("hidden");
  $("battlePage").classList.add("hidden");
  $("tabbar").classList.remove("hidden");
  if (tab) setTab(tab);
  renderAll();
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
  /* 상점 탭 전용 페이지 토글 */
  const shopPg = $("shopPage");
  if (shopPg) shopPg.classList.toggle("hidden", name !== "shop");
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
    const rewards = Object.entries(st.rewards).map(([k,v]) => `<span class="tag N">${k} +${v}</span>`).join(" ");
    el.innerHTML = `
      <h3>${st.name} ${st.boss ? "<span class='tag' style='background:#3a1622;color:var(--red)'>BOSS</span>" : ""} ${st.endless ? "<span class='tag UR'>∞</span>" : ""}</h3>
      <small>적 등급 T${st.enemyTier} · ${st.endless ? "∞웨이브" : st.waves+"웨이브"} · ${st.weather?"특수기상":"정상기상"}</small>
      <div class="reward">${rewards}</div>
      ${st.endless && S.endlessBest > 0 ? `<small style="color:var(--gold)">🏆 최고기록 웨이브 ${S.endlessBest}</small>` : ""}
      <div style="margin-top:8px;">
        <button class="btn ${locked ? "ghost" : st.endless ? "gold" : "primary"}" ${locked ? "disabled" : ""}>
          ${locked ? `점수 ${st.unlock} 필요` : st.endless ? "무한 출격" : "출격"}
        </button>
      </div>`;
    if (!locked) el.querySelector("button").addEventListener("click", e => { e.stopPropagation(); playSfx("ui_click"); startBattle(st); });
    host.appendChild(el);
  });
}

/* ============================================================
   §11  렌더링: 편대 탭
   ============================================================ */
function renderSquad() {
  const host = $("squadBoard");
  host.innerHTML = "";
  const labels = ["선봉1","선봉2","후위1","후위2","후위3"];
  S.formation.forEach((pid, idx) => {
    const slot = document.createElement("div");
    slot.className = "squad-slot" + (pid ? " filled" : "");
    const p = pid ? findPilot(pid) : null;
    if (p) {
      const t = TYPES[p.type];
      slot.innerHTML = `
        <div class="role"><span class="tag ${t.key}">${t.name}</span></div>
        <div class="name">${p.name}</div>
        <div style="font-size:10px;color:var(--muted)">${p.rarity}</div>
        <div class="lv">LV ${p.level}</div>`;
    } else {
      slot.innerHTML = `<div style="color:var(--muted);font-size:12px;text-align:center;">${labels[idx]}<br>+ 배치</div>`;
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
  const empty = document.createElement("div"); empty.className = "p";
  empty.innerHTML = `<div style="color:var(--muted);font-size:12px;">(비우기)</div>`;
  empty.addEventListener("click", () => { S.formation[slotIdx]=null; saveState(); closePilotModal(); renderAll(); });
  host.appendChild(empty);
  for (const p of items) {
    const t = TYPES[p.type]; const used = S.formation.includes(p.id);
    const div = document.createElement("div");
    div.className = "p" + (used ? " active" : "");
    div.innerHTML = `<div class="row between"><b>${p.name}</b><span class="tag ${p.rarity}">${p.rarity}</span></div>
      <div style="margin-top:4px;"><span class="tag ${t.key}">${t.name}</span> <small>LV ${p.level}</small></div>
      <small style="color:var(--muted)">전력 ${pilotPower(p)}</small>`;
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
    const el = document.createElement("div"); el.className = "hero";
    el.innerHTML = `
      <div class="avatar" style="background:linear-gradient(180deg,${t.color}55 0%,#0e1f39 100%);">${t.name[0]}</div>
      <div class="row between"><div class="name">${p.name}</div><span class="tag ${p.rarity}">${p.rarity}</span></div>
      <div class="meta"><span class="tag ${t.key}">${t.name}</span> · LV ${p.level}</div>
      <div class="stat-row"><span>공격 <b>${pilotAtk(p).toFixed(1)}</b></span><span>체력 <b>${pilotHp(p)}</b></span></div>
      <div style="margin-top:8px;"><button class="btn primary" style="width:100%;">레벨업 · 골드 ${cost}</button></div>`;
    el.querySelector("button").addEventListener("click", () => {
      if (S.gold < cost) return toast("골드가 부족합니다","err");
      if (p.level >= 30) return toast("최대 레벨","err");
      S.gold -= cost; p.level += 1; saveState(); renderAll(); playSfx("level_up"); toast(`${p.name} LV ${p.level}!`);
    });
    host.appendChild(el);
  }
}

/* ============================================================
   §13  렌더링: 스카우트 탭
   ============================================================ */
function renderScoutEmpty() { $("scoutResult").innerHTML = ""; }
function pushScoutResult(p) {
  const div = document.createElement("div"); div.className = "result";
  div.innerHTML = `<div><span class="tag ${p.rarity}">${p.rarity}</span><br>${p.name}<br><small style="color:var(--muted)">${TYPES[p.type].name}</small></div>`;
  $("scoutResult").appendChild(div);
}
$("btnScout1").addEventListener("click", () => {
  ensureAudio();
  if (S.gems < 20) return toast("다이아가 부족합니다","err");
  S.gems -= 20; renderScoutEmpty();
  const np = addRandomPilot(); pushScoutResult(np);
  saveState(); updateCurrency(); renderAll();
  playSfx(np.rarity==="UR"||np.rarity==="SR" ? "level_up" : "ui_click");
  toast(`${np.name} (${np.rarity}) 영입!`);
  trackQuest("dqScout");
});
$("btnScout10").addEventListener("click", () => {
  ensureAudio();
  if (S.gems < 180) return toast("다이아가 부족합니다","err");
  S.gems -= 180; renderScoutEmpty();
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
    const el = document.createElement("div"); el.className = "up-card";
    el.innerHTML = `
      <div class="row between"><div><b>${r.name}</b><br><small style="color:var(--muted)">${r.desc}</small></div><div class="lv">Lv ${lv}</div></div>
      <div class="progress"><div style="width:${Math.min(100,lv*7)}%"></div></div>
      <div style="margin-top:8px;"><button class="btn primary" style="width:100%;">연구 · 합금 ${cost.alloy}</button></div>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!canAfford(cost)) return toast("합금 부족","err");
      pay(cost); S.research[r.key]+=1; saveState(); renderAll(); playSfx("level_up"); toast(`${r.name} LV ${S.research[r.key]}!`);
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
    const el = document.createElement("div"); el.className = "up-card";
    el.innerHTML = `
      <div class="row between"><div><b>${f.name}</b><br><small style="color:var(--muted)">${f.desc}</small></div><div class="lv">Lv ${lv}</div></div>
      <div class="progress"><div style="width:${Math.min(100,lv*6)}%"></div></div>
      <div style="margin-top:8px;"><button class="btn gold" style="width:100%;">건설 · 골드 ${cost.gold} / 항공유 ${cost.fuel}</button></div>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!canAfford(cost)) return toast("자원 부족","err");
      if (f.key!=="tower" && S.fortress[f.key]>=S.fortress.tower*3) return toast("관제탑 레벨 상한 도달","err");
      pay(cost); S.fortress[f.key]+=1; saveState(); renderAll(); playSfx("level_up"); toast(`${f.name} Lv ${S.fortress[f.key]}`);
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
    el.innerHTML=`<div class="preview" style="background:linear-gradient(180deg,${typePreviewColor(sk.id)} 0%,#050d1e 100%);">${sk.icon}</div>
      <div class="row between"><b>${sk.name}</b>${owned?"<span class='tag R'>보유</span>":"<span class='tag N'>잠김</span>"}</div>
      <small style="color:var(--muted)">${sk.buff.atk?`공격 +${sk.buff.atk}% `:""}${sk.buff.hp?`체력 +${sk.buff.hp}%`:""}</small><br>
      <button class="btn ${owned?(equipped?"ghost":"primary"):"gold"}" style="width:100%;margin-top:6px;">
        ${owned?(equipped?"장착됨":"장착"):`다이아 ${sk.price}`}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!owned) {
        if (S.gems<sk.price) return toast("다이아 부족","err");
        S.gems-=sk.price; S.unlockedJetSkins.push(sk.id); saveState(); updateCurrency(); renderAll(); toast("구매 완료"); return;
      }
      S.equippedJetSkin=sk.id; saveState(); renderAll(); toast("스킨 장착");
    });
    jetHost.appendChild(el);
  }
  for (const sk of FORT_SKINS) {
    const owned=S.unlockedFortSkins.includes(sk.id); const equipped=S.equippedFortSkin===sk.id;
    const el = document.createElement("div"); el.className="skin"+(equipped?" active":"");
    el.innerHTML=`<div class="preview" style="background:linear-gradient(180deg,${typePreviewColor(sk.id)} 0%,#050d1e 100%);">${sk.icon}</div>
      <div class="row between"><b>${sk.name}</b>${owned?"<span class='tag R'>보유</span>":"<span class='tag N'>잠김</span>"}</div>
      <small style="color:var(--muted)">${sk.buff.goldRate?`자원 +${sk.buff.goldRate}% `:""}${sk.buff.atk?`공격 +${sk.buff.atk}%`:""}</small><br>
      <button class="btn ${owned?(equipped?"ghost":"primary"):"gold"}" style="width:100%;margin-top:6px;">
        ${owned?(equipped?"장착됨":"장착"):`다이아 ${sk.price}`}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!owned) {
        if (S.gems<sk.price) return toast("다이아 부족","err");
        S.gems-=sk.price; S.unlockedFortSkins.push(sk.id); saveState(); updateCurrency(); renderAll(); toast("구매 완료"); return;
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
  const host=$("shopList"); host.innerHTML="";
  for (const it of SHOP_ITEMS) {
    const el=document.createElement("div"); el.className="card";
    el.innerHTML=`<b>${it.name}</b><p style="color:var(--muted);font-size:12px;margin:4px 0 8px;">다이아 ${it.cost}</p><button class="btn primary" style="width:100%;">구매</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (S.gems<it.cost) return toast("다이아 부족","err");
      S.gems-=it.cost; give(it.give); saveState(); updateCurrency(); toast("구매 완료"); playSfx("powerup");
    });
    host.appendChild(el);
  }
  const passHost=$("passList"); passHost.innerHTML="";
  for (const p of SEASON_PASS) {
    const claimed=S.claimedPass.includes(p.tier); const unlocked=S.seasonKills>=p.kills;
    const el=document.createElement("div"); el.className="card";
    el.innerHTML=`<b>Tier ${p.tier}</b> <span class="tag N">${p.kills} 격추</span><br>
      <small style="color:var(--muted);">보상: ${Object.entries(p.rewards).map(([k,v])=>`${k}+${v}`).join(", ")}</small><br>
      <div class="progress" style="margin-top:6px;"><div style="width:${Math.min(100,(S.seasonKills/p.kills)*100)}%"></div></div>
      <button class="btn ${claimed?"ghost":(unlocked?"gold":"ghost")}" style="width:100%;margin-top:6px;" ${claimed||!unlocked?"disabled":""}>
        ${claimed?"획득 완료":(unlocked?"보상 획득":"달성 필요")}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!unlocked||claimed) return;
      give(p.rewards); S.claimedPass.push(p.tier); saveState(); renderAll(); playSfx("level_up"); toast("시즌 보상 획득!");
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
  const summary = document.createElement("div"); summary.className = "card";
  const totalPilots = S.ownedPilots.length;
  const healthy = Math.max(0, totalPilots - S.injuredPilots);
  const healCost = S.injuredPilots * 50;
  summary.innerHTML = `
    <div class="row between" style="margin-bottom:10px;">
      <div><h3 style="margin:0;color:var(--sky)">부상 현황</h3><p style="color:var(--muted);font-size:12px;margin:4px 0 0;">전투에서 부상당한 파일럿을 치료해야 다음 출격에 최대 전력으로 참전합니다.</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div class="up-card" style="text-align:center;"><div class="lv" style="color:var(--green)">${healthy}</div><small style="color:var(--muted)">정상</small></div>
      <div class="up-card" style="text-align:center;"><div class="lv" style="color:var(--red)">${S.injuredPilots}</div><small style="color:var(--muted)">부상</small></div>
      <div class="up-card" style="text-align:center;"><div class="lv">${totalPilots}</div><small style="color:var(--muted)">전체</small></div>
    </div>`;

  if (S.injuredPilots > 0) {
    const healBtn = document.createElement("button");
    healBtn.className = "btn gold"; healBtn.style.width="100%";
    healBtn.textContent = `전원 치료 · 합금 ${healCost}`;
    healBtn.addEventListener("click", () => {
      if (S.alloy < healCost) return toast("합금 부족","err");
      S.alloy -= healCost; S.injuredPilots = 0;
      saveState(); renderAll(); playSfx("level_up"); toast("파일럿 전원 치료 완료!");
    });
    summary.appendChild(healBtn);

    /* 1명씩 치료 */
    const healOneBtn = document.createElement("button");
    healOneBtn.className = "btn primary"; healOneBtn.style.cssText="width:100%;margin-top:8px;";
    healOneBtn.textContent = `1명 치료 · 합금 50`;
    healOneBtn.addEventListener("click", () => {
      if (S.alloy < 50) return toast("합금 부족","err");
      S.alloy -= 50; S.injuredPilots = Math.max(0, S.injuredPilots-1);
      saveState(); renderAll(); playSfx("ui_click"); toast("파일럿 1명 치료 완료");
    });
    summary.appendChild(healOneBtn);
  } else {
    const ok = document.createElement("p");
    ok.style.cssText = "text-align:center;color:var(--green);font-weight:700;margin:12px 0 0;";
    ok.textContent = "✅ 전원 정상 — 즉시 출격 가능";
    summary.appendChild(ok);
  }
  host.appendChild(summary);

  /* 출격 페널티 안내 */
  const note = document.createElement("div"); note.className = "card"; note.style.marginTop="10px";
  note.innerHTML = `<h3 style="margin:0 0 6px;font-size:14px;">부상 시스템 안내</h3>
    <ul style="color:var(--muted);font-size:12px;margin:0;padding-left:16px;line-height:1.7;">
      <li>전투 패배 시 파괴된 편대 수의 일부가 부상으로 처리됩니다.</li>
      <li>부상 파일럿이 있으면 출격 초기 편대 수가 감소합니다.</li>
      <li>합금 50개로 파일럿 1명을 즉시 치료할 수 있습니다.</li>
      <li>부상 최대 인원: 5명</li>
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
  header.innerHTML = `<div class="row between"><b>📋 일일 퀘스트</b><span class="tag N">${dateStr}</span></div>
    <p style="color:var(--muted);font-size:12px;margin:4px 0 0;">매일 자정 초기화됩니다. ${pending>0?`<span style="color:var(--gold)">✅ 수령 가능 ${pending}개!</span>`:""}`;
  host.appendChild(header);

  for (const q of DAILY_QUEST_DEF) {
    const progress  = S.dailyProgress[q.id]||0;
    const completed = S.dailyCompleted.includes(q.id);
    const unlocked  = progress >= q.goal;
    const pct       = Math.min(100, (progress/q.goal)*100);
    const el = document.createElement("div"); el.className="quest-card" + (completed?" done":"");
    el.innerHTML = `
      <div class="row between">
        <div class="row" style="gap:8px;">
          <span style="font-size:20px;">${q.icon}</span>
          <div>
            <b style="font-size:13px;">${q.desc}</b><br>
            <small style="color:var(--muted)">보상: ${Object.entries(q.reward).map(([k,v])=>`${k} +${v}`).join(", ")}</small>
          </div>
        </div>
        <span style="color:var(--muted);font-size:12px;white-space:nowrap;">${Math.min(progress,q.goal)} / ${q.goal}</span>
      </div>
      <div class="progress" style="margin-top:8px;"><div style="width:${pct}%"></div></div>
      <button class="btn ${completed?"ghost":(unlocked?"gold":"ghost")}" style="width:100%;margin-top:8px;" ${completed||!unlocked?"disabled":""}>
        ${completed?"✅ 완료":(unlocked?"🎁 보상 수령":"진행 중")}</button>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!unlocked||completed) return;
      give(q.reward); S.dailyCompleted.push(q.id); saveState(); renderAll(); playSfx("level_up"); toast(`퀘스트 완료! ${Object.entries(q.reward).map(([k,v])=>`${k}+${v}`).join(" ")}`);
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
  /* 병원 탭 배지 */
  const hospitalTab = document.querySelector(".tab[data-tab='hospital']");
  if (hospitalTab) hospitalTab.querySelector(".tb-ico").textContent = S.injuredPilots>0 ? `🏥${S.injuredPilots}` : "🏥";
  /* 퀘스트 탭 배지 */
  const pending = DAILY_QUEST_DEF.filter(q => !S.dailyCompleted.includes(q.id) && (S.dailyProgress[q.id]||0)>=q.goal).length;
  const questTab = document.querySelector(".tab[data-tab='quests']");
  if (questTab) questTab.querySelector(".tb-ico").textContent = pending>0 ? `📋✦` : "📋";
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
ctx.imageSmoothingEnabled = false; /* 성능 최적화 */
let W = 0, H = 0;

function resizeCanvas() {
  const wrap = $("battleWrap");
  /* 모바일에서 픽셀비 1로 제한 — GPU/렌더링 부담 감소 */
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const cw = wrap.clientWidth;
  const ch = wrap.clientHeight;
  canvas.style.width  = cw + "px";
  canvas.style.height = ch + "px";
  canvas.width  = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  W = cw;
  H = ch;
}
window.addEventListener("resize", () => {
  if (!$("battlePage").classList.contains("hidden")) resizeCanvas();
});

const B = {
  running:false, paused:false, over:false,
  stage:null, wave:1, maxWaves:5, waveTimer:0,
  spawnTick:0, gateTick:0,
  score:0, kills:0, squad:1, maxSquad:20, weaponLv:1,
  keys:{},
  player:{ x:0, y:0, w:36, h:44, speed:18, fireCd:0, _bombCd:0 },
  bullets:[], enemies:[], enemyBullets:[],
  gates:[], powerups:[], particles:[],
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
  B.sessionKills=0; B.sessionGates=0;
  _dmgTexts.length = 0;
  /* 액션 주스 상태 초기화 */
  _hitstop=0; _bulletTimeAlpha=0;
  _fever.gauge=0; _fever.active=false; _fever.timer=0;
  _streak.count=0; _streak.timer=0; _streak.showTimer=0;
  _ult.active=false; _ult.timer=0; _ult.beams.length=0; _ult.slowFrames=0;
  _bossDeath.dying=false; _bossDeath.timer=0; _bossDeath.whiteout=0; _bossDeath.missionTimer=0;
  /* 스킬 상태 리셋 */
  Object.assign(_skillState, { dualShot:false, tripleShot:false, explosive:false, rapidFire:false,
    giantBullets:false, guided:false, shieldCount:0, damageMult:1, laserMode:false, timeWarpTimer:0 });
  _skillKillMilestone = 15;
  _skillPickerOpen = false;
  _adRewardApplied = false;
  const sp = document.getElementById('skillPicker');
  if (sp) sp.classList.add('hidden');
  /* 광고 3배 보상 버튼 초기화 */
  const ab = document.getElementById('btnAdReward');
  if (ab) { ab.disabled = false; ab.textContent = _adNoAds ? '✅ 3배 보상 자동 지급 (광고 제거)' : '📺 광고 시청 → 보상 3배!'; }

  if (stage.endless) stage.enemyTier = 1; // reset for endless

  B.weather = stage.weather || (Math.random()<0.25 ? pick(["storm","magnetic"]) : "clear");

  const placed = S.formation.filter(Boolean);
  B.startFormation = placed.map(id => findPilot(id));
  const base = 1 + (S.fortress.deck-1) + placed.length - injuryPenalty;
  B.maxSquad = Math.max(50, 80 + (S.research.formation-1)*15 + S.fortress.deck*10);
  B.squad    = clamp(base, 1, B.maxSquad);
  B.weaponLv = 1;
  B.baseAtk  = 9 + (S.research.weapon-1)*0.6;
  B.evolutionLv  = 0;
  B.evoTargets   = [];
  B.evoSpawnTick = 0;

  showBattle();
  B.player.x=W/2; B.player.y=H-90; B.player.fireCd=0; B.player._bombCd=0;
  B.running=true;
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
  $("bSquad").textContent  = B.squad;
  $("bKills").textContent  = B.kills;
  $("bScore").textContent  = Math.floor(B.score);
  $("bWeapon").textContent = B.weaponLv;
  $("bHp").textContent     = B.squad>0 ? "정상":"전멸";
  const evoEl=$("bEvo");
  if (evoEl) {
    const evoNames=["기본","EVO 1","EVO MAX","ULTIMATE"];
    evoEl.textContent = evoNames[Math.min(B.evolutionLv||0, evoNames.length-1)];
    evoEl.style.color = ["#8ab8d8","#ffd76a","#ff9a40","#ff5540"][Math.min(B.evolutionLv||0,3)];
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
canvas.addEventListener("pointerdown", e => { ensureAudio(); dragging=true; movePlayerTo(e); });
canvas.addEventListener("pointermove", e => { if(dragging) movePlayerTo(e); });
canvas.addEventListener("pointerup",   () => dragging=false);
canvas.addEventListener("pointerleave",() => dragging=false);
function movePlayerTo(e) {
  const r=canvas.getBoundingClientRect();
  B.player.x=clamp(e.clientX-r.left,20,W-20);
  /* Y 고정 — 좌우 이동만 허용 */
}

$("btnBPause").addEventListener("click",    () => { if(B.running) B.paused=!B.paused; });
$("btnBHome").addEventListener("click",     () => returnToLobby());
$("btnOverHome").addEventListener("click",  () => returnToLobby());
$("btnOverRetry").addEventListener("click", () => startBattle(B.stage));
$("btnBossStart").addEventListener("click", () => { $("bossPanel").classList.remove("show"); B.bossPending=false; });
/* 광고 3배 보상 버튼 */
const _adBtn = $("btnAdReward");
if (_adBtn) _adBtn.addEventListener("click", () => {
  if (_adNoAds) return; /* 광고 제거 패키지 보유 시 이미 자동 3배 */
  /* 광고 시뮬레이션: 실제 광고 SDK 연결 전까지 즉시 보상 */
  triggerAdReward();
});

function returnToLobby() {
  B.running=false;
  showLobby();
}

/* ============================================================
   §25  스폰 함수들
   ============================================================ */
function spawnEnemy(forceTier) {
  const tier = forceTier || (B.stage.endless ? (1+Math.floor(B.wave/4)) : B.stage.enemyTier);
  const roll=Math.random();
  let type="raider";
  if (roll>0.58) type="bomber";
  if (roll>0.76) type="sniper";
  if (roll>0.87) type="scout";
  if (roll>0.93) type="gunboat";
  if (roll>0.985) type="rammer";
  const pf=({
    raider:  { atype:"interceptor", hpMul:1.0,  speed:2.2, fireBase:70,   size:36 },
    bomber:  { atype:"bomber",      hpMul:1.8,  speed:1.3, fireBase:95,   size:44 },
    sniper:  { atype:"gunship",     hpMul:0.9,  speed:1.8, fireBase:130,  size:34 },
    scout:   { atype:"interceptor", hpMul:0.55, speed:3.8, fireBase:50,   size:26 },
    gunboat: { atype:"bomber",      hpMul:2.8,  speed:0.8, fireBase:50,   size:54 },
    rammer:  { atype:"bomber",      hpMul:9.0,  speed:0.4, fireBase:9999, size:60 }
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
    let op, value, growth=0;
    if      (roll < 0.30) { op="+"; value=5+Math.floor(Math.random()*12)+tier*2; growth=1; }
    else if (roll < 0.55) { op="x"; value=1.5+Math.random()*1.2;                 growth=0.08; }
    else if (roll < 0.75) { op="-"; value=1+Math.floor(Math.random()*6)+tier; }
    else                  { op="÷"; value=1.5+Math.random()*0.8;               }
    return { x, y:-30, w:width, h:62, op, value, growth, applied:false };
  };
  B.gates.push(makeGate(leftX), makeGate(rightX));
}

function spawnPowerup(x, y) {
  const kind=pick(["weapon","weapon","shield","bomb","fuel"]);
  B.powerups.push({ x, y, w:26, h:26, kind, vy:2 });
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
  /* MAX_SHOOT_ALLIES 초과 아군은 데미지로 보상 — 총알 수를 상수로 유지 */
  const dmgScale = B.squad > MAX_SHOOT_ALLIES ? B.squad / MAX_SHOOT_ALLIES : 1.0;
  const baseDmg=(B.baseAtk*(1+(B.weaponLv-1)*0.35)+atkBonus*0.25)*dmgScale;
  const bspeed=10+B.weaponLv*0.7;
  const allies=B._allies.slice(0, MAX_SHOOT_ALLIES);  /* 발사 아군 상한 */
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
    /* 최대 6명 기준으로 총알 생성 (상한 초과시 데미지 스케일) */
    const dualAllies = allies.slice(0, 6);
    const dualScale = allies.length > 6 ? allies.length / 6 : 1;
    for (const ally of dualAllies) {
      B.bullets.push({ x:ally.x-14, y:ally.y-16, w:bw, h:bh, v:bspeed+2, vx:-1, dmg:bdmg*0.6*dualScale, atype:"interceptor", color:"#ff88ff" });
      B.bullets.push({ x:ally.x+14, y:ally.y-16, w:bw, h:bh, v:bspeed+2, vx:1,  dmg:bdmg*0.6*dualScale, atype:"interceptor", color:"#ff88ff" });
    }
  }
  if (_skillState.tripleShot) {
    const triAllies = allies.slice(0, 5);
    const triScale = allies.length > 5 ? allies.length / 5 : 1;
    for (const ally of triAllies) {
      for (const vx of [-3.5, 0, 3.5]) {
        B.bullets.push({ x:ally.x, y:ally.y-16, w:bw, h:bh, v:bspeed, vx, dmg:bdmg*0.5*triScale, atype:"interceptor", color:"#88ffcc" });
      }
    }
  }
  if (_skillState.laserMode) {
    /* 레이저: 화면 전체 높이를 관통하는 긴 총알 */
    B.bullets.push({ x:px, y:py-H, w:10, h:H, v:bspeed, vx:0, dmg:baseDmg*2*dmgMult, atype:"gunship", color:"#00ffcc", splash:20 });
  }
  if (dmgMult !== 1 && !_skillState.dualShot && !_skillState.tripleShot) {
    /* 데미지 배율만 적용: 기존 총알 데미지 소급 강화 */
    for (const b of B.bullets) { if (!b._dmgBoosted) { b.dmg *= dmgMult; b._dmgBoosted = true; } }
  }

  playSfx("shoot");
}
/* 로직용(사격) 최대 30명, 렌더용 최대 15명 — 실제 squad 숫자는 그대로 유지 */
const MAX_LOGIC_ALLIES  = 15;  /* 아군 위치 계산 상한 */
const MAX_VISUAL_ALLIES = 12;  /* 화면에 그리는 아군 상한 */
const MAX_SHOOT_ALLIES  = 8;   /* 총알 생성 아군 수 상한 (초과분은 데미지로 보상) */

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
/* 매 update 시작 시 한 번만 계산해 캐시 */
let _lastAllyX = -1, _lastAllySquad = -1;
function cacheAllyPositions() {
  /* 플레이어 X나 squad가 바뀐 경우에만 재계산 */
  const px = Math.round(B.player.x);
  const sq = B.squad;
  if (px === _lastAllyX && sq === _lastAllySquad) return;
  _lastAllyX = px; _lastAllySquad = sq;
  B._allies = getAllyPositions(MAX_LOGIC_ALLIES);
}
function enemyShoot(e) {
  const bspeed=2.6+B.stage.enemyTier*0.15+(B.weather==="storm"?0.2:0);
  const prevLen = B.enemyBullets.length;
  if (e.kind==="bomber") {
    for (const dx of [-0.6,0,0.6])
      B.enemyBullets.push({ x:e.x, y:e.y+12, w:7, h:14, vx:dx, vy:bspeed+0.4, dmg:11, color:"#ffae61" });
  } else if (e.kind==="sniper") {
    B.enemyBullets.push({ x:e.x, y:e.y+12, w:5, h:18, vx:0, vy:bspeed+2.2, dmg:13, color:"#d2b6ff" });
  } else if (e.kind==="scout") {
    B.enemyBullets.push({ x:e.x, y:e.y+10, w:4, h:14, vx:0, vy:bspeed+3.2, dmg:7, color:"#70ff90" });
  } else if (e.kind==="gunboat") {
    for (const dx of [-1.4,-0.5,0,0.5,1.4])
      B.enemyBullets.push({ x:e.x+dx*12, y:e.y+12, w:8, h:15, vx:dx*0.5, vy:bspeed+0.2, dmg:15, color:"#ff9a61" });
  } else {
    B.enemyBullets.push({ x:e.x, y:e.y+12, w:6, h:13, vx:0, vy:bspeed, dmg:9, color:"#ff87a5" });
  }
}
function bossShoot() {
  const e=B.boss; const count=9;
  for (let i=0;i<count;i++) {
    const t=i/(count-1); const dx=(t-0.5)*3.2;
    B.enemyBullets.push({ x:e.x+dx*30, y:e.y+50, w:6, h:14, vx:dx*0.6, vy:3.2, dmg:12, color:"#ff6a8f" });
  }
}

/* ============================================================
   §27  충돌 · 폭발 · 아군 손실
   ============================================================ */
function intersects(a, b) {
  return Math.abs(a.x-b.x)*2 < (a.w+b.w) && Math.abs(a.y-b.y)*2 < (a.h+b.h);
}
function addExplosion(x, y, color) {
  for (let i=0;i<16;i++)
    B.particles.push({ x, y, vx:(Math.random()-0.5)*5, vy:(Math.random()-0.5)*5, life:24+Math.random()*16, color });
}
function loseAlly(x, y) {
  if (B.squad<=0) return;
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
  if      (g.op==="+") B.squad+=Math.floor(g.value);
  else if (g.op==="x") B.squad=Math.floor(B.squad*g.value);
  else if (g.op==="-") B.squad=Math.max(1, B.squad-Math.floor(g.value));
  else if (g.op==="÷") B.squad=Math.max(1, Math.floor(B.squad/g.value));
  B.squad=clamp(B.squad,0,B.maxSquad);
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
  if (!B.running || B.paused || B.bossPending) return;

  /* 힛스탑 — 큰 타격 시 N프레임 일시 정지 */
  if (_hitstop > 0) { _hitstop--; return; }

  /* 총알 수 상한 (성능 보호) */
  if (B.bullets.length > 300)      B.bullets.splice(0, B.bullets.length - 300);
  if (B.enemyBullets.length > 200) B.enemyBullets.splice(0, B.enemyBullets.length - 200);

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

  /* 불릿타임 — 아군 2기 이하일 때 슬로우 */
  const squadLow = B.squad <= 2 && B.squad > 0;
  if (squadLow) _bulletTimeAlpha = Math.min(0.55, _bulletTimeAlpha + 0.025);
  else          _bulletTimeAlpha = Math.max(0,    _bulletTimeAlpha - 0.04);
  const btScale = 1 - _bulletTimeAlpha * 0.68; /* 불릿타임 중 적 탄/이동 스케일 */

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
  p.y = H - 90;

  /* 3D 지형 배경 스크롤 */
  scrollBgObjects(2.8);

  /* 자동 사격 — 총알이 너무 많으면 스킵해 성능 보호 */
  if (p.fireCd>0) p.fireCd--;
  if (p.fireCd<=0 && B.bullets.length < 350) { playerShoot(); p.fireCd=Math.max(3,10-B.weaponLv); }
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
      for (let ex=0;ex<Math.min(extraCount,3);ex++) spawnEnemy();
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
          B.weaponLv=Math.min(8,B.weaponLv+2);
          const evNames=["EVO 1","EVO MAX","EVO ULTIMATE"];
          toast(`기체 진화! ${evNames[B.evolutionLv-1]||"ULTIMATE"} 달성!`,"gold");
          for (let p=0;p<26;p++) addExplosion(et.x+rand(-30,30),et.y+rand(-30,30),"#ffd76a");
          B.evoTargets.splice(i,1);
          break;
        }
      }
      if (i<B.evoTargets.length && B.evoTargets[i] && et.y>H+80) B.evoTargets.splice(i,1);
    }
  }

  /* 아군 총알 이동 */
  for (let i=B.bullets.length-1;i>=0;i--) {
    const b=B.bullets[i]; b.y-=b.v;
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
    b.x+=b.vx*stormMul*btSpeed; b.y+=b.vy*stormMul*btSpeed;
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
      if      (g.op==="+") g.value = Math.min(9999, g.value + 2.5);
      else if (g.op==="x") g.value = Math.min(50.0,  g.value + 0.15);
      else if (g.op==="-") g.value = Math.max(0,     g.value - 3.0);  /* 공격할수록 빼는 양 감소 */
      else if (g.op==="÷") g.value = Math.max(1.0,   g.value - 0.15); /* 공격할수록 나누는 수 감소 */
      clearMesh(b);
      B.bullets.splice(j,1); B.score+=1;
    }
    if (g.y>H+60) { B.gates.splice(i,1); continue; }
    if (!g.applied && intersects(g,B.player)) applyGate(g);
  }

  /* 적 처리 */
  for (let i=B.enemies.length-1;i>=0;i--) {
    const e=B.enemies[i];

    /* ── 돌격기(rammer) 전용 2단계 로직 ── */
    if (e.kind==="rammer") {
      if (!e.charging) {
        /* 1단계: 상단(y≈120)까지 천천히 내려와 호버링 + 카운트다운 */
        if (e.y < 120) {
          e.y += 1.8;
        } else {
          e.phase = (e.phase||0) + 0.06;
          e.y = 120 + Math.sin(e.phase) * 7;
          e.chargeTimer--;
          /* 경고 파티클 (붉은 연기) */
          if (e.chargeTimer > 0 && e.chargeTimer % 5 === 0) {
            B.particles.push({ x:e.x+(Math.random()-0.5)*e.w*0.5, y:e.y+e.h*0.45,
              vx:(Math.random()-0.5)*2, vy:-1.8-Math.random()*2,
              life:18+Math.random()*12, color:pick(["#ff4400","#cc2200","#ff7700"]) });
          }
          /* 2단계 돌진 전환 */
          if (e.chargeTimer <= 0) {
            e.charging = true;
            const dx=B.player.x-e.x, dy=B.player.y-e.y;
            const dist=Math.max(1, Math.hypot(dx,dy));
            const spd=14+Math.random()*3;
            e.vx=dx/dist*spd; e.vy=dy/dist*spd;
            triggerShake(5,10);
            playSfx("boss_appear");
          }
        }
      } else {
        /* 2단계: 급강하 돌진 */
        e.x+=e.vx; e.y+=e.vy;
        /* 붉은 애프터버너 파티클 궤적 */
        if (Math.random()<0.88) {
          for (let p=0;p<4;p++) {
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
          for (let p=0;p<70;p++) {
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
        const mul=damageMultiplier(b.atype,e.atype);
        const crit=Math.random()<0.08;
        const actualDmg=b.dmg*mul*(crit?2.0:1.0);
        e.hp-=actualDmg;
        addDmgText(e.x, e.y-e.h/2-5, actualDmg, crit);
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
          addExplosion(e.x,e.y,"#ff3300");
          addExplosion(e.x-25,e.y+15,"#ff6600");
          addExplosion(e.x+25,e.y-15,"#ffaa00");
          playSfx("explosion"); triggerShake(9,18);
          trackQuest("dqKills"); _onKill();
          ramKilled=true; break;
        }
      }
      if (ramKilled||i>=B.enemies.length) continue;
      if (e.y>H+90||e.x<-130||e.x>W+130) { clearMesh(e); B.enemies.splice(i,1); }
      continue;
    }

    /* ── 일반 적 이동 / 사격 ── */
    e.phase+=0.03; e.x+=Math.sin(e.phase)*1.4; e.y+=e.speed+0.8;
    e.fireCd--;
    if (e.fireCd<=0) { enemyShoot(e); e.fireCd=e.fireBase+Math.random()*30; }

    let killed=false;
    for (let j=B.bullets.length-1;j>=0;j--) {
      const b=B.bullets[j];
      if (!intersects(e,b)) continue;
      const mul=damageMultiplier(b.atype,e.atype);
      const crit=Math.random()<0.08;
      const actualDmg=b.dmg*mul*(crit?2.0:1.0);
      e.hp-=actualDmg;
      addDmgText(e.x, e.y-e.h/2-5, actualDmg, crit);
      if (b.splash) { for (const o of B.enemies) { if (o!==e && Math.hypot(o.x-b.x,o.y-b.y)<b.splash) { o.hp-=b.dmg*0.5; addDmgText(o.x,o.y-o.h/2-5,b.dmg*0.5,false); } } addExplosion(b.x,b.y,"#ffd76a"); }
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
        addExplosion(e.x,e.y,TYPES[e.atype].color);
        playSfx("explosion"); triggerShake(3,5);
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
    if (e.y<90) e.y+=1.2; else e.x+=e.vx;
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
      if      (pu.kind==="weapon") B.weaponLv=Math.min(8,B.weaponLv+1);
      else if (pu.kind==="shield") B.squad=Math.min(B.maxSquad,B.squad+1);
      else if (pu.kind==="bomb")   { for(const e of B.enemies) e.hp-=30; if(B.boss) B.boss.hp-=80; triggerShake(6,10); }
      else if (pu.kind==="fuel")   B.score+=100;
      addExplosion(pu.x,pu.y,"#ffd76a"); playSfx("powerup"); B.powerups.splice(i,1);
    }
  }

  /* 파티클 + 데미지 텍스트 */
  for (let i=B.particles.length-1;i>=0;i--) {
    const f=B.particles[i]; f.x+=f.vx; f.y+=f.vy; f.life--;
    if (f.life<=0) B.particles.splice(i,1);
  }
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
    $("overTitle").textContent="MISSION COMPLETE"; $("overTitle").style.color="var(--gold)";
    $("overSub").textContent=B.stage.id===99 ? `∞ 웨이브 ${B.wave} 도달!` : `${B.stage.name} 클리어!`;
    playSfx("clear");
    trackQuest("dqClear");
    if (B.stage.endless) toast(`무한 모드 웨이브 ${B.wave} — 최고기록 ${S.endlessBest}!`);
  } else {
    $("overTitle").textContent="MISSION FAILED"; $("overTitle").style.color="var(--red)";
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
  const rew={
    gold:  Math.floor(B.stage.rewards.gold  *mult*bonus + B.score*0.1*mult),
    fuel:  Math.floor((B.stage.rewards.fuel  ||0)*mult*bonus),
    alloy: Math.floor((B.stage.rewards.alloy ||0)*mult*bonus),
    gems:  Math.floor((B.stage.rewards.gems  ||0)*mult)
  };
  /* 광고 제거 패키지 보유 시 자동 3배 */
  if (_adNoAds) { Object.keys(rew).forEach(k => rew[k] *= 3); }
  _pendingRewards = rew;
  give(rew);
  if (win&&S.stageCleared<B.stage.id) S.stageCleared=B.stage.id;
  if (B.score>S.bestScore) S.bestScore=Math.floor(B.score);
  $("overRewards").innerHTML=Object.entries(rew).filter(([,v])=>v>0).map(([k,v])=>`${k} +${v}`).join(" · ")||"-";
  /* 광고 3배 버튼 표시 제어 */
  const adBtn = $('btnAdReward');
  if (adBtn) {
    if (_adNoAds) {
      adBtn.textContent = '✅ 3배 자동 지급 완료 (광고 제거 패키지)';
      adBtn.disabled = true;
    } else {
      adBtn.textContent = '📺 광고 시청 → 보상 3배!';
      adBtn.disabled = false;
    }
  }
  saveState(); updateCurrency();
}

function triggerAdReward() {
  if (_adRewardApplied || !_pendingRewards) return;
  _adRewardApplied = true;
  /* 이미 지급한 보상의 2배 추가 지급 (합산 3배 효과) */
  const extra = {};
  Object.entries(_pendingRewards).forEach(([k,v]) => extra[k] = v * 2);
  give(extra);
  updateCurrency();
  $("overRewards").innerHTML += ' <span style="color:#ffd76a;font-weight:900;">× 3배!</span>';
  const adBtn = $('btnAdReward');
  if (adBtn) { adBtn.textContent = '✅ 3배 보상 수령 완료!'; adBtn.disabled = true; }
  toast('🎉 보상 3배 획득!', 'ok');
  saveState();
}

/* ============================================================
   §30  그리기
   ============================================================ */
/* ============================================================
   아군 · P-38 라이트닝 스타일 (상향 비행, 이중 붐, 프로펠러)
   ============================================================ */
function drawAllyJet(x, y, w, h, type, isLeader) {
  /* 그라디언트·애니메이션 없는 고성능 버전 — 외관은 P-38 스타일 유지 */
  const c = ({
    interceptor: { wing:"#5a88b0", body:"#7aa0c0", accent:"#4eb4ff", cockpit:"#30b4f0", flame:"#ffcc60", core:"rgba(255,255,210,0.75)" },
    bomber:      { wing:"#806840", body:"#aa9060", accent:"#ffae61", cockpit:"#eebb70", flame:"#ff8030", core:"rgba(255,240,180,0.75)" },
    gunship:     { wing:"#506090", body:"#7890b0", accent:"#a67bff", cockpit:"#b098f0", flame:"#b870f0", core:"rgba(240,220,255,0.75)" }
  })[type] || { wing:"#5a88b0", body:"#7aa0c0", accent:"#4eb4ff", cockpit:"#30b4f0", flame:"#ffcc60", core:"rgba(255,255,210,0.75)" };

  ctx.save();
  ctx.translate(x, y);

  /* 주날개 */
  ctx.fillStyle = c.wing;
  ctx.beginPath();
  ctx.moveTo(-w*0.92,-h*0.03); ctx.lineTo(w*0.92,-h*0.03);
  ctx.lineTo(w*0.70, h*0.20);  ctx.lineTo(-w*0.70, h*0.20);
  ctx.closePath(); ctx.fill();
  /* 날개 상면 하이라이트 */
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(-w*0.86,-h*0.024); ctx.lineTo(w*0.86,-h*0.024);
  ctx.lineTo(w*0.80, h*0.040);  ctx.lineTo(-w*0.80, h*0.040);
  ctx.closePath(); ctx.fill();

  /* 미사일 장착 (웨이브별) */
  const mSlots=[[-w*0.52,-h*0.05],[w*0.52,-h*0.05],[-w*0.70,h*0.06],[w*0.70,h*0.06]];
  const mCount=Math.min((B.weaponLv||1)-1, mSlots.length);
  ctx.fillStyle="#8899aa";
  for (let i=0;i<mCount;i++) {
    const [mx,my]=mSlots[i];
    ctx.fillRect(mx-w*0.024, my-h*0.13, w*0.048, h*0.16);
    ctx.fillStyle="#cc2020"; ctx.beginPath(); ctx.arc(mx,my-h*0.13,w*0.024,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#8899aa";
  }

  /* 쌍 붐 */
  ctx.fillStyle = c.body;
  ctx.fillRect(-w*0.298,-h*0.57, w*0.118, h*1.10);
  ctx.fillRect( w*0.180,-h*0.57, w*0.118, h*1.10);
  /* 붐 하이라이트 */
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(-w*0.290,-h*0.55, w*0.040, h*1.07);
  ctx.fillRect( w*0.188,-h*0.55, w*0.040, h*1.07);

  /* 엔진 나셀 (원) */
  for (const sx of [-1,1]) {
    ctx.fillStyle = "#1e2e3e";
    ctx.beginPath(); ctx.arc(sx*w*0.24,-h*0.55, w*0.085,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=c.accent; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(sx*w*0.24,-h*0.55, w*0.085,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle="#08121c";
    ctx.beginPath(); ctx.arc(sx*w*0.24,-h*0.55, w*0.052,0,Math.PI*2); ctx.fill();
  }

  /* 중앙 포드 */
  ctx.fillStyle = c.body;
  ctx.fillRect(-w*0.095,-h*0.56, w*0.190, h*0.88);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(-w*0.088,-h*0.54, w*0.052, h*0.85);

  /* 조종석 유리 */
  ctx.fillStyle = c.cockpit;
  ctx.beginPath(); ctx.ellipse(0,-h*0.22, w*0.080,h*0.108,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.beginPath(); ctx.ellipse(-w*0.026,-h*0.265, w*0.025,h*0.036,-0.45,0,Math.PI*2); ctx.fill();

  /* 악센트 띠 */
  ctx.fillStyle = c.accent;
  ctx.fillRect(-w*0.30,-h*0.25, w*0.118, h*0.036);
  ctx.fillRect( w*0.182,-h*0.25, w*0.118, h*0.036);

  /* 꼬리 날개 */
  ctx.fillStyle = c.wing;
  ctx.beginPath(); ctx.moveTo(-w*0.29,h*0.44); ctx.lineTo(-w*0.53,h*0.57); ctx.lineTo(-w*0.30,h*0.54); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo( w*0.29,h*0.44); ctx.lineTo( w*0.53,h*0.57); ctx.lineTo( w*0.30,h*0.54); ctx.closePath(); ctx.fill();

  /* 엔진 불꽃 (정적) */
  ctx.fillStyle = c.flame;
  ctx.beginPath(); ctx.ellipse(-w*0.24,h*0.57, w*0.050,h*0.16,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( w*0.24,h*0.57, w*0.050,h*0.16,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = c.core;
  ctx.beginPath(); ctx.ellipse(-w*0.24,h*0.52, w*0.020,h*0.052,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( w*0.24,h*0.52, w*0.020,h*0.052,0,0,Math.PI*2); ctx.fill();

  /* 리더 별 */
  if (isLeader) {
    ctx.fillStyle="rgba(255,220,80,0.92)";
    ctx.font="700 11px sans-serif"; ctx.textAlign="center";
    ctx.fillText("★",0,-h*0.72);
  }

  ctx.restore();
}

/* ============================================================
   아군 · 고속 경량 렌더 (그라디언트/애니메이션 없음, 추가 편대용)
   ============================================================ */
function drawAllyJetFast(x, y, w, h, type) {
  const c = ({
    interceptor: { wing:"#5a88b0", body:"#7aa0c0", cockpit:"#30b4f0", flame:"#ffcc60" },
    bomber:      { wing:"#806840", body:"#aa9060", cockpit:"#eebb70", flame:"#ff8030" },
    gunship:     { wing:"#506090", body:"#7890b0", cockpit:"#b098f0", flame:"#b870f0" }
  })[type] || { wing:"#5a88b0", body:"#7aa0c0", cockpit:"#30b4f0", flame:"#ffcc60" };
  ctx.save();
  ctx.translate(x, y);
  /* 주날개 */
  ctx.fillStyle = c.wing;
  ctx.beginPath();
  ctx.moveTo(-w*0.90,-h*0.03); ctx.lineTo(w*0.90,-h*0.03);
  ctx.lineTo( w*0.68, h*0.18); ctx.lineTo(-w*0.68, h*0.18);
  ctx.closePath(); ctx.fill();
  /* 동체 (붐 2개 + 중앙 포드) */
  ctx.fillStyle = c.body;
  ctx.fillRect(-w*0.29,-h*0.52, w*0.11, h*1.00);
  ctx.fillRect( w*0.18,-h*0.52, w*0.11, h*1.00);
  ctx.fillRect(-w*0.09,-h*0.52, w*0.18, h*0.84);
  /* 조종석 */
  ctx.fillStyle = c.cockpit;
  ctx.beginPath(); ctx.arc(0,-h*0.20, w*0.065,0,Math.PI*2); ctx.fill();
  /* 배기 불꽃 */
  ctx.fillStyle = c.flame;
  ctx.beginPath(); ctx.ellipse(-w*0.23,h*0.53, w*0.042,h*0.12, 0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( w*0.23,h*0.53, w*0.042,h*0.12, 0,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

/* ============================================================
   오프스크린 스프라이트 캐시 — 비리더 아군 드로잉용
   매 프레임 캔버스 경로 연산 대신 drawImage 한 번으로 처리
   ============================================================ */
const _allyCache = {};  /* key: "interceptor_28" → OffscreenCanvas */
function _getAllySprite(type, sz) {
  const key = type + "_" + sz;
  if (_allyCache[key]) return _allyCache[key];
  /* 오프스크린에 미리 그려둠 */
  const pad = 4;
  const oc = document.createElement("canvas");
  oc.width  = Math.ceil(sz * 2) + pad * 2;
  oc.height = Math.ceil(sz * 1.36) + pad * 2;
  const oc2 = oc.getContext("2d");
  oc2.translate(oc.width / 2, oc.height / 2);
  /* drawAllyJetFast 로직을 오프스크린에 그림 */
  const c = ({
    interceptor: { wing:"#5a88b0", body:"#7aa0c0", cockpit:"#30b4f0", flame:"#ffcc60" },
    bomber:      { wing:"#806840", body:"#aa9060", cockpit:"#eebb70", flame:"#ff8030" },
    gunship:     { wing:"#506090", body:"#7890b0", cockpit:"#b098f0", flame:"#b870f0" }
  })[type] || { wing:"#5a88b0", body:"#7aa0c0", cockpit:"#30b4f0", flame:"#ffcc60" };
  const w = sz, h = sz * 1.36;
  oc2.fillStyle = c.wing;
  oc2.beginPath();
  oc2.moveTo(-w*0.90,-h*0.03); oc2.lineTo(w*0.90,-h*0.03);
  oc2.lineTo( w*0.68, h*0.18); oc2.lineTo(-w*0.68, h*0.18);
  oc2.closePath(); oc2.fill();
  oc2.fillStyle = c.body;
  oc2.fillRect(-w*0.29,-h*0.52, w*0.11, h*1.00);
  oc2.fillRect( w*0.18,-h*0.52, w*0.11, h*1.00);
  oc2.fillRect(-w*0.09,-h*0.52, w*0.18, h*0.84);
  oc2.fillStyle = c.cockpit;
  oc2.beginPath(); oc2.arc(0,-h*0.20, w*0.065,0,Math.PI*2); oc2.fill();
  oc2.fillStyle = c.flame;
  oc2.beginPath(); oc2.ellipse(-w*0.23,h*0.53, w*0.042,h*0.12, 0,0,Math.PI*2); oc2.fill();
  oc2.beginPath(); oc2.ellipse( w*0.23,h*0.53, w*0.042,h*0.12, 0,0,Math.PI*2); oc2.fill();
  _allyCache[key] = oc;
  return oc;
}
/* 스프라이트를 drawImage로 배치 — save/restore 없이 빠름 */
function drawAllySprite(x, y, type, sz) {
  const img = _getAllySprite(type, sz);
  ctx.drawImage(img, x - img.width / 2, y - img.height / 2);
}

/* ============================================================
   적군 · 제로 파이터 스타일 (하향 비행, 단발 엔진, 일장기)
   ============================================================ */
function drawEnemyJet(x, y, w, h, type) {
  const typeData = {
    interceptor: { body:"#2e5a22", wing:"#1e4018", stripe:"#a00000", guns:2 },
    bomber:      { body:"#4a5628", wing:"#3a4420", stripe:"#cc5500", guns:4 },
    gunship:     { body:"#1a3820", wing:"#102810", stripe:"#880088", guns:3 }
  };
  const c = typeData[type] || typeData.interceptor;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI); /* 아래를 향해 비행 */

  /* 그림자 */
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(0,h*0.30, w*0.48,h*0.07, 0,0,Math.PI*2); ctx.fill();

  /* ─ 주날개 ─ */
  ctx.fillStyle = c.wing;
  ctx.beginPath();
  ctx.moveTo(-w*0.88,-h*0.04); ctx.lineTo(w*0.88,-h*0.04);
  ctx.lineTo( w*0.66, h*0.22); ctx.lineTo(-w*0.66, h*0.22);
  ctx.closePath(); ctx.fill();
  /* 날개 패널 라인 */
  ctx.strokeStyle = "rgba(0,0,0,0.40)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-w*0.55,-h*0.03); ctx.lineTo(-w*0.88,h*0.10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( w*0.55,-h*0.03); ctx.lineTo( w*0.88,h*0.10); ctx.stroke();
  /* 날개 하이라이트 */
  ctx.fillStyle = "rgba(80,140,60,0.30)";
  ctx.beginPath();
  ctx.moveTo(-w*0.82,-h*0.03); ctx.lineTo(w*0.82,-h*0.03);
  ctx.lineTo(w*0.76,  h*0.04); ctx.lineTo(-w*0.76, h*0.04);
  ctx.closePath(); ctx.fill();

  /* ─ 날개 총기 ─ */
  ctx.fillStyle = "#1a2818";
  const gunOffsets = [-0.60,-0.44, 0.44, 0.60];
  for (let i=0; i<c.guns; i++) {
    ctx.fillRect(gunOffsets[i]*w-w*0.024,-h*0.05, w*0.048,h*0.19);
    ctx.fillStyle = "#0a1408"; ctx.fillRect(gunOffsets[i]*w-w*0.012,-h*0.06, w*0.024,h*0.06); ctx.fillStyle="#1a2818";
  }

  /* ─ 동체 ─ */
  const bg = ctx.createLinearGradient(-w*0.15,-h*0.55, w*0.12,h*0.40);
  bg.addColorStop(0,"#4c7a38"); bg.addColorStop(0.45,c.body); bg.addColorStop(1,"#0d1f0a");
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.ellipse(0,-h*0.09, w*0.18,h*0.50, 0,0,Math.PI*2); ctx.fill();
  /* 동체 측면 하이라이트 */
  ctx.fillStyle = "rgba(100,170,70,0.28)";
  ctx.beginPath(); ctx.ellipse(-w*0.055,-h*0.18, w*0.058,h*0.24, -0.28,0,Math.PI*2); ctx.fill();

  /* ─ 엔진 카울링 (둥근 노즈) ─ */
  ctx.fillStyle = "#1a2a16";
  ctx.beginPath(); ctx.ellipse(0,-h*0.52, w*0.16,w*0.165, 0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#3a5a28"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0,-h*0.52, w*0.16,w*0.165, 0,0,Math.PI*2); ctx.stroke();
  /* 카울링 볼트 */
  ctx.fillStyle = "#2a3a20";
  for (let i=0;i<6;i++) {
    const a=i*Math.PI/3; ctx.beginPath();
    ctx.arc(Math.cos(a)*w*0.13,-h*0.52+Math.sin(a)*w*0.13, w*0.016,0,Math.PI*2); ctx.fill();
  }

  /* ─ 프로펠러 (역방향 회전) ─ */
  const pa = -performance.now() * 0.024;
  ctx.save(); ctx.translate(0,-h*0.56); ctx.rotate(pa);
  ctx.fillStyle = "rgba(25,45,18,0.90)";
  for (let i=0;i<3;i++) {
    ctx.save(); ctx.rotate(i*Math.PI*2/3);
    ctx.beginPath(); ctx.ellipse(0,-w*0.165, w*0.042,w*0.135, 0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  /* ─ 일장기 마킹 ─ */
  if (type !== "gunship") {
    for (const sx of [-1,1]) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(sx*w*0.42, h*0.07, w*0.092, 0,Math.PI*2); ctx.fill();
      ctx.fillStyle = c.stripe;
      ctx.beginPath(); ctx.arc(sx*w*0.42, h*0.07, w*0.065, 0,Math.PI*2); ctx.fill();
    }
  } else {
    /* 건쉽: 날개끝 보라색 포탑 */
    for (const sx of [-1,1]) {
      ctx.fillStyle = "#5a2a8a";
      ctx.beginPath(); ctx.arc(sx*w*0.66, h*0.10, w*0.07, 0,Math.PI*2); ctx.fill();
      ctx.fillStyle = "#8840cc";
      ctx.beginPath(); ctx.arc(sx*w*0.66, h*0.10, w*0.04, 0,Math.PI*2); ctx.fill();
    }
  }

  /* ─ 꼬리 날개 ─ */
  ctx.fillStyle = c.wing;
  ctx.beginPath(); ctx.moveTo(-w*0.12, h*0.44); ctx.lineTo(-w*0.35,h*0.58); ctx.lineTo(-w*0.14,h*0.54); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo( w*0.12, h*0.44); ctx.lineTo( w*0.35,h*0.58); ctx.lineTo( w*0.14,h*0.54); ctx.closePath(); ctx.fill();
  /* 수직 꼬리 */
  ctx.fillStyle = c.body;
  ctx.beginPath(); ctx.moveTo(0,h*0.28); ctx.lineTo(w*0.06,h*0.52); ctx.lineTo(-w*0.06,h*0.52); ctx.closePath(); ctx.fill();

  /* ─ 엔진 배기 (아래 방향) ─ */
  const et = performance.now()*0.005;
  const eg = ctx.createLinearGradient(0,h*0.44, 0,h*0.80);
  eg.addColorStop(0,"rgba(255,180,60,0.80)"); eg.addColorStop(1,"rgba(255,60,10,0)");
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.ellipse(0,h*0.55, w*0.048*(0.85+Math.sin(et)*0.16),h*0.14*(0.85+Math.cos(et)*0.16), 0,0,Math.PI*2); ctx.fill();

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
  /* Three.js 배경이 아래에 있으므로 2D 레이어는 투명 베이스 + 반투명 오버레이 */
  ctx.clearRect(0, 0, W, H);

  /* 반투명 바다 색조 오버레이 (Three.js가 비쳐 보임) */
  const bg = ctx.createLinearGradient(0,0,0,H);
  if (B.weather==="storm") {
    bg.addColorStop(0,"rgba(14,22,40,0.82)"); bg.addColorStop(0.5,"rgba(24,34,64,0.70)"); bg.addColorStop(1,"rgba(30,44,82,0.55)");
  } else if (B.stage?.enemyTier >= 5) {
    bg.addColorStop(0,"rgba(8,24,42,0.80)"); bg.addColorStop(0.5,"rgba(18,48,78,0.65)"); bg.addColorStop(1,"rgba(26,68,98,0.50)");
  } else {
    bg.addColorStop(0,"rgba(13,40,64,0.72)"); bg.addColorStop(0.5,"rgba(26,74,114,0.58)"); bg.addColorStop(1,"rgba(42,104,152,0.42)");
  }
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

  /* 원근 파도 패턴 — 아래쪽일수록 간격 넓고 투명도 높음 (3D 원근감) */
  const waveRows = 20;
  const scrollOff = _bgScroll % 64;
  for (let row = -1; row < waveRows+1; row++) {
    /* 원근 투영: t^2 로 압축 → 위(원경)는 촘촘, 아래(근경)는 넓음 */
    const t = (row / waveRows);
    const perspT = t * t;
    const y = perspT * H + scrollOff * perspT;
    if (y < 0 || y > H) continue;
    const depthAlpha = 0.04 + perspT * 0.14;
    const waveW = 14 + perspT * 52;
    const waveH = 3  + perspT * 8;
    const cols = Math.ceil(W / (waveW * 3.2)) + 2;
    for (let ci = 0; ci < cols; ci++) {
      const x = ci * waveW * 3.2 + ((row % 2) * waveW * 1.6);
      ctx.fillStyle = `rgba(90,180,255,${depthAlpha})`;
      ctx.beginPath(); ctx.ellipse(x, y, waveW, waveH, 0,0,Math.PI*2); ctx.fill();
    }
  }

  /* 섬 */
  for (const isl of _bgIslands) drawIsland(isl);
  /* 배 */
  for (const ship of _bgShips) drawShipBg(ship);

  /* 구름 그림자 (바다 위) */
  for (const c of _bgClouds) {
    ctx.fillStyle = "rgba(0,16,36,0.10)";
    ctx.beginPath(); ctx.ellipse(c.x+8, c.y+12, c.w*0.50, c.h*0.50, 0,0,Math.PI*2); ctx.fill();
  }
  /* 구름 본체 */
  for (const c of _bgClouds) {
    ctx.fillStyle = "rgba(225,242,255,0.14)";
    ctx.beginPath(); ctx.ellipse(c.x, c.y, c.w*0.50, c.h*0.50, 0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath(); ctx.ellipse(c.x - c.w*0.14, c.y - c.h*0.1, c.w*0.28, c.h*0.38, 0,0,Math.PI*2); ctx.fill();
  }

  /* 날씨 효과 */
  if (B.weather==="magnetic") {
    ctx.strokeStyle="rgba(166,123,255,0.12)"; ctx.lineWidth=1;
    for (let i=0;i<6;i++) {
      const base=(i*H/6+(_bgScroll*0.6))%H;
      ctx.beginPath(); ctx.moveTo(0,base); ctx.lineTo(W,(base+80)%H); ctx.stroke();
    }
  }
  if (B.weather==="storm" && Math.random()<0.007) {
    const lx=rand(W*0.1,W*0.9);
    ctx.strokeStyle="rgba(210,210,255,0.60)"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(lx,0);
    for (let seg=0;seg<7;seg++) ctx.lineTo(lx+rand(-18,18), seg*H/6);
    ctx.stroke();
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

  /* ── 아군 총알 (shadowBlur 제거 — 렉 주범) ── */
  if (_fever.active) {
    ctx.fillStyle = "#00ffcc";
    for (const b of B.bullets) ctx.fillRect(b.x - b.w, b.y - b.h/2, b.w * 1.8, b.h);
  } else {
    /* 컬러별로 그룹핑해서 fillStyle 변경 최소화 */
    let lastCol = "";
    for (const b of B.bullets) {
      const c = b.color || "#8af4ff";
      if (c !== lastCol) { ctx.fillStyle = c; lastCol = c; }
      ctx.fillRect(b.x - b.w/2, b.y - b.h/2, b.w, b.h);
    }
  }

  /* ── 아군 전투기 ─────────────────────────────────
     성능 최적화:
     · 비리더는 drawAllyJetFast (경량 버전)
     · 최대 MAX_VISUAL_ALLIES까지만 그림 (로직은 30명 유지)
     · 글로우는 리더(0번)에만 적용
     ─────────────────────────────────────────────── */
  const _allyDraw = B._allies || [];
  const _sq = B.squad || 0;
  const _evoScale = _sq >= 50 ? 1.28 : _sq >= 30 ? 1.16 : _sq >= 10 ? 1.06 : 1.0;
  const _drawLimit = Math.min(_allyDraw.length, MAX_VISUAL_ALLIES);

  for (let i = 0; i < _drawLimit; i++) {
    const a = _allyDraw[i];
    const sz = 28 * _evoScale;
    const type = a.meta?.type || 'interceptor';
    if (i === 0) {
      /* 리더: 풀 품질 + 진화 글로우 (1번만 실행) */
      if (_sq >= 50) {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = `hsl(${(performance.now()*0.18)%360},100%,55%)`;
      } else if (_sq >= 30) {
        ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = "#ffd76a";
      } else if (_sq >= 10) {
        ctx.save(); ctx.shadowBlur = 8;  ctx.shadowColor = "#4eb4ff";
      }
      drawAllyJet(a.x, a.y, sz, sz * 1.36, type, true);
      if (_sq >= 10) { ctx.shadowBlur = 0; ctx.restore(); }
    } else {
      /* 비리더: 오프스크린 캐시 이미지 — drawImage 1번으로 처리 */
      drawAllySprite(a.x, a.y, type, sz);
    }
  }

  /* ── 적 전투기 ── */
  for (const e of B.enemies) {
    drawEnemyJet(e.x, e.y, e.w, e.h, e.kind);
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

  /* ── 적 총알 (shadowBlur 제거로 성능 확보) ── */
  let _eLastCol = "";
  for (const b of B.enemyBullets) {
    const c = b.color || "#ff3366";
    if (c !== _eLastCol) { ctx.fillStyle = c; _eLastCol = c; }
    ctx.fillRect(b.x - b.w/2, b.y - b.h/2, b.w, b.h);
  }

  /* ── 게이트 ── */
  for (const g of B.gates) {
    const isNeg=(g.op==="-"||g.op==="÷");
    const col=isNeg?"#ff5a6e":g.op==="+"?"#4eb4ff":"#a67bff";
    ctx.fillStyle=isNeg?"rgba(255,90,110,0.32)":(g.op==="+"?"rgba(78,180,255,0.28)":"rgba(166,123,255,0.32)");
    ctx.strokeStyle=col; ctx.lineWidth=3;
    ctx.fillRect(g.x-g.w/2,g.y-g.h/2,g.w,g.h);
    ctx.strokeRect(g.x-g.w/2,g.y-g.h/2,g.w,g.h);
    const v=(g.op==="+"||g.op==="-")?Math.floor(g.value):(g.value>=10?g.value.toFixed(1):g.value.toFixed(2));
    const label=`${g.op}${v}`;
    const fontSize=label.length>6?18:24;
    ctx.font=`900 ${fontSize}px sans-serif`; ctx.textAlign="center"; ctx.lineJoin="round";
    ctx.strokeStyle="rgba(0,0,0,0.88)"; ctx.lineWidth=5;
    ctx.strokeText(label,g.x,g.y+8); ctx.fillStyle="#ffffff"; ctx.fillText(label,g.x,g.y+8);
    ctx.font="600 11px sans-serif"; ctx.strokeStyle="rgba(0,0,0,0.70)"; ctx.lineWidth=3;
    const sub=isNeg?(g.op==="-"?"감소":"나누기"):(g.op==="+"?"증가":"배율");
    ctx.strokeText(sub,g.x,g.y+g.h/2-6); ctx.fillStyle=col; ctx.fillText(sub,g.x,g.y+g.h/2-6);
  }

  /* ── 진화 타겟 ── */
  drawEvoTargets();

  /* ── 아군 수 뱃지 ── */
  if (B.squad > 1) {
    ctx.save();
    ctx.font="700 13px sans-serif"; ctx.textAlign="center"; ctx.lineJoin="round";
    ctx.strokeStyle="rgba(0,0,0,0.85)"; ctx.lineWidth=4;
    ctx.strokeText(`×${B.squad}`,B.player.x,B.player.y+75);
    ctx.fillStyle="#ffd76a"; ctx.fillText(`×${B.squad}`,B.player.x,B.player.y+75);
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
  for (const pu of B.powerups) {
    const puCol=pu.kind==="weapon"?"#ffd76a":pu.kind==="shield"?"#8af4ff":pu.kind==="bomb"?"#ff6a8f":"#b8ffcc";
    ctx.fillStyle=puCol; ctx.beginPath(); ctx.arc(pu.x,pu.y,pu.w/2,0,Math.PI*2); ctx.fill();
    const puLabel=pu.kind==="weapon"?"W":pu.kind==="shield"?"S":pu.kind==="bomb"?"B":"F";
    ctx.font="900 13px sans-serif"; ctx.textAlign="center"; ctx.lineJoin="round";
    ctx.strokeStyle="rgba(0,0,0,0.80)"; ctx.lineWidth=3; ctx.strokeText(puLabel,pu.x,pu.y+4.5);
    ctx.fillStyle="#001018"; ctx.fillText(puLabel,pu.x,pu.y+4.5);
  }

  /* ── 파티클 (폭발 효과) ── */
  ctx.save();
  /* 파티클: 최대 120개 제한 (성능 보호) */
  if (B.particles.length > 120) B.particles.splice(0, B.particles.length - 120);
  for (const f of B.particles) {
    const a=Math.max(0,f.life/40); ctx.globalAlpha=a; ctx.fillStyle=f.color;
    const sz=2+a*3; ctx.fillRect(f.x-sz*0.5,f.y-sz*0.5,sz,sz);
  }
  ctx.globalAlpha=1; ctx.restore();

  /* ── 데미지 팝업 ── */
  drawDmgTexts();

  /* ═══════════════════════════════════════════════════
     액션 주스 레이어 (스크린 좌표)
     ═══════════════════════════════════════════════════ */

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
   §31  게임 루프
   ============================================================ */
let _lastFrameTime = 0;
function loop(ts) {
  /* 탭이 백그라운드면 건너뜀 (모바일 배터리/성능 보호) */
  if (document.hidden) { requestAnimationFrame(loop); return; }

  /* 60fps 프레임 스킵: 16ms 미만이면 렌더 건너뜀 */
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
    if (!el.isConnected) return; t+=0.02;
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
  const start = e => { e.preventDefault(); B.keys[key] = true; };
  const end   = e => { e.preventDefault(); B.keys[key] = false; };
  el.addEventListener("touchstart", start, { passive:false });
  el.addEventListener("touchend",   end,   { passive:false });
  el.addEventListener("touchcancel",end,   { passive:false });
  el.addEventListener("mousedown",  start);
  el.addEventListener("mouseup",    end);
  el.addEventListener("mouseleave", end);
}
bindMobileCtrl("btnMoveLeft",  "ArrowLeft");
bindMobileCtrl("btnMoveRight", "ArrowRight");

/* 모바일 폭탄 버튼 */
const _btnBomb = $("btnBomb");
if (_btnBomb) {
  const _bombFire = e => { e.preventDefault(); useBomb(); };
  _btnBomb.addEventListener("touchstart", _bombFire, { passive: false });
  _btnBomb.addEventListener("mousedown",  _bombFire);
}

/* 모바일 환경 감지 → 터치 힌트 표시 */
(function _initMobileHint() {
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (!isTouchDevice) return;
  /* 처음 전투 시작 시 힌트 표시 */
  window._showTouchHintOnce = true;
})();

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
}
init();
window.addEventListener("beforeunload", saveState);
