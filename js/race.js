'use strict';

// レース番組・能力計算・レースシミュレーション
const Race = {
  GATE_COLORS: ['#f5f5f5', '#222222', '#e53935', '#1e63d6', '#f6d32d', '#2e9e4b', '#f08c1a', '#f48fb1'],

  absWeek() { return S.year * 48 + S.week; },

  levelFor(cls, age, sex, week) {
    let L = RACE_CLS[cls].level;
    if (age === '2') L *= Gen.curve(2 + (week - 1) / 48, 'normal');
    if (age === '3') L *= Gen.curve(3 + (week - 1) / 48, 'normal');
    if (sex === 'F') L -= 2;
    return L;
  },

  make(year, week, idx, o) {
    const cls = o.cls;
    const ageTxt = { '2': '2歳', '3': '3歳', '3+': '3歳以上', '4+': '4歳以上' }[o.age];
    let name = o.name;
    if (!name) {
      if (cls === 'op') name = `${U.pick(OP_NAMES)}ステークス`;
      else name = `${ageTxt}${RACE_CLS[cls].name}`;
    }
    return {
      id: `${year}-${week}-${idx}`, name, cls, surf: o.surf, dist: o.dist, age: o.age, sex: o.sex || null,
      prize: o.prize || RACE_CLS[cls].prize, lv: Race.levelFor(cls, o.age, o.sex, week),
      field: ['G1', 'G2', 'G3'].includes(cls) ? 16 : U.randi(10, 16),
    };
  },

  generateWeek(year, week) {
    const list = [];
    const T = [1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600];
    const T2 = [1200, 1400, 1600, 1800, 2000];
    const D = [1200, 1400, 1600, 1700, 1800, 1900, 2100];
    const add = o => list.push(Race.make(year, week, list.length, o));
    if (week >= 21) {
      add({ cls: 'debut', age: '2', surf: 'turf', dist: U.pick(T2) });
      add({ cls: 'debut', age: '2', surf: 'dirt', dist: U.pick([1200, 1400, 1700, 1800]) });
    }
    if (week >= 25) {
      add({ cls: 'maiden', age: '2', surf: 'turf', dist: U.pick(T2) });
      add({ cls: 'maiden', age: '2', surf: 'dirt', dist: U.pick([1200, 1400, 1700, 1800]) });
    }
    if (week >= 29) add({ cls: 'w1', age: '2', surf: week % 2 ? 'turf' : 'dirt', dist: U.pick(T2) });
    if (week >= 33 && week % 2 === 0) add({ cls: 'op', age: '2', surf: 'turf', dist: U.pick(T2) });
    if (week <= 36) {
      add({ cls: 'maiden', age: '3', surf: 'turf', dist: U.pick(T) });
      add({ cls: 'maiden', age: '3', surf: 'dirt', dist: U.pick(D) });
    }
    if (week <= 20) {
      add({ cls: 'w1', age: '3', surf: week % 2 ? 'turf' : 'dirt', dist: U.pick(week % 2 ? T : D) });
      if (week % 2 === 0) add({ cls: 'op', age: '3', surf: 'turf', dist: U.pick(T) });
    }
    const oa = week <= 20 ? '4+' : '3+';
    add({ cls: 'w1', age: oa, surf: 'turf', dist: U.pick(T) });
    add({ cls: 'w1', age: oa, surf: 'dirt', dist: U.pick(D) });
    add({ cls: 'w2', age: oa, surf: 'turf', dist: U.pick(T) });
    add({ cls: 'w2', age: oa, surf: 'dirt', dist: U.pick(D) });
    add({ cls: 'w3', age: oa, surf: week % 2 ? 'turf' : 'dirt', dist: U.pick(week % 2 ? T : D) });
    add({ cls: 'op', age: oa, surf: week % 3 === 0 ? 'dirt' : 'turf', dist: U.pick(week % 3 === 0 ? D : T) });
    for (const g of GRADED) {
      if ((g.m - 1) * 4 + g.w !== week) continue;
      add({ cls: g.g, age: g.a, surf: g.s, dist: g.d, sex: g.x, name: g.n, prize: g.p || RACE_CLS[g.g].prize });
    }
    return list;
  },

  isAgeRestricted(r) { return r.age === '2' || r.age === '3'; },

  eligible(h, r) {
    if (h.role !== 'racing' || h.inj > 0 || h.rest > 0) return false;
    const age = Gen.age(h);
    if (r.age === '2' && age !== 2) return false;
    if (r.age === '3' && age !== 3) return false;
    if (r.age === '3+' && age < 3) return false;
    if (r.age === '4+' && age < 4) return false;
    if (r.sex === 'F' && h.sex !== 'F') return false;
    const c = h.record.cls;
    switch (r.cls) {
      case 'debut': return h.record.starts === 0;
      case 'maiden': return c === 0;
      case 'w1': return c === 1;
      case 'w2': return c === 2;
      case 'w3': return c === 3;
      default: return Race.isAgeRestricted(r) ? c >= 1 : c >= 3;
    }
  },

  WEIGHTS: {
    sprint: { sp: 0.42, st: 0.05, pw: 0.18, ks: 0.15, gu: 0.1, wi: 0.1 },
    mile: { sp: 0.34, st: 0.12, pw: 0.14, ks: 0.2, gu: 0.1, wi: 0.1 },
    mid: { sp: 0.26, st: 0.24, pw: 0.1, ks: 0.2, gu: 0.1, wi: 0.1 },
    long: { sp: 0.18, st: 0.38, pw: 0.08, ks: 0.14, gu: 0.12, wi: 0.1 },
  },

  // 実戦での能力値
  score(h, r, opts = {}) {
    const d = r.dist;
    const band = d <= 1400 ? 'sprint' : d <= 1800 ? 'mile' : d <= 2400 ? 'mid' : 'long';
    const w = Object.assign({}, Race.WEIGHTS[band]);
    if (r.surf === 'dirt') { w.pw += 0.12; w.ks -= 0.07; w.sp -= 0.05; }
    let p = 0;
    for (const s of RACE_STATS) p += w[s] * Gen.cur(h, s);
    const need = 25 + (d - 1000) * 0.025;
    const st = Gen.cur(h, 'st');
    if (st < need) p -= (need - st) * 0.35;
    if (d < h.dMin) p *= 1 - (h.dMin - d) / 100 * 0.012;
    if (d > h.dMax) p *= 1 - (d - h.dMax) / 100 * 0.015;
    const t = Gen.surfScore(h, r.surf);
    if (t < 0.5) p *= 1 - (0.5 - t) * 0.24;
    if (!opts.ignoreCond) {
      p *= 1 + h.cond * 0.012;
      p *= 1 - h.fat * 0.0008;
    }
    return p;
  },

  outlook(h, r) {
    const m = Race.score(h, r) - r.lv;
    const sym = m >= 7 ? '◎' : m >= 3 ? '○' : m >= -1 ? '▲' : m >= -5 ? '△' : '×';
    return { m, sym };
  },

  // 自動出走：期待賞金が最も高いレースを選ぶ
  autoPick(h) {
    if (h.role !== 'racing' || h.inj > 0 || h.rest > 0) return null;
    if (h.fat > 45) return null;
    if (h.lastRace && Race.absWeek() - h.lastRace < 3) return null;
    let best = null, bestV = 0;
    for (const r of S.weekRaces) {
      if (!Race.eligible(h, r)) continue;
      if (r.dist < h.dMin - 200 || r.dist > h.dMax + 200) continue;
      if (Gen.surfScore(h, r.surf) < 0.35) continue;
      const m = Race.score(h, r) - r.lv;
      const pWin = 1 / (1 + Math.exp(-(m - 5) / 2.5));
      const pPlace = 1 / (1 + Math.exp(-(m - 1) / 2.5));
      const v = r.prize * (pWin * 0.7 + pPlace * 0.3) * (RACE_CLS[r.cls].rank >= 5 ? 1.3 : 1);
      if (m < -4) continue;
      if (v > bestV) { bestV = v; best = r; }
    }
    return best;
  },

  npcStyle() { return U.weightedPick(STYLES, s => ({ '逃げ': 0.15, '先行': 0.35, '差し': 0.35, '追込': 0.15 }[s])); },

  buildField(r, players) {
    const size = Math.max(r.field, players.length);
    const field = players.slice(0, 18);
    const nNpc = Math.max(0, size - field.length);
    const used = new Set(field.map(e => e.name));
    for (let i = 0; i < nNpc; i++) {
      let name;
      do { name = U.pick(NAME_PRE) + U.pick(NAME_SUF); } while (used.has(name) || Gen.usedNames.has(name));
      used.add(name);
      let P = r.lv + U.gauss() * 3.5;
      if (r.cls === 'G1' && i < 2) P += 4;
      field.push({ name, P, style: Race.npcStyle(), isPlayer: false });
    }
    const order = U.shuffle(field);
    order.forEach((e, i) => { e.gate = i + 1; });
    return order;
  },

  simulate(r, field) {
    const N = 24, segLen = r.dist / N;
    const v0 = (r.surf === 'turf' ? 16.7 : 16.0) * (1 - (r.dist - 1600) / 1600 * 0.045);
    const MOD = { '逃げ': [1.035, 1, 0.965], '先行': [1.015, 1, 0.985], '差し': [0.985, 1, 1.015], '追込': [0.965, 1, 1.035] };
    const nNige = field.filter(e => e.style === '逃げ').length;
    const pace = U.gauss() * 0.8 + (nNige - 1.5) * 0.4;
    const res = field.map(e => {
      const Peff = e.P + U.gauss() * 2.2;
      const vb = v0 * (1 + (Peff - 70) * 0.0013);
      const front = e.style === '逃げ' || e.style === '先行';
      const times = [0];
      let cum = 0;
      for (let k = 0; k < N; k++) {
        const ph = k < N * 0.3 ? 0 : k < N * 0.7 ? 1 : 2;
        let mod = MOD[e.style][ph];
        if (ph === 0 && front) mod += pace * 0.003;
        if (ph === 2) mod += front ? -pace * 0.006 : pace * 0.006;
        const v = vb * mod * (1 + U.gauss() * 0.004);
        cum += segLen / v;
        times.push(Math.round(cum * 1000) / 1000);
      }
      return { name: e.name, gate: e.gate, style: e.style, isPlayer: e.isPlayer, hid: e.hid, time: cum, times };
    });
    res.sort((a, b) => a.time - b.time);
    res.forEach((e, i) => {
      e.pos = i + 1;
      e.margin = i === 0 ? '' : Race.marginText(e.time - res[i - 1].time);
    });
    return { res, pace, n: field.length };
  },

  marginText(dt) {
    if (dt < 0.02) return '同着';
    if (dt < 0.05) return 'ハナ';
    if (dt < 0.09) return 'アタマ';
    if (dt < 0.13) return 'クビ';
    const L = dt / 0.17;
    if (L > 10) return '大差';
    if (L < 0.6) return '1/2';
    if (L < 0.85) return '3/4';
    const whole = Math.floor(L), frac = L - whole;
    const fs = frac < 0.125 ? '' : frac < 0.375 ? '1/4' : frac < 0.625 ? '1/2' : frac < 0.875 ? '3/4' : '';
    const w = frac >= 0.875 ? whole + 1 : whole;
    return fs ? `${w} ${fs}` : `${w}`;
  },

  timeText(t) {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  },

  label(r) {
    const g = RACE_CLS[r.cls].rank >= 5 ? `[${RACE_CLS[r.cls].name}] ` : '';
    return `${g}${r.name} ${r.surf === 'turf' ? '芝' : 'ダ'}${r.dist}m`;
  },

  // 今週の出走を実行
  runWeek(report) {
    const byRace = {};
    for (const [hid, rid] of Object.entries(S.entries)) {
      const h = H(+hid);
      const r = S.weekRaces.find(x => x.id === rid);
      if (!h || !r || h.owner !== 'player' || !Race.eligible(h, r)) continue;
      (byRace[rid] = byRace[rid] || []).push(h);
    }
    for (const rid of Object.keys(byRace)) {
      const r = S.weekRaces.find(x => x.id === rid);
      const horses = byRace[rid];
      const players = horses.map(h => ({ name: h.name, P: Race.score(h, r), style: h.style, isPlayer: true, hid: h.id }));
      const field = Race.buildField(r, players);
      const sim = Race.simulate(r, field);
      const out = { race: r, sim, players: [] };
      for (const e of sim.res) {
        if (!e.isPlayer) continue;
        const h = H(e.hid);
        out.players.push(Race.applyResult(h, r, e, sim, report));
      }
      report.races.push(out);
    }
  },

  applyResult(h, r, e, sim, report) {
    const rec = h.record;
    const prize = e.pos <= 5 ? Math.round(r.prize * PRIZE_RATE[e.pos - 1]) : 0;
    const income = Math.round(prize * OWNER_RATE);
    rec.starts++;
    rec.earn += prize;
    if (e.pos === 1) rec.wins++;
    else if (e.pos === 2) rec.p2++;
    else if (e.pos === 3) rec.p3++;
    const winner = sim.res[0];
    rec.hist.push({
      y: S.year, w: S.week, n: r.name, c: r.cls, s: r.surf, d: r.dist, pos: e.pos, of: sim.n,
      t: Race.timeText(e.time), m: e.pos === 1 ? (sim.res[1] ? '-' + sim.res[1].margin : '') : e.margin,
      win: e.pos === 1 ? (sim.res[1] ? sim.res[1].name : '') : winner.name,
    });
    if (income) Game.earn('prize', income);
    const yst = Game.yearStat();
    yst.starts++;
    yst.earn += prize;
    if (e.pos === 1) {
      yst.wins++;
      if (['debut', 'maiden'].includes(r.cls)) rec.cls = Math.max(rec.cls, 1);
      else if (r.cls === 'w1') rec.cls = Math.max(rec.cls, 2);
      else if (r.cls === 'w2') rec.cls = Math.max(rec.cls, 3);
      else rec.cls = 4;
      if (RACE_CLS[r.cls].rank >= 5) {
        rec.graded.push({ n: r.name, g: r.cls, y: S.year });
        rec.gw++;
        yst.gw++;
        if (r.cls === 'G1') { rec.g1++; yst.g1++; }
        S.honors.push({ y: S.year, w: S.week, n: r.name, g: r.cls, horse: h.name, hid: h.id });
        Game.news(`${h.name}が${r.name}（${RACE_CLS[r.cls].name}）を制覇！`, r.cls === 'G1' ? 'g1' : 'graded');
        const sire = H(h.sire);
        if (sire) {
          sire.offG = (sire.offG || 0) + 1;
          if (r.cls === 'G1') {
            sire.offG1 = (sire.offG1 || 0) + 1;
            if (sire.offG1 >= 3 && sire.line !== sire.name + '系' && sire.role === 'stallion') {
              sire.line = sire.name + '系';
              Game.news(`${sire.name}が自身の系統「${sire.line}」を確立しました！`, 'g1');
            }
          }
        }
      }
    }
    h.fat = U.clamp(h.fat + 15 + r.dist / 150 + U.rand(-3, 3), 0, 100);
    if (e.pos === 1 && U.chance(0.4)) h.cond = Math.min(2, h.cond + 1);
    else if (U.chance(0.35)) h.cond = Math.max(-2, h.cond - 1);
    h.lastRace = Race.absWeek();
    // 故障
    const injP = 0.006 * (110 - h.pot.he) / 50 + h.fat * 0.0002;
    let injury = null;
    if (U.chance(injP)) {
      const severe = U.chance(0.12);
      h.inj = severe ? U.randi(30, 50) : U.randi(6, 20);
      injury = severe ? '重度の故障' : '故障';
      Game.news(`${h.name}がレース後に${injury}を発症しました（全治${h.inj}週）。`, 'bad');
    }
    return { hid: h.id, name: h.name, pos: e.pos, prize, income, injury };
  },
};
