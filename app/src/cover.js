// Neon Coast cover renderer: every cover is drawn by renderCover onto any 2D
// canvas, at any size, from the same state the editor holds. Layouts, colour
// grades, lettering and effects all live here, so the live preview and the
// exported PNG are the same drawing. No Rockstar art, logo or font is used:
// the lettering is Anton and Pacifico, both shipped under the SIL Open Font
// License in app/fonts/.

export const LAYOUTS = [
  { id: 'hero3', name: 'Hero + 3', panels: 4, blurb: 'Big hero photo over three panels' },
  { id: 'grid9', name: 'Grid 9', panels: 9, blurb: 'Nine-panel poster grid' },
  { id: 'fullbleed', name: 'Full Bleed', panels: 1, blurb: 'One photo, edge to edge' },
  { id: 'split4', name: 'Split 4', panels: 4, blurb: 'Four equal panels' },
  { id: 'tilt', name: 'Tilted Shot', panels: 2, blurb: 'Tilted snapshot over a backdrop' },
];

export const GRADES = [
  { id: 'sunset', name: 'Sunset', filter: 'saturate(1.25) contrast(1.08)', accent: '#ffd319', title: ['#ffe66d', '#ff7b2f', '#ff2975'] },
  { id: 'neon', name: 'Neon', filter: 'saturate(1.55) contrast(1.12)', accent: '#00f0ff', title: ['#00f0ff', '#ff2975', '#ffd319'] },
  { id: 'vice', name: 'Vice', filter: 'saturate(1.3) contrast(1.06)', accent: '#e0aaff', title: ['#c77dff', '#ff2975', '#ff5d8f'] },
  { id: 'gold', name: 'Golden Hour', filter: 'sepia(0.28) saturate(1.45) contrast(1.06)', accent: '#ffe66d', title: ['#fff3b0', '#ffb703', '#fb8500'] },
  { id: 'mono', name: 'Mono Pop', filter: 'grayscale(1) contrast(1.28) brightness(1.06)', accent: '#ff9ecf', title: ['#ffffff', '#ffd6ec', '#ff9ecf'] },
];

export const SIZES = [
  { id: '1080x1080', label: 'Square · 1080 × 1080', w: 1080, h: 1080 },
  { id: '1080x1350', label: 'Portrait · 1080 × 1350', w: 1080, h: 1350 },
  { id: '1920x1080', label: 'Wide · 1920 × 1080', w: 1920, h: 1080 },
];

export function gradeById(id) {
  return GRADES.find((g) => g.id === id) ?? GRADES[0];
}

export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

export function sizeById(id) {
  return SIZES.find((s) => s.id === id) ?? SIZES[0];
}

/** Panel rectangles for a layout, in cover pixels. The title band owns the
 *  bottom strip (the top strip for the tilted layout); panels fill the rest. */
