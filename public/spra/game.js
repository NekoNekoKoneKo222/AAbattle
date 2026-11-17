const $ = id => document.getElementById(id);
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const W = 54, H = 34, TILE = 30, PAINT_SCALE = 8;
const PAINT_W = W * PAINT_SCALE, PAINT_H = H * PAINT_SCALE;
const paintCanvas = document.createElement('canvas');
paintCanvas.width = PAINT_W;
paintCanvas.height = PAINT_H;
const paintCtx = paintCanvas.getContext('2d');
const paintImage = paintCtx.createImageData(PAINT_W, PAINT_H);
let paintDirty = true;
function setPaintPixel(index, value) {
  if (index < 0 || index >= PAINT_W * PAINT_H || value < 0 || value > 2) return;
  paint[index] = value;
  const i = index * 4;
  if (value === 0) {
    paintImage.data[i + 3] = 0;
    return;
  }
  const noise = (((index * 2654435761) >>> 9) % 15) - 7;
  if (value === 1) {
    paintImage.data[i] = 18 + noise;
    paintImage.data[i + 1] = 204 + noise;
    paintImage.data[i + 2] = 231 + noise;
  } else {
    paintImage.data[i] = 249 + Math.min(noise, 6);
    paintImage.data[i + 1] = 146 + noise;
    paintImage.data[i + 2] = 38 + noise;
  }
  paintImage.data[i + 3] = 255;
}
function drawPaint() {
  if (paintDirty) {
    paintCtx.putImageData(paintImage, 0, 0);
    paintDirty = false;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(paintCanvas, 0, 0, canvas.width, canvas.height);
}
const COLORS = ['#27d7f3', '#ff9b36'];
let ws = null, myId = null, roomCode = '', isHost = false;
let phase = 'lobby', selectedWeapon = 'shooter', players = [], walls = [];
let paint = new Uint8Array(PAINT_W * PAINT_H), effects = [], remaining = 180, scores = [0, 0], winner = -1;
let smooth = new Map(), prevFrame = performance.now(), elapsed = 0, bombQueued = false, toastTimer;
const keys = new Set();
const pointer = { x: W / 2, y: H / 2, active: false, down: false };
const touch = { fire: false, swim: false, moveX: 0, moveY: 0, stickId: null, stickX: 0, stickY: 0 };
const nickname = $('nickname');
nickname.value = localStorage.getItem('spra_name') || '';
const queryRoom = new URL(location.href).searchParams.get('room');
if (queryRoom && /^[a-z0-9]{6}$/i.test(queryRoom)) $('roomInput').value = queryRoom.toUpperCase();
const colorOf = team => COLORS[team] || '#ffffff';

function toast(message) {
  const el = $('toast');
  el.textContent = String(message);
  el.classList.add('shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('shown'), 3500);
}
function send(packet) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(packet));
}
function updateConnection(online) {
  $('connection').classList.toggle('online', online);
  $('connection').lastChild.textContent = online ? ' ONLINE' : ' OFFLINE';
}
function join(code = '') {
  if (ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.readyState)) {
    toast('すでに接続しています。');
    return;
  }
  const name = nickname.value.trim().slice(0, 18) || 'PLAYER';
  localStorage.setItem('spra_name', name);
  $('createBtn').disabled = $('joinBtn').disabled = true;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(proto + '//' + location.host + '/spra/ws');
  ws = socket;
  socket.onopen = () => { updateConnection(true); send({ type: 'join', name, code }); };
  socket.onerror = () => toast('サーバーとの接続に失敗しました。');
  socket.onclose = () => {
    if (ws !== socket) return;
    updateConnection(false);
    $('createBtn').disabled = $('joinBtn').disabled = false;
    if (myId) {
      toast('切断されました。再び部屋に参加してください。');
      $('roomInput').value = roomCode;
      myId = null; phase = 'lobby';
      $('joinCard').classList.remove('hidden');
      $('roomCard').classList.add('hidden');
      $('arenaPanel').classList.add('hidden');
      $('result').classList.add('hidden');
    }
  };
  socket.onmessage = event => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    receive(msg);
  };
}
function decodePaint(base64) {
  try {
    const bytes = atob(base64 || '');
    if (bytes.length !== PAINT_W * PAINT_H) return;
    paint = Uint8Array.from(bytes, char => char.charCodeAt(0));
    for (let i = 0; i < paint.length; i++) setPaintPixel(i, paint[i]);
    paintDirty = true;
  } catch { toast('インク情報を取得できませんでした。'); }
}
function receive(msg) {
  if (msg.type === 'error') {
    toast(msg.message || 'エラーが発生しました');
    if (!myId) ws?.close();
  }
  if (msg.type === 'welcome') {
    myId = msg.id; roomCode = msg.code;
    walls = Array.isArray(msg.walls) ? msg.walls : [];
    decodePaint(msg.paint);
    $('roomCode').textContent = roomCode;
    $('joinCard').classList.add('hidden');
    $('roomCard').classList.remove('hidden');
    $('roomCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', '/spra/?room=' + roomCode);
    toast('部屋に参加しました！');
  }
  if (msg.type === 'reset') {
    decodePaint(msg.paint);
    effects.length = 0;
    smooth.clear();
    $('result').classList.add('hidden');
  }
  if (msg.type === 'state') {
    if (!myId) return;
    phase = msg.phase;
    remaining = msg.remaining;
    scores = Array.isArray(msg.scores) ? msg.scores : [0, 0];
    winner = msg.winner;
    isHost = msg.host === myId;
    players = Array.isArray(msg.players) ? msg.players : [];
    const changes = Array.isArray(msg.changes) ? msg.changes : [];
    for (let i = 0; i + 2 < changes.length; i += 3) {
      const start = changes[i], count = changes[i + 1], color = changes[i + 2];
      if (!Number.isInteger(start) || !Number.isInteger(count) ||
        count < 1 || count > paint.length || start < 0 ||
        start + count > paint.length || ![0, 1, 2].includes(color)) continue;
      for (let j = start; j < start + count; j++) setPaintPixel(j, color);
      paintDirty = true;
    }
    if (Array.isArray(msg.effects)) {
      for (const fx of msg.effects) effects.push({ ...fx, time: performance.now() });
      if (effects.length > 70) effects.splice(0, effects.length - 70);
    }
    updateUI();
  }
}
function roster(team) {
  const parent = $(team === 0 ? 'blueRoster' : 'orangeRoster');
  parent.replaceChildren();
  const members = players.filter(p => p.team === team);
  if (!members.length) {
    const item = document.createElement('span');
    item.className = 'empty'; item.textContent = 'まだいません';
    parent.append(item);
  }
  for (const p of members) {
    const item = document.createElement('div');
    item.className = 'member';
    const name = document.createElement('span');
    name.textContent = (p.id === myId ? '★ ' : '') + p.name;
    const meta = document.createElement('small');
    meta.textContent = p.bot ? 'CPU' : 'PLAYER';
    item.append(name, meta); parent.append(item);
  }
}
function updateUI() {
  const active = phase === 'playing' || phase === 'results';
  $('roomCard').classList.toggle('hidden', active);
  $('arenaPanel').classList.toggle('hidden', !active);
  if (!active) {
    roster(0); roster(1);
    $('startBtn').disabled = !isHost;
    $('botBtn').disabled = !isHost || players.length >= 8;
    $('hostNote').textContent = isHost ? 'あなたが部屋のホストです。CPUを追加して1人でも練習できます。' : 'ホストが試合を開始するまで待機してください。';
  }
  const me = players.find(p => p.id === myId);
  if (me) {
    $('myTeam').textContent = me.team === 0 ? 'BLUE TEAM' : 'ORANGE TEAM';
    $('myTeam').style.color = colorOf(me.team);
    $('myHp').textContent = me.hp;
    $('myInk').textContent = me.ink;
    $('myKo').textContent = me.ko;
    $('myBomb').textContent = me.bombCd > 0 ? Math.ceil(me.bombCd) + 's' : 'READY';
    if (me.weapon !== selectedWeapon) {
      selectedWeapon = me.weapon;
      for (const btn of document.querySelectorAll('.weapon')) btn.classList.toggle('selected', btn.dataset.weapon === selectedWeapon);
    }
  }
  $('blueScore').textContent = (scores[0] || 0).toFixed(1) + '%';
  $('orangeScore').textContent = (scores[1] || 0).toFixed(1) + '%';
  $('blueBar').style.width = Math.min(100, scores[0] || 0) + '%';
  $('orangeBar').style.width = Math.min(100, scores[1] || 0) + '%';
  $('clock').textContent = Math.floor(remaining / 60) + ':' + String(remaining % 60).padStart(2, '0');
  $('result').classList.toggle('hidden', phase !== 'results');
  if (phase === 'results') {
    const title = winner < 0 ? 'DRAW!' : winner === 0 ? 'BLUE WIN!' : 'ORANGE WIN!';
    $('resultTitle').textContent = title;
    $('resultTitle').style.color = winner < 0 ? '#fff' : colorOf(winner);
    $('resultScores').textContent = 'BLUE ' + scores[0].toFixed(1) + '%  /  ORANGE ' + scores[1].toFixed(1) + '%';
    $('backLobbyBtn').classList.toggle('hidden', !isHost);
    $('resultHint').textContent = isHost ? '次の試合へ進むとロビーに戻ります。' : 'ホストが次の試合を準備するまでお待ちください。';
  }
}
$('createBtn').addEventListener('click', () => join());
$('joinBtn').addEventListener('click', () => {
  const code = $('roomInput').value.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return toast('6文字の部屋コードを入力してください。');
  join(code);
});
$('copyBtn').addEventListener('click', async () => {
  const url = location.origin + '/spra/?room=' + roomCode;
  try { await navigator.clipboard.writeText(url); toast('招待URLをコピーしました！'); }
  catch { toast('招待URL: ' + url); }
});
$('blueBtn').addEventListener('click', () => send({ type: 'team', team: 0 }));
$('orangeBtn').addEventListener('click', () => send({ type: 'team', team: 1 }));
for (const btn of document.querySelectorAll('.weapon')) btn.addEventListener('click', () => {
  selectedWeapon = btn.dataset.weapon;
  for (const other of document.querySelectorAll('.weapon')) other.classList.toggle('selected', other === btn);
  send({ type: 'weapon', weapon: selectedWeapon });
});
$('startBtn').addEventListener('click', () => send({ type: 'start' }));
$('botBtn').addEventListener('click', () => send({ type: 'bot' }));
$('backLobbyBtn').addEventListener('click', () => send({ type: 'lobby' }));
$('roomInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });

const gameControl = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'shift', 'q', ' ']);
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (phase !== 'playing' || document.activeElement?.tagName === 'INPUT') return;
  if (gameControl.has(key)) event.preventDefault();
  if (key === 'q' && !keys.has(key)) bombQueued = true;
  keys.add(key);
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); pointer.down = false; touch.fire = false; touch.swim = false; touch.moveX = touch.moveY = 0; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
function aimFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = (e.clientX - rect.left) * W / rect.width;
  pointer.y = (e.clientY - rect.top) * H / rect.height;
  pointer.active = true;
}
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' || (e.pointerType !== 'mouse' && pointer.down)) aimFromEvent(e);
});
canvas.addEventListener('pointerdown', e => {
  if (phase !== 'playing') return;
  aimFromEvent(e);
  if (e.button === 0) {
    pointer.down = true;
    if (e.pointerType === 'mouse') canvas.setPointerCapture(e.pointerId);
  }
});
window.addEventListener('pointerup', () => { pointer.down = false; });
canvas.addEventListener('pointercancel', () => { pointer.down = false; });

