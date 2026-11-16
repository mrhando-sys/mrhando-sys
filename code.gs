/**
 * KEUANGAN PRIBADI - API ke Google Sheets
 * Tempel di: Spreadsheet > Ekstensi > Apps Script
 * PIN disimpan di Project Settings > Script Properties (nama: PIN)
 */
const NAMA_SHEET = { masuk: 'Pemasukan', keluar: 'Pengeluaran' };
const ALIAS = {
  tanggal:  ['tanggal', 'tgl', 'date', 'waktu'],
  kategori: ['kategori', 'category', 'sumber', 'jenis'],
  nominal:  ['nominal', 'jumlah', 'total', 'amount', 'nilai', 'rp'],
  catatan:  ['catatan', 'keterangan', 'deskripsi', 'note', 'notes', 'ket', 'uraian']
};
const WAJIB = ['tanggal', 'kategori', 'nominal'];
const MAKS_GAGAL = 5;

const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const p2_ = s => ('0' + s).slice(-2);
const aman_ = s => /^[=+\-@]/.test(s) ? "'" + s : s; // cegah teks dibaca sebagai rumus
const norm_ = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
const ss_ = () => SpreadsheetApp.getActiveSpreadsheet();

function doGet() { return json_({ ok: true, pesan: 'API keuangan aktif' }); }

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    cekPin_(req.pin);
    const aksi = { baca: baca_, tambah: tambah_, ubah: ubah_, hapus: hapus_ };
    if (!aksi[req.aksi]) throw new Error('Aksi tidak dikenal.');
    let hasil;
    if (req.aksi === 'baca') {
      hasil = baca_();
    } else {
      const lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try { hasil = aksi[req.aksi](req); } finally { lock.releaseLock(); }
    }
    return json_(Object.assign({ ok: true }, hasil));
  } catch (err) {
    return json_({ ok: false, pesan: err.message, kode: err.kode || '' });
  }
}

function errPin_(pesan) { const e = new Error(pesan); e.kode = 'PIN'; return e; }

function cekPin_(pin) {
  const cache = CacheService.getScriptCache();
  const gagal = Number(cache.get('gagal') || 0);
  if (gagal >= MAKS_GAGAL) throw errPin_('Terlalu banyak percobaan salah. Coba lagi dalam 15 menit.');
  const benar = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!benar) throw errPin_('PIN belum diatur di Script Properties.');
  if (String(pin || '') !== String(benar)) {
    cache.put('gagal', String(gagal + 1), 900);
    throw errPin_('PIN salah.');
  }
  cache.remove('gagal');
}

/* ---------- Membaca struktur sheet ---------- */
function petaSheet_(jenis) {
  const sh = ss_().getSheetByName(NAMA_SHEET[jenis]);
  if (!sh) throw new Error('Sheet "' + NAMA_SHEET[jenis] + '" tidak ditemukan.');
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const atas = sh.getRange(1, 1, Math.min(5, sh.getMaxRows()), lastCol).getDisplayValues();
  for (let r = 0; r < atas.length; r++) {
    const n = atas[r].map(norm_);
    const kol = {};
    for (const f in ALIAS) {
      for (const a of ALIAS[f]) {
        const i = n.indexOf(a);
        if (i >= 0) { kol[f] = i + 1; break; }
      }
    }
    if (WAJIB.every(f => kol[f])) return { sh, baris: r + 1, kol, lastCol };
  }
  throw new Error('Header sheet "' + NAMA_SHEET[jenis] + '" tidak cocok. Header terbaca: ' +
    atas[0].filter(String).join(' | ') + '. Dibutuhkan kolom Tanggal, Kategori, Nominal (Catatan opsional).');
}

function parseTanggal_(v, tz) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + p2_(m[2]) + '-' + p2_(m[3]);
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + p2_(m[2]) + '-' + p2_(m[1]); // teks dianggap dd/mm/yyyy
  }
  return null;
}

function parseNominal_(v) {
  if (typeof v === 'number') return Math.abs(v);
  let s = String(v).replace(/[^0-9,.\-]/g, '');
  if (!s) return null;
  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.abs(n);
}

/* ---------- BACA ---------- */
function baca_() {
  const tz = ss_().getSpreadsheetTimeZone();
  const data = []; let dilewati = 0;
  ['masuk', 'keluar'].forEach(jenis => {
    const p = petaSheet_(jenis);
    const n = p.sh.getLastRow() - p.baris;
    if (n < 1) return;
    const nilai = p.sh.getRange(p.baris + 1, 1, n, p.lastCol).getValues();
    nilai.forEach((row, i) => {
      const rawT = row[p.kol.tanggal - 1], rawN = row[p.kol.nominal - 1];
      if (rawT === '' && rawN === '') return;
      const tgl = parseTanggal_(rawT, tz), nom = parseNominal_(rawN);
      if (!tgl || nom === null) { dilewati++; return; }
      data.push({
        id: jenis + ':' + (p.baris + 1 + i), jenis: jenis, tanggal: tgl,
        kategori: String(row[p.kol.kategori - 1]).trim() || 'Lainnya',
        nominal: nom,
        catatan: p.kol.catatan ? String(row[p.kol.catatan - 1]).trim() : ''
      });
    });
  });
  return { data: data, dilewati: dilewati };
}

