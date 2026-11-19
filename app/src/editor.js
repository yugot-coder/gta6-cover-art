// Neon Coast editor state: the cover's settings, the photo tray, the
// per-panel crops and the undo/redo history. Photos are images held outside
// the serialised settings, so history snapshots stay small and fast.

import { LAYOUTS, layoutById, panelRects } from './cover.js';

export function defaultSettings() {
  return {
    layout: 'hero3',
    grade: 'neon',
    title: 'NEON COAST',
    subtitle: 'chasing the neon sunset',
    badge: 'LAUNCH WEEK',
    stars: 5,
    grain: true,
    vignette: true,
    halftone: true,
    panelPhotos: [],
    crops: {},
  };
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Creates the editor: settings, photos, selection and history. */
export function createEditor() {
  const editor = {
    settings: defaultSettings(),
    photos: [],
    selectedPanel: 0,
    undoStack: [],
    redoStack: [],
    listeners: new Set(),

    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },
    emit() {
      this.listeners.forEach((fn) => fn());
    },

    /** A deep copy of the serialisable settings, for history and export. */
    snapshotSettings() {
      return JSON.parse(JSON.stringify(this.settings));
    },

    /** Records the current settings so the next change can be undone. */
    pushHistory() {
      this.undoStack.push(this.snapshotSettings());
      if (this.undoStack.length > 60) this.undoStack.shift();
      this.redoStack.length = 0;
    },

    undo() {
      if (!this.undoStack.length) return false;
      this.redoStack.push(this.snapshotSettings());
      this.settings = this.undoStack.pop();
      this.clampSelection();
      this.emit();
      return true;
    },

    redo() {
      if (!this.redoStack.length) return false;
      this.undoStack.push(this.snapshotSettings());
      this.settings = this.redoStack.pop();
      this.clampSelection();
      this.emit();
      return true;
    },

    canUndo() { return this.undoStack.length > 0; },
    canRedo() { return this.redoStack.length > 0; },

    clampSelection() {
      const count = layoutById(this.settings.layout).panels;
      if (this.selectedPanel >= count) this.selectedPanel = 0;
    },

    /** Applies a settings patch, recording history first. */
    update(patch) {
      this.pushHistory();
      Object.assign(this.settings, patch);
      this.clampSelection();
      this.emit();
    },

    /** Applies a settings patch without a history entry (live slider drags). */
    updateLive(patch) {
      Object.assign(this.settings, patch);
      this.clampSelection();
      this.emit();
    },

    addPhoto(img, name) {
      this.photos.push({ img, name: name || `photo ${this.photos.length + 1}` });
      this.emit();
      return this.photos.length - 1;
    },

    /** Fills the selected panel with a photo from the tray. */
    assignPhoto(panel, photoIndex) {
      const photos = [...this.settings.panelPhotos];
      while (photos.length < layoutById(this.settings.layout).panels) photos.push(-1);
      if (photos[panel] === photoIndex) return;
      this.pushHistory();
      photos[panel] = photoIndex;
      this.settings.panelPhotos = photos;
      this.emit();
    },

    /** Fills every panel with one photo. */
    fillAll(photoIndex) {
      const count = layoutById(this.settings.layout).panels;
      const next = Array.from({ length: count }, () => photoIndex);
      if (JSON.stringify(next) === JSON.stringify(this.settings.panelPhotos)) return;
      this.pushHistory();
      this.settings.panelPhotos = next;
      this.emit();
    },

    /** Fills every panel in turn from the tray, in order. */
    spreadPhotos() {
      const count = layoutById(this.settings.layout).panels;
      const next = Array.from({ length: count }, (_, i) =>
        this.photos.length ? i % this.photos.length : -1);
      if (JSON.stringify(next) === JSON.stringify(this.settings.panelPhotos)) return;
      this.pushHistory();
      this.settings.panelPhotos = next;
      this.emit();
    },

    setCrop(panel, patch) {
      const crops = { ...this.settings.crops };
      crops[panel] = { zoom: 1, dx: 0, dy: 0, ...(crops[panel] ?? {}), ...patch };
      this.settings.crops = crops;
      this.emit();
    },

    resetCrop(panel) {
      const crops = { ...this.settings.crops };
      delete crops[panel];
      this.settings.crops = crops;
      this.emit();
    },

    /** The full render state: settings plus the tray's images. */
    renderState() {
      return {
        ...this.settings,
        photos: this.photos.map((p) => p.img),
      };
    },

    /** Panel rectangles hit-test: which panel, if any, holds (x, y) in
     *  cover pixels for the given cover size. */
    panelAt(x, y, W, H) {
      const rects = panelRects(this.settings.layout, W, H);
      for (let i = rects.length - 1; i >= 0; i--) {
        const r = rects[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
      }
      return -1;
    },
  };
  return editor;
}
