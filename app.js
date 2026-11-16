'use strict';
const API_URL = 'https://script.google.com/macros/s/AKfycbzN-H2HfgSXvUOjANr7Gzs04acBSIY9AWC84YjciKcaA1zuugqdmyRXPcMj-DtRd0DC/exec';
const KATEGORI_AWAL = {
  keluar: ['Makan', 'Transport', 'Tagihan', 'Belanja', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Lainnya'],
  masuk: ['Gaji', 'Bonus', 'Usaha', 'Investasi', 'Hadiah', 'Lainnya']
};
const WARNA = ['#4f7cff', '#8b5cf6', '#14b8a6', '#f59e0b', '#f43f5e', '#06b6d4', '#84cc16', '#ec4899'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const IC = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const ic = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const angka = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const rp = n => 'Rp ' + angka(n);
const rpS = n => (n < 0 ? '−' : '') + rp(Math.abs(n));
const rpPendek = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' jt' : n >= 1e3 ? Math.round(n / 1e3) + ' rb' : String(Math.round(n));
const fmtAngka = s => String(s).replace(/\D/g, '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* ---------- Tanggal ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dariIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const tambahHari = (s, n) => { const d = dariIso(s); d.setDate(d.getDate() + n); return iso(d); };
const selisihHari = (a, b) => Math.round((dariIso(b) - dariIso(a)) / 864e5);
const hariIni = () => iso(new Date());
const tglPanjang = s => { const d = dariIso(s); return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
const labelGrup = s => {
  const t = hariIni();
  if (s === t) return 'Hari ini';
  if (s === tambahHari(t, -1)) return 'Kemarin';
  return `${HARI[dariIso(s).getDay()]}, ${tglPanjang(s)}`;
};

/* ---------- State ---------- */
let cache = [];
try { cache = JSON.parse(localStorage.getItem('cache') || '[]'); } catch (e) { }
const state = {
  api: API_URL, user: localStorage.getItem('user') || '', pin: localStorage.getItem('pin') || '',
  data: cache, tab: 'beranda', periode: 'bulan', dari: '', sampai: '',
  loading: false, error: '', dilewati: 0, terakhir: 0,
  r: { q: '', jenis: 'semua', kat: '', dari: '', sampai: '', limit: 60, buka: false }
};
let form = null;

/* ---------- API ---------- */
async function panggil(aksi, data = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(state.api, { method: 'POST', body: JSON.stringify({ aksi, user: state.user, pin: state.pin, ...data }), signal: ctrl.signal });
    const j = await res.json();
    if (!j.ok) throw Object.assign(new Error(j.pesan || 'Terjadi kesalahan.'), { kode: j.kode });
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Koneksi terlalu lama. Coba lagi.');
    if (e instanceof SyntaxError) throw new Error('Respons server tidak valid. Pastikan Web App di-deploy dengan akses "Siapa saja".');
    if (e instanceof TypeError) throw new Error('Tidak bisa terhubung. Periksa internet atau URL Web App.');
    throw e;
  } finally { clearTimeout(to); }
}

async function muat() {
  state.loading = true; render();
  try {
    const j = await panggil('baca');
    state.data = j.data; state.dilewati = j.dilewati; state.error = ''; state.terakhir = Date.now();
    try { localStorage.setItem('cache', JSON.stringify(j.data)); } catch (e) { }
  } catch (e) {
    if (e.kode === 'PIN') return keluar(e.message);
    state.error = e.message; toast(e.message, 'err');
  }
  state.loading = false; render();
}

/* ---------- Periode & hitungan ---------- */
function rentang(p = state.periode) {
  const t = hariIni(), d = dariIso(t);
  let a, b = t;
  if (p === 'hari') a = t;
  else if (p === 'minggu') a = tambahHari(t, -((d.getDay() + 6) % 7));
  else if (p === 'bulan') a = iso(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  else { a = state.dari || t; b = state.sampai || a; if (b < a) [a, b] = [b, a]; }
  return { a, b };
}
function rentangSebelum(p) {
  const { a, b } = rentang(p);
  if (p === 'hari') return { a: tambahHari(a, -1), b: tambahHari(b, -1) };
  if (p === 'minggu') return { a: tambahHari(a, -7), b: tambahHari(b, -7) };
  if (p === 'bulan') {
    const d = dariIso(a), aw = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12);
    const akhir = new Date(d.getFullYear(), d.getMonth(), 0, 12).getDate();
    return { a: iso(aw), b: iso(new Date(aw.getFullYear(), aw.getMonth(), Math.min(dariIso(b).getDate(), akhir), 12)) };
  }
  const n = selisihHari(a, b) + 1;
  return { a: tambahHari(a, -n), b: tambahHari(a, -1) };
}
const dalam = (x, r) => x.tanggal >= r.a && x.tanggal <= r.b;
function ringkas(r) {
  let masuk = 0, keluar = 0;
  for (const x of state.data) if (dalam(x, r)) { if (x.jenis === 'masuk') masuk += x.nominal; else keluar += x.nominal; }
  return { masuk, keluar, saldo: masuk - keluar };
}
function labelPeriode() {
  if (state.periode === 'hari') return 'Hari ini';
  if (state.periode === 'minggu') return 'Minggu ini';
  if (state.periode === 'bulan') return 'Bulan ini';
  const r = rentang(); return r.a === r.b ? tglPanjang(r.a) : `${tglPanjang(r.a)} – ${tglPanjang(r.b)}`;
}
const nomorBaris = x => Number(x.id.split(':')[1]);
const urut = (a, b) => b.tanggal.localeCompare(a.tanggal) || nomorBaris(b) - nomorBaris(a);

/* ---------- Komponen tampilan ---------- */
const kosong = (j, t, cta) => `<div class="empty"><div class="orb">${ic('list', 34)}</div><h3>${j}</h3><p>${t}</p>${cta ? `<button class="btn" data-aksi="tambah">+ Tambah Transaksi</button>` : ''}</div>`;
const skeleton = () => '<div class="skel" style="height:170px"></div><div class="skel" style="height:90px"></div><div class="skel" style="height:90px"></div>';

function barPeriode() {
  const p = [['hari', 'Hari ini'], ['minggu', 'Minggu ini'], ['bulan', 'Bulan ini'], ['kustom', 'Kustom']];
  const hi = hariIni();
  return `<div><div class="chips">${p.map(([k, l]) => `<button class="chip ${state.periode === k ? 'on' : ''}" data-aksi="periode" data-v="${k}">${l}</button>`).join('')}</div>` +
    (state.periode === 'kustom' ? `<div class="kustom" style="margin-top:10px"><label class="lbl">Dari<input type="date" id="kDari" class="in" value="${state.dari || hi}"></label><label class="lbl">Sampai<input type="date" id="kSampai" class="in" value="${state.sampai || hi}"></label></div>` : '') + '</div>';
}

function barisTrx(x) {
  const m = x.jenis === 'masuk';
  return `<button class="trx" data-aksi="edit" data-id="${esc(x.id)}"><span class="av ${m ? 'in' : 'out'}">${esc(x.kategori.charAt(0).toUpperCase())}</span><span class="tx"><b>${esc(x.kategori)}</b><small>${esc(x.catatan || tglPanjang(x.tanggal))}</small></span><span class="nom ${m ? 'in' : 'out'}">${m ? '+' : '−'}${rp(x.nominal)}</span></button>`;
}

function insightHtml(r, s, sb) {
  const per = {};
  state.data.forEach(x => { if (x.jenis === 'keluar' && dalam(x, r)) per[x.kategori] = (per[x.kategori] || 0) + x.nominal; });
  const top = Object.entries(per).sort((a, b) => b[1] - a[1])[0];
  const hari = Math.max(1, selisihHari(r.a, r.b < hariIni() ? r.b : hariIni()) + 1);
  const banding = (now, prev, naikBagus) => {
    if (!prev) return now ? '<b>Baru</b><span>Belum ada data periode lalu</span>' : '<b>–</b><span>Belum ada data</span>';
    const p = (now - prev) / prev * 100, f = Math.abs(p);
    const teks = (f >= 10 ? f.toFixed(0) : f.toFixed(1)).replace('.', ',');
    if (p === 0) return `<b>Sama</b><span>Dengan ${rp(prev)} periode lalu</span>`;
    return `<b class="${(p > 0) === naikBagus ? 'bagus' : 'buruk'}">${p > 0 ? '▲' : '▼'} ${teks}%</b><span>vs ${rp(prev)} periode lalu</span>`;
  };
  return `<div class="grid2">
    <div class="ins"><small>Kategori terbesar</small>${top ? `<b>${esc(top[0])}</b><span>${rp(top[1])} · ${Math.round(top[1] / s.keluar * 100)}%</span>` : '<b>–</b><span>Belum ada pengeluaran</span>'}</div>
    <div class="ins"><small>Rata-rata harian</small><b>${rp(s.keluar / hari)}</b><span>pengeluaran, ${hari} hari</span></div>
    <div class="ins"><small>Pengeluaran</small>${banding(s.keluar, sb.keluar, false)}</div>
    <div class="ins"><small>Pemasukan</small>${banding(s.masuk, sb.masuk, true)}</div></div>`;
}

function viewBeranda() {
  if (state.error && !state.data.length) return kosong('Gagal memuat data', esc(state.error), false) + '<button class="btn ghost" data-aksi="muat">Coba lagi</button>';
  if (!state.data.length) return kosong('Belum ada transaksi', 'Catat pemasukan atau pengeluaran pertamamu. Cukup beberapa detik.', true);
  const r = rentang(), s = ringkas(r), sb = ringkas(rentangSebelum(state.periode));
  const terbaru = [...state.data].sort(urut).slice(0, 5);
  return `${barPeriode()}
  <div class="hero"><p>Saldo bersih · ${labelPeriode()}</p><h2>${rpS(s.saldo)}</h2>
    <div class="glass-row"><div class="glass"><small>↓ Pemasukan</small><b>${rp(s.masuk)}</b></div><div class="glass"><small>↑ Pengeluaran</small><b>${rp(s.keluar)}</b></div></div></div>
  ${insightHtml(r, s, sb)}
  <div class="judul-kartu"><h3>Transaksi terbaru</h3><button data-aksi="tab" data-v="riwayat">Lihat semua</button></div>
  <div class="card list">${terbaru.map(barisTrx).join('')}</div>`;
}

/* ---------- Grafik ---------- */
function buatBucket(r) {
  const n = selisihHari(r.a, r.b) + 1, bulanan = n > 62, out = [];
  if (!bulanan) {
    for (let i = 0; i < n; i++) { const k = tambahHari(r.a, i); out.push({ k, label: String(dariIso(k).getDate()), masuk: 0, keluar: 0 }); }
  } else {
    const end = dariIso(r.b); let d = dariIso(r.a); d = new Date(d.getFullYear(), d.getMonth(), 1, 12);
    const banyakTahun = r.a.slice(0, 4) !== r.b.slice(0, 4);
    while (d <= end) {
      out.push({ k: iso(d).slice(0, 7), label: BULAN[d.getMonth()] + (banyakTahun ? ' ' + String(d.getFullYear()).slice(2) : ''), masuk: 0, keluar: 0 });
      d.setMonth(d.getMonth() + 1);
    }
  }
  const idx = new Map(out.map((b, i) => [b.k, i]));
  for (const x of state.data) {
    if (!dalam(x, r)) continue;
    const b = out[idx.get(bulanan ? x.tanggal.slice(0, 7) : x.tanggal)];
    if (b) b[x.jenis] += x.nominal;
  }
  return { out, bulanan };
}
function sumbu(mx, W, H, pl, pt, pb) {
  return [0, .5, 1].map(f => {
    const y = (pt + (H - pt - pb) * (1 - f)).toFixed(1);
    return `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" stroke="#e8ecf5" stroke-dasharray="3 4"/><text x="${pl - 6}" y="${(+y + 3).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#94a3b8">${rpPendek(mx * f)}</text>`;
  }).join('');
}
function svgTren(b) {
  const pl = 38, pr = 12, pt = 14, pb = 26, H = 180, W = Math.max(320, pl + pr + b.length * 34);
  const mx = Math.max(...b.map(x => x.keluar), 1);
  const X = i => pl + 8 + i * (W - pl - pr - 16) / (b.length - 1);
  const Y = v => pt + (H - pt - pb) * (1 - v / mx);
  const L = b.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(x.keluar).toFixed(1)}`).join(' ');
  const A = `${L} L${X(b.length - 1).toFixed(1)} ${H - pb} L${X(0).toFixed(1)} ${H - pb} Z`;
  const lab = b.map((x, i) => `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#94a3b8">${esc(x.label)}</text>`).join('');
  const dots = b.map((x, i) => x.keluar ? `<circle cx="${X(i).toFixed(1)}" cy="${Y(x.keluar).toFixed(1)}" r="3.2" fill="#fff" stroke="#8b5cf6" stroke-width="2"/>` : '').join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:max(100%,${W}px);height:auto;display:block"><defs><linearGradient id="gA" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".35"/><stop offset="1" stop-color="#4f7cff" stop-opacity="0"/></linearGradient><linearGradient id="gL" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#4f7cff"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>${sumbu(mx, W, H, pl, pt, pb)}<path d="${A}" fill="url(#gA)"/><path d="${L}" fill="none" stroke="url(#gL)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}${lab}</svg>`;
}
function svgBanding(b) {
  const pl = 38, pr = 8, pt = 14, pb = 26, H = 180, W = Math.max(320, pl + pr + b.length * 40);
  const mx = Math.max(...b.map(x => Math.max(x.masuk, x.keluar)), 1);
  const slot = (W - pl - pr) / b.length, bw = Math.min(14, slot / 2.6), h = v => (H - pt - pb) * v / mx;
  const bars = b.map((x, i) => {
    const cx = pl + slot * (i + .5), hm = h(x.masuk), hk = h(x.keluar);
    return `<rect x="${(cx - bw - 1).toFixed(1)}" y="${(H - pb - hm).toFixed(1)}" width="${bw.toFixed(1)}" height="${hm.toFixed(1)}" rx="3" fill="url(#gM)"/><rect x="${(cx + 1).toFixed(1)}" y="${(H - pb - hk).toFixed(1)}" width="${bw.toFixed(1)}" height="${hk.toFixed(1)}" rx="3" fill="url(#gK)"/><text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#94a3b8">${esc(x.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:max(100%,${W}px);height:auto;display:block"><defs><linearGradient id="gM" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0fb5a3"/></linearGradient><linearGradient id="gK" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fb7185"/><stop offset="1" stop-color="#f43f5e"/></linearGradient></defs>${sumbu(mx, W, H, pl, pt, pb)}${bars}</svg>`;
}
function barKategori(r) {
  const per = {};
  state.data.forEach(x => { if (x.jenis === 'keluar' && dalam(x, r)) per[x.kategori] = (per[x.kategori] || 0) + x.nominal; });
  let arr = Object.entries(per).sort((a, b) => b[1] - a[1]);
  if (!arr.length) return '<p class="info">Belum ada pengeluaran pada periode ini.</p>';
  const total = arr.reduce((t, e) => t + e[1], 0);
  if (arr.length > 7) arr = arr.slice(0, 7).concat([['Kategori lain', arr.slice(7).reduce((t, e) => t + e[1], 0)]]);
  const mx = Math.max(...arr.map(e => e[1]));
  return arr.map(([k, v], i) => `<div class="bar"><div class="bar-top"><span><i style="background:${WARNA[i % 8]}"></i>${esc(k)}</span><b>${rp(v)}</b><em>${Math.round(v / total * 100)}%</em></div><div class="track"><div class="fill" style="width:${(v / mx * 100).toFixed(1)}%;background:${WARNA[i % 8]}"></div></div></div>`).join('');
}
function viewGrafik() {
  if (!state.data.length) return kosong('Belum ada data', 'Grafik akan muncul setelah ada transaksi.', true);
  const r = rentang(), { out, bulanan } = buatBucket(r);
  return `${barPeriode()}
  <div class="card"><h3>Pengeluaran per kategori</h3>${barKategori(r)}</div>
  <div class="card"><h3>Tren pengeluaran<small>${bulanan ? 'per bulan' : 'per hari'}</small></h3>${out.length < 2 ? '<p class="info">Pilih periode lebih panjang untuk melihat tren.</p>' : `<div class="scroll-x">${svgTren(out)}</div>`}</div>
  <div class="card"><h3>Pemasukan vs pengeluaran<small>${bulanan ? 'per bulan' : 'per hari'}</small></h3><div class="legend"><span><i style="background:#0fb5a3"></i>Pemasukan</span><span><i style="background:#f43f5e"></i>Pengeluaran</span></div><div class="scroll-x">${svgBanding(out)}</div></div>`;
}

/* ---------- Riwayat ---------- */
function viewRiwayat() {
  const f = state.r, kats = [...new Set(state.data.map(x => x.kategori))].sort((a, b) => a.localeCompare(b));
  return `<div class="cari"><span>${ic('search', 20)}</span><input id="q" type="search" placeholder="Cari kategori, catatan, nominal" value="${esc(f.q)}" autocomplete="off"><button class="ikon-btn ${f.buka || f.kat || f.dari || f.sampai ? 'aktif' : ''}" data-aksi="filterToggle" aria-label="Filter">${ic('filter', 20)}</button></div>
  <div class="chips">${[['semua', 'Semua'], ['masuk', 'Pemasukan'], ['keluar', 'Pengeluaran']].map(([k, l]) => `<button class="chip ${f.jenis === k ? 'on' : ''}" data-aksi="jenisR" data-v="${k}">${l}</button>`).join('')}</div>
  ${f.buka ? `<div class="card fpanel"><label class="lbl" style="margin-top:0">Kategori<select id="fKat" class="in"><option value="">Semua kategori</option>${kats.map(k => `<option value="${esc(k)}" ${k === f.kat ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label><div class="baris2"><label class="lbl">Dari tanggal<input type="date" id="fDari" class="in" value="${f.dari}"></label><label class="lbl">Sampai tanggal<input type="date" id="fSampai" class="in" value="${f.sampai}"></label></div><button class="btn ghost kecil" data-aksi="resetR">Reset filter</button></div>` : ''}
  <div id="daftar"></div>`;
}
function isiDaftar() {
  const el = $('#daftar'); if (!el) return;
  const f = state.r, q = f.q.trim().toLowerCase();
  const arr = state.data.filter(x => (f.jenis === 'semua' || x.jenis === f.jenis) && (!f.kat || x.kategori === f.kat) &&
    (!f.dari || x.tanggal >= f.dari) && (!f.sampai || x.tanggal <= f.sampai) &&
    (!q || (x.kategori + ' ' + x.catatan + ' ' + x.nominal).toLowerCase().includes(q))).sort(urut);
  if (!arr.length) {
    el.innerHTML = state.data.length ? kosong('Tidak ada hasil', 'Coba ubah kata kunci atau filter.', false) : kosong('Belum ada transaksi', 'Transaksi yang kamu catat akan muncul di sini.', true);
    return;
  }
  const tampil = arr.slice(0, f.limit); let h = `<p class="ringkas">${arr.length} transaksi</p>`, last = '';
  tampil.forEach(x => {
    if (x.tanggal !== last) { if (last) h += '</div>'; h += `<div class="grup">${labelGrup(x.tanggal)}</div><div class="card list">`; last = x.tanggal; }
    h += barisTrx(x);
  });
  h += '</div>';
  if (arr.length > tampil.length) h += '<button class="btn ghost" style="margin-top:14px" data-aksi="lagi">Tampilkan lebih banyak</button>';
  el.innerHTML = h;
}

/* ---------- Akun ---------- */
function viewAkun() {
  const wkt = state.terakhir ? new Date(state.terakhir).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '–';
  return `<div class="card akun">
    <div class="baris"><span>Status</span><b class="${state.error ? 'buruk' : 'bagus'}">${state.error ? 'Bermasalah' : 'Terhubung'}</b></div>
    <div class="baris"><span>Transaksi terbaca</span><b>${state.data.length}</b></div>
    ${state.dilewati ? `<div class="baris"><span>Baris tidak terbaca</span><b class="buruk">${state.dilewati}</b></div>` : ''}
    <div class="baris"><span>Terakhir diperbarui</span><b>${wkt}</b></div></div>
  ${state.error ? `<div class="card galat">${esc(state.error)}</div>` : ''}
  ${state.dilewati ? '<p class="catatan">Baris yang tidak terbaca biasanya punya tanggal atau nominal yang kosong atau formatnya tidak dikenali.</p>' : ''}
  <button class="btn ghost" data-aksi="muat">${ic('refresh', 20)} Muat ulang data</button>
  <button class="btn ghost" data-aksi="keluar">${ic('lock', 20)} Kunci &amp; keluar</button>`;
}

/* ---------- Render utama ---------- */
function render(animasi = false, paksa = false) {
  if (!state.pin) return;
  const a = document.activeElement;
  if (!paksa && a && a.closest && a.closest('#view') && /INPUT|SELECT/.test(a.tagName)) { if (state.tab === 'riwayat') isiDaftar(); return; }
  const judul = { beranda: 'Ringkasan', grafik: 'Grafik', riwayat: 'Riwayat', akun: 'Akun' };
  $('#judul').textContent = judul[state.tab];
  $('#btnMuat').classList.toggle('putar', state.loading);
  const v = $('#view');
  v.innerHTML = (state.loading && !state.data.length) ? skeleton() : { beranda: viewBeranda, grafik: viewGrafik, riwayat: viewRiwayat, akun: viewAkun }[state.tab]();
  if (animasi) { v.classList.remove('anim'); void v.offsetWidth; v.classList.add('anim'); }
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.v === state.tab));
  v.querySelectorAll('.scroll-x').forEach(el => { el.scrollLeft = el.scrollWidth; });
  if (state.tab === 'riwayat') isiDaftar();
}

/* ---------- Form tambah / ubah ---------- */
function daftarKategori(jenis, terpilih) {
  const cnt = {};
  state.data.forEach(x => { if (x.jenis === jenis) cnt[x.kategori] = (cnt[x.kategori] || 0) + 1; });
  const set = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
  KATEGORI_AWAL[jenis].forEach(k => { if (!set.some(s => s.toLowerCase() === k.toLowerCase())) set.push(k); });
  const hasil = set.slice(0, 14);
  if (terpilih && !hasil.includes(terpilih)) hasil.unshift(terpilih);
  return hasil;
}
function bukaForm(x) {
  form = { id: x ? x.id : '', cek: x ? `${x.tanggal}|${x.nominal}` : '', jenis: x ? x.jenis : 'keluar', nominal: x ? String(x.nominal) : '',
    kategori: x ? x.kategori : '', tanggal: x ? x.tanggal : hariIni(), catatan: x ? x.catatan : '' };
  renderForm();
  requestAnimationFrame(() => requestAnimationFrame(() => $('#sheet').classList.add('open')));
  if (!x) setTimeout(() => { const n = $('#fNominal'); if (n) n.focus(); }, 350);
}
function renderForm() {
  const f = form, edit = !!f.id, kats = daftarKategori(f.jenis, f.kategori);
  $('#sheet').innerHTML = `<div class="overlay" data-aksi="tutup"></div>
  <div class="panel" role="dialog" aria-modal="true"><div class="grip"></div>
    <div class="panel-h"><h2>${edit ? 'Ubah Transaksi' : 'Tambah Transaksi'}</h2><button class="ikon-btn" data-aksi="tutup" aria-label="Tutup">${ic('x', 20)}</button></div>
    <div class="seg ${edit ? 'kunci' : ''}"><button class="${f.jenis === 'keluar' ? 'on keluar' : ''}" data-aksi="jenisForm" data-v="keluar">Pengeluaran</button><button class="${f.jenis === 'masuk' ? 'on masuk' : ''}" data-aksi="jenisForm" data-v="masuk">Pemasukan</button></div>
    <label class="nominal"><span>Rp</span><input id="fNominal" inputmode="numeric" autocomplete="off" placeholder="0" value="${fmtAngka(f.nominal)}"></label>
    <p class="err" id="eNominal"></p>
    <div class="lbl" style="margin-top:6px">Kategori</div>
    <div class="kats">${kats.map(k => `<button class="chip ${k === f.kategori ? 'on' : ''}" data-aksi="kat" data-v="${esc(k)}">${esc(k)}</button>`).join('')}<button class="chip baru" data-aksi="katBaru">+ Baru</button></div>
    <input id="fKatBaru" class="in hidden" placeholder="Nama kategori baru" maxlength="40">
    <p class="err" id="eKat"></p>
    <label class="lbl">Tanggal<input type="date" id="fTanggal" class="in" value="${f.tanggal}"></label>
    <label class="lbl">Catatan (opsional)<input id="fCatatan" class="in" maxlength="120" placeholder="mis. makan siang" value="${esc(f.catatan)}"></label>
    <div class="aksi">${edit ? `<button class="btn hapus" data-aksi="hapus" aria-label="Hapus">${ic('trash', 22)}</button>` : ''}<button class="btn" id="btnSimpan" data-aksi="simpan">Simpan</button></div>
  </div>`;
}
function salinInput() {
  if (!$('#fNominal')) return;
  form.nominal = $('#fNominal').value; form.tanggal = $('#fTanggal').value; form.catatan = $('#fCatatan').value;
  const b = $('#fKatBaru'); if (b && !b.classList.contains('hidden') && b.value.trim()) form.kategori = b.value.trim();
}
function tutupSheet() {
  const s = $('#sheet'); s.classList.remove('open'); setTimeout(() => { if (!s.classList.contains('open')) s.innerHTML = ''; }, 350);
}
async function simpan() {
  salinInput();
  const f = form, nominal = Number(String(f.nominal).replace(/\D/g, ''));
  const gagal = (id, msg) => { const el = $('#' + id); if (el) el.textContent = msg; toast(msg, 'err'); if (navigator.vibrate) navigator.vibrate(60); };
  $('#eNominal').textContent = ''; $('#eKat').textContent = '';
  if (!nominal || nominal <= 0) return gagal('eNominal', 'Nominal tidak boleh kosong atau nol.');
  if (nominal > 1e12) return gagal('eNominal', 'Nominal terlalu besar.');
  if (!f.kategori) return gagal('eKat', 'Pilih atau buat kategori dulu.');
  if (!f.tanggal) return gagal('eKat', 'Tanggal wajib diisi.');
  const btn = $('#btnSimpan'); btn.disabled = true; btn.innerHTML = '<i class="spin"></i> Menyimpan…';
  try {
    const catatan = f.catatan.trim();
    const j = await panggil(f.id ? 'ubah' : 'tambah', { id: f.id, cek: f.cek, jenis: f.jenis, nominal, kategori: f.kategori, tanggal: f.tanggal, catatan });
    if (!f.id) state.data.push({ id: j.id, jenis: f.jenis, tanggal: f.tanggal, kategori: f.kategori, nominal, catatan });
    tutupSheet(); toast(f.id ? 'Perubahan tersimpan ✓' : 'Transaksi tersimpan ✓', 'ok');
    if (navigator.vibrate) navigator.vibrate(25);
    render(); muat();
  } catch (e) {
    if (e.kode === 'PIN') { tutupSheet(); return keluar(e.message); }
    btn.disabled = false; btn.textContent = 'Simpan'; toast('Gagal menyimpan: ' + e.message, 'err');
  }
}
function konfirmasiHapus() {
  const x = state.data.find(i => i.id === form.id); if (!x) return;
  $('#dialog').innerHTML = `<div class="overlay" data-aksi="tutupDialog"></div><div class="dlg"><h3>Hapus transaksi ini?</h3>
    <p>${x.jenis === 'masuk' ? 'Pemasukan' : 'Pengeluaran'} · ${esc(x.kategori)} · ${rp(x.nominal)}<br>${tglPanjang(x.tanggal)}</p>
    <p class="kecil">Barisnya akan dihapus permanen dari spreadsheet.</p>
    <div class="aksi"><button class="btn ghost" data-aksi="tutupDialog">Batal</button><button class="btn merah" id="btnHapusYa" data-aksi="hapusYa">Ya, hapus</button></div></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $('#dialog').classList.add('open')));
}
function tutupDialog() { const d = $('#dialog'); d.classList.remove('open'); setTimeout(() => { if (!d.classList.contains('open')) d.innerHTML = ''; }, 300); }
async function hapusYa() {
  const id = form.id, cek = form.cek, btn = $('#btnHapusYa'); btn.disabled = true; btn.innerHTML = '<i class="spin"></i>';
  try {
    await panggil('hapus', { id, cek });
    state.data = state.data.filter(x => x.id !== id);
    tutupDialog(); tutupSheet(); toast('Transaksi dihapus', 'ok'); render(); muat();
  } catch (e) {
    if (e.kode === 'PIN') { tutupDialog(); tutupSheet(); return keluar(e.message); }
    btn.disabled = false; btn.textContent = 'Ya, hapus'; toast('Gagal menghapus: ' + e.message, 'err');
  }
}

/* ---------- Login / sesi ---------- */
function tampilLogin(pesan = '') {
  $('#app').classList.add('hidden'); $('#nav').classList.add('hidden');
  const el = $('#login'); el.classList.remove('hidden');
  el.innerHTML = `<div class="login-in"><div class="orb besar">${ic('lock', 36)}</div><h1>Keuangan Pribadi</h1><p>Masuk untuk membuka.</p>
    <input id="lUser" class="in" type="text" placeholder="Username" autocomplete="username" autocapitalize="none" autocorrect="off" value="${esc(state.user)}">
    <input id="lPin" class="in pin" type="password" inputmode="numeric" placeholder="PIN" autocomplete="current-password">
    <p class="err" id="lErr">${esc(pesan)}</p><button class="btn" id="lBtn" data-aksi="masuk">Masuk</button></div>`;
}
async function masuk() {
  const user = $('#lUser').value.trim(), pin = $('#lPin').value.trim(), err = $('#lErr'), btn = $('#lBtn');
  if (!API_URL.startsWith('https://script.google.com/')) { err.textContent = 'URL Web App di app.js belum diisi dengan benar.'; return; }
  if (!user) { err.textContent = 'Username wajib diisi.'; return; }
  if (!pin) { err.textContent = 'PIN wajib diisi.'; return; }
  btn.disabled = true; btn.innerHTML = '<i class="spin"></i>'; err.textContent = '';
  state.user = user; state.pin = pin;
  try {
    const j = await panggil('baca');
    localStorage.setItem('user', user); localStorage.setItem('pin', pin);
    state.data = j.data; state.dilewati = j.dilewati; state.terakhir = Date.now(); state.error = '';
    try { localStorage.setItem('cache', JSON.stringify(j.data)); } catch (e) { }
    mulaiApp();
  } catch (e) {
    state.pin = '';
    const el = $('#lErr'); if (el) el.textContent = e.message;
    const b = $('#lBtn'); if (b) { b.disabled = false; b.textContent = 'Masuk'; }
  }
}
function keluar(pesan = '') {
  localStorage.removeItem('pin'); localStorage.removeItem('cache');
  state.pin = ''; state.data = []; tutupSheet(); tampilLogin(pesan);
}
function mulaiApp() {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#nav').classList.remove('hidden');
  $('#sapa').textContent = tglPanjang(hariIni()); $('#btnMuat').innerHTML = ic('refresh', 20);
  state.tab = 'beranda'; render(true);
}

/* ---------- Toast ---------- */
function toast(msg, tipe = '') {
  const t = $('#toast'); t.className = 'toast show ' + tipe; t.textContent = msg;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 2800);
}

/* ---------- Event ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-aksi]'); if (!el) return;
  const v = el.dataset.v;
  const aksi = {
    tab: () => { state.tab = v; window.scrollTo(0, 0); render(true); },
    periode: () => {
      state.periode = v;
      if (v === 'kustom' && !state.dari) { const t = hariIni(); state.dari = t.slice(0, 8) + '01'; state.sampai = t; }
      render();
    },
    tambah: () => bukaForm(),
    edit: () => { const x = state.data.find(i => i.id === el.dataset.id); if (x) bukaForm(x); },
    jenisForm: () => { salinInput(); form.jenis = v; form.kategori = ''; renderForm(); },
    kat: () => {
      form.kategori = v;
      document.querySelectorAll('.kats .chip').forEach(c => c.classList.toggle('on', c.dataset.v === v));
      const b = $('#fKatBaru'); b.classList.add('hidden'); b.value = '';
    },
    katBaru: () => {
      const b = $('#fKatBaru'); b.classList.remove('hidden'); b.focus(); form.kategori = '';
      document.querySelectorAll('.kats .chip').forEach(c => c.classList.remove('on'));
    },
    simpan, tutup: tutupSheet, hapus: konfirmasiHapus, hapusYa, tutupDialog,
    filterToggle: () => { state.r.buka = !state.r.buka; render(false, true); },
    jenisR: () => { state.r.jenis = v; state.r.limit = 60; render(false, true); },
    resetR: () => { Object.assign(state.r, { q: '', kat: '', dari: '', sampai: '', jenis: 'semua', limit: 60 }); render(false, true); },
    lagi: () => { state.r.limit += 60; isiDaftar(); },
    muat, keluar: () => keluar(), masuk
  };
  if (aksi[el.dataset.aksi]) aksi[el.dataset.aksi]();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'fNominal') t.value = fmtAngka(t.value);
  else if (t.id === 'q') { state.r.q = t.value; state.r.limit = 60; isiDaftar(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  const m = {
    kDari: () => { state.dari = t.value; render(false, true); },
    kSampai: () => { state.sampai = t.value; render(false, true); },
    fKat: () => { state.r.kat = t.value; state.r.limit = 60; isiDaftar(); },
    fDari: () => { state.r.dari = t.value; state.r.limit = 60; isiDaftar(); },
    fSampai: () => { state.r.sampai = t.value; state.r.limit = 60; isiDaftar(); }
  };
  if (m[t.id]) m[t.id]();
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'lPin') masuk(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.pin && Date.now() - state.terakhir > 60000) muat();
});

/* ---------- Mulai ---------- */
const tabBtn = (v, ikon, label) => `<button class="tab" data-aksi="tab" data-v="${v}">${ic(ikon, 24)}<span>${label}</span></button>`;
$('#nav').innerHTML = `<div class="nav-in">${tabBtn('beranda', 'home', 'Beranda')}${tabBtn('grafik', 'chart', 'Grafik')}<button class="fab" data-aksi="tambah" aria-label="Tambah transaksi">${ic('plus', 30)}</button>${tabBtn('riwayat', 'list', 'Riwayat')}${tabBtn('akun', 'user', 'Akun')}</div>`;
if (state.api && state.pin) { mulaiApp(); muat(); } else tampilLogin();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