/* ---------- TAMBAH ---------- */
function validasi_(req) {
  if (!NAMA_SHEET[req.jenis]) throw new Error('Jenis transaksi tidak valid.');
  const nominal = Number(req.nominal);
  if (!isFinite(nominal) || nominal <= 0) throw new Error('Nominal harus lebih dari 0.');
  const kategori = String(req.kategori || '').trim().slice(0, 60);
  if (!kategori) throw new Error('Kategori wajib diisi.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.tanggal))) throw new Error('Tanggal tidak valid.');
  return { jenis: req.jenis, nominal: Math.round(nominal), kategori: kategori,
           tanggal: req.tanggal, catatan: String(req.catatan || '').trim().slice(0, 200) };
}

function barisKosong_(p) {
  const maks = p.sh.getMaxRows(), awal = p.baris + 1;
  if (maks < awal) { p.sh.insertRowsAfter(maks, 1); return awal; }
  const n = maks - p.baris;
  const t = p.sh.getRange(awal, p.kol.tanggal, n, 1).getValues();
  const nm = p.sh.getRange(awal, p.kol.nominal, n, 1).getValues();
  let terakhir = 0;
  for (let i = 0; i < n; i++) if (t[i][0] !== '' || nm[i][0] !== '') terakhir = i + 1;
  const baris = p.baris + terakhir + 1;
  if (baris > maks) p.sh.insertRowsAfter(maks, 1);
  return baris;
}

function tambah_(req) {
  const d = validasi_(req);
  const p = petaSheet_(d.jenis);
  const baris = barisKosong_(p);
  const [y, m, g] = d.tanggal.split('-').map(Number);
  if (baris - 1 > p.baris) { // salin format dari baris di atasnya (hanya format, bukan isi)
    p.sh.getRange(baris - 1, 1, 1, p.lastCol)
      .copyTo(p.sh.getRange(baris, 1, 1, p.lastCol), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  const sel = f => p.sh.getRange(baris, p.kol[f]);
  const tg = sel('tanggal');
  tg.setValue(new Date(y, m - 1, g, 12));
  if (!/y/i.test(tg.getNumberFormat())) tg.setNumberFormat('dd/mm/yyyy');
  sel('kategori').setValue(aman_(d.kategori));
  sel('nominal').setValue(d.nominal);
  if (p.kol.catatan) sel('catatan').setValue(aman_(d.catatan));
  return { id: d.jenis + ':' + baris };
}

/* ---------- UBAH & HAPUS ---------- */
function cariBaris_(req) {
  const [jenis, no] = String(req.id).split(':');
  const baris = Number(no);
  if (!NAMA_SHEET[jenis] || !baris) throw new Error('ID transaksi tidak valid.');
  const p = petaSheet_(jenis);
  if (baris <= p.baris || baris > p.sh.getLastRow()) throw new Error('Data sudah berubah. Muat ulang aplikasi.');
  const tz = ss_().getSpreadsheetTimeZone();
  const tgl = parseTanggal_(p.sh.getRange(baris, p.kol.tanggal).getValue(), tz);
  const nom = parseNominal_(p.sh.getRange(baris, p.kol.nominal).getValue());
  if (req.cek !== tgl + '|' + nom) throw new Error('Baris di spreadsheet sudah berubah. Muat ulang lalu coba lagi.');
  return { p: p, baris: baris, jenis: jenis };
}

function ubah_(req) {
  const t = cariBaris_(req);
  const d = validasi_(Object.assign({}, req, { jenis: t.jenis }));
  const [y, m, g] = d.tanggal.split('-').map(Number);
  const sel = f => t.p.sh.getRange(t.baris, t.p.kol[f]);
  const tg = sel('tanggal');
  tg.setValue(new Date(y, m - 1, g, 12));
  if (!/y/i.test(tg.getNumberFormat())) tg.setNumberFormat('dd/mm/yyyy');
  sel('kategori').setValue(aman_(d.kategori));
  sel('nominal').setValue(d.nominal);
  if (t.p.kol.catatan) sel('catatan').setValue(aman_(d.catatan));
  return { id: req.id };
}

function hapus_(req) {
  const t = cariBaris_(req);
  t.p.sh.deleteRow(t.baris);
  return {};
}
