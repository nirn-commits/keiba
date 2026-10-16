'use strict';

// 世界（NPC種牡馬・繁殖牝馬・市場）の生成と年次更新
const World = {
  pickSire(pool) {
    return U.weightedPick(pool, id => Math.pow(Math.max(1, Gen.rating(H(id)) - 45), 2));
  },

  breed(sireId, damId, birth, sex, selectN = 1) {
    let best = null;
    for (let i = 0; i < selectN; i++) {
      const f = Gen.makeFoal(sireId, damId, { birth, sex });
      if (!best || Gen.rating(f) > Gen.rating(best)) best = f;
    }
    return Gen.finish(best);
  },

  // NPC種牡馬の架空の競走成績
  fakeRecord(h) {
    const r = Gen.rating(h);
    const rec = Gen.newRecord();
    let g1 = 0, gw = 0;
    if (r >= 86) g1 = U.randi(2, 5);
    else if (r >= 80) g1 = U.randi(1, 2);
    else if (r >= 76) g1 = U.randi(0, 1);
    if (r >= 72) gw = g1 + U.randi(1, 3);
    else if (r >= 66) gw = U.randi(0, 2);
    const mid = (h.dMin + h.dMax) / 2;
    const surf = h.surf >= 0 ? 'turf' : 'dirt';
    const fit = GRADED.filter(g => g.s === surf && !g.x && Math.abs(g.d - mid) <= 600);
    const pool = fit.length ? fit : GRADED.filter(g => !g.x);
    const g1s = U.shuffle(pool.filter(g => g.g === 'G1'));
    const others = U.shuffle(pool.filter(g => g.g !== 'G1'));
    for (let i = 0; i < g1; i++) if (g1s[i]) rec.graded.push({ n: g1s[i].n, g: 'G1' });
    for (let i = 0; i < gw - g1; i++) if (others[i]) rec.graded.push({ n: others[i].n, g: others[i].g });
    rec.g1 = rec.graded.filter(x => x.g === 'G1').length;
    rec.gw = rec.graded.length;
    rec.starts = U.randi(8, 25);
    rec.wins = Math.min(rec.starts, rec.gw + U.randi(1, 4));
    rec.cls = 4;
    return rec;
  },

  makeStallion(h) {
    h.role = 'stallion';
    h.owner = 'npc';
    h.record = World.fakeRecord(h);
    h.pop = U.clamp(1 + U.gauss() * 0.12, 0.75, 1.3);
    Gen.grantFactors(h);
    if (!h.factors.length && Gen.rating(h) >= 82 && U.chance(0.5)) {
      h.factors = [RACE_STATS.slice().sort((a, b) => h.pot[b] - h.pot[a])[0]];
    }
    h.fee = Gen.studFee(h);
    return h;
  },

  generate() {
    // 第0世代: 始祖
    const st0 = [], mr0 = [];
    for (const root of Object.keys(ROOTS)) {
      for (let i = 0; i < 2; i++) {
        const h = Gen.makeFounder('M', root, U.randi(1980, 1984), U.rand(76, 88));
        h.line = h.name + '系';
        h.factors = [RACE_STATS.concat('he').sort((a, b) => h.pot[b] - h.pot[a])[0]];
        if (U.chance(0.25)) h.factors.push(U.pick(RACE_STATS.filter(s => !h.factors.includes(s))));
        st0.push(h.id);
      }
    }
    const roots = Object.keys(ROOTS);
    for (let i = 0; i < 30; i++) {
      const h = Gen.makeFounder('F', U.pick(roots), U.randi(1980, 1986), U.rand(56, 70));
      if (U.chance(0.1)) h.factors = [U.pick(RACE_STATS)];
      mr0.push(h.id);
    }

    const gen = (sires, dams, nSt, nMr, y0, y1, establish) => {
      const st = [], mr = [];
      for (let i = 0; i < nSt; i++) {
        const h = World.breed(World.pickSire(sires), U.pick(dams), U.randi(y0, y1), 'M', 4);
        st.push(h.id);
      }
      for (let i = 0; i < nMr; i++) {
        const h = World.breed(World.pickSire(sires), U.pick(dams), U.randi(y0, y1), 'F', 1);
        mr.push(h.id);
      }
      // 上位馬は名馬として因子を持ち、系統を確立する
      const ranked = st.slice().sort((a, b) => Gen.rating(H(b)) - Gen.rating(H(a)));
      ranked.slice(0, establish).forEach(id => { H(id).line = H(id).name + '系'; });
      ranked.slice(0, 4).forEach(id => {
        const h = H(id);
        h.factors = [RACE_STATS.concat('he').sort((a, b) => h.pot[b] - h.pot[a])[0]];
      });
      mr.slice().sort((a, b) => Gen.rating(H(b)) - Gen.rating(H(a))).slice(0, 2).forEach(id => {
        const h = H(id);
        h.factors = [RACE_STATS.slice().sort((a, b) => h.pot[b] - h.pot[a])[0]];
      });
      return { st, mr };
    };

    const g1 = gen(st0, mr0, 20, 50, 1990, 1995, 3);
    const g2 = gen(g1.st.concat(st0.slice(0, 4)), g1.mr, 20, 50, 1998, 2004, 3);
    const g3 = gen(g2.st.concat(g1.st.slice(0, 6)), g2.mr.concat(g1.mr.slice(0, 10)), 24, 60, 2006, 2012, 3);
    const g4 = gen(g3.st.concat(g2.st.slice(0, 6)), g3.mr.concat(g2.mr.slice(0, 15)), 30, 70, S.year - 13, S.year - 6, 1);

    // 能力分布を整える（世代を重ねたインフレを抑える）
    const norm = (ids, mean, sd) => {
      const rs = ids.map(id => Gen.rating(H(id)));
      const m = rs.reduce((a, b) => a + b, 0) / rs.length;
      const v = Math.sqrt(rs.reduce((a, b) => a + (b - m) * (b - m), 0) / rs.length) || 1;
      ids.forEach((id, i) => Gen.shiftRating(H(id), mean + (rs[i] - m) * sd / v));
    };
    norm(st0, 82, 4);
    norm(mr0, 63, 5);
    norm(g1.st, 80, 5); norm(g2.st, 79, 5); norm(g3.st, 78, 5);
    norm(g1.mr, 62, 6); norm(g2.mr, 62, 6); norm(g3.mr, 61, 6);
    norm(g4.st, 75, 5.5);
    norm(g4.mr, 60, 6.5);

    // 現役種牡馬
    S.stallions = [];
    g4.st.forEach(id => { World.makeStallion(H(id)); S.stallions.push(id); });
    g3.st.slice().sort((a, b) => Gen.rating(H(b)) - Gen.rating(H(a))).slice(0, 8).forEach(id => {
      const h = H(id);
      h.birth = Math.max(h.birth, S.year - 21);
      World.makeStallion(h);
      S.stallions.push(id);
    });
    // NPCの繁殖牝馬プール
    S.npcMares = g4.mr.slice();
    S.npcMares.forEach(id => { H(id).role = 'mare'; });
    for (let i = 0; i < 20; i++) World.addPoolMare(S.year - U.randi(3, 6));
  },

  addPoolMare(birth) {
    const sire = World.pickSire(S.stallions.filter(id => H(id).owner === 'npc'));
    const h = World.breed(sire, U.pick(S.npcMares), birth, 'F', 1);
    Gen.shiftRating(h, 60 + U.gauss() * 6.5);
    h.role = 'mare';
    h.owner = 'npc';
    S.npcMares.push(h.id);
    return h;
  },

  refreshMarket() {
    // 売れ残った1歳馬は市場から消える
    (S.market.yearlings || []).forEach(id => {
      const h = H(id);
      if (h && h.owner === 'market') { h.owner = 'npc'; h.role = 'retired'; }
    });
    const cands = U.shuffle(S.npcMares.filter(id => {
      const h = H(id);
      const a = Gen.age(h);
      return a >= 4 && a <= 14;
    }));
    S.market.mares = cands.slice(0, 8);
    S.market.yearlings = [];
    const sires = S.stallions.filter(id => H(id).owner === 'npc');
    for (let i = 0; i < 8; i++) {
      const sire = U.weightedPick(sires, id => H(id).fee);
      const h = World.breed(sire, U.pick(S.npcMares), S.year - 1, null, 1);
      h.role = 'foal';
      h.owner = 'market';
      S.market.yearlings.push(h.id);
    }
  },

  yearly(report) {
    // 種牡馬の引退
    S.stallions = S.stallions.filter(id => {
      const h = H(id);
      if (h.owner === 'player') return true;
      const a = Gen.age(h);
      if (a >= 25 || (a >= 20 && U.chance(0.25))) { h.role = 'ancestor'; return false; }
      return true;
    });
    // 新種牡馬の供用開始
    const npcSt = S.stallions.filter(id => H(id).owner === 'npc' && Gen.age(H(id)) >= 6);
    const newNames = [];
    const n = U.randi(4, 6);
    for (let i = 0; i < n; i++) {
      const big = U.chance(0.15);
      const h = World.breed(World.pickSire(npcSt), U.pick(S.npcMares), S.year - 4, 'M', 1);
      Gen.shiftRating(h, big ? U.rand(85, 92) : 75 + U.gauss() * 5);
      World.makeStallion(h);
      if (Gen.rating(h) >= 88 && U.chance(0.5)) h.line = h.name + '系';
      S.stallions.push(h.id);
      newNames.push(h.name);
    }
    if (report) report.events.push(`新種牡馬が供用開始: ${newNames.join('、')}`);
    // 人気の変動
    S.stallions.forEach(id => {
      const h = H(id);
      if (h.owner !== 'npc') return;
      h.pop = U.clamp((h.pop || 1) * (1 + U.gauss() * 0.06), 0.7, 1.5);
      h.fee = Gen.studFee(h);
    });
    // 繁殖牝馬プールの入れ替え
    S.npcMares = S.npcMares.filter(id => {
      const h = H(id);
      if (!h || h.owner !== 'npc' || h.role !== 'mare') return false;
      if (Gen.age(h) >= 20) { h.role = 'ancestor'; return false; }
      return true;
    });
    for (let i = 0; i < 14; i++) World.addPoolMare(S.year - 3);
    World.refreshMarket();
    World.gc();
  },

  // 参照されなくなった古い馬を削除してセーブデータを小さく保つ
  gc() {
    const keep = new Set();
    const roots = [];
    for (const h of Object.values(S.horses)) {
      if (h.owner === 'player' || h.owner === 'market' || h.bred || ['stallion', 'mare', 'foal', 'racing'].includes(h.role)) roots.push(h.id);
    }
    S.stallions.forEach(id => roots.push(id));
    S.npcMares.forEach(id => roots.push(id));
    const walk = (id, depth) => {
      if (id == null || depth > 6) return;
      const h = H(id);
      if (!h) return;
      keep.add(id);
      walk(h.sire, depth + 1);
      walk(h.dam, depth + 1);
    };
    roots.forEach(id => walk(id, 0));
    for (const id of Object.keys(S.horses)) {
      if (!keep.has(+id)) delete S.horses[id];
    }
  },
};
