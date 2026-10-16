'use strict';

// ゲーム進行・経営
const SAVE_PREFIX = 'keiba-sim-';
const SAVE_SLOTS = 5;
const LEGACY_SAVE_KEY = 'keiba-sim-save-v1';

const Game = {
  newGame(farmName, kanmei) {
    S = {
      version: 1, farmName: farmName || '袋井ファーム', kanmei: kanmei || '',
      year: 2027, week: 1, money: 12000, nextId: 1, horses: {},
      stallions: [], npcMares: [], market: { mares: [], yearlings: [] },
      entries: {}, weekRaces: [], news: [], honors: [], yearStats: {}, finance: {},
      facilities: { barn: 1, nursery: 1, pasture: 1, trainer: 1 },
      lastReport: null, settings: { autosave: true },
    };
    Gen.usedNames = new Set();
    World.generate();
    World.refreshMarket();

    // 初期所有馬
    const pool = S.npcMares.filter(id => {
      const a = Gen.age(H(id));
      return a >= 4 && a <= 12;
    }).sort((a, b) => Math.abs(Gen.rating(H(a)) - 62) - Math.abs(Gen.rating(H(b)) - 62));
    const mares = pool.slice(0, 2);
    mares.forEach(id => {
      const h = H(id);
      h.owner = 'player';
      S.npcMares = S.npcMares.filter(x => x !== id);
      S.market.mares = S.market.mares.filter(x => x !== id);
    });
    const cheap = S.stallions.filter(id => H(id).fee <= 600);
    H(mares[0]).preg = { sire: U.pick(cheap.length ? cheap : S.stallions), y: S.year - 1 };

    const mk = (birth, role) => {
      const sire = U.weightedPick(cheap.length ? cheap : S.stallions, () => 1);
      const h = World.breed(sire, U.pick(S.npcMares), birth, null, 3);
      h.owner = 'player';
      h.role = role;
      h.bred = true;
      h.name = Gen.makeName(S.kanmei || null);
      return h;
    };
    mk(S.year - 2, 'racing');
    mk(S.year - 1, 'foal');

    Race.pruneSchedule();
    S.weekRaces = Race.program(S.year, S.week);
    Game.autoEntries();
    Game.news(`${S.farmName}の経営が始まりました。繁殖牝馬2頭、競走馬1頭、1歳馬1頭からのスタートです。`, 'info');
    Game.news('種付けシーズンは2月2週〜5月4週です。それまでに配合を検討しましょう。', 'info');
    Game.save();
  },

  // ---- 状態ヘルパ ----
  mine(role) {
    return Object.values(S.horses).filter(h => h.owner === 'player' && (!role || h.role === role));
  },
  barnCap() { return BARN_CAP[S.facilities.barn - 1]; },
  isSeason() { return S.week >= 6 && S.week <= 20; },
  news(t, k = 'info') {
    S.news.unshift({ y: S.year, w: S.week, t, k });
    if (S.news.length > 120) S.news.length = 120;
  },
  fin(cat) {
    const f = S.finance[S.year] = S.finance[S.year] || {};
    return f;
  },
  earn(cat, v) { S.money += v; const f = Game.fin(); f[cat] = (f[cat] || 0) + v; },
  spend(cat, v) { S.money -= v; const f = Game.fin(); f[cat] = (f[cat] || 0) - v; },
  yearStat(y = S.year) {
    return S.yearStats[y] = S.yearStats[y] || { starts: 0, wins: 0, earn: 0, gw: 0, g1: 0, births: 0 };
  },

  // 出走方針: auto=自動（ローテ優先）/ plan=ローテのみ / manual=手動
  mode(h) { return h.mode || (h.auto === false ? 'manual' : 'auto'); },

  autoEntries() {
    S.entries = {};
    const now = Race.absWeek();
    for (const h of Game.mine('racing')) {
      h.plan = (h.plan || []).filter(p => p.y * 48 + p.w >= now);
      const p = h.plan.find(x => x.y === S.year && x.w === S.week);
      if (p) {
        const r = Race.findPlanned(h, p);
        if (r) {
          S.entries[h.id] = r.id;
        } else {
          Game.news(`${h.name}は予定していた${Plan.label(p)}に出走できませんでした（${Plan.whyNot(h, p)}）。`, 'bad');
          h.plan = h.plan.filter(x => x !== p);
        }
        continue;
      }
      if (Game.mode(h) !== 'auto') continue;
      // ローテの目標レースが近い場合は調整に専念する
      const next = h.plan[0];
      if (next && next.y * 48 + next.w - now <= 3) continue;
      const r = Race.autoPick(h);
      if (r) S.entries[h.id] = r.id;
    }
  },

  // ---- 週送り ----
  nextWeek() {
    const report = { y: S.year, w: S.week, races: [], events: [] };
    Race.runWeek(report);
    Game.weeklyHorses(report);
    Game.upkeep();

    S.week++;
    if (S.week > 48) {
      S.week = 1;
      S.year++;
      Game.newYear(report);
    }
    Game.weekEvents(report);
    Race.pruneSchedule();
    S.weekRaces = Race.program(S.year, S.week);
    Game.autoEntries();
    S.lastReport = report;
    if (S.money < 0 && S.week % 4 === 1) Game.news('資金がマイナスです。馬の売却などで立て直しましょう。', 'bad');
    Game.save();
    return report;
  },

  weeklyHorses(report) {
    const tl = S.facilities.trainer, nl = S.facilities.nursery, pl = S.facilities.pasture;
    for (const h of Game.mine()) {
      if (h.role === 'racing') {
        if (h.inj > 0) {
          h.inj--;
          h.fat = Math.max(0, h.fat - 15);
          if (h.inj === 0) {
            Game.news(`${h.name}が故障から復帰しました。`, 'info');
            h.tb = Math.max(0, h.tb - 0.01);
          }
        } else if (h.rest > 0) {
          h.rest--;
          h.fat = Math.max(0, h.fat - 18 - 3 * (pl - 1));
          if (U.chance(0.3)) h.cond = Math.min(2, h.cond + 1);
          if (h.rest === 0) report.events.push(`${h.name}が放牧から帰厩しました。`);
        } else {
          const I = INTENSITY[h.intensity] || INTENSITY.normal;
          h.fat = U.clamp(h.fat + I.fat + U.gauss() * 2, 0, 100);
          const cap = 0.05 + 0.012 * tl;
          if (h.tb < cap) h.tb = Math.min(cap, h.tb + I.tb * (1 + 0.15 * (tl - 1)));
          const injP = I.inj * (110 - h.pot.he) / 50 + Math.max(0, h.fat - 50) * 0.0004;
          if (U.chance(injP)) {
            h.inj = U.randi(4, 16);
            delete S.entries[h.id];
            Game.news(`${h.name}が調教中に故障しました（全治${h.inj}週）。`, 'bad');
          }
          if (U.chance(0.25)) h.cond = U.clamp(h.cond + (U.chance(h.fat > 60 ? 0.3 : 0.5) ? 1 : -1), -2, 2);
        }
      } else if (h.role === 'foal') {
        const cap = 0.015 * nl;
        if (h.tb < cap) h.tb = Math.min(cap, h.tb + 0.0003 * nl);
      }
    }
  },

  upkeep() {
    let cost = 0;
    for (const h of Game.mine()) {
      if (h.role === 'racing') cost += 14 + 3 * (S.facilities.trainer - 1);
      else if (h.role === 'mare') cost += 3;
      else if (h.role === 'foal') cost += 2;
      else if (h.role === 'stallion') cost += 4;
    }
    if (cost) Game.spend('upkeep', cost);
  },

  newYear(report) {
    const prev = S.year - 1;
    const ys = Game.yearStat(prev);
    Game.news(`${prev}年の成績: ${ys.starts}戦${ys.wins}勝 重賞${ys.gw}勝(GI ${ys.g1}勝) 獲得賞金${U.money(ys.earn)}`, 'info');
    report.events.push(`${prev}年が終わりました。${ys.starts}戦${ys.wins}勝、重賞${ys.gw}勝、獲得賞金${U.money(ys.earn)}。`);

    for (const h of Game.mine()) {
      const a = Gen.age(h);
      if (h.role === 'foal' && a >= 2) {
        h.role = 'racing';
        h.intensity = 'normal';
        h.mode = 'auto';
        h.plan = [];
        report.events.push(`${h.name}が入厩しました。6月からデビュー可能です。`);
      } else if (h.role === 'racing' && a >= 10) {
        const msg = Game.autoRetire(h);
        report.events.push(msg);
      } else if (h.role === 'racing' && a >= 8) {
        Game.news(`${h.name}は${a}歳になりました。引退を検討しましょう。`, 'info');
      } else if (h.role === 'mare' && a >= 22) {
        h.role = 'retired';
        h.preg = null;
        report.events.push(`${h.name}が繁殖生活を引退し、功労馬となりました。`);
      } else if (h.role === 'stallion' && a >= 25) {
        h.role = 'retired';
        S.stallions = S.stallions.filter(x => x !== h.id);
        report.events.push(`${h.name}が種牡馬を引退しました。`);
      }
    }
    World.yearly(report);
    Gen.rebuildNames();
    Game.news('新しい年になりました。市場に繁殖牝馬と1歳馬が入荷しています。', 'info');
  },

  weekEvents(report) {
    if (S.week === 6) {
      Game.births(report);
      Game.news('種付けシーズンが始まりました（5月4週まで）。', 'info');
    }
    if (S.week === 21) {
      Game.news('種付けシーズンが終了しました。', 'info');
      for (const h of Game.mine('stallion')) {
        const r = Gen.rating(h);
        h.fee = Gen.studFee(h);
        const books = Math.round(U.clamp(30 + (r - 65) * 4 + (h.record.g1 || 0) * 8 + (h.offG || 0) * 5 + U.gauss() * 8, 10, 150));
        const income = Math.round(h.fee * books * 0.12);
        h.books = books;
        Game.earn('stud', income);
        report.events.push(`種牡馬${h.name}: ${books}頭に種付け、種付料収入${U.money(income)}`);
        Game.news(`種牡馬${h.name}の今年の種付け頭数は${books}頭。収入${U.money(income)}。`, 'good');
      }
    }
  },

  births(report) {
    for (const m of Game.mine('mare')) {
      if (!m.preg || m.preg.y >= S.year) continue;
      const sire = H(m.preg.sire);
      m.preg = null;
      if (!sire) continue;
      const ev = Gen.evaluate(sire.id, m.id);
      const f = Gen.finish(Gen.makeFoal(sire.id, m.id, {
        ev, birth: S.year, bonusHe: (S.facilities.pasture - 1) * 2, name: Gen.makeName(S.kanmei || null),
      }));
      f.owner = 'player';
      f.role = 'foal';
      f.bred = true;
      Game.yearStat().births++;
      const r = Gen.estRating(f);
      const cm = r >= 82 ? 'とんでもない馬が生まれたかもしれません！'
        : r >= 74 ? 'かなりの素質を感じます。'
          : r >= 66 ? 'なかなか良い馬です。'
            : r >= 58 ? 'まずまずの馬です。' : '少し物足りないかもしれません。';
      let extra = '';
      if (f.flags.includes('miracle')) extra = '（配合が見事に噛み合ったようです！）';
      if (f.flags.includes('weak')) extra = '（体質がやや弱いようです…）';
      const msg = `${m.name}が${sire.name}との仔（${Gen.sexLabel(f)}）を出産。「${cm}」${extra}`;
      report.events.push(msg);
      report.births = report.births || [];
      report.births.push(f.id);
      Game.news(msg, r >= 74 ? 'good' : 'info');
    }
  },

  // ---- 操作 ----
  setEntry(hid, rid) {
    if (!rid) delete S.entries[hid];
    else S.entries[hid] = rid;
  },

  mate(mareId, sireId) {
    const m = H(mareId), s = H(sireId);
    if (!Game.isSeason()) return { ok: false, msg: '種付けシーズン外です（2月2週〜5月4週）。' };
    if (!m || m.owner !== 'player' || m.role !== 'mare') return { ok: false, msg: '繁殖牝馬を選んでください。' };
    if (m.preg) return { ok: false, msg: `${m.name}は既に受胎しています。` };
    if (!s || s.role !== 'stallion') return { ok: false, msg: '種牡馬を選んでください。' };
    if (s.id === m.sire) return { ok: false, msg: '父娘の配合はできません。' };
    const fee = s.owner === 'player' ? 0 : s.fee;
    if (S.money < fee) return { ok: false, msg: '資金が足りません。' };
    const a = Gen.age(m);
    const p = U.clamp(0.88 - Math.max(0, a - 14) * 0.05, 0.4, 0.9);
    if (!U.chance(p)) {
      Game.news(`${m.name}×${s.name}: 残念ながら不受胎でした（種付料は返還されます）。`, 'bad');
      return { ok: true, conceived: false, msg: '不受胎でした。種付料は返還されます。もう一度種付けできます。' };
    }
    if (fee) Game.spend('fee', fee);
    m.preg = { sire: s.id, y: S.year };
    Game.news(`${m.name}が${s.name}の仔を受胎しました（種付料${U.money(fee)}）。`, 'good');
    Game.save();
    return { ok: true, conceived: true, msg: `受胎確認！来年2月に出産予定です。` };
  },

  buy(hid) {
    const h = H(hid);
    if (!h) return { ok: false, msg: '対象が見つかりません。' };
    const price = Game.buyPrice(h);
    if (S.money < price) return { ok: false, msg: '資金が足りません。' };
    if (S.market.mares.includes(hid)) {
      if (Game.mine('mare').length >= Game.barnCap()) return { ok: false, msg: '繁殖厩舎が満杯です。施設を拡張してください。' };
      S.market.mares = S.market.mares.filter(x => x !== hid);
      S.npcMares = S.npcMares.filter(x => x !== hid);
      h.owner = 'player';
      h.preg = null;
    } else if (S.market.yearlings.includes(hid)) {
      S.market.yearlings = S.market.yearlings.filter(x => x !== hid);
      h.owner = 'player';
    } else return { ok: false, msg: 'この馬は購入できません。' };
    Game.spend('purchase', price);
    Game.news(`${h.name}を${U.money(price)}で購入しました。`, 'info');
    Game.save();
    return { ok: true, msg: `${h.name}を購入しました。` };
  },
  buyPrice(h) { return Math.round(Gen.value(h) * 1.25 / 10) * 10; },

  sell(hid) {
    const h = H(hid);
    if (!h || h.owner !== 'player') return { ok: false };
    const price = Gen.value(h);
    Game.earn('sales', price);
    delete S.entries[hid];
    if (h.role === 'mare') {
      h.owner = 'npc';
      h.preg = null;
      S.npcMares.push(h.id);
    } else if (h.role === 'stallion') {
      h.owner = 'npc';
      h.pop = 1;
    } else {
      h.owner = 'npc';
      h.role = 'retired';
    }
    Game.news(`${h.name}を${U.money(price)}で売却しました。`, 'info');
    Game.save();
    return { ok: true, msg: `${h.name}を${U.money(price)}で売却しました。` };
  },

  canStud(h) {
    return h.sex === 'M' && (h.record.gw >= 1 || Gen.rating(h) >= 72);
  },

  retire(hid, mode) {
    const h = H(hid);
    if (!h || h.owner !== 'player' || h.role !== 'racing') return { ok: false, msg: '引退できません。' };
    delete S.entries[hid];
    Gen.grantFactors(h);
    h.fat = 0; h.inj = 0; h.rest = 0;
    if (mode === 'mare') {
      if (h.sex !== 'F') return { ok: false, msg: '牝馬のみ繁殖入りできます。' };
      if (Game.mine('mare').length >= Game.barnCap()) return { ok: false, msg: '繁殖厩舎が満杯です。' };
      h.role = 'mare';
      Game.news(`${h.name}が引退し、繁殖牝馬となりました。`, 'info');
    } else if (mode === 'stud') {
      if (!Game.canStud(h)) return { ok: false, msg: '種牡馬入りの条件を満たしていません（重賞勝ちまたは高い能力が必要）。' };
      h.role = 'stallion';
      h.pop = 1;
      h.fee = Gen.studFee(h);
      S.stallions.push(h.id);
      Game.news(`${h.name}が種牡馬入りしました！（種付料${U.money(h.fee)}）`, 'good');
    } else {
      return Game.sell(hid);
    }
    Game.save();
    return { ok: true, msg: '引退しました。' };
  },

  autoRetire(h) {
    if (h.sex === 'F' && Game.mine('mare').length < Game.barnCap()) {
      Game.retire(h.id, 'mare');
      return `${h.name}が10歳を迎え引退、繁殖牝馬となりました。`;
    }
    if (h.sex === 'M' && Game.canStud(h)) {
      Game.retire(h.id, 'stud');
      return `${h.name}が10歳を迎え引退、種牡馬入りしました。`;
    }
    const r = Game.sell(h.id);
    return `${h.name}が10歳を迎え引退しました。${r.msg || ''}`;
  },

  rest(hid, weeks) {
    const h = H(hid);
    if (!h || h.role !== 'racing') return;
    h.rest = weeks;
    delete S.entries[hid];
  },

  upgrade(key) {
    const lv = S.facilities[key];
    const F = FACILITIES[key];
    if (lv >= F.cost.length) return { ok: false, msg: '最大レベルです。' };
    const cost = F.cost[lv];
    if (S.money < cost) return { ok: false, msg: '資金が足りません。' };
    Game.spend('facility', cost);
    S.facilities[key] = lv + 1;
    Game.news(`${F.name}をLv${lv + 1}に拡張しました。`, 'info');
    Game.save();
    return { ok: true, msg: `${F.name}をLv${lv + 1}に拡張しました。` };
  },

  rename(hid, name) {
    const h = H(hid);
    name = (name || '').trim();
    if (!h || !name) return { ok: false, msg: '名前を入力してください。' };
    if (name.length > 12) return { ok: false, msg: '名前は12文字以内にしてください。' };
    if (Gen.usedNames.has(name) && h.name !== name) return { ok: false, msg: '同じ名前の馬が既にいます。' };
    if (h.record.starts > 0) return { ok: false, msg: 'デビュー後は改名できません。' };
    Gen.usedNames.delete(h.name);
    h.name = name;
    Gen.usedNames.add(name);
    Game.save();
    return { ok: true };
  },

  // ---- セーブ ----
  // オートセーブ（毎週）と、手動で使うスロット1〜5を持つ
  slotKey(id) { return SAVE_PREFIX + (id === 'auto' ? 'auto' : 'slot' + id); },

  readIndex() {
    try { return JSON.parse(localStorage.getItem(SAVE_PREFIX + 'index')) || {}; } catch (e) { return {}; }
  },
  writeIndex(idx) {
    try { localStorage.setItem(SAVE_PREFIX + 'index', JSON.stringify(idx)); } catch (e) { /* noop */ }
  },

  summary() {
    return {
      farm: S.farmName, y: S.year, w: S.week, money: S.money,
      horses: Game.mine().filter(h => h.role !== 'retired').length,
      honors: S.honors.length, g1: S.honors.filter(x => x.g === 'G1').length, at: Date.now(),
    };
  },

  write(id) {
    if (!S) return false;
    try {
      localStorage.setItem(Game.slotKey(id), JSON.stringify(S));
      const idx = Game.readIndex();
      idx[id] = Game.summary();
      Game.writeIndex(idx);
      return true;
    } catch (e) {
      return false;
    }
  },

  // オートセーブ
  save() {
    if (S && S.settings && S.settings.autosave === false) return true;
    const ok = Game.write('auto');
    if (!ok && !Game._warned) {
      Game._warned = true;
      Game.news('オートセーブに失敗しました（ブラウザの保存容量不足）。不要なスロットを削除してください。', 'bad');
    }
    return ok;
  },
  saveSlot(id) { return Game.write(id); },

  loadSlot(id) {
    try {
      const raw = localStorage.getItem(Game.slotKey(id));
      if (!raw) return false;
      S = JSON.parse(raw);
      S.settings = S.settings || {};
      Gen.rebuildNames();
      return true;
    } catch (e) { return false; }
  },

  deleteSlot(id) {
    try { localStorage.removeItem(Game.slotKey(id)); } catch (e) { /* noop */ }
    const idx = Game.readIndex();
    delete idx[id];
    Game.writeIndex(idx);
  },

  listSlots() {
    const idx = Game.readIndex();
    return ['auto'].concat(Array.from({ length: SAVE_SLOTS }, (_, i) => String(i + 1)))
      .map(id => ({ id, meta: idx[id] || null }));
  },

  hasAnySave() { return Game.listSlots().some(s => s.meta); },

  // 旧形式（1枠のみ）のセーブをオートセーブへ移す
  migrate() {
    try {
      const raw = localStorage.getItem(LEGACY_SAVE_KEY);
      if (!raw) return;
      if (!localStorage.getItem(Game.slotKey('auto'))) {
        S = JSON.parse(raw);
        Gen.rebuildNames();
        Game.write('auto');
        S = null;
      }
      localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch (e) { /* noop */ }
  },

  exportData() { return JSON.stringify(S); },
  importData(text) {
    const data = JSON.parse(text);
    if (!data || !data.horses || !data.year) throw new Error('セーブデータの形式が正しくありません');
    S = data;
    S.settings = S.settings || {};
    Gen.rebuildNames();
    Game.save();
  },
  toTitle() { S = null; },
};

// ローテーション（出走計画）
const Plan = {
  abs(y, w) { return y * 48 + w; },

  ageOk(h, a, y) {
    const age = y - h.birth;
    return a === '2' ? age === 2 : a === '3' ? age === 3 : a === '3+' ? age >= 3 : age >= 4;
  },

  // 今週から先の番組（年齢・性別で出走可能なもの）
  upcoming(h, weeks) {
    const out = [];
    const sy = S.year, sw = S.week;
    for (let i = 0; i < weeks; i++) {
      let y = sy, w = sw + i;
      while (w > 48) { w -= 48; y++; }
      for (const r of Race.program(y, w)) {
        if (!Race.ageSexOk(h, r, y)) continue;
        if (r.cls === 'debut' && h.record.starts > 0) continue;
        if (r.cls === 'maiden' && h.record.cls > 0) continue;
        // 見込みはレース時点の成長度で計算する
        S.year = y; S.week = w;
        const sc = Race.score(h, r, { ignoreCond: true });
        S.year = sy; S.week = sw;
        out.push({ y, w, r, ok: Race.classOk(h, r), out: sc - r.lv });
      }
    }
    return out;
  },

  classNote(h, g) {
    const need = (g.a === '2' || g.a === '3') ? 1 : 3;
    return h.record.cls >= need ? '' : `${CLASS_NAMES[need]}以上が必要`;
  },

  label(p) {
    if (p.n) return p.n;
    return `自己条件戦（${{ turf: '芝', dirt: 'ダート', any: '馬場問わず' }[p.surf || 'any']}）`;
  },

  whyNot(h, p) {
    if (h.inj > 0) return '故障中';
    if (h.rest > 0) return '放牧中';
    if (Gen.age(h) === 2 && S.week < 21) return '2歳馬のデビューは6月からです';
    if (p.n) {
      const g = GRADED.find(x => x.n === p.n);
      if (g && Plan.classNote(h, g)) return Plan.classNote(h, g);
    }
    if (p.c) return `出走条件（${Race.classReq({ cls: p.c, age: p.a })}）を満たしていません`;
    return '出走条件を満たしていません';
  },

  add(h, p) {
    h.plan = (h.plan || []).filter(x => !(x.y === p.y && x.w === p.w));
    h.plan.push(p);
    h.plan.sort((a, b) => Plan.abs(a.y, a.w) - Plan.abs(b.y, b.w));
    if (p.y === S.year && p.w === S.week) {
      const r = Race.findPlanned(h, p);
      if (r) S.entries[h.id] = r.id;
    }
    Game.save();
  },

  remove(h, i) {
    const p = h.plan[i];
    h.plan.splice(i, 1);
    if (p && p.y === S.year && p.w === S.week) delete S.entries[h.id];
    Game.save();
  },

  // 間隔が詰まりすぎている予定の警告
  warnings(h) {
    const ws = [];
    const pl = h.plan || [];
    for (let i = 1; i < pl.length; i++) {
      const gap = Plan.abs(pl[i].y, pl[i].w) - Plan.abs(pl[i - 1].y, pl[i - 1].w);
      if (gap <= 2) ws.push(`${Plan.label(pl[i - 1])} → ${Plan.label(pl[i])} は間隔が${gap === 1 ? '連闘' : '中1週'}です。疲労に注意してください。`);
    }
    return ws;
  },

  next(h) { return (h.plan || [])[0] || null; },

  // 1年分の空いている週を、一定間隔の自己条件戦で埋める
  fill(h, interval, surf, weeks = 48) {
    h.plan = h.plan || [];
    const now = Plan.abs(S.year, S.week);
    const start = Math.max(now, h.lastRace ? h.lastRace + interval : now, Gen.age(h) <= 2 ? S.year * 48 + 21 : now);
    let added = 0;
    for (let t = start; t < now + weeks; t++) {
      const y = Math.floor((t - 1) / 48), w = t - y * 48;
      const near = h.plan.some(p => Math.abs(Plan.abs(p.y, p.w) - t) < interval);
      if (near) continue;
      h.plan.push({ y, w, n: null, surf });
      added++;
    }
    h.plan.sort((a, b) => Plan.abs(a.y, a.w) - Plan.abs(b.y, b.w));
    const cur = h.plan.find(p => p.y === S.year && p.w === S.week);
    if (cur) { const r = Race.findPlanned(h, cur); if (r) S.entries[h.id] = r.id; }
    Game.save();
    return added;
  },

  clear(h) {
    h.plan = [];
    delete S.entries[h.id];
    Game.save();
  },
};