const stick = $('joystick'), thumb = $('thumb');
function updateStick(e) {
  const rect = stick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
  const radius = rect.width * 0.35;
  let x = e.clientX - centerX, y = e.clientY - centerY;
  const len = Math.hypot(x, y);
  if (len > radius) { x = x * radius / len; y = y * radius / len; }
  touch.moveX = x / radius; touch.moveY = y / radius;
  thumb.style.transform = 'translate(calc(-50% + ' + x + 'px),calc(-50% + ' + y + 'px))';
}
stick.addEventListener('pointerdown', e => {
  e.preventDefault(); touch.stickId = e.pointerId; stick.setPointerCapture(e.pointerId); updateStick(e);
});
stick.addEventListener('pointermove', e => { if (e.pointerId === touch.stickId) updateStick(e); });
function releaseStick(e) {
  if (e.pointerId !== touch.stickId) return;
  touch.stickId = null; touch.moveX = touch.moveY = 0; thumb.style.transform = 'translate(-50%,-50%)';
}
stick.addEventListener('pointerup', releaseStick); stick.addEventListener('pointercancel', releaseStick);
function touchHeld(id, prop) {
  const btn = $(id);
  btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture(e.pointerId); touch[prop] = true; });
  btn.addEventListener('pointerup', () => { touch[prop] = false; });
  btn.addEventListener('pointercancel', () => { touch[prop] = false; });
}
touchHeld('fireTouch', 'fire'); touchHeld('swimTouch', 'swim');
$('bombTouch').addEventListener('pointerdown', e => { e.preventDefault(); bombQueued = true; });

