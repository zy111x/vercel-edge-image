import { ensureFontLoaded } from './text-fonts.js';

const EXTRA_PROPS = ['layerId', 'displayName', 'fontCategory', 'presetId'];
const uid = () => `text_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function cloneShadow(shadow) {
  if (!shadow) return null;
  return {
    color: shadow.color || 'rgba(0,0,0,.3)',
    blur: Number(shadow.blur) || 0,
    offsetX: Number(shadow.offsetX) || 0,
    offsetY: Number(shadow.offsetY) || 0,
  };
}

export class TextLayerManager {
  constructor({ canvasId, hostId, stageId, onCommit, onSelection, onTransient }) {
    if (!window.fabric) throw new Error('Fabric.js 未加载。');
    this.fabric = window.fabric;
    this.host = document.getElementById(hostId);
    this.stage = document.getElementById(stageId);
    this.onCommit = onCommit || (() => {});
    this.onSelection = onSelection || (() => {});
    this.onTransient = onTransient || (() => {});
    this.silent = false;
    this.interactive = false;
    this.commitTimer = null;
    this.logicalWidth = 1;
    this.logicalHeight = 1;
    this.canvas = new this.fabric.Canvas(canvasId, {
      selection: true,
      preserveObjectStacking: true,
      allowTouchScrolling: true,
      renderOnAddRemove: true,
    });
    this.canvas.setBackgroundColor('rgba(0,0,0,0)', this.canvas.renderAll.bind(this.canvas));
    this.bindEvents();
    this.setInteractive(false);
  }

  bindEvents() {
    const select = () => { if (!this.silent) this.onSelection(this.getActiveData()); };
    this.canvas.on('selection:created', select);
    this.canvas.on('selection:updated', select);
    this.canvas.on('selection:cleared', () => !this.silent && this.onSelection(null));
    const transient = () => { if (!this.silent) this.onTransient(this.getActiveData()); };
    this.canvas.on('object:moving', transient);
    this.canvas.on('object:scaling', transient);
    this.canvas.on('object:rotating', transient);
    this.canvas.on('object:modified', () => {
      if (this.silent) return;
      this.onSelection(this.getActiveData());
      this.onCommit('transform');
    });
    this.canvas.on('text:changed', () => {
      if (this.silent) return;
      this.onSelection(this.getActiveData());
      this.scheduleCommit('text');
    });
  }

  scheduleCommit(reason = 'style', delay = 380) {
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => { if (!this.silent) this.onCommit(reason); }, delay);
  }

  setInteractive(value) {
    this.interactive = Boolean(value);
    this.canvas.selection = this.interactive;
    this.canvas.skipTargetFind = !this.interactive;
    this.host.style.pointerEvents = this.interactive ? 'auto' : 'none';
    for (const obj of this.canvas.getObjects()) {
      obj.selectable = this.interactive && !obj.lockedByUser;
      obj.evented = this.interactive && !obj.lockedByUser;
    }
    if (!this.interactive) this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  setVisible(value) { this.host.hidden = !value; }

  async setViewport(logicalWidth, logicalHeight, targetEl) {
    const lw = Math.max(1, Math.round(logicalWidth || 1));
    const lh = Math.max(1, Math.round(logicalHeight || 1));
    const scale = Math.min(1, 1600 / lw, 1200 / lh);
    const nextW = Math.max(1, Math.round(lw * scale));
    const nextH = Math.max(1, Math.round(lh * scale));
    const prevW = this.canvas.getWidth() || nextW;
    const prevH = this.canvas.getHeight() || nextH;
    if ((prevW !== nextW || prevH !== nextH) && this.canvas.getObjects().length) {
      const sx = nextW / prevW, sy = nextH / prevH;
      this.silent = true;
      for (const obj of this.canvas.getObjects()) {
        obj.set({ left: (obj.left || 0) * sx, top: (obj.top || 0) * sy, scaleX: (obj.scaleX || 1) * sx, scaleY: (obj.scaleY || 1) * sy });
        obj.setCoords();
      }
      this.silent = false;
    }
    this.canvas.setDimensions({ width: nextW, height: nextH });
    this.logicalWidth = lw;
    this.logicalHeight = lh;
    this.canvas.requestRenderAll();
    await this.syncTo(targetEl);
  }

  async syncTo(targetEl) {
    if (!targetEl || targetEl.hidden) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rect = targetEl.getBoundingClientRect(), stageRect = this.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.host.style.left = `${rect.left - stageRect.left}px`;
    this.host.style.top = `${rect.top - stageRect.top}px`;
    this.host.style.width = `${rect.width}px`;
    this.host.style.height = `${rect.height}px`;
    this.canvas.setDimensions({ width: rect.width, height: rect.height }, { cssOnly: true });
    const container = this.canvas.wrapperEl;
    if (container) { container.style.width = '100%'; container.style.height = '100%'; }
  }

  async addText(initial = {}) {
    const fontFamily = initial.fontFamily || 'ZCOOL KuaiLe';
    await ensureFontLoaded(fontFamily, initial.fontWeight || 400, initial.fontSize || 64);
    const text = new this.fabric.IText(initial.text || '双击编辑文字', {
      left: initial.left ?? this.canvas.getWidth() / 2,
      top: initial.top ?? this.canvas.getHeight() / 2,
      originX: 'center', originY: 'center', fontFamily,
      fontSize: initial.fontSize || Math.max(34, Math.round(this.canvas.getWidth() / 14)),
      fontWeight: initial.fontWeight || 400,
      fill: initial.fill || '#ffffff', opacity: initial.opacity ?? 1,
      stroke: initial.stroke || 'rgba(0,0,0,0)', strokeWidth: initial.strokeWidth || 0,
      shadow: initial.shadow ? new this.fabric.Shadow(initial.shadow) : new this.fabric.Shadow({ color: 'rgba(0,0,0,.3)', blur: 8, offsetX: 0, offsetY: 3 }),
      charSpacing: initial.charSpacing || 0, lineHeight: initial.lineHeight || 1.2,
      textAlign: initial.textAlign || 'center', angle: initial.angle || 0,
      padding: 8, cornerStyle: 'circle', transparentCorners: false,
      cornerColor: '#8b7cff', cornerStrokeColor: '#ffffff', borderColor: '#8b7cff', editingBorderColor: '#56d8ff',
      layerId: initial.layerId || uid(), displayName: initial.displayName || '文字图层',
      fontCategory: initial.fontCategory || 'cartoon', presetId: initial.presetId || '',
    });
    text.lockedByUser = false;
    text.selectable = this.interactive;
    text.evented = this.interactive;
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    this.canvas.requestRenderAll();
    this.onSelection(this.getActiveData());
    this.onCommit('add');
    return text;
  }

  getObjects() { return this.canvas.getObjects(); }
  getActive() { return this.canvas.getActiveObject() || null; }
  getActiveData() { const obj = this.getActive(); return obj ? this.objectData(obj) : null; }

  objectData(obj) {
    const shadow = obj.shadow ? cloneShadow(obj.shadow) : null;
    return {
      id: obj.layerId, name: obj.displayName || String(obj.text || '文字').slice(0, 12), text: obj.text || '',
      fontFamily: obj.fontFamily || 'Noto Sans SC', fontWeight: obj.fontWeight || 400, fontSize: Math.round(obj.fontSize || 48),
      fill: typeof obj.fill === 'string' ? obj.fill : '#ffffff', opacity: obj.opacity ?? 1,
      stroke: typeof obj.stroke === 'string' ? obj.stroke : 'rgba(0,0,0,0)', strokeWidth: Number(obj.strokeWidth) || 0,
      shadow, charSpacing: Number(obj.charSpacing) || 0, lineHeight: Number(obj.lineHeight) || 1.2,
      textAlign: obj.textAlign || 'center', angle: Number(obj.angle) || 0,
      left: Number(obj.left) || 0, top: Number(obj.top) || 0, scaleX: Number(obj.scaleX) || 1, scaleY: Number(obj.scaleY) || 1,
      visible: obj.visible !== false, locked: Boolean(obj.lockedByUser), presetId: obj.presetId || '', fontCategory: obj.fontCategory || 'sans',
    };
  }

  list() { return this.getObjects().map((obj) => this.objectData(obj)).reverse(); }

  async patchActive(patch, { commit = false, reason = 'style' } = {}) {
    const obj = this.getActive();
    if (!obj) return;
    if (patch.fontFamily) await ensureFontLoaded(patch.fontFamily, patch.fontWeight || obj.fontWeight || 400, obj.fontSize || 48);
    const next = { ...patch };
    if (Object.prototype.hasOwnProperty.call(next, 'shadow')) next.shadow = next.shadow ? new this.fabric.Shadow(next.shadow) : null;
    if (Object.prototype.hasOwnProperty.call(next, 'locked')) { obj.lockedByUser = Boolean(next.locked); delete next.locked; }
    obj.set(next);
    obj.selectable = this.interactive && !obj.lockedByUser;
    obj.evented = this.interactive && !obj.lockedByUser;
    obj.setCoords();
    this.canvas.requestRenderAll();
    this.onSelection(this.getActiveData());
    if (commit) this.onCommit(reason); else this.scheduleCommit(reason);
  }

  async applyPreset(preset) {
    if (!this.getActive() || !preset) return;
    await this.patchActive({ ...preset.style, presetId: preset.id }, { commit: true, reason: 'preset' });
  }

  select(id) {
    const obj = this.getObjects().find((item) => item.layerId === id);
    if (!obj) return;
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
    this.onSelection(this.getActiveData());
  }

  remove(id = this.getActive()?.layerId) {
    const obj = this.getObjects().find((item) => item.layerId === id);
    if (!obj) return;
    this.canvas.remove(obj);
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.onSelection(null);
    this.onCommit('delete');
  }

  async duplicate(id = this.getActive()?.layerId) {
    const obj = this.getObjects().find((item) => item.layerId === id);
    if (!obj) return;
    const copy = await new Promise((resolve) => obj.clone(resolve, EXTRA_PROPS));
    copy.set({ left: (obj.left || 0) + 28, top: (obj.top || 0) + 28, layerId: uid(), displayName: `${obj.displayName || '文字图层'} 副本`, selectable: this.interactive, evented: this.interactive });
    copy.lockedByUser = false;
    this.canvas.add(copy);
    this.canvas.setActiveObject(copy);
    this.canvas.requestRenderAll();
    this.onSelection(this.getActiveData());
    this.onCommit('duplicate');
  }

  toggleVisible(id) {
    const obj = this.getObjects().find((item) => item.layerId === id); if (!obj) return;
    obj.visible = !obj.visible; this.canvas.requestRenderAll(); this.onCommit('visibility');
  }
  toggleLock(id) {
    const obj = this.getObjects().find((item) => item.layerId === id); if (!obj) return;
    obj.lockedByUser = !obj.lockedByUser;
    obj.selectable = this.interactive && !obj.lockedByUser; obj.evented = this.interactive && !obj.lockedByUser;
    if (obj.lockedByUser && this.getActive() === obj) this.canvas.discardActiveObject();
    this.canvas.requestRenderAll(); this.onSelection(this.getActiveData()); this.onCommit('lock');
  }
  move(id, direction) {
    const obj = this.getObjects().find((item) => item.layerId === id); if (!obj) return;
    if (direction === 'up') this.canvas.bringForward(obj); else this.canvas.sendBackwards(obj);
    this.canvas.requestRenderAll(); this.onCommit('order');
  }
  centerActive() {
    const obj = this.getActive(); if (!obj) return;
    obj.set({ left: this.canvas.getWidth() / 2, top: this.canvas.getHeight() / 2 }); obj.setCoords();
    this.canvas.requestRenderAll(); this.onSelection(this.getActiveData()); this.onCommit('position');
  }

  clear({ silent = false } = {}) {
    const prev = this.silent; this.silent = this.silent || silent;
    this.canvas.clear(); this.canvas.setBackgroundColor('rgba(0,0,0,0)', this.canvas.renderAll.bind(this.canvas));
    this.silent = prev; if (!silent) this.onCommit('clear');
  }

  serializeState() {
    return { width: this.canvas.getWidth(), height: this.canvas.getHeight(), json: this.canvas.toJSON(EXTRA_PROPS) };
  }

  async loadState(saved, { silent = true } = {}) {
    if (!saved?.json) { this.clear({ silent }); return; }
    const targetW = this.canvas.getWidth(), targetH = this.canvas.getHeight();
    const sourceW = saved.width || targetW, sourceH = saved.height || targetH;
    const prev = this.silent; this.silent = this.silent || silent;
    await new Promise((resolve) => {
      this.canvas.loadFromJSON(saved.json, () => {
        const sx = targetW / sourceW, sy = targetH / sourceH;
        for (const obj of this.canvas.getObjects()) {
          obj.set({ left: (obj.left || 0) * sx, top: (obj.top || 0) * sy, scaleX: (obj.scaleX || 1) * sx, scaleY: (obj.scaleY || 1) * sy });
          obj.lockedByUser = false; obj.selectable = this.interactive; obj.evented = this.interactive; obj.setCoords();
        }
        this.canvas.requestRenderAll(); resolve();
      });
    });
    this.silent = prev; this.onSelection(null);
  }

  async exportOverlay(finalWidth, finalHeight) {
    const visible = this.getObjects().filter((obj) => obj.visible !== false);
    if (!visible.length) return null;
    await Promise.all(visible.map((obj) => ensureFontLoaded(obj.fontFamily, obj.fontWeight || 400, obj.fontSize || 48)));
    const width = Math.max(1, Math.round(finalWidth)), height = Math.max(1, Math.round(finalHeight));
    const sx = width / this.canvas.getWidth(), sy = height / this.canvas.getHeight();
    const staticCanvas = new this.fabric.StaticCanvas(null, { width, height, backgroundColor: 'rgba(0,0,0,0)' });
    for (const obj of visible) {
      const copy = await new Promise((resolve) => obj.clone(resolve, EXTRA_PROPS));
      copy.set({ left: (obj.left || 0) * sx, top: (obj.top || 0) * sy, scaleX: (obj.scaleX || 1) * sx, scaleY: (obj.scaleY || 1) * sy, selectable: false, evented: false });
      copy.setCoords(); staticCanvas.add(copy);
    }
    staticCanvas.renderAll();
    const blob = await new Promise((resolve) => staticCanvas.lowerCanvasEl.toBlob(resolve, 'image/png'));
    staticCanvas.dispose();
    return blob;
  }
}
