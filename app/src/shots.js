// Fixed scenes for screenshots: ?shot=editor shows the editor with sample
// photos loaded; ?shot=cover shows the finished cover alone, full-bleed.
// `photo` picks the first sample, `caption` the title, `layout` the panel
// layout and `size` the export size the cover is drawn at. The scene sets
// window.__shotReady once the cover is painted.

/** Waits until the vendored fonts can draw, then two animation frames. */
export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('100px Pacifico'),
      document.fonts.ready,
    ]);
  } catch {
    // The cover still draws with the fallback fonts.
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export async function runShot(shot, query, api) {
  const photo = query.get('photo') ?? 'boulevard';
  const other = photo === 'boulevard' ? 'pier' : 'boulevard';
  const caption = query.get('caption') ?? 'Neon Coast';
  const layout = query.get('layout') ?? 'hero3';
  const size = query.get('size') ?? '1080x1080';
  const subtitle = query.get('subtitle') ?? 'chasing the neon sunset';
  const grade = query.get('grade') ?? 'neon';

  await api.loadSamples([`samples/${photo}.jpg`, `samples/${other}.jpg`]);
  api.applyShot({ layout, caption, subtitle, grade, size });
  // Frame the photos on their subjects: the samples are portraits, so a
  // wide panel needs its crop nudged toward the top of the photo.
  if (layout === 'hero3') api.setPanelCrop(0, { zoom: 1, dx: 0, dy: 0.7 });
  if (layout === 'tilt') {
    api.setPanelCrop(0, { zoom: 1, dx: 0, dy: 0.65 });
    api.setPanelCrop(1, { zoom: 1, dx: 0, dy: 0.5 });
  }
  if (shot === 'cover') document.body.classList.add('shot-cover');
  await fontsReady();
  api.render();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