export function panelRects(layoutId, W, H) {
  const g = Math.max(4, Math.round(Math.min(W, H) * 0.008));
  const bandH = Math.round(H * 0.17);
  const contentH = H - bandH;
  const area = { x: g, y: g, w: W - 2 * g, h: contentH - 2 * g };
  if (layoutId === 'fullbleed') return [{ x: 0, y: 0, w: W, h: H }];
  if (layoutId === 'tilt') {
    const sw = Math.round(W * 0.6);
    const sh = Math.round(H * 0.48);
    return [
      { x: 0, y: 0, w: W, h: H },
      { x: Math.round((W - sw) / 2 + W * 0.06), y: Math.round(bandH + (contentH - sh) / 2), w: sw, h: sh, angle: -0.12 },
    ];
  }
  if (layoutId === 'grid9') {
    const cw = Math.round((area.w - 2 * g) / 3);
    const ch = Math.round((area.h - 2 * g) / 3);
    const rects = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        rects.push({
          x: area.x + col * (cw + g),
          y: area.y + row * (ch + g),
          w: col === 2 ? area.x + area.w - (area.x + 2 * (cw + g)) : cw,
          h: row === 2 ? area.y + area.h - (area.y + 2 * (ch + g)) : ch,
        });
      }
    }
    return rects;
  }
  if (layoutId === 'split4') {
    const cw = Math.round((area.w - g) / 2);
    const ch = Math.round((area.h - g) / 2);
    return [
      { x: area.x, y: area.y, w: cw, h: ch },
      { x: area.x + cw + g, y: area.y, w: area.x + area.w - (area.x + cw + g), h: ch },
      { x: area.x, y: area.y + ch + g, w: cw, h: area.y + area.h - (area.y + ch + g) },
      { x: area.x + cw + g, y: area.y + ch + g, w: area.x + area.w - (area.x + cw + g), h: area.y + area.h - (area.y + ch + g) },
    ];
  }
  // hero3 (default)
  const heroH = Math.round(area.h * 0.58);
  const rowY = area.y + heroH + g;
  const rowH = area.y + area.h - rowY;
  const pw = Math.round((area.w - 2 * g) / 3);
  return [
    { x: area.x, y: area.y, w: area.w, h: heroH },
    { x: area.x, y: rowY, w: pw, h: rowH },
    { x: area.x + pw + g, y: rowY, w: pw, h: rowH },
    { x: area.x + 2 * (pw + g), y: rowY, w: area.x + area.w - (area.x + 2 * (pw + g)), h: rowH },
  ];
}

/** How far a photo may be panned inside a panel without leaving a gap:
 *  the slack between the drawn photo and the panel, in panel fractions. */
export function cropLimits(img, rect, zoom) {
  const base = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * (zoom ?? 1);
  const pw = img.naturalWidth * base;
  const ph = img.naturalHeight * base;
  return {
    dx: Math.max(0, (pw - rect.w) / (2 * rect.w)),
    dy: Math.max(0, (ph - rect.h) / (2 * rect.h)),
  };
}

/** Draws one photo into a panel rect with cover-fit, honouring its crop
 *  (zoom and pan offsets, in fractions of the panel). */
export function drawPhotoInPanel(ctx, img, rect, crop, filter) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (filter) ctx.filter = filter;
  const zoom = crop?.zoom ?? 1;
  const base = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
  const pw = img.naturalWidth * base;
  const ph = img.naturalHeight * base;
  const cx = x + w / 2 + (crop?.dx ?? 0) * w;
  const cy = y + h / 2 + (crop?.dy ?? 0) * h;
  ctx.drawImage(img, cx - pw / 2, cy - ph / 2, pw, ph);
  ctx.filter = 'none';
  ctx.restore();
}

function drawEmptyPanel(ctx, rect, label) {
  const { x, y, w, h } = rect;
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, '#3b1d5e');
  grad.addColorStop(1, '#8a2a6d');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = Math.max(2, w * 0.01);
  for (let d = -h; d < w + h; d += Math.max(18, w * 0.08)) {
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.max(14, Math.min(w, h) * 0.14);
  ctx.font = `${size}px Anton, sans-serif`;
  ctx.fillText('+', x + w / 2, y + h / 2 - size * 0.7);
  const labelSize = Math.max(10, Math.min(w, h) * 0.07);
  ctx.font = `${labelSize}px Anton, sans-serif`;
  ctx.fillText(label, x + w / 2, y + h / 2 + size * 0.5);
}

