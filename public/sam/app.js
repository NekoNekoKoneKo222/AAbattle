import { STEP, WIDTH, HEIGHT, DEFAULT_STAGE, DEFAULT_MOVE, balanceMove, createMatch, cpuInput, stepMatch } from './engine.js';

const $ = (id) => document.getElementById(id);
const storageKey = 'draw-fighters-v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } })();
const data = {
  name: typeof saved.name === 'string' ? saved.name.slice(0, 24) : 'MY FIGHTER',
  art: typeof saved.art === 'string' && saved.art.startsWith('data:image/png;base64,') ? saved.art : null,
  moveArt: typeof saved.moveArt === 'string' && saved.moveArt.startsWith('data:image/png;base64,') ? saved.moveArt : null,
  move: { ...DEFAULT_MOVE, ...(saved.move || {}) },
  stage: saved.stage?.platforms?.length <= 24 ? saved.stage : structuredClone(DEFAULT_STAGE)
};
function persist() { try { localStorage.setItem(storageKey, JSON.stringify(data)); toast('この端末に保存しました'); } catch { toast('保存容量が不足しています'); } }
let toastTimer;
function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }

document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.tab,.screen').forEach((el) => el.classList.remove('active'));
  button.classList.add('active');
  $(`${button.dataset.screen}-screen`).classList.add('active');
  if (button.dataset.screen === 'stage') renderStage();
}));

const paint = $('paint');
const paintCtx = paint.getContext('2d', { willReadFrequently: true });
const movePaint = $('move-paint');
const moveCtx = movePaint.getContext('2d', { willReadFrequently: true });
const preview = $('character-preview');
let brushTool = 'pen';
let painting = false;
let drawingStart = null;
let drawingBefore = null;
const undo = [];
const redo = [];
const imageCache = new Map();

