import { ensureFontLoaded, fontCssFamily, canonicalFontId } from './text-fonts.js';

const uid = () => `text_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const rad = (deg) => (Number(deg) || 0) * Math.PI / 180;
const clone = (value) => JSON.parse(JSON.stringify(value));

function cloneShadow(shadow) {
  if (!shadow) return null;
  return {
    color: shadow.color || 'rgba(0,0,0,.3)',
    blur: Number(shadow.blur) || 0,
    offsetX: Number(shadow.offsetX) || 0,
    offsetY: Number(shadow.offsetY) || 0,
  };
}

function defaultLayer(initial = {}, width = 800, height = 600) {
  return {
    layerId: initial.layerId || uid(),
    displayName: initial.displayName || '文字图层',
    text: initial.text || '双击编辑文字',
    fontFamily: canonicalFontId(initial.fontFamily || 'Studio Cartoon'),
    fontCategory: initial.fontCategory || 'cartoon',
    presetId: initial.presetId || '',
    fontSize: Number(initial.fontSize) || Math.max(34, Math.round(width / 14)),
    fontWeight: Number(initial.fontWeight) || 700,
    fill: initial.fill || '#ffffff',
    opacity: initial.opacity ?? 1,
    stroke: initial.stroke || 'rgba(0,0,0,0)',
    strokeWidth: Number(initial.strokeWidth) || 0,
    shadow: initial.shadow ? cloneShadow(initial.shadow) : { color: 'rgba(0,0,0,.3)', blur: 8, offsetX: 0, offsetY: 3 },
    charSpacing: Number(initial.charSpacing) || 0,
    lineHeight: Number(initial.lineHeight) || 1.2,
    textAlign: initial.textAlign || 'center',
    angle: Number(initial.angle) || 0,
    skewX: Number(initial.skewX) || 0,
    left: initial.left ?? width / 2,
    top: initial.top ?? height / 2,
    scaleX: Number(initial.scaleX) || 1,
    scaleY: Number(initial.scaleY) || 1,
    visible: initial.visible !== false,
    lockedByUser: Boolean(initial.locked ?? initial.lockedByUser),
  };
}

export class TextLayerManager {
  constructor({ canvasId, hostId, stageId, onCommit, onSelection, onTransient }) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.host = document.getElementById(hostId);
    this.stage = document.getElementById(stageId);
    this.onCommit = onCommit || (() => {});
    this.onSelection = onSelection || (() => {});
    this.onTransient = onTransient || (() => {});
    this.objects = [];
    this.activeId = null;
    this.interactive = false;
    this.silent = false;
    this.logicalWidth = 1;
    this.logicalHeight = 1;
    this.commitTimer = null;
    this.drag = null;
    this.handleRadius = 9;
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.bindEvents();
    this.setInteractive(false);
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.pointerUp(event));
    this.canvas.addEventListener('dblclick', (event) => {
      if (!this.interactive) return;
      const point = this.eventPoint(event);
      const hit = this.hitObject(point.x, point.y);
      if (!hit) return;
      this.activeId = hit.layerId;
      this.render();
      this.onSelection(this.getActiveData());
      const editor = document.getElementById('textContent');
      if (editor) {
        editor.focus();
        editor.select?.();
      }
    });
  }

  scheduleCommit(reason = 'style', delay = 260) {
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => {
      if (!this.silent) this.onCommit(reason);
    }, delay);
  }

  setInteractive(value) {
    this.interactive = Boolean(value);
    this.host.style.pointerEvents = this.interactive ? 'auto' : 'none';
    this.canvas.style.cursor = this.interactive ? 'default' : 'inherit';
    if (!this.interactive) this.drag = null;
    this.render();
  }

  setVisible(value) {
    this.host.hidden = !value;
  }

  async setViewport(logicalWidth, logicalHeight, targetEl) {
    const lw = Math.max(1, Math.round(logicalWidth || 1));
    const lh = Math.max(1, Math.round(logicalHeight || 1));
    const scale = Math.min(1, 1600 / lw, 1200 / lh);
    const nextW = Math.max(1, Math.round(lw * scale));
    const nextH = Math.max(1, Math.round(lh * scale));
    const prevW = this.canvas.width || nextW;
    const prevH = this.canvas.height || nextH;

    if ((prevW !== nextW || prevH !== nextH) && this.objects.length) {
      const sx = nextW / prevW;
      const sy = nextH / prevH;
      for (const obj of this.objects) {
        obj.left *= sx;
        obj.top *= sy;
        obj.scaleX *= sx;
        obj.scaleY *= sy;
      }
    }

    this.canvas.width = nextW;
    this.canvas.height = nextH;
    this.logicalWidth = lw;
    this.logicalHeight = lh;
    this.render();
    await this.syncTo(targetEl);
  }

  async syncTo(targetEl) {
    if (!targetEl || targetEl.hidden) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rect = targetEl.getBoundingClientRect();
    const stageRect = this.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.host.style.left = `${rect.left - stageRect.left}px`;
    this.host.style.top = `${rect.top - stageRect.top}px`;
    this.host.style.width = `${rect.width}px`;
    this.host.style.height = `${rect.height}px`;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
  }

  eventPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.canvas.width / Math.max(1, rect.width)),
      y: (event.clientY - rect.top) * (this.canvas.height / Math.max(1, rect.height)),
    };
  }

  fontSpec(obj, scale = 1) {
    const size = Math.max(1, (Number(obj.fontSize) || 48) * scale);
    return `${Number(obj.fontWeight) || 400} ${size}px ${fontCssFamily(obj.fontFamily)}`;
  }

  spacingPx(obj, scale = 1) {
    return (Number(obj.fontSize) || 48) * (Number(obj.charSpacing) || 0) / 1000 * scale;
  }

  measureLine(ctx, text, obj, scale = 1) {
    const chars = Array.from(String(text || ''));
    if (!chars.length) return 0;
    const spacing = this.spacingPx(obj, scale);
    return chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing * Math.max(0, chars.length - 1);
  }

  metrics(obj, ctx = this.ctx, scale = 1) {
    ctx.save();
    ctx.font = this.fontSpec(obj, scale);
    const lines = String(obj.text || '').split('\n');
    const widths = lines.map((line) => this.measureLine(ctx, line, obj, scale));
    const fontSize = (Number(obj.fontSize) || 48) * scale;
    const lineHeight = Math.max(.5, Number(obj.lineHeight) || 1.2);
    const width = Math.max(fontSize * .6, ...widths) + (Number(obj.strokeWidth) || 0) * 2 * scale + 12 * scale;
    const height = Math.max(fontSize, lines.length * fontSize * lineHeight) + (Number(obj.strokeWidth) || 0) * 2 * scale + 12 * scale;
    ctx.restore();
    return { width, height, widths, lines, fontSize, lineHeight };
  }

  drawSpacedLine(ctx, text, x, y, obj, width, scale = 1, mode = 'fill') {
    const chars = Array.from(String(text || ''));
    const spacing = this.spacingPx(obj, scale);
    const total = this.measureLine(ctx, text, obj, scale);
    let start;
    if (obj.textAlign === 'left') start = -width / 2;
    else if (obj.textAlign === 'right') start = width / 2 - total;
    else start = -total / 2;

    for (const ch of chars) {
      const w = ctx.measureText(ch).width;
      if (mode === 'stroke') ctx.strokeText(ch, start + w / 2 + x, y);
      else ctx.fillText(ch, start + w / 2 + x, y);
      start += w + spacing;
    }
  }

  drawObject(ctx, obj, transform = { sx: 1, sy: 1 }, controls = false) {
    if (obj.visible === false) return;
    const sx = transform.sx ?? 1;
    const sy = transform.sy ?? 1;
    const uniform = Math.sqrt(Math.abs(sx * sy)) || 1;
    const m = this.metrics(obj, ctx, uniform);
    const x = obj.left * sx;
    const y = obj.top * sy;
    const scaleX = (Number(obj.scaleX) || 1) * sx / uniform;
    const scaleY = (Number(obj.scaleY) || 1) * sy / uniform;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad(obj.angle));
    const shear = Math.tan(rad(obj.skewX));
    if (shear) ctx.transform(1, 0, shear, 1, 0, 0);
    ctx.scale(scaleX, scaleY);
    ctx.globalAlpha = Math.max(0, Math.min(1, Number(obj.opacity) ?? 1));
    ctx.font = this.fontSpec(obj, uniform);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const shadow = obj.shadow || null;
    if (shadow) {
      ctx.shadowColor = shadow.color || 'transparent';
      ctx.shadowBlur = (Number(shadow.blur) || 0) * uniform;
      ctx.shadowOffsetX = (Number(shadow.offsetX) || 0) * uniform;
      ctx.shadowOffsetY = (Number(shadow.offsetY) || 0) * uniform;
    }

    const lineStep = m.fontSize * m.lineHeight;
    const firstY = -((m.lines.length - 1) * lineStep) / 2;
    const drawWidth = Math.max(...m.widths, m.fontSize * .6);
    for (let i = 0; i < m.lines.length; i++) {
      const ly = firstY + i * lineStep;
      if ((Number(obj.strokeWidth) || 0) > 0) {
        ctx.strokeStyle = obj.stroke || '#000000';
        ctx.lineWidth = (Number(obj.strokeWidth) || 0) * 2 * uniform;
        this.drawSpacedLine(ctx, m.lines[i], 0, ly, obj, drawWidth, uniform, 'stroke');
      }
      ctx.fillStyle = obj.fill || '#ffffff';
      this.drawSpacedLine(ctx, m.lines[i], 0, ly, obj, drawWidth, uniform, 'fill');
    }
    ctx.restore();

    if (controls) this.drawControls(ctx, obj);
  }

  objectBox(obj) {
    const m = this.metrics(obj);
    return {
      width: m.width * Math.abs(Number(obj.scaleX) || 1),
      height: m.height * Math.abs(Number(obj.scaleY) || 1),
    };
  }

  localPoint(obj, x, y) {
    const dx = x - obj.left;
    const dy = y - obj.top;
    const a = -rad(obj.angle);
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = dx * Math.sin(a) + dy * Math.cos(a);
    return {
      x: rx / (Number(obj.scaleX) || 1),
      y: ry / (Number(obj.scaleY) || 1),
    };
  }

  hitObject(x, y) {
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];
      if (obj.visible === false || obj.lockedByUser) continue;
      const p = this.localPoint(obj, x, y);
      const m = this.metrics(obj);
      if (Math.abs(p.x) <= m.width / 2 + 10 && Math.abs(p.y) <= m.height / 2 + 10) return obj;
    }
    return null;
  }

  controlPoints(obj) {
    const box = this.objectBox(obj);
    const a = rad(obj.angle);
    const rotatePoint = (lx, ly) => ({
      x: obj.left + lx * Math.cos(a) - ly * Math.sin(a),
      y: obj.top + lx * Math.sin(a) + ly * Math.cos(a),
    });
    return {
      nw: rotatePoint(-box.width / 2, -box.height / 2),
      ne: rotatePoint(box.width / 2, -box.height / 2),
      sw: rotatePoint(-box.width / 2, box.height / 2),
      se: rotatePoint(box.width / 2, box.height / 2),
      rotate: rotatePoint(0, -box.height / 2 - 28),
    };
  }

  hitHandle(obj, point) {
    const points = this.controlPoints(obj);
    const radius = this.handleRadius + 6;
    for (const [name, p] of Object.entries(points)) {
      if (Math.hypot(point.x - p.x, point.y - p.y) <= radius) return name;
    }
    return null;
  }

  drawControls(ctx, obj) {
    if (!this.interactive || obj.lockedByUser) return;
    const pts = this.controlPoints(obj);
    const a = rad(obj.angle);
    const box = this.objectBox(obj);
    ctx.save();
    ctx.translate(obj.left, obj.top);
    ctx.rotate(a);
    ctx.strokeStyle = '#8b7cff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(-box.width / 2, -box.height / 2, box.width, box.height);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, -box.height / 2);
    ctx.lineTo(0, -box.height / 2 - 28);
    ctx.stroke();
    ctx.restore();

    for (const [name, p] of Object.entries(pts)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, name === 'rotate' ? 7 : this.handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = name === 'rotate' ? '#56d8ff' : '#8b7cff';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const obj of this.objects) this.drawObject(ctx, obj, { sx: 1, sy: 1 }, obj.layerId === this.activeId);
  }

  pointerDown(event) {
    if (!this.interactive) return;
    const p = this.eventPoint(event);
    const active = this.getActive();
    const handle = active && !active.lockedByUser ? this.hitHandle(active, p) : null;
    if (handle) {
      const distance = Math.max(1, Math.hypot(p.x - active.left, p.y - active.top));
      const angle = Math.atan2(p.y - active.top, p.x - active.left);
      this.drag = {
        type: handle === 'rotate' ? 'rotate' : 'scale',
        id: active.layerId,
        startX: p.x,
        startY: p.y,
        startLeft: active.left,
        startTop: active.top,
        startScaleX: active.scaleX,
        startScaleY: active.scaleY,
        startAngle: active.angle,
        startDistance: distance,
        startPointerAngle: angle,
      };
      this.canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }

    const hit = this.hitObject(p.x, p.y);
    if (!hit) {
      this.activeId = null;
      this.render();
      this.onSelection(null);
      return;
    }
    this.activeId = hit.layerId;
    this.drag = {
      type: 'move', id: hit.layerId, startX: p.x, startY: p.y,
      startLeft: hit.left, startTop: hit.top,
    };
    this.canvas.setPointerCapture?.(event.pointerId);
    this.render();
    this.onSelection(this.getActiveData());
    event.preventDefault();
  }

  pointerMove(event) {
    if (!this.interactive || !this.drag) return;
    const obj = this.objects.find((item) => item.layerId === this.drag.id);
    if (!obj) return;
    const p = this.eventPoint(event);
    if (this.drag.type === 'move') {
      obj.left = this.drag.startLeft + (p.x - this.drag.startX);
      obj.top = this.drag.startTop + (p.y - this.drag.startY);
    } else if (this.drag.type === 'scale') {
      const distance = Math.max(1, Math.hypot(p.x - obj.left, p.y - obj.top));
      const factor = Math.max(.08, Math.min(20, distance / this.drag.startDistance));
      obj.scaleX = this.drag.startScaleX * factor;
      obj.scaleY = this.drag.startScaleY * factor;
    } else if (this.drag.type === 'rotate') {
      const current = Math.atan2(p.y - obj.top, p.x - obj.left);
      obj.angle = this.drag.startAngle + (current - this.drag.startPointerAngle) * 180 / Math.PI;
    }
    this.render();
    if (!this.silent) this.onTransient(this.getActiveData());
    event.preventDefault();
  }

  pointerUp(event) {
    if (!this.drag) return;
    const changed = this.drag;
    this.drag = null;
    try { this.canvas.releasePointerCapture?.(event.pointerId); } catch {}
    this.render();
    if (!this.silent) {
      this.onSelection(this.getActiveData());
      this.onCommit(changed.type === 'move' ? 'position' : changed.type);
    }
  }

  async addText(initial = {}) {
    await ensureFontLoaded(canonicalFontId(initial.fontFamily || 'Studio Cartoon'), initial.fontWeight || 700, initial.fontSize || 64);
    const layer = defaultLayer(initial, this.canvas.width || 800, this.canvas.height || 600);
    this.objects.push(layer);
    this.activeId = layer.layerId;
    this.render();
    this.onSelection(this.getActiveData());
    this.onCommit('add');
    return layer;
  }

  getObjects() { return this.objects; }
  getActive() { return this.objects.find((item) => item.layerId === this.activeId) || null; }
  getActiveData() { const obj = this.getActive(); return obj ? this.objectData(obj) : null; }

  objectData(obj) {
    return {
      id: obj.layerId,
      name: obj.displayName || String(obj.text || '文字').slice(0, 12),
      text: obj.text || '',
      fontFamily: obj.fontFamily || 'Studio Modern',
      fontWeight: Number(obj.fontWeight) || 400,
      fontSize: Math.round(Number(obj.fontSize) || 48),
      fill: obj.fill || '#ffffff',
      opacity: obj.opacity ?? 1,
      stroke: obj.stroke || 'rgba(0,0,0,0)',
      strokeWidth: Number(obj.strokeWidth) || 0,
      shadow: cloneShadow(obj.shadow),
      charSpacing: Number(obj.charSpacing) || 0,
      lineHeight: Number(obj.lineHeight) || 1.2,
      textAlign: obj.textAlign || 'center',
      angle: Number(obj.angle) || 0,
      skewX: Number(obj.skewX) || 0,
      left: Number(obj.left) || 0,
      top: Number(obj.top) || 0,
      scaleX: Number(obj.scaleX) || 1,
      scaleY: Number(obj.scaleY) || 1,
      visible: obj.visible !== false,
      locked: Boolean(obj.lockedByUser),
      presetId: obj.presetId || '',
      fontCategory: obj.fontCategory || 'sans',
    };
  }

  list() { return this.objects.map((obj) => this.objectData(obj)).reverse(); }

  async patchActive(patch, { commit = false, reason = 'style' } = {}) {
    const obj = this.getActive();
    if (!obj) return;
    if (patch.fontFamily) {
      patch = { ...patch, fontFamily: canonicalFontId(patch.fontFamily) };
      await ensureFontLoaded(patch.fontFamily, patch.fontWeight || obj.fontWeight || 400, obj.fontSize || 48);
    }
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'shadow') obj.shadow = value ? cloneShadow(value) : null;
      else if (key === 'locked') obj.lockedByUser = Boolean(value);
      else obj[key] = value;
    }
    this.render();
    this.onSelection(this.getActiveData());
    if (commit) this.onCommit(reason); else this.scheduleCommit(reason);
  }

  async applyPreset(preset) {
    if (!this.getActive() || !preset) return;
    await this.patchActive({ ...preset.style, presetId: preset.id }, { commit: true, reason: 'preset' });
  }

  select(id) {
    if (!this.objects.some((item) => item.layerId === id)) return;
    this.activeId = id;
    this.render();
    this.onSelection(this.getActiveData());
  }

  remove(id = this.activeId) {
    const index = this.objects.findIndex((item) => item.layerId === id);
    if (index < 0) return;
    this.objects.splice(index, 1);
    this.activeId = null;
    this.render();
    this.onSelection(null);
    this.onCommit('delete');
  }

  async duplicate(id = this.activeId) {
    const obj = this.objects.find((item) => item.layerId === id);
    if (!obj) return;
    const copy = clone(obj);
    copy.layerId = uid();
    copy.displayName = `${obj.displayName || '文字图层'} 副本`;
    copy.left += 28;
    copy.top += 28;
    copy.lockedByUser = false;
    this.objects.push(copy);
    this.activeId = copy.layerId;
    this.render();
    this.onSelection(this.getActiveData());
    this.onCommit('duplicate');
  }

  toggleVisible(id) {
    const obj = this.objects.find((item) => item.layerId === id);
    if (!obj) return;
    obj.visible = !obj.visible;
    this.render();
    this.onCommit('visibility');
  }

  toggleLock(id) {
    const obj = this.objects.find((item) => item.layerId === id);
    if (!obj) return;
    obj.lockedByUser = !obj.lockedByUser;
    if (obj.lockedByUser && this.activeId === id) this.activeId = null;
    this.render();
    this.onSelection(this.getActiveData());
    this.onCommit('lock');
  }

  move(id, direction) {
    const index = this.objects.findIndex((item) => item.layerId === id);
    if (index < 0) return;
    const target = direction === 'up' ? index + 1 : index - 1;
    if (target < 0 || target >= this.objects.length) return;
    [this.objects[index], this.objects[target]] = [this.objects[target], this.objects[index]];
    this.render();
    this.onCommit('order');
  }

  centerActive() {
    const obj = this.getActive();
    if (!obj) return;
    obj.left = this.canvas.width / 2;
    obj.top = this.canvas.height / 2;
    this.render();
    this.onSelection(this.getActiveData());
    this.onCommit('position');
  }

  clear({ silent = false } = {}) {
    const prev = this.silent;
    this.silent = this.silent || silent;
    this.objects = [];
    this.activeId = null;
    this.render();
    this.silent = prev;
    if (!silent) this.onCommit('clear');
  }

  serializeState() {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
      native: true,
      objects: clone(this.objects),
      activeId: this.activeId,
    };
  }

  async loadState(saved, { silent = true } = {}) {
    if (!saved) { this.clear({ silent }); return; }
    const source = Array.isArray(saved.objects) ? saved.objects : [];
    const sourceW = Math.max(1, Number(saved.width) || this.canvas.width);
    const sourceH = Math.max(1, Number(saved.height) || this.canvas.height);
    const sx = this.canvas.width / sourceW;
    const sy = this.canvas.height / sourceH;
    const prev = this.silent;
    this.silent = this.silent || silent;
    this.objects = source.map((raw) => {
      const obj = defaultLayer(raw, this.canvas.width, this.canvas.height);
      obj.left = (Number(raw.left) || 0) * sx;
      obj.top = (Number(raw.top) || 0) * sy;
      obj.scaleX = (Number(raw.scaleX) || 1) * sx;
      obj.scaleY = (Number(raw.scaleY) || 1) * sy;
      return obj;
    });
    this.activeId = this.objects.some((item) => item.layerId === saved.activeId) ? saved.activeId : null;
    this.render();
    this.silent = prev;
    this.onSelection(this.getActiveData());
  }

  async exportOverlay(finalWidth, finalHeight) {
    const visible = this.objects.filter((obj) => obj.visible !== false);
    if (!visible.length) return null;
    await Promise.all(visible.map((obj) => ensureFontLoaded(obj.fontFamily, obj.fontWeight || 400, obj.fontSize || 48)));
    const width = Math.max(1, Math.round(finalWidth));
    const height = Math.max(1, Math.round(finalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const sx = width / Math.max(1, this.canvas.width);
    const sy = height / Math.max(1, this.canvas.height);
    for (const obj of visible) this.drawObject(ctx, obj, { sx, sy }, false);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
}