/** A five-pointed star path centred at (cx, cy) with outer radius r. */
export function starPath(ctx, cx, cy, r) {
  const inner = r * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

let grainTile = null;
function grainPattern(ctx) {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 140;
  tile.height = 140;
  const tctx = tile.getContext('2d');
  const data = tctx.createImageData(140, 140);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  tctx.putImageData(data, 0, 0);
  grainTile = ctx.createPattern(tile, 'repeat');
  return grainTile;
}

let halftoneTile = null;
function halftonePattern(ctx, color) {
  if (halftoneTile) return halftoneTile;
  const tile = document.createElement('canvas');
  tile.width = 22;
  tile.height = 22;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = color;
  tctx.beginPath();
  tctx.arc(5, 5, 3.2, 0, Math.PI * 2);
  tctx.fill();
  tctx.beginPath();
  tctx.arc(16, 16, 3.2, 0, Math.PI * 2);
  tctx.fill();
  halftoneTile = ctx.createPattern(tile, 'repeat');
  return halftoneTile;
}

/** The warm / neon colour wash that unifies the panels into one grade. */
function applyGradeWash(ctx, gradeId, W, H) {
  ctx.save();
  if (gradeId === 'sunset') {
    const wash = ctx.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, 'rgba(255, 150, 60, 0)');
    wash.addColorStop(1, 'rgba(255, 60, 110, 0.34)');
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255, 140, 40, 0.35)';
    ctx.fillRect(0, 0, W, H);
  } else if (gradeId === 'neon') {
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    top.addColorStop(0, 'rgba(255, 41, 117, 0.38)');
    top.addColorStop(1, 'rgba(255, 41, 117, 0)');
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, H * 0.55);
    const bottom = ctx.createLinearGradient(0, H * 0.45, 0, H);
    bottom.addColorStop(0, 'rgba(0, 240, 255, 0)');
    bottom.addColorStop(1, 'rgba(0, 240, 255, 0.34)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, H * 0.45, W, H * 0.55);
  } else if (gradeId === 'vice') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(120, 40, 180, 0.28)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255, 41, 117, 0.30)';
    ctx.fillRect(0, 0, W, H);
  } else if (gradeId === 'gold') {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255, 170, 30, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255, 120, 0, 0.22)';
    ctx.fillRect(0, 0, W, H);
  } else if (gradeId === 'mono') {
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255, 158, 207, 0.22)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** The title block: a halftone band with a neon top edge, the script subtitle,
 *  the big Anton title in a grade gradient, and a star meter. */
