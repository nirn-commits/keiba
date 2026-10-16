'use strict';

const TABS = [
  ['home', 'ホーム'], ['racers', '競走馬'], ['stock', '繁殖・幼駒'], ['breed', '種付け'],
  ['stallions', '種牡馬一覧'], ['market', '市場'], ['farm', '牧場経営'], ['records', '記録'], ['help', '遊び方'],
];

const UI = {
  tab: 'home',
  breed: { mare: null, sire: null, root: '', sort: 'stars' },
  stal: { root: '', sort: 'fee' },
  onModalClose: null,

  // ---------- 共通部品 ----------
  esc: U.esc,
  grade(v) { return `<span class="grade ${U.gradeCls(v)}">${U.grade(v)}</span>`; },
  rootBadge(root) { const R = ROOTS[root]; return `<span class="root-badge" style="background:${R.color}">${R.name}</span>`; },
  factors(h) { return (h.factors || []).map(f => `<span class="factor" title="${STAT_NAMES[f]}因子">${FACTOR_LABEL[f]}</span>`).join(''); },
  hlink(h) { return h ? `<a class="link" data-act="horse" data-id="${h.id}">${U.esc(h.name)}</a>` : '<span class="muted">—</span>'; },
  cond(c) { return `<span class="cond c${c}">${['↓', '↘', '→', '↗', '↑'][c + 2]}</span>`; },
  raceBadge(cls) {
    const map = { G1: 'g1', G2: 'g2', G3: 'g3', op: 'op' };
    return map[cls] ? `<span class="badge ${map[cls]}">${RACE_CLS[cls].name}</span>` : `<span class="badge gray">${RACE_CLS[cls].name}</span>`;
  },
  stars(n) { return `<span class="stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`; },
  clsLabel(h) { return CLASS_NAMES[h.record.cls]; },
  recStr(rec) { return `${rec.starts}戦${rec.wins}勝 [${rec.wins}-${rec.p2}-${rec.p3}-${rec.starts - rec.wins - rec.p2 - rec.p3}]`; },
  distStr(h) { return `${h.dMin}〜${h.dMax}m`; },
  surfStr(h) { return `芝${Gen.aptMark(Gen.surfScore(h, 'turf'))} ダ${Gen.aptMark(Gen.surfScore(h, 'dirt'))}`; },
  parentsStr(h) {
    const s = H(h.sire), d = H(h.dam), ds = d ? H(d.sire) : null;
    return `<span class="small">父 ${UI.hlink(s)}<br>母 ${UI.hlink(d)}${ds ? `（母父 ${U.esc(ds.name)}）` : ''}</span>`;
  },
  gradesRow(h, useEst) {
    return ALL_STATS.map(s => UI.grade(useEst ? Gen.est(h, s) : h.pot[s])).join(' ');
  },
  growthStr(h) { return Gen.uncertainty(h) >= 8 ? '？' : GROWTH[h.growth].name; },

  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => el.classList.add('hidden'), 2800);
  },

  modal(html, onClose) {
    if (UI.onModalClose) { const f = UI.onModalClose; UI.onModalClose = null; f(); }
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').classList.remove('hidden');
    UI.onModalClose = onClose || null;
  },
  closeModal() {
    document.getElementById('modal').classList.add('hidden');
    if (UI.onModalClose) UI.onModalClose();
    UI.onModalClose = null;
  },

  // ---------- 描画 ----------
  render() {
    if (!S) { UI.renderTitle(); return; }
    document.getElementById('farmName').textContent = S.farmName;
    document.getElementById('dateLabel').textContent = U.dateStr(S.year, S.week);
    const sl = document.getElementById('seasonLabel');
    sl.textContent = Game.isSeason() ? '種付けシーズン' : (S.week >= 21 && S.week <= 48 ? 'デビュー可能期' : 'オフ期');
    sl.style.display = '';
    const ml = document.getElementById('moneyLabel');
    ml.textContent = '所持金 ' + U.money(S.money);
    ml.classList.toggle('neg', S.money < 0);
    document.getElementById('btnNext').style.display = '';
    document.getElementById('btnSave').style.display = '';
    document.getElementById('tabs').innerHTML = TABS.map(([k, n]) =>
      `<button data-act="tab" data-tab="${k}" class="${UI.tab === k ? 'active' : ''}">${n}</button>`).join('');
    const v = document.getElementById('view');
    v.innerHTML = UI.views[UI.tab]();
  },

  renderTitle() {
    const slots = Game.listSlots();
    const auto = slots[0].meta;
    const any = slots.some(x => x.meta);
    document.getElementById('farmName').textContent = 'ダービー牧場物語';
    document.getElementById('btnSave').style.display = 'none';
    document.getElementById('tabs').innerHTML = '';
    document.getElementById('btnNext').style.display = 'none';
    document.getElementById('dateLabel').textContent = '';
    document.getElementById('seasonLabel').style.display = 'none';
    document.getElementById('moneyLabel').textContent = '';
    document.getElementById('view').innerHTML = `
      <div class="card title-screen">
        <div style="font-size:48px">🐎</div>
        <h1>ダービー牧場物語</h1>
        <p class="muted">配合理論で名馬を生み出す、競馬経営シミュレーション</p>
        ${auto || any ? `<div class="row" style="justify-content:center;margin:14px 0">
          ${auto ? `<button class="btn primary big" data-act="loadSlot" data-id="auto">つづきから</button>` : ''}
          ${any ? '<button class="btn big" data-act="slots">ロード</button>' : ''}
        </div>
        ${auto ? `<div class="small muted">オートセーブ: ${UI.slotSummary(auto)}</div>` : ''}
        <hr style="border:none;border-top:1px solid var(--line);margin:16px 0">
        <div class="small muted">新しい牧場をはじめる</div>` : ''}
        <div class="field"><label>牧場名</label><input type="text" id="inFarm" value="袋井ファーム" maxlength="16"></div>
        <div class="field"><label>冠名（生産馬の名前の頭につきます。空欄でも可）</label><input type="text" id="inKan" value="" maxlength="6" placeholder="例: フクロイ"></div>
        <button class="btn primary big" data-act="start">はじめから</button>
        <p class="small muted" style="margin-top:12px">${auto ? 'はじめからを選ぶと、オートセーブは新しい牧場で上書きされます。残したい進行はスロットにセーブしておいてください。' : 'データはブラウザに保存されます。'}</p>
      </div>`;
  },

  views: {
    home() {
      const entries = Object.entries(S.entries).map(([hid, rid]) => ({ h: H(+hid), r: S.weekRaces.find(x => x.id === rid) })).filter(x => x.h && x.r);
      const graded = S.weekRaces.filter(r => RACE_CLS[r.cls].rank >= 5);
      const rep = S.lastReport;
      const racers = Game.mine('racing'), mares = Game.mine('mare'), foals = Game.mine('foal');
      const pregN = mares.filter(m => m.preg).length;
      const upcoming = [];
      for (let i = 1; i <= 4; i++) {
        let w = S.week + i;
        if (w > 48) w -= 48;
        GRADED.filter(g => (g.m - 1) * 4 + g.w === w && g.g === 'G1').forEach(g => upcoming.push(`${g.m}月${g.w}週 ${g.n}`));
      }
      return `
      <div class="grid2">
        <div>
          <div class="card">
            <h2>今週の出走予定 <span class="muted small">${U.dateStr(S.year, S.week)}</span></h2>
            ${entries.length ? `<div class="table-wrap"><table class="list"><tr><th>馬名</th><th>レース</th><th>見込み</th></tr>
              ${entries.map(({ h, r }) => `<tr><td>${UI.hlink(h)}</td><td>${UI.raceBadge(r.cls)} ${U.esc(r.name)} <span class="muted small">${r.surf === 'turf' ? '芝' : 'ダ'}${r.dist}m</span></td><td>${Race.outlook(h, r).sym}</td></tr>`).join('')}
              </table></div>` : '<div class="empty-note">今週出走する馬はいません</div>'}
            ${graded.length ? `<h3>今週の重賞</h3>${graded.map(r => `<div>${UI.raceBadge(r.cls)} ${U.esc(r.name)} <span class="muted small">${r.surf === 'turf' ? '芝' : 'ダ'}${r.dist}m ${{ '2': '2歳', '3': '3歳', '3+': '3歳以上', '4+': '4歳以上' }[r.age]}${r.sex ? '牝' : ''}</span></div>`).join('')}` : ''}
            ${upcoming.length ? `<h3>近日のGI</h3><div class="small">${upcoming.map(U.esc).join(' / ')}</div>` : ''}
            <div class="row" style="margin-top:10px"><button class="btn" data-act="tab" data-tab="racers">出走を調整する</button></div>
          </div>
          ${rep ? `<div class="card">
            <h2>先週の結果 <span class="muted small">${U.dateStr(rep.y, rep.w)}</span></h2>
            ${UI.reportBody(rep)}
          </div>` : ''}
        </div>
        <div>
          <div class="card">
            <h2>牧場の状況</h2>
            <dl class="kv">
              <dt>所持金</dt><dd><b>${U.money(S.money)}</b></dd>
              <dt>競走馬</dt><dd>${racers.length}頭</dd>
              <dt>繁殖牝馬</dt><dd>${mares.length} / ${Game.barnCap()}頭（受胎 ${pregN}頭）</dd>
              <dt>幼駒</dt><dd>${foals.length}頭</dd>
              <dt>種牡馬</dt><dd>${Game.mine('stallion').length}頭</dd>
              <dt>重賞勝利</dt><dd>${S.honors.length}勝（GI ${S.honors.filter(x => x.g === 'G1').length}勝）</dd>
            </dl>
            ${Game.isSeason() ? `<div class="comment good" style="margin-top:8px">種付けシーズン中です（5月4週まで）。空胎の繁殖牝馬: ${mares.filter(m => !m.preg && Gen.age(m) >= 3).length}頭</div>` : ''}
          </div>
          <div class="card">
            <h2>ニュース</h2>
            <ul class="news">${S.news.map(n => `<li class="${n.k}"><span class="d">${U.dateStr(n.y, n.w)}</span>${U.esc(n.t)}</li>`).join('')}</ul>
          </div>
        </div>
      </div>`;
    },

    racers() {
      const list = Game.mine('racing').sort((a, b) => a.birth - b.birth || b.record.earn - a.record.earn);
      if (!list.length) return '<div class="card"><div class="empty-note">競走馬がいません。幼駒は2歳の1月に入厩します。市場で1歳馬を購入することもできます。</div></div>';
      return `<div class="card">
        <h2>競走馬 <span class="muted small">${list.length}頭 / 2歳馬は6月からデビュー可能</span></h2>
        <div class="table-wrap"><table class="list">
          <tr><th>馬名</th><th>性齢</th><th>クラス</th><th>成績</th><th>現在能力</th><th>適性</th><th>調子</th><th>疲労</th><th>調教</th><th>今週の出走</th><th>ローテ</th><th>出走方針</th><th></th></tr>
          ${list.map(h => {
            const elig = S.weekRaces.filter(r => Race.eligible(h, r)).sort((a, b) => RACE_CLS[b.cls].rank - RACE_CLS[a.cls].rank);
            const cur = S.entries[h.id] || '';
            let state = '';
            if (h.inj > 0) state = `<span class="badge danger">故障 残${h.inj}週</span>`;
            else if (h.rest > 0) state = `<span class="badge gray">放牧中 残${h.rest}週</span>`;
            const sel = state || `<select data-chg="entry" data-id="${h.id}"><option value="">出走しない</option>${elig.map(r => {
              const o = Race.outlook(h, r);
              return `<option value="${r.id}" ${cur === r.id ? 'selected' : ''}>${o.sym} ${U.esc(Race.label(r))}</option>`;
            }).join('')}</select>`;
            return `<tr>
              <td>${UI.hlink(h)} ${h.record.g1 ? `<span class="badge g1">GI ${h.record.g1}勝</span>` : ''}</td>
              <td class="nowrap">${Gen.sexLabel(h)}${Gen.age(h)}</td>
              <td class="nowrap">${UI.clsLabel(h)}</td>
              <td class="nowrap small">${h.record.starts}戦${h.record.wins}勝<br>${U.money(h.record.earn)}</td>
              <td>${UI.grade(Gen.curRating(h))}</td>
              <td class="small nowrap">${UI.distStr(h)}<br>${UI.surfStr(h)}</td>
              <td>${UI.cond(h.cond)}</td>
              <td><div class="bar fat" title="${Math.round(h.fat)}"><span style="width:${h.fat}%"></span></div></td>
              <td><select data-chg="intensity" data-id="${h.id}">${Object.entries(INTENSITY).map(([k, v]) => `<option value="${k}" ${h.intensity === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></td>
              <td>${sel}</td>
              <td class="small">${UI.nextPlan(h)}<br><button class="btn sm" data-act="rotation" data-id="${h.id}">ローテ設定</button></td>
              <td><select data-chg="mode" data-id="${h.id}">${[['auto', '自動'], ['plan', 'ローテのみ'], ['manual', '手動']].map(([k, n]) => `<option value="${k}" ${Game.mode(h) === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
              <td class="nowrap">${h.inj > 0 || h.rest > 0 ? '' : `<button class="btn sm" data-act="rest" data-id="${h.id}">放牧</button>`}
                <button class="btn sm" data-act="retireDlg" data-id="${h.id}">引退</button></td>
            </tr>`;
          }).join('')}
        </table></div>
        <p class="small muted">出走方針 — 自動: ローテの予定を優先し、空いた週は適したレースを自動で選びます（目標レースの3週前からは調整に専念）。ローテのみ: 予定したレースだけに出走します。手動: ローテの予定以外は毎週ご自身で選びます。<br>見込み: ◎勝ち負け ○上位争い ▲掲示板 △苦戦 ×厳しい。疲労が溜まると成績が落ち、故障しやすくなります。調教「強め」は成長が早い反面、疲労と故障リスクが増えます。</p>
      </div>`;
    },

    stock() {
      const mares = Game.mine('mare').sort((a, b) => a.birth - b.birth);
      const foals = Game.mine('foal').sort((a, b) => a.birth - b.birth);
      const studs = Game.mine('stallion');
      return `
      <div class="card">
        <h2>繁殖牝馬 <span class="muted small">${mares.length} / ${Game.barnCap()}頭</span></h2>
        ${mares.length ? `<div class="table-wrap"><table class="list">
          <tr><th>馬名</th><th>年齢</th><th>血統</th><th>能力</th><th>因子</th><th>距離/馬場</th><th>状態</th><th>産駒</th><th></th></tr>
          ${mares.map(m => {
            const off = Gen.offspring(m.id);
            return `<tr>
              <td>${UI.hlink(m)}</td><td>${Gen.age(m)}歳</td><td>${UI.parentsStr(m)}</td>
              <td>${UI.grade(Gen.rating(m))}</td><td>${UI.factors(m)}</td>
              <td class="small">${UI.distStr(m)}<br>${UI.surfStr(m)}</td>
              <td>${m.preg ? `<span class="badge">受胎</span> <span class="small">${U.esc(H(m.preg.sire) ? H(m.preg.sire).name : '?')}</span>` : '<span class="badge gray">空胎</span>'}</td>
              <td class="small">${off.length}頭</td>
              <td class="nowrap">${!m.preg && Game.isSeason() ? `<button class="btn sm primary" data-act="goBreed" data-id="${m.id}">種付け</button>` : ''}
                <button class="btn sm" data-act="sellDlg" data-id="${m.id}">売却</button></td>
            </tr>`;
          }).join('')}</table></div>` : '<div class="empty-note">繁殖牝馬がいません。市場で購入するか、牝馬を引退させて繁殖入りさせましょう。</div>'}
      </div>
      <div class="card">
        <h2>幼駒 <span class="muted small">2歳の1月に入厩します</span></h2>
        ${foals.length ? `<div class="table-wrap"><table class="list">
          <tr><th>馬名</th><th>性齢</th><th>血統</th><th>推定能力（速 持 力 瞬 根 賢 健）</th><th>成長</th><th>評価額</th><th></th></tr>
          ${foals.map(f => `<tr>
            <td>${UI.hlink(f)} ${f.flags.includes('miracle') ? '<span class="badge">✨</span>' : ''}${f.flags.includes('weak') ? '<span class="badge danger">虚弱</span>' : ''}</td>
            <td>${Gen.sexLabel(f)}${Gen.ageLabel(f)}</td><td>${UI.parentsStr(f)}</td>
            <td class="nowrap">${UI.gradesRow(f, true)}</td><td>${UI.growthStr(f)}</td>
            <td class="nowrap small">${U.money(Gen.value(f))}</td>
            <td class="nowrap"><button class="btn sm" data-act="renameDlg" data-id="${f.id}">命名</button>
              <button class="btn sm" data-act="sellDlg" data-id="${f.id}">売却</button></td>
          </tr>`).join('')}</table></div>` : '<div class="empty-note">幼駒はいません。</div>'}
        <p class="small muted">幼駒の能力は推定値です。成長するほど正確に見えるようになります。</p>
      </div>
      ${studs.length ? `<div class="card"><h2>所有種牡馬</h2><div class="table-wrap"><table class="list">
        <tr><th>馬名</th><th>年齢</th><th>系統</th><th>種付料</th><th>昨年の種付頭数</th><th>産駒重賞</th><th></th></tr>
        ${studs.map(s => `<tr><td>${UI.hlink(s)}</td><td>${Gen.age(s)}歳</td><td>${UI.rootBadge(s.root)} <span class="small">${U.esc(Gen.lineName(s))}</span></td>
          <td>${U.money(s.fee)}</td><td>${s.books || '—'}</td><td>${s.offG || 0}勝（GI ${s.offG1 || 0}）</td>
          <td><button class="btn sm" data-act="sellDlg" data-id="${s.id}">売却</button></td></tr>`).join('')}
      </table></div><p class="small muted">所有種牡馬は自分の繁殖牝馬に無料で種付けでき、毎年5月末に外部からの種付料収入が入ります。</p></div>` : ''}`;
    },

    breed() {
      const B = UI.breed;
      const mares = Game.mine('mare').filter(m => Gen.age(m) >= 3);
      if (B.mare && !mares.find(m => m.id === B.mare)) B.mare = null;
      if (!B.mare) {
        const open = mares.find(m => !m.preg);
        if (open) B.mare = open.id;
      }
      const mare = H(B.mare);
      let html = `<div class="card">
        <h2>種付け ${Game.isSeason() ? '<span class="badge">シーズン中</span>' : '<span class="badge gray">シーズン外（2月2週〜5月4週）・シミュレーションのみ</span>'}</h2>
        ${mares.length ? `<div class="mare-pick">${mares.map(m => `<div class="mp ${B.mare === m.id ? 'sel' : ''} ${m.preg ? 'dis' : ''}" data-act="pickMare" data-id="${m.id}">
          <b>${U.esc(m.name)}</b> <span class="small muted">${Gen.age(m)}歳</span><br>
          <span class="small">${UI.grade(Gen.rating(m))} ${UI.rootBadge(m.root)}</span><br>
          <span class="small">${m.preg ? '受胎済: ' + U.esc(H(m.preg.sire) ? H(m.preg.sire).name : '') : '空胎'}</span></div>`).join('')}</div>`
        : '<div class="empty-note">繁殖牝馬がいません。</div>'}
      </div>`;
      if (!mare) return html;

      const roots = Object.keys(ROOTS);
      let rows = S.stallions.map(id => H(id)).filter(s => s && s.id !== mare.sire && (!B.root || s.root === B.root))
        .map(s => ({ s, ev: Gen.evaluate(s.id, mare.id) }));
      const sorters = {
        stars: (a, b) => b.ev.explosive - a.ev.explosive,
        exp: (a, b) => b.ev.expRating - a.ev.expRating,
        fee: (a, b) => b.s.fee - a.s.fee,
        feeAsc: (a, b) => a.s.fee - b.s.fee,
        rating: (a, b) => Gen.rating(b.s) - Gen.rating(a.s),
      };
      rows.sort(sorters[B.sort] || sorters.stars);
      html += `<div class="card">
        <h2>種牡馬を選ぶ <span class="muted small">相手: ${U.esc(mare.name)}（${UI.rootBadge(mare.root)}）</span></h2>
        <div class="row" style="margin-bottom:8px">
          <select data-chg="breedRoot"><option value="">全系統</option>${roots.map(k => `<option value="${k}" ${B.root === k ? 'selected' : ''}>${ROOTS[k].name}</option>`).join('')}</select>
          <select data-chg="breedSort">
            ${[['stars', '配合評価順'], ['exp', '期待値順'], ['rating', '能力順'], ['fee', '種付料が高い順'], ['feeAsc', '種付料が安い順']].map(([k, n]) => `<option value="${k}" ${B.sort === k ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="table-wrap" style="max-height:420px;overflow-y:auto"><table class="list">
          <tr><th>種牡馬</th><th>年齢</th><th>系統</th><th>種付料</th><th>能力</th><th>因子</th><th>距離/馬場</th><th>配合評価</th><th>期待値</th><th>主なクロス</th></tr>
          ${rows.map(({ s, ev }) => `<tr class="click ${B.sire === s.id ? 'sel' : ''}" data-act="pickSire" data-id="${s.id}">
            <td><b>${U.esc(s.name)}</b>${s.owner === 'player' ? ' <span class="badge">自家</span>' : ''}</td>
            <td>${Gen.age(s)}</td><td>${UI.rootBadge(s.root)}<br><span class="small muted">${U.esc(Gen.lineName(s))}</span></td>
            <td class="nowrap">${s.owner === 'player' ? '無料' : U.money(s.fee)}</td>
            <td>${UI.grade(Gen.rating(s))}</td><td>${UI.factors(s)}</td>
            <td class="small nowrap">${UI.distStr(s)}<br>${UI.surfStr(s)}</td>
            <td>${UI.stars(ev.stars)}${ev.risk >= 3 ? ' <span class="badge danger">危険</span>' : ev.risk >= 1 ? ' <span class="badge warn">注意</span>' : ''}${ev.nick ? ' <span class="badge">ニックス</span>' : ''}</td>
            <td>${UI.grade(ev.expRating)}</td>
            <td class="small">${ev.inbreeds.slice(0, 2).map(i => `${U.esc(i.name)} ${i.label}`).join('<br>') || '—'}</td>
          </tr>`).join('')}
        </table></div>
      </div>`;
      if (B.sire && H(B.sire)) html += UI.matingPanel(H(B.sire), mare);
      return html;
    },

    stallions() {
      const T = UI.stal;
      let list = S.stallions.map(id => H(id)).filter(s => s && (!T.root || s.root === T.root));
      const sorters = {
        fee: (a, b) => b.fee - a.fee, rating: (a, b) => Gen.rating(b) - Gen.rating(a),
        age: (a, b) => b.birth - a.birth, root: (a, b) => a.root.localeCompare(b.root) || b.fee - a.fee,
      };
      list.sort(sorters[T.sort] || sorters.fee);
      return `<div class="card">
        <h2>種牡馬一覧 <span class="muted small">${list.length}頭</span></h2>
        <div class="row" style="margin-bottom:8px">
          <select data-chg="stalRoot"><option value="">全系統</option>${Object.keys(ROOTS).map(k => `<option value="${k}" ${T.root === k ? 'selected' : ''}>${ROOTS[k].name}</option>`).join('')}</select>
          <select data-chg="stalSort">${[['fee', '種付料順'], ['rating', '能力順'], ['age', '若い順'], ['root', '系統順']].map(([k, n]) => `<option value="${k}" ${T.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>
        <div class="table-wrap"><table class="list">
          <tr><th>種牡馬</th><th>年齢</th><th>親系統 / 系統</th><th>種付料</th><th>能力</th><th>因子</th><th>距離</th><th>馬場</th><th>成長</th><th>主な勝鞍</th></tr>
          ${list.map(s => `<tr>
            <td>${UI.hlink(s)}${s.owner === 'player' ? ' <span class="badge">自家</span>' : ''}</td><td>${Gen.age(s)}</td>
            <td>${UI.rootBadge(s.root)}<br><span class="small muted">${U.esc(Gen.lineName(s))}</span></td>
            <td class="nowrap">${U.money(s.fee)}</td><td>${UI.grade(Gen.rating(s))}</td><td>${UI.factors(s)}</td>
            <td class="small nowrap">${UI.distStr(s)}</td><td class="small nowrap">${UI.surfStr(s)}</td><td>${GROWTH[s.growth].name}</td>
            <td class="small">${s.record.graded.filter(g => g.g === 'G1').slice(0, 2).map(g => U.esc(g.n)).join('、') || (s.record.graded[0] ? U.esc(s.record.graded[0].n) : '—')}</td>
          </tr>`).join('')}
        </table></div>
      </div>
      <div class="card"><h2>親系統とニックス</h2>
        <div class="row">${Object.keys(ROOTS).map(k => UI.rootBadge(k)).join(' ')}</div>
        <h3>ニックス（父系統 × 母父系統）</h3>
        <div class="small">${Object.entries(NICKS).map(([k, v]) => { const [a, b] = k.split('>'); return `<div>${ROOTS[a].name} × ${ROOTS[b].name} <span class="stars">${'★'.repeat(v - 1)}</span></div>`; }).join('')}</div>
      </div>`;
    },

    market() {
      const mares = S.market.mares.map(id => H(id)).filter(Boolean);
      const ys = S.market.yearlings.map(id => H(id)).filter(Boolean);
      const full = Game.mine('mare').length >= Game.barnCap();
      return `<div class="card">
        <h2>繁殖牝馬セール <span class="muted small">毎年1月に入れ替わります</span></h2>
        ${full ? '<div class="comment warn">繁殖厩舎が満杯です。購入するには施設を拡張してください。</div>' : ''}
        ${mares.length ? `<div class="table-wrap"><table class="list">
          <tr><th>馬名</th><th>年齢</th><th>血統</th><th>能力</th><th>因子</th><th>距離/馬場</th><th>価格</th><th></th></tr>
          ${mares.map(m => `<tr><td>${UI.hlink(m)}</td><td>${Gen.age(m)}歳</td><td>${UI.parentsStr(m)}</td><td>${UI.gradesRow(m, false)}</td>
            <td>${UI.factors(m)}</td><td class="small nowrap">${UI.distStr(m)}<br>${UI.surfStr(m)}</td>
            <td class="nowrap"><b>${U.money(Game.buyPrice(m))}</b></td>
            <td><button class="btn sm primary" data-act="buy" data-id="${m.id}" ${full ? 'disabled' : ''}>購入</button></td></tr>`).join('')}
        </table></div>` : '<div class="empty-note">売り物はありません。</div>'}
      </div>
      <div class="card">
        <h2>1歳馬セール <span class="muted small">購入すると来年1月に入厩します</span></h2>
        ${ys.length ? `<div class="table-wrap"><table class="list">
          <tr><th>馬名</th><th>性</th><th>血統</th><th>推定能力（速 持 力 瞬 根 賢 健）</th><th>価格</th><th></th></tr>
          ${ys.map(h => `<tr><td>${UI.hlink(h)}</td><td>${Gen.sexLabel(h)}</td><td>${UI.parentsStr(h)}</td><td class="nowrap">${UI.gradesRow(h, true)}</td>
            <td class="nowrap"><b>${U.money(Game.buyPrice(h))}</b></td>
            <td><button class="btn sm primary" data-act="buy" data-id="${h.id}">購入</button></td></tr>`).join('')}
        </table></div>` : '<div class="empty-note">売り物はありません。</div>'}
      </div>`;
    },

    farm() {
      const f = S.finance[S.year] || {}, pf = S.finance[S.year - 1] || {};
      const cats = [['prize', '賞金収入'], ['stud', '種付料収入'], ['sales', '売却収入'], ['fee', '種付料支払'], ['purchase', '馬の購入'], ['upkeep', '預託料・飼育費'], ['facility', '施設投資']];
      const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
      return `<div class="grid2">${Object.entries(FACILITIES).map(([k, F]) => {
        const lv = S.facilities[k];
        const max = lv >= F.cost.length;
        return `<div class="card fac-card">
          <h2>${F.name} <span class="lv">Lv${lv}</span></h2>
          <div class="small muted">${F.desc}</div>
          <div style="margin:6px 0">現在: ${F.effect(lv)}${max ? '' : `<br>次: ${F.effect(lv + 1)}`}</div>
          ${max ? '<span class="badge">最大</span>' : `<button class="btn primary" data-act="upgrade" data-key="${k}" ${S.money < F.cost[lv] ? 'disabled' : ''}>拡張する（${U.money(F.cost[lv])}）</button>`}
        </div>`;
      }).join('')}</div>
      <div class="grid2">
        <div class="card"><h2>収支</h2>
          <div class="table-wrap"><table class="list"><tr><th>項目</th><th class="right">${S.year}年</th><th class="right">${S.year - 1}年</th></tr>
          ${cats.map(([k, n]) => `<tr><td>${n}</td><td class="right">${U.money(f[k] || 0)}</td><td class="right">${U.money(pf[k] || 0)}</td></tr>`).join('')}
          <tr><td><b>合計</b></td><td class="right"><b>${U.money(sum(f))}</b></td><td class="right"><b>${U.money(sum(pf))}</b></td></tr></table></div>
        </div>
        <div class="card"><h2>設定・データ</h2>
          <div class="row"><label class="small muted" style="width:60px">牧場名</label><input type="text" id="setFarm" value="${U.esc(S.farmName)}" maxlength="16"></div>
          <div class="row" style="margin-top:6px"><label class="small muted" style="width:60px">冠名</label><input type="text" id="setKan" value="${U.esc(S.kanmei)}" maxlength="6"></div>
          <div class="row" style="margin-top:8px"><button class="btn" data-act="saveSettings">設定を保存</button></div>
          <h3>セーブデータ</h3>
          <div class="row">
            <button class="btn primary" data-act="slots">セーブ / ロード</button>
            <label class="small"><input type="checkbox" data-chg="autosave" ${S.settings && S.settings.autosave === false ? '' : 'checked'}> 毎週オートセーブする</label>
          </div>
          <div class="row" style="margin-top:8px">
            <button class="btn" data-act="export">ファイルに書き出す</button>
            <button class="btn" data-act="importDlg">ファイルから読み込む</button>
            <button class="btn" data-act="titleDlg">タイトルに戻る</button>
          </div>
          <p class="small muted">セーブデータはこのブラウザ内に保存されます。オートセーブ1枠と、手動で使えるスロット${SAVE_SLOTS}枠があります。別の端末に移すときは「ファイルに書き出す」をお使いください。</p>
        </div>
      </div>`;
    },

    records() {
      const years = Object.keys(S.yearStats).map(Number).sort((a, b) => b - a);
      const honors = S.honors.slice().reverse();
      const stars = Object.values(S.horses).filter(h => (h.bred || h.owner === 'player') && h.record.starts > 0)
        .sort((a, b) => b.record.earn - a.record.earn).slice(0, 15);
      return `<div class="grid2">
        <div class="card"><h2>年度別成績</h2>
          ${years.length ? `<div class="table-wrap"><table class="list"><tr><th>年</th><th>出走</th><th>勝利</th><th>重賞</th><th>GI</th><th>生産</th><th>獲得賞金</th></tr>
          ${years.map(y => { const s = S.yearStats[y]; return `<tr><td>${y}</td><td>${s.starts}</td><td>${s.wins}</td><td>${s.gw}</td><td>${s.g1}</td><td>${s.births}</td><td>${U.money(s.earn)}</td></tr>`; }).join('')}
          </table></div>` : '<div class="empty-note">まだ記録はありません。</div>'}
        </div>
        <div class="card"><h2>獲得賞金ランキング</h2>
          ${stars.length ? `<div class="table-wrap"><table class="list"><tr><th>#</th><th>馬名</th><th>成績</th><th>重賞</th><th>獲得賞金</th></tr>
          ${stars.map((h, i) => `<tr><td>${i + 1}</td><td>${UI.hlink(h)}</td><td class="small">${h.record.starts}戦${h.record.wins}勝</td><td>${h.record.gw}（GI ${h.record.g1}）</td><td>${U.money(h.record.earn)}</td></tr>`).join('')}
          </table></div>` : '<div class="empty-note">まだ記録はありません。</div>'}
        </div>
      </div>
      <div class="card"><h2>重賞勝利の歴史 <span class="muted small">${S.honors.length}勝</span></h2>
        ${honors.length ? `<div class="table-wrap"><table class="list"><tr><th>年月</th><th>レース</th><th>勝ち馬</th></tr>
        ${honors.map(x => `<tr><td class="nowrap">${U.dateStr(x.y, x.w)}</td><td>${UI.raceBadge(x.g)} ${U.esc(x.n)}</td><td>${H(x.hid) ? UI.hlink(H(x.hid)) : U.esc(x.horse)}</td></tr>`).join('')}
        </table></div>` : '<div class="empty-note">重賞制覇を目指しましょう！</div>'}
      </div>`;
    },

    help() {
      return `<div class="card help">
        <h2>遊び方</h2>
        <ol>
          <li><b>週を進める</b> — 右上の「次の週へ」で1週間進みます。1年は48週（各月4週）です。</li>
          <li><b>競走馬</b> — 「自動」にチェックがあると、能力・適性・疲労を見て出走レースを自動で選びます。手動で変更も可能です。疲労が溜まったら「放牧」で回復させましょう。</li>
          <li><b>クラス</b> — 未勝利 → 1勝 → 2勝 → 3勝 → オープン。2・3歳限定の重賞は1勝以上、古馬の重賞は3勝クラス以上で出走できます。</li>
          <li><b>種付け</b> — 2月2週〜5月4週がシーズンです。仔は翌年2月に生まれ、2歳の1月に入厩、6月からデビューします。</li>
          <li><b>引退</b> — 牝馬は繁殖牝馬に、重賞勝ちや高能力の牡馬は種牡馬になれます。自家種牡馬は種付け無料で、毎年種付料収入も入ります。</li>
        </ol>
        <h2>配合理論</h2>
        <ul>
          <li><b>インブリード</b> — 父側と母側の両方に同じ祖先がいる状態。「3×4」のように父側・母側の世代で表します。3×4・4×4あたりは爆発力が高く、2×3など近すぎると虚弱な仔が生まれる危険があります。</li>
          <li><b>因子</b> — 活躍した名馬が持つ能力の素質（速=スピード、持=スタミナ、力=パワー、瞬=瞬発力、根=根性、賢=賢さ、健=健康）。血統表の3代以内にあると仔の該当能力が伸びやすく、因子持ちの馬をクロスするとさらに効果的です。GIを勝って引退した馬は因子を得ます。</li>
          <li><b>ニックス</b> — 父の親系統と母父の親系統の相性。成立すると爆発力が上がります（「種牡馬一覧」で確認できます）。</li>
          <li><b>活力補完</b> — 父・母父・父の母父・母の母父の親系統がすべて異なると成立。健康な仔が生まれやすくなります。</li>
          <li><b>爆発力</b> — これらの合計。★が多いほど両親を超える仔が出やすくなり、稀に「見事な配合」で大物が生まれます。</li>
          <li><b>系統確立</b> — 産駒がGIを3勝すると、その種牡馬は自身の系統を確立します。</li>
        </ul>
        <h2>能力の見かた</h2>
        <p>S+ / S / A / B / C / D / E / F の8段階。若駒の能力は推定値で、成長とともに正確になります。成長型（早熟・普通・晩成）によってピークの時期が異なります。</p>
      </div>`;
    },
  },

  reportBody(rep) {
    let html = '';
    if (rep.races.length) {
      html += `<div class="table-wrap"><table class="list"><tr><th>レース</th><th>馬名</th><th>着順</th><th>賞金</th><th></th></tr>`;
      rep.races.forEach((e, i) => {
        e.players.forEach((p, j) => {
          html += `<tr><td>${j === 0 ? `${UI.raceBadge(e.race.cls)} ${U.esc(e.race.name)} <span class="muted small">${e.race.surf === 'turf' ? '芝' : 'ダ'}${e.race.dist}m</span>` : ''}</td>
            <td>${H(p.hid) ? UI.hlink(H(p.hid)) : U.esc(p.name)}${p.injury ? ` <span class="badge danger">${p.injury}</span>` : ''}</td>
            <td class="${p.pos === 1 ? 'pos-1' : ''}">${p.pos}着 <span class="muted small">/${e.sim.n}</span></td>
            <td class="small">${p.prize ? U.money(p.prize) : '—'}</td>
            <td>${j === 0 ? `<button class="btn sm" data-act="watch" data-i="${i}">観戦</button>` : ''}</td></tr>`;
        });
      });
      html += '</table></div>';
    }
    if (rep.events.length) html += `<ul class="news" style="margin-top:8px">${rep.events.map(t => `<li>${U.esc(t)}</li>`).join('')}</ul>`;
    if (!html) html = '<div class="empty-note">特に出来事はありませんでした。</div>';
    return html;
  },

  raceResultTable(entry) {
    const res = entry.sim.res;
    return `<h3>結果</h3><div class="table-wrap"><table class="list">
      <tr><th>着</th><th>馬番</th><th>馬名</th><th>脚質</th><th>タイム</th><th>着差</th></tr>
      ${res.map(e => `<tr class="${e.isPlayer ? 'me' : ''}"><td class="${e.pos === 1 ? 'pos-1' : ''}">${e.pos}</td><td>${e.gate}</td>
        <td>${e.isPlayer && H(e.hid) ? UI.hlink(H(e.hid)) : U.esc(e.name)}</td><td>${e.style}</td><td>${Race.timeText(e.time)}</td><td>${e.margin}</td></tr>`).join('')}
    </table></div>`;
  },

  // 血統表（5代）
  pedigree(sireId, damId, crossIds) {
    const G = 5, rows = Array.from({ length: 32 }, () => []);
    const cross = new Set(crossIds || []);
    const place = (id, gen, row) => {
      const span = Math.pow(2, G - gen);
      const h = H(id);
      if (!h) {
        rows[row].push(`<td rowspan="${span}" class="empty">${id != null ? '（不明）' : '—'}</td>`);
      } else {
        const cls = [h.sex === 'M' ? 'm' : 'f', `gen${gen}`, cross.has(h.id) ? 'cross' : ''].join(' ');
        rows[row].push(`<td rowspan="${span}" class="${cls}"><span class="pn link" data-act="horse" data-id="${h.id}">${U.esc(h.name)}</span>${UI.factors(h)}
          ${gen <= 3 && h.sex === 'M' ? `<span class="rl" style="color:${ROOTS[h.root].color}">${U.esc(Gen.lineName(h))}</span>` : ''}</td>`);
      }
      if (gen < G) {
        place(h ? h.sire : null, gen + 1, row);
        place(h ? h.dam : null, gen + 1, row + span / 2);
      }
    };
    place(sireId, 1, 0);
    place(damId, 1, 16);
    return `<div class="ped-wrap"><table class="ped">${rows.map(r => `<tr>${r.join('')}</tr>`).join('')}</table></div>`;
  },

  evalBody(ev) {
    return `
      ${ev.comments.map(c => `<div class="comment ${c.k}">${U.esc(c.t)}</div>`).join('')}
      <h3>インブリード</h3>
      ${ev.inbreeds.length ? `<table class="list"><tr><th>祖先</th><th>クロス</th><th>効果</th></tr>
        ${ev.inbreeds.map(i => `<tr><td>${U.esc(i.name)} ${UI.factors(H(i.id))}</td><td>${i.label}</td>
          <td>${i.kind === 'danger' ? '<span class="badge danger">危険</span>' : i.kind === 'warn' ? '<span class="badge warn">やや濃い</span>' : '<span class="badge">良好</span>'}
          ${i.exp ? ` 爆発力+${i.exp}` : ''}${i.factorCross.length ? ' 因子クロス' : ''}</td></tr>`).join('')}</table>` : '<div class="small muted">5代以内にクロスはありません（アウトブリード）。</div>'}
      <dl class="kv" style="margin-top:8px">
        <dt>ニックス</dt><dd>${ev.nick ? `成立（爆発力+${ev.nick}）` : 'なし'}</dd>
        <dt>活力補完</dt><dd>${ev.vitRoots.length ? ev.vitRoots.map(r => UI.rootBadge(r)).join(' ') + ` → ${ev.vitality === 2 ? '成立（+2）' : ev.vitality === 1 ? 'ほぼ成立（+1）' : '不成立'}` : '判定不可'}</dd>
        <dt>血統内の因子</dt><dd>${ev.facCount ? Object.entries(ev.fac).map(([k, v]) => `${STAT_NAMES[k]} ${v.toFixed(1)}`).join(' / ') + `（+${ev.facExp.toFixed(1)}）` : 'なし'}</dd>
        <dt>爆発力</dt><dd><b>${ev.explosive.toFixed(1)}</b> ${UI.stars(ev.stars)}</dd>
        <dt>危険度</dt><dd>${ev.risk >= 3 ? `<span class="badge danger">${ev.risk.toFixed(1)}</span>` : ev.risk >= 1 ? `<span class="badge warn">${ev.risk.toFixed(1)}</span>` : ev.risk.toFixed(1)}</dd>
      </dl>`;
  },

  matingPanel(sire, mare) {
    const ev = Gen.evaluate(sire.id, mare.id);
    const fee = sire.owner === 'player' ? 0 : sire.fee;
    const can = Game.isSeason() && !mare.preg && S.money >= fee;
    return `<div class="card">
      <h2>配合検討: ${U.esc(sire.name)} × ${U.esc(mare.name)} ${UI.stars(ev.stars)}</h2>
      <div class="grid2">
        <div>
          <dl class="kv">
            <dt>種付料</dt><dd><b>${fee ? U.money(fee) : '無料（自家種牡馬）'}</b></dd>
            <dt>期待能力</dt><dd>${UI.grade(ev.expRating)}（父 ${UI.grade(Gen.rating(sire))} / 母 ${UI.grade(Gen.rating(mare))}）</dd>
            <dt>予想距離</dt><dd>${Math.round(((sire.dMin + sire.dMax) / 2 + (mare.dMin + mare.dMax) / 2) / 2 / 100) * 100}m前後</dd>
            <dt>予想馬場</dt><dd>${UI.surfStr({ surf: (sire.surf + mare.surf) / 2 })}</dd>
          </dl>
          ${UI.evalBody(ev)}
          <div class="row" style="margin-top:12px">
            <button class="btn primary big" data-act="mate" ${can ? '' : 'disabled'}>種付けする</button>
            ${!Game.isSeason() ? '<span class="small muted">シーズン外のため種付けできません</span>' : mare.preg ? '<span class="small muted">この牝馬は受胎済みです</span>' : S.money < fee ? '<span class="small muted">資金不足です</span>' : ''}
          </div>
        </div>
        <div>
          <h3>生まれる仔の血統表</h3>
          ${UI.pedigree(sire.id, mare.id, ev.inbreeds.map(i => i.id))}
        </div>
      </div>
    </div>`;
  },

  showHorse(id) {
    const h = H(id);
    if (!h) return;
    const ev = (h.sire != null && h.dam != null && H(h.sire) && H(h.dam)) ? Gen.evaluate(h.sire, h.dam) : null;
    const showEst = h.owner !== 'npc' || h.role === 'foal';
    const isRacer = h.role === 'racing' || h.record.starts > 0;
    const off = (h.role === 'mare' || h.role === 'stallion' || h.role === 'retired') ? Gen.offspring(h.id).sort((a, b) => b.birth - a.birth) : [];
    const roleName = { foal: '幼駒', racing: '競走馬', mare: '繁殖牝馬', stallion: '種牡馬', retired: '引退', ancestor: '—' }[h.role] || '';
    const ownerName = h.owner === 'player' ? '自牧場' : h.owner === 'market' ? '市場' : '他牧場';
    const html = `
      <h2>${U.esc(h.name)} <span class="muted small">${Gen.sexLabel(h)}${Gen.ageLabel(h)} / ${roleName} / ${ownerName}</span> ${UI.factors(h)}</h2>
      <div class="grid2">
        <div>
          <dl class="kv">
            <dt>父</dt><dd>${UI.hlink(H(h.sire))}</dd>
            <dt>母</dt><dd>${UI.hlink(H(h.dam))}</dd>
            <dt>系統</dt><dd>${UI.rootBadge(h.root)} ${U.esc(Gen.lineName(h))}</dd>
            <dt>生年</dt><dd>${h.birth}年</dd>
            <dt>距離適性</dt><dd>${UI.distStr(h)}</dd>
            <dt>馬場適性</dt><dd>${UI.surfStr(h)}</dd>
            <dt>成長型</dt><dd>${UI.growthStr(h)}</dd>
            <dt>脚質</dt><dd>${h.style}</dd>
            ${h.role === 'stallion' ? `<dt>種付料</dt><dd>${U.money(h.fee)}</dd>` : ''}
            ${h.role === 'mare' && h.preg ? `<dt>受胎</dt><dd>${U.esc(H(h.preg.sire) ? H(h.preg.sire).name : '?')}の仔</dd>` : ''}
            ${h.owner !== 'npc' ? `<dt>評価額</dt><dd>${U.money(Gen.value(h))}</dd>` : ''}
          </dl>
          ${h.flags.includes('weak') ? '<div class="comment danger">体質が弱く、故障しやすい馬です。</div>' : ''}
          ${h.flags.includes('miracle') ? '<div class="comment good">配合が見事に噛み合って生まれた馬です。</div>' : ''}
        </div>
        <div>
          <table class="stat-table">
            <tr><th></th><th class="small muted">${Gen.uncertainty(h) ? '推定' : '素質'}</th>${isRacer ? '<th class="small muted">現在</th>' : ''}</tr>
            ${ALL_STATS.map(s => {
              const v = showEst ? Gen.est(h, s) : h.pot[s];
              const c = Gen.cur(h, s);
              return `<tr><td>${STAT_NAMES[s]}</td><td>${UI.grade(v)}</td>
                ${isRacer ? `<td><div class="bar"><span style="width:${U.clamp(c, 0, 110) / 1.1}%"></span></div></td>` : ''}</tr>`;
            }).join('')}
          </table>
          ${h.role === 'racing' ? `<div class="small" style="margin-top:6px">調子 ${UI.cond(h.cond)} / 疲労 ${Math.round(h.fat)} / クラス ${UI.clsLabel(h)}</div>` : ''}
        </div>
      </div>
      ${h.record.starts > 0 || h.record.graded.length ? `<h3>競走成績: ${UI.recStr(h.record)} 獲得賞金 ${U.money(h.record.earn)}</h3>
        ${h.record.graded.length ? `<div class="small">主な勝鞍: ${h.record.graded.map(g => `${UI.raceBadge(g.g)} ${U.esc(g.n)}`).join(' ')}</div>` : ''}
        ${h.record.hist.length ? `<div class="table-wrap" style="max-height:240px;overflow-y:auto"><table class="list">
          <tr><th>日付</th><th>レース</th><th>距離</th><th>着順</th><th>タイム</th><th>着差</th><th>勝ち馬(2着馬)</th></tr>
          ${h.record.hist.slice().reverse().map(x => `<tr><td class="nowrap small">${U.dateStr(x.y, x.w)}</td><td>${UI.raceBadge(x.c)} ${U.esc(x.n)}</td>
            <td class="nowrap">${x.s === 'turf' ? '芝' : 'ダ'}${x.d}</td><td class="${x.pos === 1 ? 'pos-1' : ''}">${x.pos}/${x.of}</td><td>${x.t}</td><td>${x.m}</td><td class="small">${U.esc(x.win)}</td></tr>`).join('')}
        </table></div>` : ''}` : ''}
      ${off.length ? `<h3>産駒（${off.length}頭）</h3><div class="table-wrap" style="max-height:200px;overflow-y:auto"><table class="list">
        <tr><th>馬名</th><th>生年</th><th>性</th><th>${h.sex === 'M' ? '母' : '父'}</th><th>成績</th></tr>
        ${off.map(o => `<tr><td>${UI.hlink(o)}</td><td>${o.birth}</td><td>${Gen.sexLabel(o)}</td><td>${UI.hlink(H(h.sex === 'M' ? o.dam : o.sire))}</td>
          <td class="small">${o.record.starts ? `${o.record.starts}戦${o.record.wins}勝 重賞${o.record.gw}勝` : '—'}</td></tr>`).join('')}
      </table></div>` : ''}
      <h3>血統表</h3>
      ${UI.pedigree(h.sire, h.dam, ev ? ev.inbreeds.map(i => i.id) : [])}
      ${ev && ev.inbreeds.length ? `<div class="small" style="margin-top:6px">クロス: ${ev.inbreeds.map(i => `${U.esc(i.name)} ${i.label}`).join('、')}</div>` : ''}
      ${h.owner === 'player' && h.role === 'foal' ? `<div class="row" style="margin-top:10px"><button class="btn" data-act="renameDlg" data-id="${h.id}">命名する</button></div>` : ''}`;
    UI.modal(html);
  },

  nextPlan(h) {
    const p = Plan.next(h);
    if (!p) return '<span class="muted">予定なし</span>';
    const more = h.plan.length > 1 ? ` <span class="muted">他${h.plan.length - 1}件</span>` : '';
    return `${p.y !== S.year ? p.y + '年' : ''}${U.month(p.w)}月${U.wim(p.w)}週 ${U.esc(Plan.label(p))}${more}`;
  },

  rot: { hid: null, fit: true, surf: '', grade: '' },

  showRotation(hid) {
    const h = H(hid);
    if (!h) return;
    const R = UI.rot;
    if (R.hid !== hid) Object.assign(R, { hid, fit: true, surf: '', cls: 'ok', range: '48' });
    h.plan = h.plan || [];
    const planned = new Set(h.plan.map(p => p.rid || `${p.y}-${p.w}-${p.n || ''}`));
    let list = Plan.upcoming(h, +R.range);
    if (R.fit) list = list.filter(x => x.r.dist >= h.dMin - 200 && x.r.dist <= h.dMax + 200 && Gen.surfScore(h, x.r.surf) >= 0.35);
    if (R.surf) list = list.filter(x => x.r.surf === R.surf);
    const rank = x => RACE_CLS[x.r.cls].rank;
    const clsF = {
      ok: x => x.ok, all: () => true, graded: x => rank(x) >= 5, op: x => x.r.cls === 'op',
      cond: x => ['w1', 'w2', 'w3'].includes(x.r.cls), new: x => ['debut', 'maiden'].includes(x.r.cls),
    }[R.cls] || (() => true);
    list = list.filter(clsF);
    const total = list.length;
    list = list.slice(0, 300);
    const sym = m => m >= 7 ? '◎' : m >= 3 ? '○' : m >= -1 ? '▲' : m >= -5 ? '△' : '×';
    const weeks = [];
    for (let i = 0; i < 48; i++) {
      let y = S.year, w = S.week + i;
      if (w > 48) { w -= 48; y++; }
      weeks.push([y, w]);
    }
    const warns = Plan.warnings(h);
    UI.modal(`<h2>${U.esc(h.name)}のローテーション <span class="muted small">${Gen.sexLabel(h)}${Gen.age(h)} / ${UI.clsLabel(h)} / ${UI.distStr(h)} / ${UI.surfStr(h)} / 成長型 ${UI.growthStr(h)}</span></h2>
      <div class="grid2">
        <div>
          <h3>予定（${h.plan.length}件）</h3>
          ${h.plan.length ? `<table class="list">${h.plan.map((p, i) => `<tr>
            <td class="nowrap">${p.y}年${U.month(p.w)}月${U.wim(p.w)}週</td>
            <td>${p.g && RACE_CLS[p.g] ? UI.raceBadge(p.g) + ' ' : ''}${U.esc(Plan.label(p))}${p.d ? ` <span class="muted small">${p.s === 'turf' ? '芝' : 'ダ'}${p.d}m</span>` : ''}</td>
            <td><button class="btn sm danger" data-act="rotDel" data-id="${h.id}" data-i="${i}">削除</button></td></tr>`).join('')}</table>`
            : '<div class="empty-note">予定はありません。右の一覧から目標レースを追加してください。</div>'}
          ${warns.map(t => `<div class="comment warn">${U.esc(t)}</div>`).join('')}
          <h3>自己条件戦を予定に入れる</h3>
          <div class="row">
            <select id="condWeek">${weeks.map(([y, w]) => `<option value="${y}-${w}">${y}年${U.month(w)}月${U.wim(w)}週</option>`).join('')}</select>
            <select id="condSurf"><option value="any">馬場問わず</option><option value="turf">芝</option><option value="dirt">ダート</option></select>
            <button class="btn sm primary" data-act="rotAddCond" data-id="${h.id}">追加</button>
          </div>
          <p class="small muted">自己条件戦は、その週の番組からその時点のクラスで出走できる最適なレースを選びます。</p>
          <h3>1年分をまとめて組む</h3>
          <div class="row">
            <select id="fillInt">${[3, 4, 5, 6, 8].map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n}週間隔</option>`).join('')}</select>
            <select id="fillSurf"><option value="any">馬場問わず</option><option value="turf" ${h.surf >= 0.2 ? 'selected' : ''}>芝</option><option value="dirt" ${h.surf <= -0.2 ? 'selected' : ''}>ダート</option></select>
            <button class="btn sm primary" data-act="rotFill" data-id="${h.id}">空き週を埋める</button>
            <button class="btn sm danger" data-act="rotClear" data-id="${h.id}">予定を全消去</button>
          </div>
          <p class="small muted">先に目標の重賞を入れてから「空き週を埋める」を押すと、目標レースの前後を空けて1年分の自己条件戦を自動で配置します。予定した条件戦にクラスが合わなくなった場合は、同じ週の近い条件のレースへ自動で振り替えます。</p>
          <p class="small muted">見込みはレース時点の成長を見越した目安です（調子・疲労は含みません）。上のクラスのレースも予定に入れられますが、その週までに勝ち上がっていないと出走できません。重賞・OPは2・3歳限定戦なら1勝クラス以上、古馬混合なら3勝クラス以上で出走できます。</p>
        </div>
        <div>
          <h3>レースカレンダー</h3>
          <div class="row" style="margin-bottom:6px">
            <select data-chg="rotFilter" data-k="range">${[['12', '3か月'], ['24', '半年'], ['48', '1年'], ['72', '1年半']].map(([k, n]) => `<option value="${k}" ${R.range === k ? 'selected' : ''}>${n}先まで</option>`).join('')}</select>
            <select data-chg="rotFilter" data-k="cls">${[['ok', '今のクラスで出走可能'], ['all', '全クラス'], ['graded', '重賞'], ['op', 'オープン特別'], ['cond', '条件戦（1〜3勝クラス）'], ['new', '新馬・未勝利']].map(([k, n]) => `<option value="${k}" ${R.cls === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
            <select data-chg="rotFilter" data-k="surf"><option value="">芝・ダ</option><option value="turf" ${R.surf === 'turf' ? 'selected' : ''}>芝</option><option value="dirt" ${R.surf === 'dirt' ? 'selected' : ''}>ダート</option></select>
            <label class="small"><input type="checkbox" data-chg="rotFilter" data-k="fit" ${R.fit ? 'checked' : ''}> 適性に合うレースのみ</label>
          </div>
          <div class="table-wrap" style="max-height:460px;overflow-y:auto"><table class="list">
            <tr><th>時期</th><th>レース</th><th>距離</th><th>見込み</th><th></th></tr>
            ${list.map(x => {
              const r = x.r;
              return `<tr>
                <td class="nowrap small">${x.y !== S.year ? x.y + '年' : ''}${U.month(x.w)}月${U.wim(x.w)}週</td>
                <td>${UI.raceBadge(r.cls)} ${U.esc(r.name)}${x.ok ? '' : `<br><span class="small" style="color:var(--warn)">${Race.classReq(r)}（現在は${UI.clsLabel(h)}）</span>`}</td>
                <td class="nowrap">${r.surf === 'turf' ? '芝' : 'ダ'}${r.dist}</td>
                <td class="center">${sym(x.out)}</td>
                <td>${planned.has(r.id) || planned.has(`${x.y}-${x.w}-${r.name}`) ? '<span class="badge">予定済</span>' : `<button class="btn sm" data-act="rotAdd" data-id="${h.id}" data-y="${x.y}" data-w="${x.w}" data-rid="${r.id}">追加</button>`}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="5" class="empty-note">条件に合うレースがありません</td></tr>'}
          </table></div>
          ${total > list.length ? `<p class="small muted">${total}件中${list.length}件を表示しています。絞り込みをご利用ください。</p>` : ''}
        </div>
      </div>
      <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" data-act="closeModal">閉じる</button></div>`,
      () => { if (UI.tab === 'racers' || UI.tab === 'home') UI.render(); });
  },

  slotSummary(m) {
    const d = new Date(m.at);
    const ds = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${U.esc(m.farm)} ${U.dateStr(m.y, m.w)} / 所持金 ${U.money(m.money)} / 所有馬 ${m.horses}頭 / 重賞 ${m.honors}勝（GI ${m.g1}） <span class="muted">（${ds} 保存）</span>`;
  },

  confirm(title, body, act, data, okLabel, danger) {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${U.esc(v)}"`).join(' ');
    UI.modal(`<h2>${U.esc(title)}</h2><p>${body}</p>
      <div class="row"><button class="btn ${danger ? 'danger' : 'primary'}" data-act="${act}" ${attrs}>${okLabel}</button>
      <button class="btn" data-act="slots">やめる</button></div>`);
  },

  showSlots() {
    const inGame = !!S;
    const rows = Game.listSlots().map(({ id, meta }) => {
      const name = id === 'auto' ? 'オートセーブ' : `スロット${id}`;
      return `<tr>
        <td class="nowrap"><b>${name}</b></td>
        <td class="small">${meta ? UI.slotSummary(meta) : '<span class="muted">（空き）</span>'}</td>
        <td class="nowrap">
          ${inGame && id !== 'auto' ? `<button class="btn sm primary" data-act="saveSlot" data-id="${id}">セーブ</button>` : ''}
          ${meta ? `<button class="btn sm" data-act="loadSlot" data-id="${id}">ロード</button>` : ''}
          ${meta ? `<button class="btn sm danger" data-act="delSlot" data-id="${id}">削除</button>` : ''}
        </td></tr>`;
    }).join('');
    UI.modal(`<h2>${inGame ? 'セーブ / ロード' : 'ロード'}</h2>
      ${inGame ? `<p class="small muted">現在: ${U.esc(S.farmName)} ${U.dateStr(S.year, S.week)} / 所持金 ${U.money(S.money)}</p>` : ''}
      <div class="table-wrap"><table class="list">${rows}</table></div>
      <p class="small muted">オートセーブは毎週自動で上書きされます。大事な場面（GI前・配合前など）はスロットに残しておくと、後から戻ってやり直せます。</p>`);
  },

  showReport(rep) {
    UI.modal(`<h2>${U.dateStr(rep.y, rep.w)} の結果</h2>${UI.reportBody(rep)}
      <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" data-act="closeModal">OK</button></div>`);
  },
};

// ---------- アクション ----------
const Act = {
  start() {
    const farm = document.getElementById('inFarm').value.trim() || '袋井ファーム';
    const kan = document.getElementById('inKan').value.trim();
    Game.newGame(farm, kan);
    UI.tab = 'home';
    UI.render();
  },
  tab(d) { UI.tab = d.tab; UI.render(); window.scrollTo(0, 0); },
  next() {
    const rep = Game.nextWeek();
    UI.render();
    const important = rep.races.length || rep.events.length;
    if (important) UI.showReport(rep);
  },
  closeModal() { UI.closeModal(); },
  horse(d) { UI.showHorse(+d.id); },
  watch(d, el) {
    const rep = S.lastReport;
    if (rep && rep.races[+d.i]) Viewer.open(rep.races[+d.i]);
  },
  raceSpeed(d) { if (Viewer.state) Viewer.state.speed = +d.v; },
  raceSkip() { Viewer.finish(); },
  rotation(d) { UI.showRotation(+d.id); },
  rotAdd(d) {
    const h = H(+d.id);
    const y = +d.y, w = +d.w;
    const r = Race.program(y, w).find(x => x.id === d.rid);
    if (!r) return;
    Plan.add(h, { y, w, rid: r.id, n: r.name, g: r.cls, c: r.cls, a: r.age, s: r.surf, d: r.dist });
    UI.showRotation(h.id);
  },
  rotAddCond(d) {
    const h = H(+d.id);
    const [y, w] = document.getElementById('condWeek').value.split('-').map(Number);
    Plan.add(h, { y, w, n: null, surf: document.getElementById('condSurf').value });
    UI.showRotation(h.id);
  },
  rotFill(d) {
    const h = H(+d.id);
    const n = Plan.fill(h, +document.getElementById('fillInt').value, document.getElementById('fillSurf').value);
    UI.toast(`${n}レースを予定に追加しました。`);
    UI.showRotation(h.id);
  },
  rotClear(d) { Plan.clear(H(+d.id)); UI.showRotation(+d.id); },
  rotDel(d) { Plan.remove(H(+d.id), +d.i); UI.showRotation(+d.id); },
  rest(d) { Game.rest(+d.id, 4); UI.toast('4週間の放牧に出しました。'); UI.render(); },
  retireDlg(d) {
    const h = H(+d.id);
    const canMare = h.sex === 'F';
    const full = Game.mine('mare').length >= Game.barnCap();
    UI.modal(`<h2>${U.esc(h.name)}の引退</h2>
      <p>${UI.recStr(h.record)} 獲得賞金 ${U.money(h.record.earn)}</p>
      <div class="row">
        ${canMare ? `<button class="btn primary" data-act="retire" data-id="${h.id}" data-mode="mare" ${full ? 'disabled' : ''}>繁殖牝馬にする</button>${full ? '<span class="small muted">繁殖厩舎が満杯です</span>' : ''}` : ''}
        ${!canMare ? `<button class="btn primary" data-act="retire" data-id="${h.id}" data-mode="stud" ${Game.canStud(h) ? '' : 'disabled'}>種牡馬にする（種付料 ${U.money(Gen.studFee(h))}）</button>
          ${Game.canStud(h) ? '' : '<span class="small muted">重賞勝ちか高い能力が必要です</span>'}` : ''}
        <button class="btn" data-act="retire" data-id="${h.id}" data-mode="sell">売却する（${U.money(Gen.value(h))}）</button>
      </div>
      <p class="small muted">GIを勝った馬や能力の高い馬は、引退時に因子を獲得します。</p>`);
  },
  retire(d) {
    const r = Game.retire(+d.id, d.mode);
    UI.closeModal();
    UI.toast(r.msg || '');
    UI.render();
  },
  sellDlg(d) {
    const h = H(+d.id);
    UI.modal(`<h2>${U.esc(h.name)}を売却しますか？</h2><p>売却額: <b>${U.money(Gen.value(h))}</b></p>
      <div class="row"><button class="btn primary" data-act="sell" data-id="${h.id}">売却する</button><button class="btn" data-act="closeModal">やめる</button></div>`);
  },
  sell(d) { const r = Game.sell(+d.id); UI.closeModal(); UI.toast(r.msg || ''); UI.render(); },
  buy(d) { const r = Game.buy(+d.id); UI.toast(r.msg); UI.render(); },
  renameDlg(d) {
    const h = H(+d.id);
    UI.modal(`<h2>命名</h2><div class="row"><input type="text" id="renameIn" value="${U.esc(h.name)}" maxlength="12">
      <button class="btn primary" data-act="rename" data-id="${h.id}">決定</button></div>
      <p class="small muted">デビュー前の馬のみ改名できます。</p>`);
  },
  rename(d) {
    const r = Game.rename(+d.id, document.getElementById('renameIn').value);
    if (!r.ok) { UI.toast(r.msg); return; }
    UI.closeModal();
    UI.render();
  },
  goBreed(d) { UI.breed.mare = +d.id; UI.breed.sire = null; UI.tab = 'breed'; UI.render(); },
  pickMare(d) { UI.breed.mare = +d.id; UI.breed.sire = null; UI.render(); },
  pickSire(d) {
    UI.breed.sire = +d.id;
    UI.render();
    const panels = document.querySelectorAll('.card');
    if (panels.length) panels[panels.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  mate() {
    const r = Game.mate(UI.breed.mare, UI.breed.sire);
    UI.toast(r.msg);
    if (r.ok && r.conceived) {
      UI.breed.sire = null;
      const next = Game.mine('mare').find(m => !m.preg && Gen.age(m) >= 3);
      UI.breed.mare = next ? next.id : UI.breed.mare;
    }
    UI.render();
  },
  upgrade(d) { const r = Game.upgrade(d.key); UI.toast(r.msg); UI.render(); },
  saveSettings() {
    S.farmName = document.getElementById('setFarm').value.trim() || S.farmName;
    S.kanmei = document.getElementById('setKan').value.trim();
    Game.save();
    UI.toast('設定を保存しました。');
    UI.render();
  },
  export() {
    const blob = new Blob([Game.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `keiba-save-${S.year}-${S.week}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importDlg() {
    UI.modal(`<h2>セーブデータのインポート</h2><input type="file" id="importFile" accept=".json,application/json">
      <div class="row" style="margin-top:10px"><button class="btn primary" data-act="importDo">読み込む</button></div>`);
  },
  importDo() {
    const f = document.getElementById('importFile').files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try { Game.importData(rd.result); UI.closeModal(); UI.toast('読み込みました。'); UI.render(); } catch (e) { UI.toast('読み込みに失敗しました: ' + e.message); }
    };
    rd.readAsText(f);
  },
  slots() { UI.showSlots(); },
  saveSlot(d) {
    const meta = Game.readIndex()[d.id];
    if (meta && !d.ok) {
      UI.confirm(`スロット${d.id}に上書きしますか？`, `${UI.slotSummary(meta)}`, 'saveSlot', { id: d.id, ok: 1 }, '上書きする');
      return;
    }
    UI.toast(Game.saveSlot(d.id) ? `スロット${d.id}にセーブしました。` : 'セーブに失敗しました（保存容量不足）。不要なスロットを削除してください。');
    UI.showSlots();
  },
  loadSlot(d) {
    if (S && !d.ok) {
      UI.confirm(`${d.id === 'auto' ? 'オートセーブ' : 'スロット' + d.id}をロードしますか？`, 'セーブしていない現在の進行は失われます。', 'loadSlot', { id: d.id, ok: 1 }, 'ロードする');
      return;
    }
    if (!Game.loadSlot(d.id)) { UI.toast('ロードに失敗しました。'); return; }
    UI.closeModal();
    UI.tab = 'home';
    UI.render();
    UI.toast(`${U.dateStr(S.year, S.week)}のデータをロードしました。`);
  },
  delSlot(d) {
    if (!d.ok) {
      UI.confirm(`${d.id === 'auto' ? 'オートセーブ' : 'スロット' + d.id}を削除しますか？`, '削除したデータは元に戻せません。', 'delSlot', { id: d.id, ok: 1 }, '削除する', true);
      return;
    }
    Game.deleteSlot(d.id);
    UI.toast('削除しました。');
    if (!S) UI.render();
    if (Game.hasAnySave() || S) UI.showSlots(); else UI.closeModal();
  },
  titleDlg() {
    UI.confirm('タイトルに戻りますか？', 'オートセーブが有効なら、現在の進行は「つづきから」で再開できます。', 'toTitle', {}, 'タイトルへ');
  },
  toTitle() { Game.save(); Game.toTitle(); UI.closeModal(); UI.tab = 'home'; UI.render(); },
};

const Chg = {
  entry(d, v) { Game.setEntry(+d.id, v); Game.save(); },
  intensity(d, v) { H(+d.id).intensity = v; Game.save(); },
  mode(d, v) {
    const h = H(+d.id);
    h.mode = v;
    if (v === 'auto' && !S.entries[h.id]) { const r = Race.autoPick(h); if (r) S.entries[h.id] = r.id; }
    Game.save();
    UI.render();
  },
  rotFilter(d, v, el) {
    UI.rot[d.k] = el.type === 'checkbox' ? el.checked : v;
    UI.showRotation(UI.rot.hid);
    Game.save();
  },
  autosave(d, v, el) {
    S.settings = S.settings || {};
    S.settings.autosave = el.checked;
    if (el.checked) Game.save();
    UI.toast(el.checked ? 'オートセーブを有効にしました。' : 'オートセーブを無効にしました。手動でセーブしてください。');
  },
  breedRoot(d, v) { UI.breed.root = v; UI.render(); },
  breedSort(d, v) { UI.breed.sort = v; UI.render(); },
  stalRoot(d, v) { UI.stal.root = v; UI.render(); },
  stalSort(d, v) { UI.stal.sort = v; UI.render(); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    if (e.target.id === 'modal') UI.closeModal();
    return;
  }
  const fn = Act[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]');
  if (!el) return;
  const fn = Chg[el.dataset.chg];
  if (fn) fn(el.dataset, el.value, el);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') UI.closeModal();
});

Game.migrate();
UI.render();
