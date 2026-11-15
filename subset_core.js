// Subsetting core: usable from the page (browser) and Node. ES module.
// Uses hb-subset.wasm (HarfBuzz, standalone, no imports) from harfbuzzjs 1.6.4.

export async function loadHb(wasmBytesOrModule) {
  const mod = wasmBytesOrModule instanceof WebAssembly.Module
    ? wasmBytesOrModule : await WebAssembly.compile(wasmBytesOrModule);
  const inst = await WebAssembly.instantiate(mod, {});
  const ex = inst.exports;
  if (ex._initialize) ex._initialize();
  return ex;
}

// Parse the sfnt table directory. Returns Map tag -> {offset,length}.
export function sfntTables(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 12) throw new Error('File too small to be a font');
  const tag = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
  const ver = dv.getUint32(0);
  if (tag === 'ttcf') throw new Error('Font collections (.ttc) are not supported');
  if (!(ver === 0x00010000 || tag === 'OTTO' || tag === 'true')) throw new Error('Not a TrueType/OpenType font (bad sfnt version)');
  const n = dv.getUint16(4);
  const t = new Map();
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    if (o + 16 > u8.length) break;
    const name = String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    t.set(name, { offset: dv.getUint32(o + 8), length: dv.getUint32(o + 12) });
  }
  return t;
}

export function readNumGlyphs(u8) {
  const maxp = sfntTables(u8).get('maxp');
  if (!maxp) throw new Error('No maxp table');
  return new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint16(maxp.offset + 4);
}

// Collect the Unicode codepoints mapped by the font's cmap (formats 4 and 12).
export function cmapCodepoints(u8) {
  const cm = sfntTables(u8).get('cmap');
  const out = new Set();
  if (!cm) return out;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const base = cm.offset;
  const nSub = dv.getUint16(base + 2);
  const seen = new Set();
  for (let i = 0; i < nSub; i++) {
    const plat = dv.getUint16(base + 4 + i * 8);
    const enc = dv.getUint16(base + 6 + i * 8);
    const off = dv.getUint32(base + 8 + i * 8);
    const unicode = plat === 0 || (plat === 3 && (enc === 1 || enc === 10));
    if (!unicode || seen.has(off)) continue;
    seen.add(off);
    const s = base + off;
    const fmt = dv.getUint16(s);
    if (fmt === 4) {
      const segX2 = dv.getUint16(s + 6);
      const endO = s + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
      for (let k = 0; k < segX2 / 2; k++) {
        const end = dv.getUint16(endO + k * 2), start = dv.getUint16(startO + k * 2);
        const delta = dv.getUint16(deltaO + k * 2), ro = dv.getUint16(rangeO + k * 2);
        for (let c = start; c <= end && c !== 0xFFFF; c++) {
          let g;
          if (ro === 0) g = (c + delta) & 0xFFFF;
          else {
            const p = rangeO + k * 2 + ro + (c - start) * 2;
            if (p + 2 > u8.length) continue;
            g = dv.getUint16(p);
            if (g) g = (g + delta) & 0xFFFF;
          }
          if (g) out.add(c);
        }
      }
    } else if (fmt === 12) {
      const ng = dv.getUint32(s + 12);
      for (let k = 0; k < ng; k++) {
        const o = s + 16 + k * 12;
        const a = dv.getUint32(o), b = dv.getUint32(o + 4), g = dv.getUint32(o + 8);
        if (b - a > 0x110000) continue;
        for (let c = a; c <= b; c++) if (g + (c - a) !== 0) out.add(c);
      }
    }
  }
  return out;
}

// Build the requested codepoint Set from text + options.
export function buildCodepointSet(text, opts = {}) {
  const set = new Set();
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c === 0xFEFF) continue;
    if (c >= 0x20 || c === 0x0A || c === 0x09) set.add(c);
  }
  const range = (a, b) => { for (let c = a; c <= b; c++) set.add(c); };
  if (opts.ascii) range(0x20, 0x7E);
  if (opts.kana) range(0x3040, 0x30FF);
  if (opts.cjkPunct) { range(0x3000, 0x303F); range(0xFF00, 0xFFEF); }
  return set;
}

// Subset fontBytes (Uint8Array) to the codepoints in `codepoints` (iterable of ints).
export function subsetFont(hb, fontBytes, codepoints) {
  const mem = () => new Uint8Array(hb.memory.buffer);
  const ptr = hb.malloc(fontBytes.length);
  if (!ptr) throw new Error('malloc failed');
  mem().set(fontBytes, ptr);
  let blob = 0, face = 0, input = 0, sub = 0, outBlob = 0;
  try {
    blob = hb.hb_blob_create(ptr, fontBytes.length, 1 /* READONLY */, 0, 0);
    face = hb.hb_face_create(blob, 0);
    input = hb.hb_subset_input_create_or_fail();
    if (!input) throw new Error('hb_subset_input_create_or_fail failed');
    const uset = hb.hb_subset_input_unicode_set(input);
    for (const c of codepoints) hb.hb_set_add(uset, c);
    sub = hb.hb_subset_or_fail(face, input);
    if (!sub) throw new Error('Subsetting failed (unsupported or broken font)');
    outBlob = hb.hb_face_reference_blob(sub);
    const len = hb.hb_blob_get_length(outBlob);
    const dp = hb.hb_blob_get_data(outBlob, 0);
    if (!len || !dp) throw new Error('Empty subset result');
    return mem().slice(dp, dp + len); // copy out of wasm memory
  } finally {
    if (outBlob) hb.hb_blob_destroy(outBlob);
    if (sub) hb.hb_face_destroy(sub);
    if (input) hb.hb_subset_input_destroy(input);
    if (face) hb.hb_face_destroy(face);
    if (blob) hb.hb_blob_destroy(blob);
    hb.free(ptr);
  }
}

export function fmtBytes(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}