function imageFrom(src) {
  if (!src) return null;
  if (!imageCache.has(src)) {
    const image = new Image();
    image.src = src;
    imageCache.set(src, image);
  }
  return imageCache.get(src);
}
function updatePreview() {
  const ctx = preview.getContext('2d');
  ctx.clearRect(0, 0, 160, 160);
  ctx.imageSmoothingEnabled = $('draw-mode').value === 'smooth';
  ctx.drawImage(paint, 0, 0, 160, 160);
}
function point(event, canvas) {
  const bounds = canvas.getBoundingClientRect();
  return { x: Math.floor((event.clientX - bounds.left) / bounds.width * canvas.width),
    y: Math.floor((event.clientY - bounds.top) / bounds.height * canvas.height) };
}
function snapshot(canvas, stack) { stack.push(canvas.toDataURL('image/png')); if (stack.length > 30) stack.shift(); }
function restore(canvas, src, next) {
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); next?.(); };
  img.src = src;
}
function stroke(ctx, from, to, erase = false) {
  ctx.save();
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = erase ? '#000' : $('draw-color').value;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = Number($('brush-size').value);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(to.x, to.y, Math.max(0.5, ctx.lineWidth / 2), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function fillAt(canvas, x, y) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  const at = (px, py) => (py * canvas.width + px) * 4;
  const target = [...pixels.slice(at(x, y), at(x, y) + 4)];
  const color = $('draw-color').value;
  const replacement = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), 255];
  if (target.every((n, i) => n === replacement[i])) return;
  const queue = [[x, y]];
  const seen = new Uint8Array(canvas.width * canvas.height);
  while (queue.length) {
    const [px, py] = queue.pop();
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
    const cell = py * canvas.width + px;
    if (seen[cell]) continue;
    seen[cell] = 1;
    const start = cell * 4;
    if (!target.every((n, i) => pixels[start + i] === n)) continue;
    for (let i = 0; i < 4; i++) pixels[start + i] = replacement[i];
    queue.push([px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]);
  }
  ctx.putImageData(frame, 0, 0);
}
function installPaint(canvas, ctx, isMove = false) {
  let last;
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    const p = point(event, canvas);
    if (p.x < 0 || p.y < 0 || p.x >= canvas.width || p.y >= canvas.height) return;
    const tool = isMove ? (brushTool === 'erase' ? 'erase' : 'pen') : brushTool;
    if (tool === 'eyedropper') {
      const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
      $('draw-color').value = `#${[...pixel.slice(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
      return;
    }
    snapshot(canvas, undo); redo.length = 0;
    if (tool === 'fill') { fillAt(canvas, p.x, p.y); updatePreview(); return; }
    painting = true; drawingStart = p; last = p;
    drawingBefore = (tool === 'line' || tool === 'rect') ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    if (tool === 'pen' || tool === 'erase') stroke(ctx, p, p, tool === 'erase');
    updatePreview();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!painting || !canvas.hasPointerCapture(event.pointerId)) return;
    const p = point(event, canvas);
    const tool = isMove ? (brushTool === 'erase' ? 'erase' : 'pen') : brushTool;
    if (drawingBefore) {
      ctx.putImageData(drawingBefore, 0, 0);
      ctx.save(); ctx.strokeStyle = $('draw-color').value; ctx.lineWidth = Number($('brush-size').value);
      if (tool === 'line') { ctx.beginPath(); ctx.moveTo(drawingStart.x, drawingStart.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      if (tool === 'rect') ctx.strokeRect(drawingStart.x, drawingStart.y, p.x - drawingStart.x, p.y - drawingStart.y);
      ctx.restore();
    } else stroke(ctx, last, p, tool === 'erase');
    last = p; updatePreview();
  });
  const stop = () => { painting = false; drawingBefore = null; updatePreview(); };
  canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
}
installPaint(paint, paintCtx); installPaint(movePaint, moveCtx, true);
document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
  brushTool = button.dataset.tool;
  document.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('selected', item === button));
}));
$('draw-mode').addEventListener('change', () => document.querySelector('.paint-wrap').classList.toggle('smooth', $('draw-mode').value === 'smooth'));
$('undo-art').addEventListener('click', () => { if (undo.length) { snapshot(paint, redo); restore(paint, undo.pop(), updatePreview); } });
$('redo-art').addEventListener('click', () => { if (redo.length) { snapshot(paint, undo); restore(paint, redo.pop(), updatePreview); } });
$('clear-art').addEventListener('click', () => { snapshot(paint, undo); paintCtx.clearRect(0, 0, 64, 64); updatePreview(); });
$('clear-move-art').addEventListener('click', () => moveCtx.clearRect(0, 0, 64, 64));
$('save-character').addEventListener('click', () => { data.name = $('character-name').value.trim().slice(0, 24) || 'MY FIGHTER'; data.art = paint.toDataURL('image/png'); persist(); });
$('export-character').addEventListener('click', () => { const link = document.createElement('a'); link.href = paint.toDataURL('image/png'); link.download = 'draw-fighter.png'; link.click(); });
$('import-character').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file || file.type !== 'image/png' || file.size > 4 * 1024 * 1024) { toast('4MB以下のPNGを選んでください'); return; }
  try {
    const bitmap = await createImageBitmap(file);
    snapshot(paint, undo); paintCtx.clearRect(0, 0, 64, 64); paintCtx.drawImage(bitmap, 0, 0, 64, 64); bitmap.close(); updatePreview();
  } catch { toast('PNGを読み込めませんでした'); }
  event.target.value = '';
});

const moveFields = ['damage', 'knockback', 'range', 'startup', 'recovery', 'cooldown'];
function readMove() {
  const result = { name: $('move-name').value.trim().slice(0, 24) || DEFAULT_MOVE.name,
    description: $('move-description').value.trim().slice(0, 140) };
  for (const key of moveFields) result[key] = Math.max(0, Math.min(999, Number($(`move-${key}`).value) || 0));
  return result;
}
function comparison() {
  const { original, balanced } = balanceMove(readMove());
  const titles = { damage: 'ダメージ', knockback: '吹き飛ばし', range: '射程', startup: '発生', recovery: '後隙', cooldown: '再使用' };
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>性能</th><th>原案</th><th>通常</th></tr>';
  for (const key of moveFields) {
    const row = document.createElement('tr');
    for (const value of [titles[key], original[key], balanced[key]]) { const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell); }
    table.append(row);
  }
  $('balance-comparison').replaceChildren(table);
}
document.querySelectorAll('#move-screen input').forEach((el) => el.addEventListener('input', comparison));
$('save-move').addEventListener('click', () => { data.move = readMove(); data.moveArt = movePaint.toDataURL('image/png'); persist(); });
$('suggest-move').addEventListener('click', () => {
  const pixels = moveCtx.getImageData(0, 0, 64, 64).data;
  let visible = 0, red = 0, blue = 0, green = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 80) { visible++; red += pixels[i]; green += pixels[i + 1]; blue += pixels[i + 2]; }
  if (!visible) { toast('先に技の画像を描いてください'); return; }
  $('move-damage').value = Math.min(40, Math.max(5, Math.round(visible / 100) + (red > blue * 1.2 ? 5 : 0)));
  $('move-range').value = Math.min(160, 40 + Math.round(visible / 30));
  $('move-knockback').value = green > red && green > blue ? 5 : 10;
  $('move-startup').value = visible > 1200 ? 20 : 9;
  comparison(); toast('ローカルの画像ルールで性能を推定しました');
});
fetch('/sam/api/config').then((response) => response.json()).then((config) => {
  $('gemini-move').hidden = !config.geminiAvailable;
  $('ai-availability').textContent = config.geminiAvailable
    ? 'Gemini画像解析を利用できます。生成前に技の画像を描いてください。'
    : 'Gemini APIキー未設定のため画像AIは利用できません。ローカル推定と手動編集で遊べます。';
}).catch(() => { $('ai-availability').textContent = '画像AIの状態を取得できません。ローカル推定は利用できます。'; });
$('gemini-move').addEventListener('click', async () => {
  const pixels = moveCtx.getImageData(0, 0, 64, 64).data;
  let drawn = false;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 80) { drawn = true; break; }
  if (!drawn) { toast('先に技の画像を描いてください'); return; }
  const button = $('gemini-move'); button.disabled = true; button.textContent = '画像を解析中…';
  try {
    const response = await fetch('/sam/api/move/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('move-name').value, description: $('move-description').value,
        attackArt: movePaint.toDataURL('image/png'), characterArt: data.art })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'AI生成に失敗しました');
    $('move-name').value = result.move.name;
    $('move-description').value = result.move.description;
    for (const key of moveFields) $(`move-${key}`).value = result.move[key];
    comparison(); toast('Geminiが画像から性能を提案しました。確認して保存してください');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = 'Geminiで画像解析'; }
});

const stageCanvas = $('stage-editor');
const stageCtx = stageCanvas.getContext('2d');
const stageHistory = [];
let stageDraft = structuredClone(data.stage);
let stageStart = null;
let stageEnd = null;
function renderStage() {
  stageCtx.fillStyle = '#15243a'; stageCtx.fillRect(0, 0, WIDTH, HEIGHT);
  stageCtx.fillStyle = '#1d3450';
  for (let x = 0; x < WIDTH; x += 48) for (let y = 0; y < HEIGHT; y += 48) stageCtx.fillRect(x, y, 1, 1);
  stageCtx.fillStyle = '#53c7b0';
  for (const p of stageDraft.platforms) { stageCtx.fillRect(p.x, p.y, p.w, p.h); stageCtx.fillStyle = '#90ffe0'; stageCtx.fillRect(p.x, p.y, p.w, 4); stageCtx.fillStyle = '#53c7b0'; }
  if (stageStart && stageEnd) { stageCtx.fillStyle = '#edc57599'; stageCtx.fillRect(Math.min(stageStart.x, stageEnd.x), Math.min(stageStart.y, stageEnd.y), Math.abs(stageEnd.x - stageStart.x), 16); }
  stageCtx.fillStyle = '#d8e7fc'; stageCtx.font = '16px sans-serif'; stageCtx.fillText('DRAG TO DRAW PLATFORMS', 20, 35);
}
stageCanvas.addEventListener('pointerdown', (event) => { event.preventDefault(); stageCanvas.setPointerCapture(event.pointerId); stageStart = point(event, stageCanvas); stageEnd = stageStart; renderStage(); });
stageCanvas.addEventListener('pointermove', (event) => { if (!stageCanvas.hasPointerCapture(event.pointerId)) return; stageEnd = point(event, stageCanvas); renderStage(); });
stageCanvas.addEventListener('pointerup', (event) => {
  if (!stageStart) return;
  const end = point(event, stageCanvas);
  stageHistory.push(structuredClone(stageDraft));
  if (Math.abs(end.x - stageStart.x) < 20) {
    const index = stageDraft.platforms.findIndex((p) => stageStart.x >= p.x && stageStart.x <= p.x + p.w && stageStart.y >= p.y - 8 && stageStart.y <= p.y + p.h + 8);
    if (index >= 0) stageDraft.platforms.splice(index, 1);
  } else if (stageDraft.platforms.length < 24) {
    stageDraft.platforms.push({ x: Math.max(0, Math.min(stageStart.x, end.x)), y: Math.max(80, Math.min(500, stageStart.y)), w: Math.min(960, Math.abs(end.x - stageStart.x)), h: 16 });
  } else toast('足場は24個までです');
  stageStart = stageEnd = null; renderStage();
});
$('undo-stage').addEventListener('click', () => { if (stageHistory.length) { stageDraft = stageHistory.pop(); renderStage(); } });
$('reset-stage').addEventListener('click', () => { stageHistory.push(structuredClone(stageDraft)); stageDraft = structuredClone(DEFAULT_STAGE); renderStage(); });
$('save-stage').addEventListener('click', () => { data.stage = { name: $('stage-name').value.trim().slice(0, 24) || 'MY STAGE', platforms: structuredClone(stageDraft.platforms) }; persist(); });

const arena = $('arena');
const arenaCtx = arena.getContext('2d');
const pressed = new Set();
const touchPressed = new Set();
const controlledKeys = new Set(['KeyA','KeyD','KeyW','KeyS','Space','ShiftLeft','KeyJ','KeyK','KeyI','KeyL','KeyU','KeyO','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Numpad1','Numpad2','Numpad3','Digit1','Digit2','Digit3']);
document.addEventListener('keydown', (event) => { if (event.target.matches('input,select,textarea')) return; if (controlledKeys.has(event.code)) { event.preventDefault(); pressed.add(event.code); } });
document.addEventListener('keyup', (event) => pressed.delete(event.code));
window.addEventListener('blur', () => { pressed.clear(); touchPressed.clear(); });
document.querySelectorAll('[data-input]').forEach((button) => {
  const key = button.dataset.input;
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); touchPressed.add(key); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => touchPressed.delete(key));
});
function playerInput(index) {
  const pad = navigator.getGamepads?.()[index];
  const axis = pad?.axes?.[0] || 0;
  const button = (n) => Boolean(pad?.buttons?.[n]?.pressed);
  if (index === 0) return {
    left: pressed.has('KeyA') || touchPressed.has('left') || axis < -0.35,
    right: pressed.has('KeyD') || touchPressed.has('right') || axis > 0.35,
    down: pressed.has('KeyS') || touchPressed.has('down'),
    jump: pressed.has('KeyW') || pressed.has('Space') || touchPressed.has('jump') || button(0),
    dash: pressed.has('ShiftLeft') || button(5),
    attack: pressed.has('KeyJ') || touchPressed.has('attack') || button(2),
    special: pressed.has('KeyK') || touchPressed.has('special') || button(1),
    strong: pressed.has('KeyI') || button(3),
    shield: pressed.has('KeyL') || touchPressed.has('shield') || button(4),
    grab: pressed.has('KeyU'), dodge: pressed.has('KeyO') || touchPressed.has('dodge')
  };
  return { left: pressed.has('ArrowLeft') || axis < -0.35,
    right: pressed.has('ArrowRight') || axis > 0.35,
    down: pressed.has('ArrowDown'), jump: pressed.has('ArrowUp') || button(0),
    attack: pressed.has('Numpad1') || pressed.has('Digit1') || button(2),
    special: pressed.has('Numpad2') || pressed.has('Digit2') || button(1),
    shield: pressed.has('Numpad3') || pressed.has('Digit3') || button(4) };
}
let match = null;
let paused = false;
let onlineSocket = null;
let onlineSlot = null;
let onlinePlayers = [null, null];
let onlineCode = null;
let lastTime = 0;
let accumulator = 0;
let lastHitFrame = -1;
let audioContext;
function sound() {
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'square'; oscillator.frequency.setValueAtTime(180, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(55, audioContext.currentTime + 0.09);
    gain.gain.setValueAtTime(0.08, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
    oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + 0.1);
  } catch { /* audio is optional */ }
}
function drawFighter(f, index) {
  if (f.stocks <= 0) return;
  const ctx = arenaCtx;
  ctx.save(); ctx.translate(f.x, f.y);
  if (f.invincible && Math.floor(f.invincible / 5) % 2) ctx.globalAlpha = .4;
  ctx.fillStyle = '#07172899'; ctx.beginPath(); ctx.ellipse(0, 32, 28, 7, 0, 0, Math.PI * 2); ctx.fill();
  const art = match?.mode === 'online' ? onlinePlayers[index]?.art : index === 0 ? data.art : null;
  if (art) {
    const img = imageFrom(art);
    if (img?.complete && img.naturalWidth) { ctx.imageSmoothingEnabled = $('draw-mode').value === 'smooth'; ctx.drawImage(img, -30, -37, 60, 65); }
    else drawDefaultFighter(ctx, f);
  } else drawDefaultFighter(ctx, f);
  if (f.shield) { ctx.strokeStyle = '#a3d6ff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, 0, 33, 41, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (f.attackFrame >= 0 && f.attackFrame >= match.attack.startup && f.attackFrame <= match.attack.startup + 5) {
    ctx.fillStyle = index ? '#ff8d9977' : '#72f3c677';
    ctx.beginPath(); ctx.ellipse(f.facing * match.attack.range / 2, -8, match.attack.range / 2, 19, 0, 0, Math.PI * 2); ctx.fill();
    if (index === 0 && data.moveArt) { const img = imageFrom(data.moveArt); if (img?.complete && img.naturalWidth) ctx.drawImage(img, f.facing * 24 - 24, -42, 48, 48); }
  }
  ctx.restore();
}
function drawDefaultFighter(ctx, f) {
  ctx.fillStyle = f.color; ctx.strokeStyle = '#10243c'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(-21, -29, 42, 57, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0b1830'; ctx.fillRect(f.facing > 0 ? 7 : -10, -13, 5, 5);
}
function renderArena() {
  const ctx = arenaCtx;
  ctx.save();
  ctx.fillStyle = '#122038'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT); sky.addColorStop(0, '#15253e'); sky.addColorStop(1, '#284b60'); ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#92d8d91a';
  for (let i = 0; i < 13; i++) { const x = i * 80 + 20; ctx.fillRect(x, 330 + (i % 4) * 20, 50, 210); }
  if (!match) { ctx.restore(); return; }
  if (match.effect?.kind === 'hit' && match.frame - match.effect.frame < 9) ctx.translate((Math.random() - .5) * 9, (Math.random() - .5) * 9);
  for (const p of match.stage.platforms) { ctx.fillStyle = '#1c5165'; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.fillStyle = '#6be5c7'; ctx.fillRect(p.x, p.y, p.w, 5); }
  match.fighters.forEach(drawFighter);
  if (match.effect) {
    const age = match.frame - match.effect.frame;
    ctx.strokeStyle = match.effect.kind === 'block' ? '#9dd3ff' : '#fff2a1'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(match.effect.x, match.effect.y, 8 + age * 4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#09172bc9'; ctx.fillRect(0, 0, WIDTH, 75);
  ctx.font = '800 18px sans-serif';
  ctx.fillStyle = '#75edcd'; ctx.fillText((match.mode === 'online' ? onlinePlayers[0]?.name : data.name || 'PLAYER 1').slice(0, 17), 24, 28);
  ctx.fillStyle = '#ff9ca6'; ctx.textAlign = 'right'; ctx.fillText(match.mode === 'online' ? (onlinePlayers[1]?.name || 'PLAYER 2').slice(0, 17) : match.mode === 'local' ? 'PLAYER 2' : 'CPU', WIDTH - 24, 28);
  ctx.font = '800 32px sans-serif';
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(`${Math.round(match.fighters[0].damage)}%`, 24, 62);
  ctx.textAlign = 'right'; ctx.fillText(`${Math.round(match.fighters[1].damage)}%`, WIDTH - 24, 62);
  ctx.textAlign = 'center'; ctx.font = '700 15px sans-serif'; ctx.fillStyle = '#c4d5ea';
  ctx.fillText(`${match.fighters[0].stocks} STOCK  ·  ${Math.ceil(match.timer / 3600)}:${String(Math.floor(match.timer / 60) % 60).padStart(2, '0')}  ·  ${match.fighters[1].stocks} STOCK`, WIDTH / 2, 42);
  if (match.winner !== null) { ctx.fillStyle = '#081426df'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.fillStyle = '#83f3d3'; ctx.font = '900 56px sans-serif'; ctx.fillText(match.winner === 0 ? 'PLAYER 1 WINS' : match.mode === 'local' || match.mode === 'online' ? 'PLAYER 2 WINS' : 'CPU WINS', WIDTH / 2, HEIGHT / 2); ctx.font = '18px sans-serif'; ctx.fillText(match.mode === 'online' ? 'ホストが再戦できます' : '試合開始で再戦', WIDTH / 2, HEIGHT / 2 + 38); }
}
function loop(time) {
  if (!lastTime) lastTime = time;
  accumulator += Math.min(0.1, (time - lastTime) / 1000);
  lastTime = time;
  if (match && !paused && match.mode !== 'online') {
    let ticks = 0;
    while (accumulator >= STEP && ticks < 5) {
      const second = match.mode === 'local' ? playerInput(1) : match.mode === 'training' ? {} : cpuInput(match, 1, $('cpu-level').value);
      stepMatch(match, [playerInput(0), second]);
      accumulator -= STEP; ticks++;
    }
    if (ticks === 5) accumulator = 0;
    if (match.effect?.kind === 'hit' && match.effect.frame !== lastHitFrame) { sound(); lastHitFrame = match.effect.frame; }
  } else accumulator = 0;
  renderArena(); requestAnimationFrame(loop);
}
$('start-match').addEventListener('click', () => {
  if ($('game-mode').value === 'online') { toast('オンラインルームを作成・参加してください'); return; }
  match = createMatch({ mode: $('game-mode').value, stage: data.stage, move: data.move, free: $('rule-mode').value === 'free' });
  paused = false; $('arena-overlay').classList.add('hidden'); $('pause-match').textContent = '一時停止'; toast('試合開始！');
});
$('pause-match').addEventListener('click', () => { if (!match || match.mode === 'online') return; paused = !paused; $('pause-match').textContent = paused ? '再開' : '一時停止'; $('arena-overlay').classList.toggle('hidden', !paused); $('arena-overlay').querySelector('span').textContent = paused ? '一時停止中' : '試合開始を押してプレイ'; });

function onlineStatus(message) { $('online-status').textContent = message; }
function onlineSend(message) { if (onlineSocket?.readyState === WebSocket.OPEN) onlineSocket.send(JSON.stringify(message)); }
function connectOnline(next) {
  if (onlineSocket && onlineSocket.readyState === WebSocket.OPEN) return next();
  onlineSocket?.close();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  onlineSocket = new WebSocket(`${protocol}//${location.host}/sam/ws`);
  onlineStatus('サーバーに接続中…');
  onlineSocket.addEventListener('open', next, { once: true });
  onlineSocket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'joined') { onlineSlot = message.slot; onlineCode = message.code; $('room-code').value = message.code; onlineStatus(`ルーム ${message.code} に参加しました。相手を待っています`); }
    if (message.type === 'room') { onlinePlayers = message.players; $('start-online').disabled = onlineSlot !== 0 || !message.canStart; onlineStatus(`ルーム ${message.code} · ${message.players.filter(Boolean).map((p) => p.name).join(' vs ')} · ${message.canStart ? '対戦準備完了' : '相手を待機中'}`); }
    if (message.type === 'started') {
      match = message.match; match.mode = 'online'; paused = false;
      $('arena-overlay').classList.add('hidden'); onlineStatus(`ルーム ${onlineCode} · 対戦中`); toast('オンライン試合開始！');
    }
    if (message.type === 'state') { match = message.match; match.mode = 'online'; }
    if (message.type === 'notice' || message.type === 'error') { onlineStatus(message.message); toast(message.message); }
  });
  onlineSocket.addEventListener('close', () => { onlineSlot = null; onlineCode = null; onlinePlayers = [null, null]; $('start-online').disabled = true; onlineStatus('接続が切れました。再度ルームに参加してください'); if (match?.mode === 'online') match = null; });
  onlineSocket.addEventListener('error', () => onlineStatus('接続に失敗しました'));
}
$('game-mode').addEventListener('change', () => { $('online-panel').hidden = $('game-mode').value !== 'online'; $('cpu-level').disabled = $('game-mode').value !== 'cpu'; $('pause-match').disabled = $('game-mode').value === 'online'; $('start-match').disabled = $('game-mode').value === 'online'; });
$('create-room').addEventListener('click', () => connectOnline(() => onlineSend({ type: 'create', name: data.name, art: data.art,
  stage: data.stage, move: data.move, free: $('rule-mode').value === 'free' })));
$('join-room').addEventListener('click', () => {
  const code = $('room-code').value.trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) { toast('6桁のルームコードを入力してください'); return; }
  connectOnline(() => onlineSend({ type: 'join', code, name: data.name, art: data.art }));
});
$('start-online').addEventListener('click', () => onlineSend({ type: 'start' }));
$('leave-room').addEventListener('click', () => { onlineSend({ type: 'leave' }); onlineSocket?.close(); match = null; $('arena-overlay').classList.remove('hidden'); });
setInterval(() => { if (match?.mode === 'online' && match.winner === null) onlineSend({ type: 'input', input: playerInput(0) }); }, 1000 / 30);

$('character-name').value = data.name;
for (const key of ['name', ...moveFields]) if ($(`move-${key}`)) $(`move-${key}`).value = data.move[key] ?? DEFAULT_MOVE[key];
$('move-description').value = data.move.description || '';
$('stage-name').value = data.stage.name;
if (data.art) restore(paint, data.art, updatePreview);
if (data.moveArt) restore(movePaint, data.moveArt);
updatePreview(); comparison(); renderStage(); requestAnimationFrame(loop);
