// Neon Coast editor wiring: builds the control rows, keeps the live preview
// in step with the editor state, handles photo uploads, panel dragging and
// zooming, and exports the cover as PNGs. A `?shot=` query sets up a fixed
// scene for a screenshot instead (./shots.js).

import { GRADES, LAYOUTS, SIZES, cropLimits, panelRects, renderCover, sizeById } from './cover.js';
import { createEditor, loadImage } from './editor.js';
import { fontsReady, runShot } from './shots.js';

const editor = createEditor();
const preview = document.getElementById('preview');
const status = document.getElementById('status');
const panelLabel = document.getElementById('panelLabel');
const tray = document.getElementById('tray');
const zoomRange = document.getElementById('zoomRange');
let currentSize = SIZES[0];
let drag = null;
let gestureSnapshot = null;

function setStatus(text) {
  status.textContent = text;
}

/** Draws the live preview at the selected export size. */
function renderPreview() {
  preview.width = currentSize.w;
  preview.height = currentSize.h;
  renderCover(preview.getContext('2d'), editor.renderState(), currentSize.w, currentSize.h);
  updatePanelLabel();
  document.getElementById('undoBtn').disabled = !editor.canUndo();
  document.getElementById('redoBtn').disabled = !editor.canRedo();
}

function updatePanelLabel() {
  const count = LAYOUTS.find((l) => l.id === editor.settings.layout).panels;
  const crop = editor.settings.crops[editor.selectedPanel];
  panelLabel.textContent = `Panel ${editor.selectedPanel + 1} of ${count} — click another panel in the preview to select it.`;
  zoomRange.value = String(crop?.zoom ?? 1);
}

/** Writes the state back into the controls (after an undo or redo). */
function syncControlsFromState() {
  const s = editor.settings;
  document.getElementById('titleInput').value = s.title;
  document.getElementById('subtitleInput').value = s.subtitle;
  document.getElementById('badgeInput').value = s.badge;
  document.getElementById('starsInput').value = String(s.stars);
  document.getElementById('grainCheck').checked = s.grain;
  document.getElementById('vignetteCheck').checked = s.vignette;
  document.getElementById('halftoneCheck').checked = s.halftone;
}

/** A choice row of buttons; the active one is marked aria-pressed. */
function buildChoiceRow(el, items, activeId, onPick) {
  el.innerHTML = '';
  items.forEach((item) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = item.name ?? item.label;
    b.title = item.blurb ?? item.label;
    b.dataset.id = item.id;
    b.setAttribute('aria-pressed', String(item.id === activeId));
    b.addEventListener('click', () => {
      onPick(item.id);
      el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    el.appendChild(b);
  });
}

function buildLayoutRow() {
  buildChoiceRow(document.getElementById('layoutRow'), LAYOUTS, editor.settings.layout, (id) => {
    editor.update({ layout: id, panelPhotos: [], crops: {} });
    editor.spreadPhotos();
    setStatus(`Layout: ${LAYOUTS.find((l) => l.id === id).name}.`);
  });
}

function buildGradeRow() {
  buildChoiceRow(document.getElementById('gradeRow'), GRADES, editor.settings.grade, (id) => {
    editor.update({ grade: id });
    setStatus(`Grade: ${GRADES.find((g) => g.id === id).name}.`);
  });
}

function buildSizeRow() {
  buildChoiceRow(document.getElementById('sizeRow'), SIZES, currentSize.id, (id) => {
    currentSize = sizeById(id);
    renderPreview();
    setStatus(`Preview size: ${currentSize.label}.`);
  });
}

/** Rebuilds the photo tray thumbnails from the editor's photos. */
function renderTray() {
  tray.innerHTML = '';
  editor.photos.forEach((photo, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb';
    b.title = `${photo.name} — click to put it in the selected panel`;
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = photo.name;
    b.appendChild(img);
    const caption = document.createElement('span');
    caption.textContent = photo.name;
    b.appendChild(caption);
    b.addEventListener('click', () => {
      editor.assignPhoto(editor.selectedPanel, i);
      setStatus(`Panel ${editor.selectedPanel + 1} now shows ${photo.name}.`);
    });
    tray.appendChild(b);
  });
  if (!editor.photos.length) {
    tray.textContent = 'No photos yet — add your own, or try the samples.';
  }
}

async function addFiles(files) {
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      editor.addPhoto(img, file.name);
      editor.photos[editor.photos.length - 1].url = url;
      added++;
    } catch {
      URL.revokeObjectURL(url);
    }
  }
  if (added) {
    editor.spreadPhotos();
    renderTray();
    setStatus(`${added} photo${added > 1 ? 's' : ''} added and spread across the panels.`);
  }
}