function drawTitleBlock(ctx, state, grade, W, H) {
  const bandH = Math.round(H * 0.17);
  const top = state.layout === 'tilt';
  const bandY = top ? 0 : H - bandH;
  // Band background.
  const bg = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  bg.addColorStop(0, '#22103a');
  bg.addColorStop(1, '#0d0518');
  ctx.fillStyle = bg;
  ctx.fillRect(0, bandY, W, bandH);
  // Halftone dots.
  if (state.halftone) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = halftonePattern(ctx, grade.accent);
    ctx.fillRect(0, bandY, W, bandH);
    ctx.restore();
  }
  // Neon edge line.
  const edge = ctx.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, '#ff2975');
  edge.addColorStop(0.5, '#ffd319');
  edge.addColorStop(1, '#00f0ff');
  ctx.fillStyle = edge;
  ctx.fillRect(0, top ? bandY + bandH - Math.max(3, H * 0.004) : bandY, W, Math.max(3, H * 0.004));
  // Subtitle in script.
  const sub = (state.subtitle || '').trim();
  const subSize = Math.max(14, bandH * 0.2);
  if (sub) {
    ctx.font = `${subSize}px Pacifico, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = grade.accent;
    ctx.fillText(sub, W / 2, bandY + bandH * 0.24);
  }
  // Title in Anton, fitted to the width, gradient-filled with a dark outline.
  const title = (state.title || 'NEON COAST').trim().toUpperCase() || 'NEON COAST';
  let size = bandH * 0.52;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fit = () => {
    ctx.font = `${size}px Anton, sans-serif`;
    try { ctx.letterSpacing = `${Math.max(1, size * 0.02)}px`; } catch { /* older canvas */ }
    return ctx.measureText(title).width;
  };
  while (fit() > W * 0.92 && size > 12) size -= 2;
  const titleY = bandY + bandH * (sub ? 0.62 : 0.52);
  const tw = ctx.measureText(title).width;
  const grad = ctx.createLinearGradient(W / 2 - tw / 2, 0, W / 2 + tw / 2, 0);
  grade.title.forEach((c, i) => grad.addColorStop(i / (grade.title.length - 1), c));
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(16, 4, 32, 0.95)';
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.strokeText(title, W / 2, titleY);
  ctx.fillStyle = grad;
  ctx.fillText(title, W / 2, titleY);
  try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }
  // Star meter.
  const stars = Math.max(0, Math.min(5, state.stars ?? 5));
  if (stars > 0) {
    const r = Math.max(6, bandH * 0.075);
    const gap = r * 2.4;
    const total = 5 * gap - (gap - r * 2);
    let cx = W / 2 - total / 2 + r;
    const cy = bandY + bandH * 0.9;
    for (let i = 0; i < 5; i++) {
      starPath(ctx, cx, cy, r);
      if (i < stars) {
        ctx.fillStyle = '#ffd319';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = Math.max(1, r * 0.16);
        ctx.stroke();
      }
      cx += gap;
    }
  }
}

/** The badge ribbon: a tilted strip with the badge words, top-left. */
function drawBadgeRibbon(ctx, state, W, H) {
  const badge = (state.badge || '').trim();
  if (!badge) return;
  const size = Math.max(13, H * 0.026);
  ctx.save();
  ctx.font = `${size}px Anton, sans-serif`;
  const tw = ctx.measureText(badge.toUpperCase()).width;
  const bw = tw + size * 1.6;
  const bh = size * 1.9;
  ctx.translate(W * 0.02 + bw / 2, H * 0.055);
  ctx.rotate(-0.1);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = H * 0.01;
  ctx.shadowOffsetY = H * 0.004;
  const grad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  grad.addColorStop(0, '#ff2975');
  grad.addColorStop(1, '#ffd319');
  ctx.fillStyle = grad;
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#16041f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge.toUpperCase(), 0, 1);
  ctx.restore();
}

/** Draws the whole cover for `state` onto `ctx` at W x H. `state.photos` is an
 *  array of images; `state.panelPhotos` maps each panel to a photo index
 *  (-1 leaves the panel empty); `state.crops` maps a panel index to a crop. */
export function renderCover(ctx, state, W, H) {
  const grade = gradeById(state.grade);
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#12081d';
  ctx.fillRect(0, 0, W, H);
  const rects = panelRects(state.layout, W, H);
  const border = Math.max(3, Math.round(Math.min(W, H) * 0.005));
  rects.forEach((rect, i) => {
    const photoIndex = state.panelPhotos?.[i] ?? (state.photos?.length ? i % state.photos.length : -1);
    const img = photoIndex >= 0 ? state.photos?.[photoIndex] : null;
    if (rect.angle) {
      // Tilted snapshot: white polaroid-style border, soft shadow.
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate(rect.angle);
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = Math.round(H * 0.02);
      ctx.shadowOffsetY = Math.round(H * 0.008);
      ctx.fillStyle = '#ffffff';
      const pad = Math.round(Math.min(W, H) * 0.012);
      ctx.fillRect(-rect.w / 2 - pad, -rect.h / 2 - pad, rect.w + pad * 2, rect.h + pad * 2);
      ctx.shadowColor = 'transparent';
      if (img) drawPhotoInPanel(ctx, img, { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h }, state.crops?.[i], grade.filter);
      else drawEmptyPanel(ctx, { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h }, 'ADD PHOTO');
      ctx.restore();
      return;
    }
    if (img) drawPhotoInPanel(ctx, img, rect, state.crops?.[i], grade.filter);
    else drawEmptyPanel(ctx, rect, 'ADD PHOTO');
    // Inked white panel border.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = border;
    ctx.strokeRect(rect.x + border / 2, rect.y + border / 2, rect.w - border, rect.h - border);
    ctx.strokeStyle = 'rgba(10, 2, 20, 0.6)';
    ctx.lineWidth = Math.max(1, border * 0.35);
    ctx.strokeRect(rect.x + border * 1.4, rect.y + border * 1.4, rect.w - border * 2.8, rect.h - border * 2.8);
  });
  applyGradeWash(ctx, state.grade, W, H);
  drawTitleBlock(ctx, state, grade, W, H);
  drawBadgeRibbon(ctx, state, W, H);
  // Grain, then vignette.
  if (state.grain) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (state.vignette) {
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(5,0,12,0.5)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
