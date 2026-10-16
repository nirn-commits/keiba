'use strict';

// 汎用ユーティリティ
const U = {
  rand(a, b) { return a + Math.random() * (b - a); },
  randi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  chance(p) { return Math.random() < p; },
  gauss() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  },
  clamp(x, a, b) { return Math.max(a, Math.min(b, x)); },
  round(x, step = 1) { return Math.round(x / step) * step; },
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  weightedPick(arr, wfn) {
    let total = 0;
    const ws = arr.map(x => { const w = Math.max(0, wfn(x)); total += w; return w; });
    if (total <= 0) return U.pick(arr);
    let r = Math.random() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= ws[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  },
  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  // 金額は万円単位の整数で扱う
  money(man) {
    const neg = man < 0;
    const v = Math.round(Math.abs(man));
    const oku = Math.floor(v / 10000), rest = v % 10000;
    let s;
    if (oku) s = `${oku}億` + (rest ? `${rest}万` : '');
    else s = `${rest}万`;
    return (neg ? '-' : '') + s + '円';
  },
  month(week) { return Math.ceil(week / 4); },
  wim(week) { return (week - 1) % 4 + 1; },
  dateStr(year, week) { return `${year}年${U.month(week)}月${U.wim(week)}週`; },
  grade(v) {
    if (v >= 95) return 'S+';
    if (v >= 88) return 'S';
    if (v >= 80) return 'A';
    if (v >= 72) return 'B';
    if (v >= 64) return 'C';
    if (v >= 56) return 'D';
    if (v >= 48) return 'E';
    return 'F';
  },
  gradeCls(v) { return 'g-' + U.grade(v).replace('+', 'p'); },
};
