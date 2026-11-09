const SIZE = 64;
const MAX_LAYERS = 6;
const imagePattern = /^data:image\/png;base64,[A-Za-z0-9+/=]{1,90000}$/;
const makeCanvas = (size = SIZE) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
};
const image = (src) => new Promise((resolve, reject) => {
  if (!imagePattern.test(src)) return reject(new Error('PNG画像が不正です'));
  const result = new Image();
  result.onload = () => resolve(result);
  result.onerror = reject;
  result.src = src;
});
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export class RasterEditor {
  constructor(canvas, { onChange = () => {}, color = () => '#71f4c8', size = () => 3 } = {}) {
    this.canvas = canvas;
    this.size = canvas.width;
    this.ctx = canvas.getContext('2d');
    this.layers = [{ name: 'レイヤー 1', visible: true, canvas: makeCanvas(this.size) }];
    this.active = 0;
    this.tool = 'pen';
    this.onChange = onChange;
    this.color = color;
    this.brushSize = size;
    this.undoStack = [];
    this.redoStack = [];
    this.selection = null;
    this.drag = null;
    this.onion = null;
    canvas.addEventListener('pointerdown', (event) => this.down(event));
    canvas.addEventListener('pointermove', (event) => this.move(event));
    canvas.addEventListener('pointerup', (event) => this.up(event));
    canvas.addEventListener('pointercancel', () => { this.drag = null; this.render(); });
    this.render();
  }
  get layer() { return this.layers[this.active]; }
  get layerCtx() { return this.layer.canvas.getContext('2d', { willReadFrequently: true }); }
  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clamp(Math.floor((event.clientX - rect.left) / rect.width * this.size), 0, this.size - 1),
      y: clamp(Math.floor((event.clientY - rect.top) / rect.height * this.size), 0, this.size - 1) };
  }
  history() {
    this.undoStack.push({ active: this.active, selection: this.selection && { ...this.selection }, layers: this.layers.map((layer) => ({
      name: layer.name, visible: layer.visible, pixels: layer.canvas.getContext('2d').getImageData(0, 0, this.size, this.size)
    })) });
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  capture() { return { active: this.active, selection: this.selection && { ...this.selection }, layers: this.layers.map((layer) => ({
    name: layer.name, visible: layer.visible, pixels: layer.canvas.getContext('2d').getImageData(0, 0, this.size, this.size)
  })) }; }
  restore(state) {
    this.layers = state.layers.map((layer) => {
      const canvas = makeCanvas(this.size); canvas.getContext('2d').putImageData(layer.pixels, 0, 0);
      return { name: layer.name, visible: layer.visible, canvas };
    });
    this.active = clamp(state.active, 0, this.layers.length - 1);
    this.selection = state.selection;
    this.changed();
  }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(this.capture()); this.restore(this.undoStack.pop()); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(this.capture()); this.restore(this.redoStack.pop()); }
  changed() { this.render(); this.onChange(); }
  setTool(tool) { this.tool = tool; }
  setOnion(src) {
    this.onion = null;
    if (!src) return this.render();
    image(src).then((img) => { this.onion = img; this.render(); }).catch(() => {});
  }
  composite() {
    const canvas = makeCanvas(this.size); const ctx = canvas.getContext('2d');
    for (const layer of this.layers) if (layer.visible) ctx.drawImage(layer.canvas, 0, 0);
    return canvas;
  }
  png() { return this.composite().toDataURL('image/png'); }
  serialize() { return this.layers.map((layer) => ({ name: layer.name, visible: layer.visible, src: layer.canvas.toDataURL('image/png') })); }
  async load(layers, fallback) {
    const source = Array.isArray(layers) && layers.length ? layers.slice(0, MAX_LAYERS) : [{ name: 'レイヤー 1', visible: true, src: fallback }];
    const result = [];
    for (const entry of source) {
      const canvas = makeCanvas(this.size);
      if (entry?.src) {
        try { canvas.getContext('2d').drawImage(await image(entry.src), 0, 0, this.size, this.size); } catch { /* keep valid blank layer */ }
      }
      result.push({ name: String(entry?.name || `レイヤー ${result.length + 1}`).slice(0, 24), visible: entry?.visible !== false, canvas });
    }
    this.layers = result; this.active = result.length - 1;
    this.selection = null; this.undoStack = []; this.redoStack = []; this.changed();
  }
  addLayer() {
    if (this.layers.length >= MAX_LAYERS) return false;
    this.history(); this.layers.splice(this.active + 1, 0, { name: `レイヤー ${this.layers.length + 1}`, visible: true, canvas: makeCanvas(this.size) });
    this.active++; this.changed(); return true;
  }
  deleteLayer() {
    if (this.layers.length <= 1) return false;
    this.history(); this.layers.splice(this.active, 1); this.active = clamp(this.active, 0, this.layers.length - 1); this.changed(); return true;
  }
  reorder(direction) {
    const next = this.active + direction;
    if (next < 0 || next >= this.layers.length) return;
    this.history(); [this.layers[this.active], this.layers[next]] = [this.layers[next], this.layers[this.active]];
    this.active = next; this.changed();
  }
  selectLayer(index) { if (index >= 0 && index < this.layers.length) { this.active = index; this.changed(); } }
  toggleLayer(index) { if (!this.layers[index]) return; this.history(); this.layers[index].visible = !this.layers[index].visible; this.changed(); }
  clear() { this.history(); this.layerCtx.clearRect(0, 0, this.size, this.size); this.changed(); }
  async importPng(file) {
    if (file.type !== 'image/png' || file.size > 4 * 1024 * 1024) throw new Error('4MB以下のPNGを選んでください');
    const bitmap = await createImageBitmap(file);
    this.history(); this.layerCtx.clearRect(0, 0, this.size, this.size);
    this.layerCtx.drawImage(bitmap, 0, 0, this.size, this.size); bitmap.close(); this.changed();
  }
  rect() { return this.selection || { x: 0, y: 0, w: this.size, h: this.size }; }
  transform(kind) {
    const { x, y, w, h } = this.rect();
    if (!w || !h) return;
    this.history();
    const ctx = this.layerCtx; const source = makeCanvas(this.size);
    source.getContext('2d').drawImage(this.layer.canvas, x, y, w, h, 0, 0, w, h);
    ctx.clearRect(x, y, w, h);
    ctx.save(); ctx.translate(x + w / 2, y + h / 2);
    if (kind === 'flip') ctx.scale(-1, 1);
    if (kind === 'rotate') ctx.rotate(Math.PI / 2);
    const scale = kind === 'grow' ? 1.25 : kind === 'shrink' ? 0.8 : 1;
    ctx.scale(scale, scale);
    ctx.drawImage(source, 0, 0, w, h, -w / 2, -h / 2, w, h);
    ctx.restore(); this.changed();
  }
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);
    if (this.onion) { ctx.save(); ctx.globalAlpha = .26; ctx.drawImage(this.onion, 0, 0, this.size, this.size); ctx.restore(); }
    for (const layer of this.layers) if (layer.visible) ctx.drawImage(layer.canvas, 0, 0);
    if (this.selection) { const { x, y, w, h } = this.selection; ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.strokeRect(x + .5, y + .5, w, h); ctx.restore(); }
  }
  stroke(a, b, erase) {
    const ctx = this.layerCtx;
    ctx.save(); ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = erase ? '#000' : this.color(); ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = clamp(Number(this.brushSize()) || 1, 1, 16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(.5, ctx.lineWidth / 2), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  fill(x, y) {
    const ctx = this.layerCtx; const frame = ctx.getImageData(0, 0, this.size, this.size); const pixels = frame.data;
    const offset = (y * this.size + x) * 4;
    const target = [...pixels.slice(offset, offset + 4)];
    const hex = this.color(); const next = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
    if (target.every((n, i) => n === next[i])) return;
    const stack = [y * this.size + x]; const seen = new Uint8Array(this.size * this.size);
    while (stack.length) {
      const cell = stack.pop();
      if (cell < 0 || cell >= seen.length || seen[cell]) continue;
      seen[cell] = 1; const offset = cell * 4;
      if (!target.every((n, i) => n === pixels[offset + i])) continue;
      for (let i = 0; i < 4; i++) pixels[offset + i] = next[i];
      const px = cell % this.size;
      if (px) stack.push(cell - 1); if (px < this.size - 1) stack.push(cell + 1);
      stack.push(cell - this.size, cell + this.size);
    }
    ctx.putImageData(frame, 0, 0);
  }
  down(event) {
    event.preventDefault(); this.canvas.setPointerCapture(event.pointerId);
    const p = this.point(event); const tool = this.tool;
    if (tool === 'eyedropper') {
      const pixels = this.layerCtx.getImageData(p.x, p.y, 1, 1).data;
      const value = `#${[...pixels.slice(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
      this.onPick?.(value); return;
    }
    if (tool === 'select') { this.drag = { start: p, last: p, tool }; this.selection = { x: p.x, y: p.y, w: 1, h: 1 }; this.render(); return; }
    this.history();
    const before = this.layerCtx.getImageData(0, 0, this.size, this.size);
    this.drag = { start: p, last: p, tool, before, selection: this.selection && { ...this.selection } };
    if (tool === 'fill') { this.fill(p.x, p.y); this.drag = null; this.changed(); }
    else if (tool === 'pen' || tool === 'erase') { this.stroke(p, p, tool === 'erase'); this.changed(); }
  }
  move(event) {
    if (!this.drag || !this.canvas.hasPointerCapture(event.pointerId)) return;
    const p = this.point(event); const { start, tool, before, last } = this.drag;
    if (tool === 'select') {
      this.selection = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x) + 1, h: Math.abs(p.y - start.y) + 1 };
      this.render();
    } else if (tool === 'pen' || tool === 'erase') { this.stroke(last, p, tool === 'erase'); this.changed(); }
    else if (['line', 'rect', 'ellipse', 'move'].includes(tool)) {
      const ctx = this.layerCtx; ctx.putImageData(before, 0, 0);
      if (tool === 'move') {
        const box = this.drag.selection || { x: 0, y: 0, w: this.size, h: this.size };
        const tmp = makeCanvas(this.size); tmp.getContext('2d').putImageData(before, 0, 0);
        ctx.clearRect(box.x, box.y, box.w, box.h);
        ctx.drawImage(tmp, box.x, box.y, box.w, box.h, box.x + p.x - start.x, box.y + p.y - start.y, box.w, box.h);
        if (this.drag.selection) this.selection = { ...box, x: clamp(box.x + p.x - start.x, 0, this.size - 1), y: clamp(box.y + p.y - start.y, 0, this.size - 1) };
      } else {
        ctx.save(); ctx.strokeStyle = this.color(); ctx.lineWidth = clamp(Number(this.brushSize()) || 1, 1, 16);
        if (tool === 'line') { ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
        if (tool === 'rect') ctx.strokeRect(start.x, start.y, p.x - start.x, p.y - start.y);
        if (tool === 'ellipse') { ctx.beginPath(); ctx.ellipse((start.x + p.x) / 2, (start.y + p.y) / 2, Math.max(1, Math.abs(p.x - start.x) / 2), Math.max(1, Math.abs(p.y - start.y) / 2), 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
      this.changed();
    }
    this.drag.last = p;
  }
  up(event) { if (!this.drag) return; this.move(event); this.drag = null; this.changed(); }
}
