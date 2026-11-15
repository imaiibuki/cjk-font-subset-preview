import { loadHb, subsetFont, buildCodepointSet, cmapCodepoints, readNumGlyphs, fmtBytes } from './subset_core.js';

const $ = (id) => document.getElementById(id);
let fontBytes = null, fontName = '', fileTexts = [], lastOut = null, hbPromise = null;

function getHb() {
  if (!hbPromise) {
    hbPromise = fetch('vendor/hb-subset.wasm')
      .then((r) => { if (!r.ok) throw new Error('Could not load vendor/hb-subset.wasm (' + r.status + ')'); return r.arrayBuffer(); })
      .then((b) => loadHb(b));
  }
  return hbPromise;
}

function allText() { return $('text').value + '\n' + fileTexts.map((f) => f.text).join('\n'); }
function opts() { return { ascii: $('optAscii').checked, kana: $('optKana').checked, cjkPunct: $('optPunct').checked }; }

function updateCount() {
  const set = new Set();
  for (const ch of allText()) { const c = ch.codePointAt(0); if (c >= 0x20) set.add(c); }
  let na = 0; for (const c of set) if (c > 0x7F) na++;
  $('charcount').textContent = `Unique characters: ${set.size} (non-ASCII: ${na})`;
}

async function setFont(file) {
  $('err').textContent = '';
  try {
    const b = new Uint8Array(await file.arrayBuffer());
    const n = readNumGlyphs(b); // validates sfnt
    fontBytes = b; fontName = file.name;
    $('fontinfo').textContent = `${file.name} — ${fmtBytes(b.length)} (${b.length} bytes), ${n} glyphs`;
    $('build').disabled = false;
  } catch (e) { fontBytes = null; $('build').disabled = true; $('fontinfo').textContent = ''; $('err').textContent = e.message; }
}

$('font').addEventListener('change', (e) => { if (e.target.files[0]) setFont(e.target.files[0]); });
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) setFont(e.dataTransfer.files[0]); });

$('text').addEventListener('input', updateCount);
$('textfiles').addEventListener('change', async (e) => {
  fileTexts = [];
  for (const f of e.target.files) fileTexts.push({ name: f.name, text: await f.text() });
  $('filelist').textContent = fileTexts.length ? 'Loaded: ' + fileTexts.map((f) => f.name).join(', ') : '';
  updateCount();
});

$('build').addEventListener('click', async () => {
  $('err').textContent = ''; $('build').disabled = true;
  try {
    const hb = await getHb();
    const req = buildCodepointSet(allText(), opts());
    const out = subsetFont(hb, fontBytes, req);
    const have = cmapCodepoints(fontBytes);
    const missing = []; for (const c of req) if (c > 0x20 && !have.has(c)) missing.push(c);
    lastOut = out;
    $('rOrig').textContent = `${fontBytes.length} bytes (${fmtBytes(fontBytes.length)})`;
    $('rSub').textContent = `${out.length} bytes (${fmtBytes(out.length)})`;
    $('rRatio').textContent = (out.length / fontBytes.length * 100).toFixed(2) + ' %';
    $('rGlyphs').textContent = String(readNumGlyphs(out));
    $('rReq').textContent = String(req.size);
    const shown = missing.slice(0, 200).map((c) => String.fromCodePoint(c) + ' (U+' + c.toString(16).toUpperCase().padStart(4, '0') + ')').join(' ');
    $('rMissing').textContent = missing.length ? `${missing.length}: ${shown}${missing.length > 200 ? ' ...' : ''}` : '0';
    $('result').hidden = false;
  } catch (e) { $('err').textContent = e.message; }
  $('build').disabled = !fontBytes;
});

$('download').addEventListener('click', () => {
  if (!lastOut) return;
  const m = /\.(ttf|otf)$/i.exec(fontName);
  const ext = m ? m[1].toLowerCase() : 'ttf';
  const base = fontName.replace(/\.[^.]+$/, '');
  const url = URL.createObjectURL(new Blob([lastOut], { type: 'font/' + ext }));
  const a = document.createElement('a'); a.href = url; a.download = `${base}.subset.${ext}`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