setInterval(() => {
  if (phase !== 'playing' || !myId || ws?.readyState !== WebSocket.OPEN) return;
  const x = (+keys.has('d') || +keys.has('arrowright')) - (+keys.has('a') || +keys.has('arrowleft')) + touch.moveX;
  const y = (+keys.has('s') || +keys.has('arrowdown')) - (+keys.has('w') || +keys.has('arrowup')) + touch.moveY;
  const me = players.find(p => p.id === myId);
  let aim = me?.aim || 0;
  if (me && pointer.active) aim = Math.atan2(pointer.y - me.y, pointer.x - me.x);
  send({ type: 'input', x, y, aim, fire: pointer.down || touch.fire || keys.has(' '), swim: keys.has('shift') || touch.swim, bomb: bombQueued });
  bombQueued = false;
}, 65);

function rect(x, y, w, h, fill) {
  ctx.fillStyle = fill; ctx.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
}
function roundedRect(x, y, w, h, r, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}
function drawArena() {
  ctx.fillStyle = '#162b38'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // floor tiles
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    rect(x, y, 1, 1, (x + y) % 2 === 0 ? '#1a3341' : '#18313e');
  }
  ctx.strokeStyle = '#e5f6ff12';ctx.lineWidth = 1;
  for (let i = 0; i <= W; i++) { ctx.beginPath();ctx.moveTo(i * TILE, 0);ctx.lineTo(i * TILE, canvas.height);ctx.stroke(); }
  for (let i = 0; i <= H; i++) { ctx.beginPath();ctx.moveTo(0, i * TILE);ctx.lineTo(canvas.width, i * TILE);ctx.stroke(); }
  drawPaint();
  for (const w of walls) {
    roundedRect((w.x + .17) * TILE, (w.y + .3) * TILE, w.w * TILE, w.h * TILE, 8, '#030f19a0');
    roundedRect(w.x * TILE, w.y * TILE, w.w * TILE, w.h * TILE, 8, '#395366');
    roundedRect((w.x + .15) * TILE, (w.y + .15) * TILE, (w.w - .3) * TILE, (w.h - .3) * TILE, 5, '#435e70');
    ctx.strokeStyle = '#9cb7c355';ctx.lineWidth = 2;
    ctx.strokeRect((w.x + .25) * TILE, (w.y + .25) * TILE, (w.w - .5) * TILE, (w.h - .5) * TILE);
  }
  // home bases
  for (const [i, x] of [4.5, W - 4.5].entries()) {
    ctx.beginPath();ctx.arc(x * TILE, H / 2 * TILE, 59, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS[i] + 'bb'; ctx.lineWidth = 4;ctx.setLineDash([14, 8]);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(x * TILE, H / 2 * TILE, 27, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[i] + '24'; ctx.fill();
  }
}
function drawEffects(now) {
  effects = effects.filter(f => now - f.time < 550);
  for (const fx of effects) {
    const age = (now - fx.time) / 550, alpha = Math.max(0, 1 - age);
    ctx.save();ctx.globalAlpha = alpha;
    if (fx.type === 'shot') {
      ctx.strokeStyle = colorOf(fx.team);ctx.lineWidth = (fx.weapon === 'roller' ? 13 : 5) * (1 - age * .75);
      ctx.lineCap = 'round';ctx.beginPath();ctx.moveTo(fx.x * TILE, fx.y * TILE);
      ctx.lineTo(fx.tx * TILE, fx.ty * TILE);ctx.stroke();
      for (let j = 0; j < 5; j++) {
        const t = j / 5, x = (fx.x + (fx.tx - fx.x) * t) * TILE, y = (fx.y + (fx.ty - fx.y) * t) * TILE;
        ctx.fillStyle = colorOf(fx.team);ctx.beginPath();ctx.arc(x, y, 5 + (j % 3) * 3, 0, Math.PI * 2);ctx.fill();
      }
    } else if (fx.type === 'bomb' || fx.type === 'ko') {
      const radius = (fx.type === 'bomb' ? 105 : 55) * age;
      ctx.strokeStyle = colorOf(fx.team);ctx.lineWidth = 15 * (1 - age);
      ctx.beginPath();ctx.arc(fx.x * TILE, fx.y * TILE, radius, 0, Math.PI * 2);ctx.stroke();
      ctx.fillStyle = colorOf(fx.team) + '66';ctx.beginPath();ctx.arc(fx.x * TILE, fx.y * TILE, radius * .8, 0, Math.PI * 2);ctx.fill();
    }
    ctx.restore();
  }
}
function drawPlayers(dt) {
  const present = new Set();
  const now = performance.now();
  for (const p of players) {
    if (p.dead) continue;
    present.add(p.id);
    let s = smooth.get(p.id);
    if (!s) { s = { x: p.x, y: p.y, aim: p.aim }; smooth.set(p.id, s); }
    const alpha = Math.min(1, dt * 14);
    const diff = Math.atan2(Math.sin(p.aim - s.aim), Math.cos(p.aim - s.aim));
    s.x += (p.x - s.x) * alpha; s.y += (p.y - s.y) * alpha;s.aim += diff * alpha;
    const x = s.x * TILE, y = s.y * TILE;
    const my = p.id === myId;
    const myColor = colorOf(p.team);
    ctx.save();ctx.translate(x, y);
    ctx.fillStyle = '#03101988';ctx.beginPath();ctx.ellipse(4, 9, 18, 10, 0, 0, 2 * Math.PI);ctx.fill();
    if (my) {
      ctx.strokeStyle = '#e8ff9c';ctx.lineWidth = 2.6;
      ctx.beginPath();ctx.arc(0, 0, 24 + Math.sin(now * .005) * 2, 0, Math.PI * 2);ctx.stroke();
    }
    ctx.rotate(s.aim);
    ctx.fillStyle = '#0a202a';
    roundedRect(3, -7, 28, 14, 5, '#172d3a');
    roundedRect(15, -4, 19, 8, 3, myColor);
    ctx.beginPath();ctx.moveTo(-9, -16);ctx.lineTo(13, 0);ctx.lineTo(-9, 16);ctx.closePath();
    ctx.fillStyle = '#fff';ctx.fill();
    ctx.beginPath();ctx.arc(-4, 0, 16, 0, Math.PI * 2);ctx.fillStyle = myColor;ctx.fill();
    ctx.beginPath();ctx.arc(-8, -5, 4, 0, 2 * Math.PI);ctx.fillStyle = '#fcffff';ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';ctx.font = 'bold 11px system-ui';ctx.fillStyle = '#00141b';
    ctx.fillText(p.name, x + 1, y - 33 + 1);
    ctx.fillStyle = '#fff';ctx.fillText(p.name, x, y - 33);
    ctx.fillStyle = '#001018bc';ctx.fillRect(x - 18, y - 26, 36, 5);
    ctx.fillStyle = p.hp > 35 ? '#e4ff7d' : '#ff6d6d';ctx.fillRect(x - 18, y - 26, 36 * p.hp / 100, 5);
    if (p.swim) {
      ctx.strokeStyle = myColor;ctx.lineWidth = 3;ctx.beginPath();ctx.arc(x, y, 22, 0, Math.PI * 2);ctx.stroke();
    }
  }
  for (const id of smooth.keys()) if (!present.has(id)) smooth.delete(id);
}
function drawAim() {
  const me = players.find(p => p.id === myId);
  if (!me || me.dead || !pointer.active) return;
  const x = me.x * TILE, y = me.y * TILE;
  const theta = Math.atan2(pointer.y - me.y, pointer.x - me.x);
  const endX = x + Math.cos(theta) * 220, endY = y + Math.sin(theta) * 220;
  ctx.strokeStyle = '#f6ffd670';ctx.lineWidth = 2;ctx.setLineDash([12, 10]);ctx.beginPath();
  ctx.moveTo(x + Math.cos(theta) * 20, y + Math.sin(theta) * 20);ctx.lineTo(endX, endY);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle = '#f8ffa8dd';ctx.lineWidth = 2;ctx.beginPath();ctx.arc(pointer.x * TILE, pointer.y * TILE, 10, 0, Math.PI * 2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(pointer.x * TILE - 15, pointer.y * TILE);ctx.lineTo(pointer.x * TILE + 15, pointer.y * TILE);
  ctx.moveTo(pointer.x * TILE, pointer.y * TILE - 15);ctx.lineTo(pointer.x * TILE, pointer.y * TILE + 15);ctx.stroke();
}
function render(now) {
  const dt = Math.min(.1, (now - prevFrame) / 1000);prevFrame = now;elapsed += dt;
  drawArena();
  drawEffects(now);
  drawPlayers(dt);
  drawAim();
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
