// Finds a PICTURE on a book page (illustration, diagram, photo), so the website shows only real images
// beside Krishna Sakha, never plain text pages.
//
// The page is divided into small squares. Text squares are mostly paper with thin strokes (about 10–35% ink);
// picture squares are densely filled (shading, halftone, solid areas). The largest cluster of dense squares
// that looks like a picture (not a dark scan border or a bold heading) is returned as a crop box.

const B = 16;              // square size in pixels (pages are analysed at ~640 px wide)
const DENSE = 0.5;         // share of non-paper pixels that makes a square "picture-like"
const MIN_SHARE = 0.025;   // the picture must cover at least 2.5% of the page…
const MIN_BLOCKS = 14;     // …and at least this many squares

export function findPicture(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  const lum = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;

  // paper colour = a bright percentile (scans are often cream or grey, not pure white)
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i += 7) hist[lum[i]]++;
  let total = 0; for (const n of hist) total += n;
  let acc = 0, paper = 255;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.35) { paper = v; break; } }
  if (paper < 90) return null;                      // a dark page (cover/photo plate): leave it
  const cut = paper - 28;

  const cols = Math.floor(w / B), rows = Math.floor(h / B);
  const dense = new Uint8Array(cols * rows);
  const mx = Math.ceil(cols * 0.04), my = Math.ceil(rows * 0.03);   // ignore scan margins / gutter shadows
  for (let r = my; r < rows - my; r++) {
    for (let c = mx; c < cols - mx; c++) {
      let ink = 0;
      for (let y = r * B; y < (r + 1) * B; y += 2) for (let x = c * B; x < (c + 1) * B; x += 2) if (lum[y * w + x] < cut) ink++;
      if (ink / ((B / 2) * (B / 2)) > DENSE) dense[r * cols + c] = 1;
    }
  }

  // clusters of dense squares (8-neighbour, bridging 1-square gaps so a halftone photo stays one piece)
  const seen = new Uint8Array(cols * rows);
  let best = null;
  for (let s = 0; s < dense.length; s++) {
    if (!dense[s] || seen[s]) continue;
    const stack = [s]; seen[s] = 1;
    let n = 0, c0 = cols, c1 = 0, r0 = rows, r1 = 0;
    while (stack.length) {
      const k = stack.pop(); n++;
      const r = Math.floor(k / cols), c = k % cols;
      if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const kk = rr * cols + cc;
        if (dense[kk] && !seen[kk]) { seen[kk] = 1; stack.push(kk); }
      }
    }
    const bw = c1 - c0 + 1, bh = r1 - r0 + 1;
    const fill = n / (bw * bh);
    const aspect = bw / bh;
    // a picture is a solid-ish block of reasonable shape, not a thin rule or a line of bold text
    if (n < MIN_BLOCKS || n / (cols * rows) < MIN_SHARE || fill < 0.3 || aspect > 5 || aspect < 0.2 || bh < 3 || bw < 3) continue;
    if (!best || n > best.n) best = { n, c0, c1, r0, r1 };
  }
  if (!best) return null;
  const pad = B;
  const x = Math.max(0, best.c0 * B - pad), y = Math.max(0, best.r0 * B - pad);
  return {
    x, y, w: Math.min(w, (best.c1 + 1) * B + pad) - x, h: Math.min(h, (best.r1 + 1) * B + pad) - y,
    score: best.n / (cols * rows),
  };
}
