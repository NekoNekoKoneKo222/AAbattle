const $ = (id) => document.getElementById(id);
const app = { user: null, fighters: [], selected: null, ws: null, authMode: 'login', battle: null, waiting: false };

// Actual ASCII pipe characters form both vertical sides, including panels that resize.
function decorateFrames() {
  const frames = document.querySelectorAll('.ascii-content');
  const observer = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const pipes = '|\n'.repeat(Math.ceil(target.clientHeight / 16) + 1);
      target.querySelectorAll('.frame-pipes').forEach((side) => { side.textContent = pipes; });
    }
  });
  frames.forEach((frame) => {
    frame.prepend(node('pre', 'frame-pipes left'), node('pre', 'frame-pipes right'));
    observer.observe(frame);
  });
}

async function api(endpoint, options = {}) {
  const { timeoutMs = 45000, ...requestOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`/api/${endpoint}`, {
      credentials: 'same-origin',
      ...requestOptions,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `サーバーエラー: ${response.status}`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('サーバーの応答がタイムアウトしました。無料サーバーが起動中の可能性があります。再接続してください。');
    }
    if (error instanceof TypeError) {
      throw new Error('サーバーへ接続できませんでした。通信状態を確認して再接続してください。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function notify(message, error = false) {
  const target = $('notification');
  target.textContent = message;
  target.classList.toggle('error', error);
  target.classList.remove('hidden');
  clearTimeout(notify.timeout);
  notify.timeout = setTimeout(() => target.classList.add('hidden'), 6500);
}

function node(tag, cls, text) {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
}

function changeAuthMode(mode) {
  app.authMode = mode;
  $('auth-title').textContent = mode === 'register' ? '新規アカウント登録' : 'ログイン';
  $('auth-submit').textContent = mode === 'register' ? '>> CREATE ACCOUNT' : '>> LOGIN';
  $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('switch-login').classList.toggle('active', mode === 'login');
  $('switch-register').classList.toggle('active', mode === 'register');
}

function switchTab(tab) {
  document.querySelectorAll('.tab-page').forEach((page) => page.classList.toggle('hidden', page.id !== `tab-${tab}`));
  document.querySelectorAll('.nav-button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'history') refreshHistory();
}

function showAuth() {
  app.user = null;
  app.fighters = [];
  app.selected = null;
  $('auth-view').classList.remove('hidden');
  $('game-view').classList.add('hidden');
  $('user-badge').textContent = 'GUEST MODE';
  if (app.ws) { app.ws.close(); app.ws = null; }
}

async function showGame(user) {
  app.user = user;
  $('auth-view').classList.add('hidden');
  $('game-view').classList.remove('hidden');
  $('user-badge').textContent = `@${user.username} / W${user.wins} L${user.losses}`;
  switchTab('create');
  await loadFighters();
  connect();
}

async function loadFighters() {
  const { fighters } = await api('fighters');
  app.fighters = fighters;
  if (!fighters.some((f) => f.id === app.selected)) app.selected = fighters[0]?.id || null;
  const select = $('selected-fighter');
  select.replaceChildren();
  if (!fighters.length) select.append(node('option', '', 'まずキャラクターを作ってください'));
  for (const fighter of fighters) {
    const option = node('option', '', `${fighter.name} / ${fighter.definition.archetype}`);
    option.value = fighter.id;
    select.append(option);
  }
  select.disabled = fighters.length === 0;
  if (app.selected) select.value = app.selected;
  $('join-queue').disabled = fighters.length === 0;
  renderCollection();
}

function renderDefinition(definition, target) {
  target.replaceChildren();
  target.append(node('div', 'result-title', definition.title));
  target.append(node('div', 'muted', `// ${definition.archetype} / ${definition.personality.toUpperCase()}`));
  const stats = { HP: definition.stats.hp, ATK: definition.stats.atk, DEF: definition.stats.def, SPD: definition.stats.speed };
  for (const [key, value] of Object.entries(stats)) {
    const line = node('div', 'stat-row');
    line.append(node('span', '', key), node('b', '', `${value}`));
    target.append(line);
  }
  const list = node('div', 'skill-list');
  list.append(node('div', 'panel-heading', '// GENERATED ABILITIES'));
  for (const skill of definition.skills) {
    const row = node('div', 'skill-row');
    row.append(node('b', '', `${skill.name} [CD:${skill.cooldown}]`), node('small', '', skill.description));
    list.append(row);
  }
  const passive = node('div', 'skill-row');
  passive.append(node('b', '', `[PASSIVE] ${definition.passive.name}`), node('small', '', definition.passive.description));
  list.append(passive);
  target.append(list);
}

function renderCollection() {
  const container = $('fighter-list');
  container.replaceChildren();
  if (!app.fighters.length) {
    container.append(node('p', 'muted', 'まだキャラクターがいません。作成画面で最初の一体を作ろう。'));
    return;
  }
  for (const fighter of app.fighters) {
    const card = node('article', 'fighter-card');
    card.append(node('div', 'small-badge', fighter.generation_mode === 'ai' ? 'AI GENERATED' : 'LOCAL GENERATED'));
    card.append(node('h3', '', fighter.name));
    card.append(node('p', 'muted', fighter.definition.archetype));
    card.append(node('pre', '', fighter.art));
    const stats = fighter.definition.stats;
    card.append(node('small', '', `HP ${stats.hp} / ATK ${stats.atk} / DEF ${stats.def} / SPD ${stats.speed}`));
    const b = node('button', 'secondary-button', '[ このキャラで対戦 ]');
    b.type = 'button';
    b.addEventListener('click', () => {
      app.selected = fighter.id;
      $('selected-fighter').value = fighter.id;
      switchTab('arena');
      notify(`${fighter.name}を選択しました。`);
    });
    card.append(b);
    container.append(card);
  }
}

async function refreshHistory() {
  if (!app.user) return;
  try {
    const [{ matches }, { user }] = await Promise.all([api('history'), api('me')]);
    app.user = user;
    $('user-badge').textContent = `@${user.username} / W${user.wins} L${user.losses}`;
    $('record-wins').textContent = `WIN ${user.wins}`;
    $('record-losses').textContent = `LOSE ${user.losses}`;
    const list = $('match-history');
    list.replaceChildren();
    if (!matches.length) list.append(node('p', 'muted', '対戦記録はまだありません。'));
    for (const match of matches) {
      const win = match.winner_id === user.id;
      const item = node('div', `history-item ${win ? 'win' : 'loss'}`);
      item.append(node('b', '', win ? '[ WIN ] 勝利' : '[ LOSE ] 敗北'));
      item.append(node('span', 'muted', new Date(match.created_at).toLocaleString('ja-JP')));
      list.append(item);
    }
  } catch (error) { notify(error.message, true); }
}

function connect() {
  if (!app.user) return;
  if (app.ws && (app.ws.readyState === WebSocket.OPEN || app.ws.readyState === WebSocket.CONNECTING)) return;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${scheme}//${location.host}/ws`);
  app.ws = ws;
  let heartbeat;
  ws.onopen = () => {
    $('queue-status').textContent = 'サーバーに接続しました。対戦できます。';
    heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 25000);
  };
  ws.onclose = () => {
    clearInterval(heartbeat);
    if (app.ws !== ws) return;
    app.waiting = false;
    queueButtons();
    $('queue-status').textContent = '通信が切断されました。再接続します。';
    setTimeout(() => { if (app.user && app.ws === ws) connect(); }, 2500);
  };
  ws.onmessage = async ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.type === 'error') {
      app.waiting = false;
      queueButtons();
      return notify(msg.message, true);
    }
    if (msg.type === 'queue:waiting') {
      app.waiting = true;
      queueButtons();
      $('queue-status').textContent = '>>> 対戦相手を検索中…（友達もログインして「対戦開始」を押してください）';
    }
    if (msg.type === 'queue:left') {
      app.waiting = false;
      queueButtons();
      $('queue-status').textContent = 'マッチングをキャンセルしました。';
    }
    if (msg.type === 'battle:start') startBattle(msg);
    if (msg.type === 'battle:turn') updateBattle(msg);
    if (msg.type === 'battle:finish') {
      $('queue-status').textContent = msg.winnerId === app.user.id ? '>>> YOU WIN! 戦績に保存しました。' : '>>> YOU LOSE. 戦績に保存しました。';
      await refreshHistory();
    }
  };
}

function queueButtons() {
  $('join-queue').classList.toggle('hidden', app.waiting);
  $('leave-queue').classList.toggle('hidden', !app.waiting);
}

function startBattle(msg) {
  app.waiting = false;
  queueButtons();
  app.battle = msg;
  switchTab('arena');
  $('battle-stage').classList.remove('hidden');
  $('battle-id').textContent = `MATCH ${msg.id.slice(0, 8).toUpperCase()}`;
  $('battle-turn').textContent = 'TURN 00';
  $('queue-status').textContent = '>>> MATCH FOUND. 自動戦闘が始まりました！';
  $('battle-log').replaceChildren();
  for (let i = 0; i < 2; i++) {
    const key = i ? 'b' : 'a';
    const fighter = msg.fighters[i];
    $(`battle-name-${key}`).textContent = `${fighter.name} / ${fighter.username}`;
    $(`battle-art-${key}`).textContent = fighter.art;
    $(`battle-hp-${key}`).textContent = `${fighter.hp} / ${fighter.maxHp} HP`;
    $(`hp-${key}`).style.width = '100%';
  }
  addLog('>>> BATTLE START!', true);
}

function addLog(text, highlight = false) {
  const box = $('battle-log');
  const line = node('div', highlight ? 'result' : '', text);
  box.append(line);
  while (box.children.length > 150) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

function updateBattle(msg) {
  if (!app.battle || msg.id !== app.battle.id) return;
  $('battle-turn').textContent = `TURN ${String(msg.turn).padStart(2, '0')}`;
  msg.fighters.forEach((fighter, i) => {
    const key = i ? 'b' : 'a';
    $(`battle-hp-${key}`).textContent = `${fighter.hp} / ${fighter.maxHp} HP${fighter.shield ? ` / SHIELD ${fighter.shield}` : ''}`;
    $(`hp-${key}`).style.width = `${Math.round(100 * fighter.hp / fighter.maxHp)}%`;
    const element = $(`battle-art-${key}`);
    element.style.color = msg.attackerId === fighter.userId ? '#8ef4c7' : '#a9dedb';
  });
  for (const line of msg.lines) addLog(`[${String(msg.turn).padStart(2, '0')}] ${line}`, msg.ended && line.startsWith('勝者'));
}

$('switch-login').addEventListener('click', () => changeAuthMode('login'));
$('switch-register').addEventListener('click', () => changeAuthMode('register'));
document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('auth-submit');
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = '>>> CONNECTING...';
  try {
    const result = await api(app.authMode === 'register' ? 'register' : 'login', {
      method: 'POST', body: JSON.stringify({ username: $('username').value, password: $('password').value })
    });
    $('password').value = '';
    await showGame(result.user);
    notify(`ようこそ、${result.user.username}！`);
  } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; button.textContent = originalText; }
});
$('logout').addEventListener('click', async () => {
  try { await api('logout', { method: 'POST', body: '{}' }); } catch (_) {}
  showAuth();
  notify('ログアウトしました。');
});
$('art-editor').addEventListener('input', () => {
  $('art-preview').textContent = $('art-editor').value || '...';
  $('art-size').textContent = `${$('art-editor').value.length} / 1600`;
});
$('art-editor').dispatchEvent(new Event('input'));
decorateFrames();
$('fighter-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('generate-button');
  button.disabled = true;
  button.textContent = '>>> ANALYZING...';
  try {
    const { fighter } = await api('fighters', {
      method: 'POST',
      body: JSON.stringify({ name: $('fighter-name').value, art: $('art-editor').value })
    });
    renderDefinition(fighter.definition, $('generation-result'));
    await loadFighters();
    app.selected = fighter.id;
    $('selected-fighter').value = fighter.id;
    notify(`${fighter.name}が誕生しました！ ${fighter.generation_mode === 'ai' ? 'AI' : 'ローカル'}生成完了。`);
  } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; button.textContent = '>> GENERATE FIGHTER'; }
});
$('selected-fighter').addEventListener('change', (e) => { app.selected = e.target.value; });
$('join-queue').addEventListener('click', () => {
  if (!app.selected) return notify('キャラクターを作ってください。', true);
  if (!app.ws || app.ws.readyState !== WebSocket.OPEN) { connect(); return notify('サーバーに接続中です。少し待ってもう一度押してください。', true); }
  $('battle-stage').classList.add('hidden');
  app.ws.send(JSON.stringify({ type: 'queue:join', fighterId: app.selected }));
});
$('leave-queue').addEventListener('click', () => app.ws?.send(JSON.stringify({ type: 'queue:leave' })));

async function initialize() {
  const status = $('boot-status');
  const message = $('boot-message');
  const retry = $('boot-retry');
  status.classList.remove('hidden', 'error');
  retry.classList.add('hidden');
  message.textContent = '> サーバーとの接続を確認しています…';
  const slowTimer = setTimeout(() => {
    message.textContent = '> サーバーを起動中です。無料プランでは起動に1分ほどかかる場合があります…';
  }, 8000);
  try {
    const [{ user }, config] = await Promise.all([api('me'), api('config')]);
    $('mode-badge').textContent = config.generationMode === 'ai' ? 'GENERATOR : AI ACTIVE' : 'GENERATOR : LOCAL DEMO';
    if (user) await showGame(user);
    status.classList.add('hidden');
  } catch (error) {
    status.classList.add('error');
    $('mode-badge').textContent = 'SERVER : CONNECTION FAILED';
    message.textContent = `> ${error.message}`;
    retry.classList.remove('hidden');
    notify(error.message, true);
  } finally {
    clearTimeout(slowTimer);
  }
}
$('boot-retry').addEventListener('click', initialize);
initialize();
