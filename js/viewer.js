'use strict';

// 簡易レース観戦（canvas）
const Viewer = {
  raf: null,

  frameOf(gate, n) {
    if (n <= 8) return gate;
    return Math.min(8, Math.max(1, Math.ceil(gate * 8 / n)));
  },

  open(entry) {
    Viewer.stop();
    const r = entry.race;
    const html = `
      <h2>${UI.raceBadge(r.cls)} ${U.esc(r.name)} <span class="muted small">${r.surf === 'turf' ? '芝' : 'ダート'}${r.dist}m / ${entry.sim.n}頭</span></h2>
      <div class="race-stage">
        <div>
          <canvas id="raceCanvas" class="race-canvas" height="300"></canvas>
          <div class="commentary" id="raceComment">各馬ゲートイン完了…</div>
          <div class="row">
            <button class="btn sm" data-act="raceSpeed" data-v="1">×1</button>
            <button class="btn sm" data-act="raceSpeed" data-v="2">×2</button>
            <button class="btn sm" data-act="raceSpeed" data-v="4">×4</button>
            <button class="btn sm" data-act="raceSkip">結果へ</button>
            <span class="spacer"></span>
            <span class="muted small" id="raceRemain"></span>
          </div>
        </div>
        <div class="race-side"><b>現在の順位</b><ol id="raceOrder"></ol></div>
      </div>
      <div id="raceResult"></div>`;
    UI.modal(html, () => Viewer.stop());
    const canvas = document.getElementById('raceCanvas');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 700, Hh = 300;
    canvas.width = W * dpr;
    canvas.height = Hh * dpr;
    canvas.style.height = Hh + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const res = entry.sim.res;
    const N = res[0].times.length - 1;
    const segLen = r.dist / N;
    const maxT = Math.max(...res.map(e => e.time));
    const durReal = 14 + r.dist / 300;
    const st = { t: 0, speed: 1, last: performance.now(), done: false, said: {} };
    Viewer.state = st;
    Viewer.entry = entry;

    const posAt = (e, t) => {
      const T = e.times;
      if (t >= T[N]) return r.dist + (t - T[N]) * (segLen / (T[N] - T[N - 1]));
      let k = 0;
      while (k < N - 1 && T[k + 1] <= t) k++;
      return (k + (t - T[k]) / (T[k + 1] - T[k])) * segLen;
    };
    const say = (key, text) => {
      if (st.said[key]) return;
      st.said[key] = true;
      document.getElementById('raceComment').textContent = text;
    };

    const draw = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - st.last) / 1000);
      st.last = now;
      st.t += dt * (maxT / durReal) * st.speed;
      const t = st.t;
      const ps = res.map(e => ({ e, p: posAt(e, t) }));
      const order = ps.slice().sort((a, b) => b.p - a.p);
      const lead = Math.min(order[0].p, r.dist + 40);
      const tail = Math.min(...ps.map(x => x.p));
      const span = Math.max(60, lead - tail + 30);
      const ppm = Math.min(9, (W - 120) / span);
      const X = p => W - 60 - (lead - p) * ppm;

      // 背景
      ctx.fillStyle = r.surf === 'turf' ? '#3f8f3f' : '#a77b45';
      ctx.fillRect(0, 0, W, Hh);
      ctx.fillStyle = r.surf === 'turf' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      const stripe = 20 * ppm;
      for (let m = Math.floor((lead - W / ppm) / 20) * 20; m < lead + 100; m += 40) {
        ctx.fillRect(X(m), 18, stripe, Hh - 36);
      }
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, 10, W, 4);
      ctx.fillRect(0, Hh - 14, W, 4);
      // ハロン棒
      ctx.font = '11px sans-serif';
      const from = Math.floor((lead - (W + 60) / ppm) / 100) * 100;
      for (let m = Math.max(0, from); m <= Math.min(r.dist, lead + 100); m += 100) {
        const x = X(m);
        if (x < -20 || x > W + 20) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x, 14, 1, Hh - 28);
        if ((r.dist - m) % 200 === 0 && m < r.dist) {
          ctx.fillStyle = '#fff';
          ctx.fillText(`残${r.dist - m}`, x + 3, 9);
        }
      }
      const fx = X(r.dist);
      if (fx > -10 && fx < W + 10) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(fx - 2, 14, 4, Hh - 28);
        ctx.fillStyle = '#e53935';
        ctx.fillRect(fx - 2, 14, 4, 10);
        ctx.fillStyle = '#fff';
        ctx.fillText('ゴール', fx + 4, Hh - 2);
      }
      // 馬
      const n = res.length;
      const laneH = (Hh - 50) / Math.max(1, n - 1);
      ps.slice().sort((a, b) => a.e.gate - b.e.gate).forEach(({ e, p }) => {
        const x = Math.max(8, X(p));
        const y = 25 + (e.gate - 1) * laneH;
        const fr = Viewer.frameOf(e.gate, n);
        if (e.isPlayer) {
          ctx.beginPath();
          ctx.arc(x, y, 11, 0, Math.PI * 2);
          ctx.fillStyle = '#ffd54a';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = Race.GATE_COLORS[fr - 1];
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#333';
        ctx.stroke();
        ctx.fillStyle = (fr === 1 || fr === 5) ? '#222' : '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(e.gate), x, y + 3.5);
        ctx.textAlign = 'left';
        if (e.isPlayer) {
          ctx.font = 'bold 12px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.fillText(e.name, Math.min(x + 14, W - 110), y + 4);
        }
      });

      // 順位・実況
      const ol = document.getElementById('raceOrder');
      if (ol) {
        ol.innerHTML = order.slice(0, Math.min(10, n)).map(x => `<li class="${x.e.isPlayer ? 'me' : ''}">${U.esc(x.e.name)}</li>`).join('')
          + order.map((x, i) => (i >= 10 && x.e.isPlayer) ? `<li value="${i + 1}" class="me">${U.esc(x.e.name)}</li>` : '').join('');
      }
      const remain = Math.max(0, r.dist - order[0].p);
      const rm = document.getElementById('raceRemain');
      if (rm) rm.textContent = remain > 0 ? `残り ${Math.ceil(remain)}m` : 'ゴール';
      const leader = order[0].e.name;
      if (t > 0.5) say('start', 'スタートしました！');
      if (order[0].p > r.dist * 0.25) say('early', `先頭は${leader}、レースを引っ張ります。`);
      if (remain < 1000 && r.dist > 1400) say('1000', `残り1000m、先頭は${leader}。`);
      if (remain < 400) say('400', `最後の直線！ ${leader}が先頭、${order[1].e.name}も迫る！`);
      if (remain < 150) say('150', `${leader}か！ ${order[1].e.name}か！`);
      if (remain <= 0) say('goal', `${res[0].name}、1着でゴールイン！`);

      if (t > maxT + 0.8) {
        Viewer.finish();
        return;
      }
      Viewer.raf = requestAnimationFrame(draw);
    };
    Viewer.raf = requestAnimationFrame(draw);
  },

  finish() {
    Viewer.stop();
    const el = document.getElementById('raceResult');
    if (el && Viewer.entry) el.innerHTML = UI.raceResultTable(Viewer.entry);
    const c = document.getElementById('raceComment');
    if (c && Viewer.entry) c.textContent = `${Viewer.entry.sim.res[0].name}、1着でゴールイン！`;
  },

  stop() {
    if (Viewer.raf) cancelAnimationFrame(Viewer.raf);
    Viewer.raf = null;
  },
};
