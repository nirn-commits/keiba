'use strict';

// ゲーム状態（game.js で生成・ロード）
let S = null;
function H(id) { return id == null ? null : S.horses[id]; }

// 能力・血統・配合理論
const Gen = {
  usedNames: new Set(),

  rebuildNames() {
    Gen.usedNames = new Set(Object.values(S.horses).map(h => h.name));
  },

  makeName(prefix) {
    for (let i = 0; i < 200; i++) {
      const name = (prefix || U.pick(NAME_PRE)) + U.pick(NAME_SUF);
      if (!Gen.usedNames.has(name)) { Gen.usedNames.add(name); return name; }
    }
    let n = 2;
    const base = (prefix || U.pick(NAME_PRE)) + U.pick(NAME_SUF);
    while (Gen.usedNames.has(base + n)) n++;
    Gen.usedNames.add(base + n);
    return base + n;
  },

  age(h) { return S.year - h.birth; },
  ageF(h) { return S.year - h.birth + (S.week - 1) / 48; },
  ageLabel(h) {
    const a = Gen.age(h);
    return a <= 0 ? '当歳' : `${a}歳`;
  },
  sexLabel(h) { return h.sex === 'M' ? '牡' : '牝'; },

  // 成長曲線（全盛期=1.0）
  curve(a, growth) {
    const g = GROWTH[growth] || GROWTH.normal;
    if (a < 2) return 0.7;
    if (a < g.ps) return 0.75 + 0.25 * (a - 2) / (g.ps - 2);
    if (a <= g.pe) return 1;
    return Math.max(0.55, 1 - 0.09 * (a - g.pe));
  },

  cur(h, s) {
    if (s === 'he') return h.pot.he;
    return h.pot[s] * Gen.curve(Gen.ageF(h), h.growth) * (1 + (h.tb || 0));
  },

  rating(h) {
    let t = 0;
    for (const s of RACE_STATS) t += h.pot[s];
    return t / RACE_STATS.length;
  },

  curRating(h) {
    let t = 0;
    for (const s of RACE_STATS) t += Gen.cur(h, s);
    return t / RACE_STATS.length;
  },

  // 能力推定の誤差幅（若駒ほど見えない）
  uncertainty(h) {
    if (['stallion', 'mare', 'ancestor', 'retired'].includes(h.role)) return 0;
    if (h.record && h.record.starts > 0) return 0;
    const a = Gen.age(h);
    return a <= 0 ? 12 : a === 1 ? 8 : 4;
  },
  est(h, s) { return h.pot[s] + (h.est ? h.est[s] : 0) * Gen.uncertainty(h); },
  estRating(h) {
    let t = 0;
    for (const s of RACE_STATS) t += Gen.est(h, s);
    return t / RACE_STATS.length;
  },

  newRecord() {
    return { starts: 0, wins: 0, p2: 0, p3: 0, earn: 0, cls: 0, graded: [], g1: 0, gw: 0, hist: [] };
  },

  // 既定値を埋めて登録
  finish(h) {
    h.id = S.nextId++;
    if (!h.name) h.name = Gen.makeName();
    h.est = h.est || {};
    for (const s of ALL_STATS) if (h.est[s] == null) h.est[s] = U.clamp(U.gauss(), -1.8, 1.8);
    if (!h.style) h.style = Gen.pickStyle(h.pot);
    h.factors = h.factors || [];
    h.tb = h.tb || 0;
    h.fat = h.fat || 0;
    h.cond = h.cond || 0;
    h.inj = h.inj || 0;
    h.rest = h.rest || 0;
    h.auto = h.auto !== false;
    h.intensity = h.intensity || 'normal';
    h.record = h.record || Gen.newRecord();
    h.owner = h.owner || 'npc';
    h.role = h.role || 'ancestor';
    h.flags = h.flags || [];
    S.horses[h.id] = h;
    return h;
  },

  pickStyle(pot) {
    const f = (pot.sp - pot.ks) + (pot.wi - 60) * 0.3 + U.gauss() * 8;
    if (f > 8) return '逃げ';
    if (f > 0) return '先行';
    if (f > -8) return '差し';
    return '追込';
  },

  makeFounder(sex, root, birth, q) {
    const R = ROOTS[root];
    const pot = {};
    for (const s of RACE_STATS) pot[s] = U.clamp(q + U.gauss() * 7 + (R.bias[s] || 0), 25, 112);
    pot.he = U.clamp(60 + U.gauss() * 12, 25, 100);
    const c = R.dist + U.gauss() * 200;
    const w = U.randi(5, 9) * 100;
    const dMin = U.clamp(U.round(c - w / 2, 100), 1000, 3000);
    const dMax = U.clamp(U.round(c + w / 2, 100), dMin + 400, 3600);
    return Gen.finish({
      sex, birth, sire: null, dam: null, root, line: null, pot,
      growth: U.pick(['early', 'normal', 'normal', 'late']),
      dMin, dMax, surf: U.clamp(R.surf + U.gauss() * 0.25, -1, 1),
    });
  },

  // 血統表上の位置（path: S=父 D=母 の連なり）
  positions(sireId, damId, maxGen = 5) {
    const list = [];
    const walk = (id, gen, path) => {
      if (id == null || gen > maxGen) return;
      const h = H(id);
      if (!h) return;
      list.push({ id, gen, path });
      walk(h.sire, gen + 1, path + 'S');
      walk(h.dam, gen + 1, path + 'D');
    };
    walk(sireId, 1, 'S');
    walk(damId, 1, 'D');
    return list;
  },

  // 配合評価
  evaluate(sireId, damId) {
    const sire = H(sireId), dam = H(damId);
    const pos = Gen.positions(sireId, damId, 5);
    const side = { S: new Map(), D: new Map() };
    for (const p of pos) {
      const m = side[p.path[0]];
      if (!m.has(p.id)) m.set(p.id, []);
      m.get(p.id).push(p);
    }
    const commonIds = [...side.S.keys()].filter(id => side.D.has(id));
    const commonPaths = new Set();
    for (const id of commonIds) {
      side.S.get(id).forEach(p => commonPaths.add(p.path));
      side.D.get(id).forEach(p => commonPaths.add(p.path));
    }
    // 上位のクロス馬を経由するだけの重複は数えない
    const derived = p => {
      for (let i = 1; i < p.path.length; i++) if (commonPaths.has(p.path.slice(0, i))) return true;
      return false;
    };

    const inbreeds = [];
    const fb = {};
    let inbExp = 0, risk = 0;
    for (const id of commonIds) {
      const sg = side.S.get(id).filter(p => !derived(p)).map(p => p.gen).sort();
      const dg = side.D.get(id).filter(p => !derived(p)).map(p => p.gen).sort();
      if (!sg.length || !dg.length) continue;
      const a = sg[0], b = dg[0], sum = a + b;
      let e = 0, r = 0;
      if (a === 1 || b === 1) { r = 6; }
      else if (a === 2 || b === 2 || sum <= 5) { r = 3; e = 1; }
      else if (sum === 6) { e = 3; r = 1.2; }
      else if (sum === 7) { e = 2.5; r = 0.3; }
      else if (sum === 8) { e = 1.5; }
      else if (sum === 9) { e = 0.7; }
      else { e = 0.2; }
      const extra = sg.length + dg.length - 2;
      e += extra * 0.3;
      if (sum <= 7) r += extra * 0.4;
      const anc = H(id);
      const fBonus = {};
      if (anc.factors.length && sum <= 9) {
        for (const f of anc.factors) {
          const v = sum <= 7 ? 5 : 3;
          fb[f] = (fb[f] || 0) + v;
          fBonus[f] = v;
        }
      }
      inbExp += e;
      risk += r;
      inbreeds.push({
        id, name: anc.name, sg, dg, label: `${sg.join('・')}×${dg.join('・')}`, exp: e, risk: r,
        kind: r >= 3 ? 'danger' : r >= 1 ? 'warn' : 'good', factorCross: Object.keys(fBonus),
      });
    }
    inbreeds.sort((x, y) => (x.sg[0] + x.dg[0]) - (y.sg[0] + y.dg[0]));

    const nick = (sire && dam) ? (NICKS[sire.root + '>' + dam.root] || 0) : 0;

    const at = path => { const p = pos.find(x => x.path === path); return p ? H(p.id) : null; };
    const vitHorses = ['S', 'DS', 'SDS', 'DDS'].map(at);
    let vitality = 0, vitRoots = [];
    if (vitHorses.every(Boolean)) {
      vitRoots = vitHorses.map(h => h.root);
      const n = new Set(vitRoots).size;
      vitality = n === 4 ? 2 : n === 3 ? 1 : 0;
    }

    const fac = {};
    let facCount = 0;
    for (const p of pos) {
      if (p.gen > 3) continue;
      const h = H(p.id);
      if (!h.factors.length) continue;
      const w = [0, 1, 0.6, 0.35][p.gen];
      for (const f of h.factors) { fac[f] = (fac[f] || 0) + w; facCount++; }
    }
    const facExp = Math.min(3, facCount * 0.4);

    inbExp = Math.min(7, inbExp);
    const explosive = inbExp + nick + vitality + facExp;
    const stars = explosive < 2.5 ? 1 : explosive < 5 ? 2 : explosive < 7.5 ? 3 : explosive < 10 ? 4 : 5;
    const base = (sire && dam) ? (Gen.rating(sire) + Gen.rating(dam)) / 2 * 0.8 + 55 * 0.2 : 55;
    const expRating = base + Math.min(12, explosive) * 0.45;

    const comments = [];
    if (risk >= 6) comments.push({ k: 'danger', t: '極めて近い近親配合です。虚弱な仔が生まれる危険が非常に高いです。' });
    else if (risk >= 3) comments.push({ k: 'danger', t: '近親の度合いが強く、虚弱体質になる危険があります。' });
    else if (risk >= 1) comments.push({ k: 'warn', t: 'やや濃いインブリードです。健康面に注意が必要です。' });
    if (inbExp >= 3) comments.push({ k: 'good', t: 'インブリードが爆発力を生みそうです。' });
    if (nick) comments.push({ k: 'good', t: `ニックスが成立しています（${ROOTS[sire.root].name}×${ROOTS[dam.root].name}）。` });
    if (vitality === 2) comments.push({ k: 'good', t: '活力補完が成立しています。健康で丈夫な仔が期待できます。' });
    else if (vitality === 1) comments.push({ k: 'good', t: '活力補完がほぼ成立しています。' });
    if (Object.keys(fb).length) comments.push({ k: 'good', t: '因子を持つ名馬のクロスがあります。能力の伸びが期待できます。' });
    if (facCount >= 4) comments.push({ k: 'good', t: `血統内に因子が${facCount}個あります。` });
    if (!comments.length) comments.push({ k: '', t: '特筆する配合理論はありません。両親の能力が素直に出そうです。' });

    return { inbreeds, nick, vitality, vitRoots, fac, facCount, facExp, fb, inbExp, explosive, risk, stars, expRating, comments };
  },

  // 仔を作る（未登録のオブジェクトを返す）
  makeFoal(sireId, damId, opts = {}) {
    const s = H(sireId), d = H(damId);
    const ev = opts.ev || Gen.evaluate(sireId, damId);
    const general = U.gauss() * 5;
    const miracle = ev.explosive >= 9 && U.chance(0.04 + (ev.explosive - 9) * 0.02);
    const weak = ev.risk >= 3 && U.chance(Math.min(0.7, ev.risk * 0.1));
    const pot = {};
    for (const st of RACE_STATS) {
      let v = (s.pot[st] + d.pot[st]) / 2 * 0.8 + 55 * 0.2 + general + U.gauss() * 9 + Math.min(12, ev.explosive) * 0.45;
      v += (ev.fac[st] || 0) * U.rand(0.5, 2.5);
      v += (ev.fb[st] || 0) * U.rand(0.4, 0.8);
      if (miracle) v += 7;
      pot[st] = Gen.softCap(v);
    }
    let he = (s.pot.he + d.pot.he) / 2 * 0.8 + 60 * 0.2 + U.gauss() * 9 + ev.vitality * 3 - ev.risk * 3
      + (opts.bonusHe || 0) + (ev.fac.he || 0) * U.rand(0.5, 3) + (ev.fb.he || 0) * 0.7;
    if (weak) he -= 20;
    pot.he = Gen.softCap(he);

    const center = ((s.dMin + s.dMax) / 2 + (d.dMin + d.dMax) / 2) / 2 + U.gauss() * 150 + (pot.st - pot.sp) * 5;
    const w = U.randi(4, 9) * 100;
    const dMin = U.clamp(U.round(center - w / 2, 100), 1000, 3000);
    const dMax = U.clamp(U.round(center + w / 2, 100), dMin + 400, 3600);
    const r = Math.random();
    const growth = r < 0.4 ? s.growth : r < 0.8 ? d.growth : U.pick(['early', 'normal', 'late']);
    const flags = [];
    if (miracle) flags.push('miracle');
    if (weak) flags.push('weak');
    return {
      sex: opts.sex || (U.chance(0.5) ? 'M' : 'F'),
      birth: opts.birth != null ? opts.birth : S.year,
      sire: sireId, dam: damId, root: s.root, line: s.line, pot, growth, dMin, dMax,
      surf: U.clamp((s.surf + d.surf) / 2 + U.gauss() * 0.3, -1, 1),
      flags, name: opts.name,
    };
  },

  // 90を超える部分は伸びにくい
  softCap(v) {
    if (v > 90) v = 90 + (v - 90) * 0.5;
    return U.clamp(v, 15, 115);
  },

  // 能力の総合値を target に合わせて全能力を平行移動する
  shiftRating(h, target) {
    const d = target - Gen.rating(h);
    for (const s of RACE_STATS) h.pot[s] = U.clamp(h.pot[s] + d, 15, 115);
  },

  // 系統名
  lineName(h) { return h.line || ROOTS[h.root].name; },

  // 馬場適性
  surfScore(h, surf) { return surf === 'turf' ? (h.surf + 1) / 2 : (1 - h.surf) / 2; },
  aptMark(score) { return score >= 0.75 ? '◎' : score >= 0.5 ? '○' : score >= 0.3 ? '△' : '×'; },

  // 種付料
  studFee(h) {
    const r = Gen.rating(h);
    let f = Math.pow(Math.max(0, r - 58) / 25, 2) * 1500;
    const rec = h.record || {};
    f += (rec.g1 || 0) * 250 + (rec.gw || 0) * 60 + (h.offG || 0) * 80 + (h.offG1 || 0) * 300;
    f *= (h.pop || 1);
    return Math.max(50, Math.round(f / 50) * 50);
  },

  // 因子付与（引退時）
  grantFactors(h) {
    if (h.factors.length) return;
    const rec = h.record;
    const top = RACE_STATS.concat(['he']).slice().sort((a, b) => h.pot[b] - h.pot[a]);
    let n = 0;
    if (rec.g1 >= 3 || (rec.g1 >= 1 && Gen.rating(h) >= 85)) n = 2;
    else if (rec.g1 >= 1 || rec.gw >= 3 || h.pot[top[0]] >= 92) n = 1;
    h.factors = top.slice(0, n);
  },

  // 評価額（万円）
  value(h) {
    const r = Gen.estRating(h);
    const age = Gen.age(h);
    const q = Math.pow(Math.max(0, r - 45), 2);
    let v;
    if (h.role === 'foal') {
      const sire = H(h.sire);
      v = 80 + q * 2.2 + (sire ? Gen.studFee(sire) * 0.8 : 0);
    } else if (h.role === 'racing') {
      const am = age <= 3 ? 1 : age <= 5 ? 0.7 : 0.35;
      v = (50 + q * 2) * am + h.record.earn * 0.1;
    } else if (h.role === 'mare') {
      const am = age <= 10 ? 1 : Math.max(0.15, 1 - (age - 10) * 0.12);
      v = (100 + q * 1.8 + h.record.g1 * 1500 + h.record.gw * 300) * am;
    } else if (h.role === 'stallion') {
      v = Gen.studFee(h) * 25;
    } else {
      v = 50;
    }
    return Math.max(10, Math.round(v / 10) * 10);
  },

  offspring(id) {
    return Object.values(S.horses).filter(h => h.sire === id || h.dam === id);
  },
};