async function loadSamples() {
  for (const name of ['boulevard', 'pier']) {
    if (editor.photos.some((p) => p.name === name)) continue;
    const url = `samples/${name}.jpg`;
    const img = await loadImage(url);
    editor.addPhoto(img, name);
    editor.photos[editor.photos.length - 1].url = url;
  }
  editor.spreadPhotos();
  renderTray();
}

/** Exports the cover at one size as a PNG download. */
async function exportCover(size) {
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  renderCover(off.getContext('2d'), editor.renderState(), size.w, size.h);
  const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `neon-coast-${size.id}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return blob.size;
}

function previewPoint(event) {
  const rect = preview.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * preview.width,
    y: ((event.clientY - rect.top) / rect.height) * preview.height,
  };
}

/** A gesture (drag, wheel or slider) that commits one undo step when it
 *  changes something: snapshot first, push the snapshot only if it moved. */
function beginGesture() {
  if (!gestureSnapshot) gestureSnapshot = editor.snapshotSettings();
}
function endGesture(changed) {
  if (changed && gestureSnapshot) {
    editor.undoStack.push(gestureSnapshot);
    if (editor.undoStack.length > 60) editor.undoStack.shift();
    editor.redoStack.length = 0;
  }
  gestureSnapshot = null;
  renderPreview();
}

function bindPreview() {
  preview.addEventListener('pointerdown', (event) => {
    const p = previewPoint(event);
    const panel = editor.panelAt(p.x, p.y, preview.width, preview.height);
    if (panel < 0) return;
    editor.selectedPanel = panel;
    beginGesture();
    drag = { panel, startX: p.x, startY: p.y, moved: false };
    preview.setPointerCapture(event.pointerId);
    renderPreview();
  });
  preview.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const p = previewPoint(event);
    const rect = panelRects(editor.settings.layout, preview.width, preview.height)[drag.panel];
    if (Math.abs(p.x - drag.startX) + Math.abs(p.y - drag.startY) > 2) drag.moved = true;
    if (!drag.moved) return;
    const crop = editor.settings.crops[drag.panel] ?? { zoom: 1, dx: 0, dy: 0 };
    const photoIndex = editor.settings.panelPhotos[drag.panel];
    const img = photoIndex >= 0 ? editor.photos[photoIndex]?.img : null;
    const limits = img ? cropLimits(img, rect, crop.zoom) : { dx: 0.6, dy: 0.6 };
    editor.setCrop(drag.panel, {
      dx: Math.max(-limits.dx, Math.min(limits.dx, crop.dx + ((p.x - drag.startX) / rect.w))),
      dy: Math.max(-limits.dy, Math.min(limits.dy, crop.dy + ((p.y - drag.startY) / rect.h))),
    });
    drag.startX = p.x;
    drag.startY = p.y;
  });
  preview.addEventListener('pointerup', () => {
    if (!drag) return;
    endGesture(drag.moved);
    drag = null;
  });
  preview.addEventListener('wheel', (event) => {
    event.preventDefault();
    beginGesture();
    const crop = editor.settings.crops[editor.selectedPanel] ?? { zoom: 1, dx: 0, dy: 0 };
    const zoom = Math.max(1, Math.min(3, crop.zoom * (event.deltaY < 0 ? 1.08 : 0.92)));
    editor.setCrop(editor.selectedPanel, { zoom });
    renderPreview();
    clearTimeout(preview._wheelTimer);
    preview._wheelTimer = setTimeout(() => endGesture(true), 600);
  }, { passive: false });
}

function bindControls() {
  document.getElementById('photoInput').addEventListener('change', (e) => {
    addFiles([...e.target.files]);
    e.target.value = '';
  });
  document.getElementById('sampleBtn').addEventListener('click', async () => {
    await loadSamples();
    setStatus('Sample photos loaded — replace them with your own any time.');
  });
  document.getElementById('fillAllBtn').addEventListener('click', () => {
    if (!editor.photos.length) return setStatus('Add a photo first.');
    const shown = editor.settings.panelPhotos[editor.selectedPanel];
    editor.fillAll(shown >= 0 ? shown : 0);
    setStatus('Every panel now shows the same photo.');
  });
  document.getElementById('spreadBtn').addEventListener('click', () => {
    if (!editor.photos.length) return setStatus('Add a photo first.');
    editor.spreadPhotos();
    setStatus('Photos spread across the panels in turn.');
  });
  // Text edits are one undo step each: snapshot when the field gains focus,
  // commit when it loses focus with a change.
  for (const [id, key] of [['titleInput', 'title'], ['subtitleInput', 'subtitle'], ['badgeInput', 'badge']]) {
    const input = document.getElementById(id);
    input.addEventListener('focus', beginGesture);
    input.addEventListener('input', (e) => editor.updateLive({ [key]: e.target.value }));
    input.addEventListener('change', () => endGesture(true));
    input.addEventListener('blur', () => {
      if (gestureSnapshot && gestureSnapshot[key] === input.value) gestureSnapshot = null;
    });
  }
  document.getElementById('starsInput').addEventListener('change', (e) => {
    editor.update({ stars: Number(e.target.value) });
  });
  zoomRange.addEventListener('pointerdown', beginGesture);
  zoomRange.addEventListener('input', () => {
    editor.setCrop(editor.selectedPanel, { zoom: Number(zoomRange.value) });
  });
  zoomRange.addEventListener('change', () => endGesture(true));
  document.getElementById('resetCropBtn').addEventListener('click', () => {
    editor.pushHistory();
    editor.resetCrop(editor.selectedPanel);
    setStatus(`Panel ${editor.selectedPanel + 1} crop reset.`);
  });
  document.getElementById('grainCheck').addEventListener('change', (e) => editor.update({ grain: e.target.checked }));
  document.getElementById('vignetteCheck').addEventListener('change', (e) => editor.update({ vignette: e.target.checked }));
  document.getElementById('halftoneCheck').addEventListener('change', (e) => editor.update({ halftone: e.target.checked }));
  document.getElementById('exportOneBtn').addEventListener('click', async () => {
    setStatus(`Exporting ${currentSize.label}…`);
    await exportCover(currentSize);
    setStatus(`Saved neon-coast-${currentSize.id}.png.`);
  });
  document.getElementById('exportAllBtn').addEventListener('click', async () => {
    setStatus('Exporting all three sizes…');
    for (const size of SIZES) await exportCover(size);
    setStatus('Saved all three PNGs: 1080 × 1080, 1080 × 1350, 1920 × 1080.');
  });
  document.getElementById('undoBtn').addEventListener('click', () => { editor.undo(); syncControlsFromState(); setStatus('Undone.'); });
  document.getElementById('redoBtn').addEventListener('click', () => { editor.redo(); syncControlsFromState(); setStatus('Redone.'); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); editor.undo(); syncControlsFromState(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); editor.redo(); syncControlsFromState(); }
  });
  editor.onChange(renderPreview);
}

const shot = new URLSearchParams(location.search).get('shot');
if (shot) {
  buildLayoutRow();
  buildGradeRow();
  buildSizeRow();
  bindControls();
  bindPreview();
  await fontsReady();
  await runShot(shot, new URLSearchParams(location.search), {
    async loadSamples(urls) {
      for (const url of urls) {
        const img = await loadImage(url);
        editor.addPhoto(img, url.split('/').pop().replace('.jpg', ''));
        editor.photos[editor.photos.length - 1].url = url;
      }
      editor.spreadPhotos();
      renderTray();
    },
    applyShot({ layout, caption, subtitle, grade, size }) {
      currentSize = sizeById(size);
      editor.update({ layout, grade, title: caption, subtitle, panelPhotos: [], crops: {} });
      editor.spreadPhotos();
      buildLayoutRow();
      buildGradeRow();
      buildSizeRow();
    },
    render() {
      renderPreview();
    },
    setPanelCrop(panel, crop) {
      editor.setCrop(panel, crop);
    },
  });
} else {
  buildLayoutRow();
  buildGradeRow();
  buildSizeRow();
  bindControls();
  bindPreview();
  await fontsReady();
  renderPreview();
  renderTray();
}
