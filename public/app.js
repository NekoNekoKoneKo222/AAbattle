const $ = (id) => document.getElementById(id);
const app = { user: null, fighters: [], selected: null, ws: null, authMode: 'login', battle: null, waiting: false, tradeTarget: null, pveEnemies: [], pvePlayback: null, generationMode: 'local', availableProviders: {}, model: null, pendingGenerations: 0, pendingGenerationInputs: new Set(), pollingJobIds: new Set(), aiStatusTimer: null, aiStatusChecking: false };
const effectLabels = { damage: '攻撃', heal: '回復', shield: '防護', weaken: '弱体', poison: '毒', burn: '火傷', drain: '吸収', boost: '強化', cleanse: '浄化', stun: '気絶', bleed: '出血', rupture: '破裂', silence: '沈黙', counter_stance: '反撃態勢' };

function effectSummary(effect) {
  if (effect.type === 'bleed') return `出血 毎ターン${effect.power}ダメージ / 付与${effect.chance}%`;
  if (effect.type === 'rupture') return `破裂 実ダメージの10%を追加 / 付与${effect.chance}%`;
  if (effect.type === 'silence') return `沈黙 行動不能${effect.chance}%`;
  if (effect.type === 'counter_stance') return `反撃態勢 ${effect.power}ダメージ / 反撃${effect.chance}%`;
  return `${effectLabels[effect.type] || effect.type} ${effect.power} / ${effect.chance}%`;
}

function battleStatus(fighter) {
  const active = [fighter.bleed && '出血', fighter.rupture && '破裂', fighter.silence && '沈黙', fighter.counterStance && '反撃態勢'].filter(Boolean);
  return active.length ? ` / ${active.join('・')}` : '';
}

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
    if (!response.ok) {
      const error = new Error(data.error || `サーバーエラー: ${response.status}`);
      error.status = response.status;
      throw error;
    }
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
  if (tab === 'trades') { loadFighters().catch((e) => notify(e.message, true)); refreshTrades(); }
  if (tab === 'pve') {
    if (!app.pveEnemies.length) loadPveEnemies();
    refreshPveHistory();
  }
}

function showAuth() {
  if (app.aiStatusTimer) clearInterval(app.aiStatusTimer);
  app.aiStatusTimer = null;
  app.user = null;
  app.fighters = [];
  app.selected = null;
  app.tradeTarget = null;
  if (app.pvePlayback?.timer) clearInterval(app.pvePlayback.timer);
  app.pvePlayback = null;
  $('pve-start').disabled = false;
  $('pve-skip').classList.add('hidden');
  $('auth-view').classList.remove('hidden');
  $('game-view').classList.add('hidden');
  $('user-badge').textContent = 'GUEST MODE';
  if (app.ws) { app.ws.close(); app.ws = null; }
}

async function refreshAiStatus() {
  if (!app.user || app.generationMode === 'local' || app.aiStatusChecking) return;
  app.aiStatusChecking = true;
  $('ai-status-refresh').disabled = true;
  try {
    const provider = app.generationMode;
    const state = await api(`ai/status?provider=${provider}`, { timeoutMs: 12000 });
    if (app.generationMode !== provider) return;
    const connection = provider === 'gemini' ? 'キー設定済み' : !state.connected ? '未接続' : state.installed ? '接続済み' : 'モデル未導入';
    const activity = state.generating ? '生成中' : '待機中';
    const waiting = Number(state.waiting) || 0;
    const checked = new Date(state.checkedAt || Date.now()).toLocaleTimeString('ja-JP');
    $('ai-status').textContent = `${provider === 'gemini' ? 'Gemini API' : 'Ollama'}: ${connection} / モデル: ${state.model || app.model} / 状態: ${activity} / 順番待ち: ${waiting}件 / 更新: ${checked}`;
    $('ai-status').parentElement.dataset.state = provider === 'gemini' ? state.generating ? 'busy' : 'online' : !state.connected || !state.installed ? 'offline' : state.generating ? 'busy' : 'online';
  } catch {
    $('ai-status').textContent = `${app.generationMode === 'gemini' ? 'Gemini API' : 'Ollama'}: 状態を確認できません`;
    $('ai-status').parentElement.dataset.state = 'offline';
  } finally {
    app.aiStatusChecking = false;
    $('ai-status-refresh').disabled = false;
  }
}

function startAiMonitor() {
  if (app.aiStatusTimer) clearInterval(app.aiStatusTimer);
  if (app.generationMode === 'local') return;
  void refreshAiStatus();
  app.aiStatusTimer = setInterval(() => {
    if (app.user && !document.hidden) void refreshAiStatus();
  }, 10000);
}

async function showGame(user) {
  app.user = user;
  $('auth-view').classList.add('hidden');
  $('game-view').classList.remove('hidden');
  $('user-badge').textContent = `@${user.username} / W${user.wins} L${user.losses}`;
  switchTab('create');
  await loadFighters();
  await resumeGenerationJobs();
  connect();
  startAiMonitor();
}
function updateProviderControls() {
  for (const provider of ['gemini', 'ollama']) {
    const button = $(`provider-${provider}`);
    button.disabled = !app.availableProviders[provider];
    button.setAttribute('aria-pressed', String(app.generationMode === provider));
    button.title = button.disabled ? `${provider === 'gemini' ? 'Gemini APIキー' : 'Ollama'}が未設定です` : '';
  }
  $('mode-badge').textContent = app.generationMode === 'ollama' ? `GENERATOR : OLLAMA (${app.model})` : app.generationMode === 'gemini' ? 'GENERATOR : GEMINI AI' : 'GENERATOR : LOCAL RULES';
  $('ai-status-refresh').classList.toggle('hidden', app.generationMode === 'local');
  if (app.generationMode === 'local') {
    $('ai-status').textContent = 'ローカルルールを使用';
    $('ai-status').parentElement.dataset.state = 'online';
  } else {
    $('ai-status').textContent = `${app.generationMode === 'gemini' ? 'Gemini API' : 'Ollama'}の状態を確認中…`;
    $('ai-status').parentElement.dataset.state = '';
  }
  if (app.user) startAiMonitor();
}
for (const provider of ['gemini', 'ollama']) {
  $(`provider-${provider}`).addEventListener('click', () => {
    if (!app.availableProviders[provider]) return;
    app.generationMode = provider;
    localStorage.setItem('aabattle-generation-provider', provider);
    updateProviderControls();
  });
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
  renderTradeOwnOptions();
  renderPveFighterOptions();
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
    if (skill.effects?.length) {
      row.append(node('small', '', skill.effects.map(effectSummary).join(' + ')));
    }
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
    card.append(node('div', 'small-badge', fighter.generation_mode === 'ollama' ? 'OLLAMA GENERATED' : fighter.generation_mode === 'gemini' ? 'GEMINI GENERATED' : fighter.generation_mode === 'ai' ? 'AI GENERATED' : 'LOCAL GENERATED'));
    card.append(node('h3', '', `${fighter.is_favorite ? '★ ' : ''}${fighter.name}`));
    card.append(node('p', 'muted', fighter.definition.archetype));
    card.append(node('pre', '', fighter.art));
    const stats = fighter.definition.stats;
    card.append(node('small', '', `HP ${stats.hp} / ATK ${stats.atk} / DEF ${stats.def} / SPD ${stats.speed}`));
    const details = node('details', 'fighter-details');
    details.append(node('summary', '', '[ ステータス・スキル・パッシブを見る ]'));
    const definition = node('div', 'definition-details');
    renderDefinition(fighter.definition, definition);
    details.append(definition);
    card.append(details);
    const b = node('button', 'secondary-button', '[ このキャラで対戦 ]');
    b.type = 'button';
    b.addEventListener('click', () => {
      app.selected = fighter.id;
      $('selected-fighter').value = fighter.id;
      switchTab('arena');
      notify(`${fighter.name}を選択しました。`);
    });
    card.append(b);
    const actions = node('div', 'fighter-actions');
    const favorite = node('button', `secondary-button favorite-button ${fighter.is_favorite ? 'active' : ''}`, fighter.is_favorite ? '[ ★ お気に入り解除 ]' : '[ ☆ お気に入り ]');
    favorite.type = 'button';
    favorite.setAttribute('aria-pressed', String(Boolean(fighter.is_favorite)));
    favorite.addEventListener('click', async () => {
      favorite.disabled = true;
      try {
        await api(`fighters/${fighter.id}/favorite`, { method: 'PUT', body: JSON.stringify({ favorite: !fighter.is_favorite }) });
        await loadFighters();
        notify(`${fighter.name}のお気に入りを${fighter.is_favorite ? '解除' : '登録'}しました。`);
      } catch (error) { favorite.disabled = false; notify(error.message, true); }
    });
    const remove = node('button', 'secondary-button delete-button', '[ 削除 ]');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`${fighter.name}を図鑑から削除しますか？\n未完了の交換申請も取り消されます。`)) return;
      remove.disabled = true;
      try {
        await api(`fighters/${fighter.id}`, { method: 'DELETE' });
        await loadFighters();
        notify(`${fighter.name}を削除しました。`);
      } catch (error) { remove.disabled = false; notify(error.message, true); }
    });
    actions.append(favorite, remove);
    card.append(actions);
    container.append(card);
  }
}

function renderPveFighterOptions() {
  const select = $('pve-fighter');
  const selected = select.value;
  select.replaceChildren();
  if (!app.fighters.length) select.append(node('option', '', '先にAAを作成してください'));
  for (const fighter of app.fighters) {
    const option = node('option', '', `${fighter.name} / ${fighter.definition.archetype}`);
    option.value = fighter.id;
    select.append(option);
  }
  if (app.fighters.some((fighter) => fighter.id === selected)) select.value = selected;
  else if (app.selected) select.value = app.selected;
  select.disabled = !app.fighters.length;
  $('pve-start').disabled = !app.fighters.length || !!app.pvePlayback;
}

async function loadPveEnemies() {
  try {
    const { enemies } = await api('pve/enemies');
    app.pveEnemies = enemies;
    const select = $('pve-difficulty');
    const previous = select.value;
    select.replaceChildren();
    for (const enemy of enemies) {
      const option = node('option', '', enemy.label);
      option.value = enemy.key;
      select.append(option);
    }
    if (enemies.some((enemy) => enemy.key === previous)) select.value = previous;
    renderPveEnemyPreview();
  } catch (error) { notify(error.message, true); }
}

function renderPveEnemyPreview() {
  const enemy = app.pveEnemies.find((item) => item.key === $('pve-difficulty').value);
  if (!enemy) return;
  $('pve-enemy-name').textContent = enemy.name;
  $('pve-enemy-art').textContent = enemy.art;
  $('pve-enemy-description').textContent = enemy.description;
  const { hp, atk, def, speed } = enemy.stats;
  $('pve-enemy-stats').textContent = `HP ${hp} / ATK ${atk} / DEF ${def} / SPD ${speed}`;
  const skills = $('pve-enemy-skills');
  skills.replaceChildren(node('div', 'panel-heading', '// ENEMY ABILITIES'));
  for (const skill of enemy.skills || []) {
    const row = node('div', 'skill-row');
    row.append(node('b', '', `${skill.name} [CD:${skill.cooldown}]`), node('small', '', skill.description));
    if (skill.effects?.length) row.append(node('small', '', skill.effects.map(effectSummary).join(' + ')));
    skills.append(row);
  }
  if (enemy.passive) {
    const row = node('div', 'skill-row');
    row.append(node('b', '', `[PASSIVE] ${enemy.passive.name}`), node('small', '', enemy.passive.description));
    skills.append(row);
  }
}

async function refreshPveHistory() {
  if (!app.user) return;
  try {
    const { wins, losses, matches } = await api('pve/history');
    $('pve-wins').textContent = `PVE WIN ${wins}`;
    $('pve-losses').textContent = `PVE LOSE ${losses}`;
    const list = $('pve-history');
    list.replaceChildren();
    if (!matches.length) list.append(node('p', 'muted', 'まだPvEに挑戦していません。'));
    for (const match of matches) {
      const card = node('div', `history-item ${match.won ? 'win' : 'loss'}`);
      const details = node('div', 'pve-history-details');
      details.append(node('b', '', `${match.won ? '[ CLEAR ]' : '[ DEFEAT ]'} ${match.enemy_name}`));
      details.append(node('small', '', `${match.fighter_name} / ${match.enemy_key.toUpperCase()} / ${match.turns}ターン`));
      card.append(details, node('span', 'muted', new Date(match.created_at).toLocaleString('ja-JP')));
      list.append(card);
    }
  } catch (error) { notify(error.message, true); }
}

function appendPveLog(text, highlight = false) {
  const box = $('pve-battle-log');
  box.append(node('div', highlight ? 'result' : '', text));
  while (box.children.length > 150) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

function replayPveTurn(turn) {
  $('pve-battle-turn').textContent = `TURN ${String(turn.turn).padStart(2, '0')}`;
  turn.fighters.forEach((fighter, i) => {
    const side = i ? 'b' : 'a';
    $(`pve-battle-hp-${side}`).textContent = `${fighter.hp} / ${fighter.maxHp} HP${fighter.shield ? ` / SHIELD ${fighter.shield}` : ''}${battleStatus(fighter)}`;
    $(`pve-hp-${side}`).style.width = `${Math.round(100 * fighter.hp / fighter.maxHp)}%`;
    $(`pve-battle-art-${side}`).style.color = turn.attackerId === fighter.userId ? '#8ef4c7' : '#a9dedb';
  });
  for (const line of turn.lines) appendPveLog(`[${String(turn.turn).padStart(2, '0')}] ${line}`, turn.ended && line.startsWith('勝者'));
}

function finishPvePlayback(playback) {
  if (app.pvePlayback !== playback) return;
  clearInterval(playback.timer);
  app.pvePlayback = null;
  $('pve-skip').classList.add('hidden');
  $('pve-start').disabled = !app.fighters.length;
  $('pve-status').textContent = playback.battle.won ? '>>> PVE CLEAR! 勝利を保存しました。' : '>>> DEFEAT. 次の挑戦を待っています。';
  refreshPveHistory();
}

function playPveReplay(battle) {
  if (app.pvePlayback?.timer) clearInterval(app.pvePlayback.timer);
  $('pve-placeholder').classList.add('hidden');
  $('pve-battle-stage').classList.remove('hidden');
  $('pve-battle-id').textContent = `SOLO ${battle.id.slice(0, 8).toUpperCase()}`;
  $('pve-battle-turn').textContent = 'TURN 00';
  $('pve-battle-log').replaceChildren();
  for (let i = 0; i < 2; i++) {
    const fighter = battle.fighters[i];
    const side = i ? 'b' : 'a';
    $(`pve-battle-name-${side}`).textContent = `${fighter.name} / ${fighter.username}`;
    $(`pve-battle-art-${side}`).textContent = fighter.art;
    $(`pve-battle-hp-${side}`).textContent = `${fighter.hp} / ${fighter.maxHp} HP`;
    $(`pve-hp-${side}`).style.width = '100%';
  }
  appendPveLog('>>> SOLO BATTLE START!', true);
  const playback = { battle, index: 0, timer: null };
  app.pvePlayback = playback;
  $('pve-skip').classList.remove('hidden');
  $('pve-status').textContent = '>>> CPUとの自動戦闘を再生中…';
  const tick = () => {
    if (app.pvePlayback !== playback) return;
    replayPveTurn(battle.log[playback.index++]);
    if (playback.index >= battle.log.length) finishPvePlayback(playback);
  };
  playback.timer = setInterval(tick, 480);
  tick();
}

function skipPveReplay() {
  const playback = app.pvePlayback;
  if (!playback) return;
  while (playback.index < playback.battle.log.length) replayPveTurn(playback.battle.log[playback.index++]);
  finishPvePlayback(playback);
}

function renderTradeOwnOptions() {
  const select = $('trade-offer');
  const previous = select.value;
  select.replaceChildren();
  if (!app.fighters.length) select.append(node('option', '', 'キャラクターを先に作成してください'));
  for (const fighter of app.fighters) {
    const option = node('option', '', `${fighter.name} / ${fighter.definition.archetype}`);
    option.value = fighter.id;
    select.append(option);
  }
  select.disabled = app.fighters.length === 0;
  if (app.fighters.some((fighter) => fighter.id === previous)) select.value = previous;
  renderTradePreview();
}

function addTradeFighterPreview(container, fighter, heading) {
  const card = node('div', 'trade-fighter');
  card.append(node('div', 'panel-heading', heading));
  if (!fighter) { card.append(node('p', 'muted', 'AAを選択してください。')); container.append(card); return; }
  card.append(node('b', '', fighter.name));
  card.append(node('pre', '', fighter.art));
  const s = fighter.definition.stats;
  card.append(node('small', '', `HP ${s.hp} / ATK ${s.atk} / DEF ${s.def} / SPD ${s.speed}`));
  const details = node('details', 'fighter-details');
  details.append(node('summary', '', '[ 技・パッシブ ]'));
  const body = node('div', 'definition-details');
  renderDefinition(fighter.definition, body);
  details.append(body);
  card.append(details);
  container.append(card);
}

function renderTradePreview() {
  const target = $('trade-preview');
  target.replaceChildren();
  const offered = app.fighters.find((fighter) => fighter.id === $('trade-offer').value);
  const requested = app.tradeTarget?.fighters.find((fighter) => fighter.id === $('trade-request').value);
  if (offered) addTradeFighterPreview(target, offered, 'YOU GIVE');
  if (requested) addTradeFighterPreview(target, requested, 'YOU RECEIVE');
}

function resetTradeTarget() {
  app.tradeTarget = null;
  const select = $('trade-request');
  select.replaceChildren(node('option', '', '先に相手を検索してください'));
  select.disabled = true;
  $('trade-target-status').textContent = 'プレイヤー名を検索してください。';
  renderTradePreview();
}

async function searchTradeTarget() {
  const username = $('trade-target').value.normalize('NFKC').trim();
  if (!username) return notify('相手のプレイヤー名を入力してください。', true);
  const button = $('trade-search');
  button.disabled = true;
  $('trade-target-status').textContent = '検索中…';
  try {
    const result = await api(`players/${encodeURIComponent(username)}/fighters`);
    app.tradeTarget = result;
    const select = $('trade-request');
    select.replaceChildren();
    if (!result.fighters.length) select.append(node('option', '', 'このプレイヤーはまだAAを持っていません'));
    for (const fighter of result.fighters) {
      const option = node('option', '', `${fighter.name} / ${fighter.definition.archetype}`);
      option.value = fighter.id;
      select.append(option);
    }
    select.disabled = result.fighters.length === 0;
    $('trade-target-status').textContent = `@${result.username} : ${result.fighters.length}体のAAが見つかりました。`;
    renderTradePreview();
  } catch (error) { resetTradeTarget(); notify(error.message, true); }
  finally { button.disabled = false; }
}

const tradeStatusLabels = { pending: '申請中', accepted: '交換成立', declined: '拒否', cancelled: 'キャンセル', expired: '期限切れ' };

function renderTrades(trades) {
  const list = $('trade-list');
  list.replaceChildren();
  if (!trades.length) { list.append(node('p', 'muted', '交換申請はまだありません。')); return; }
  for (const trade of trades.slice().sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'))) {
    const incoming = trade.recipient_id === app.user.id;
    const card = node('article', 'trade-entry');
    card.append(node('div', `small-badge trade-status-${trade.status}`, `${incoming ? 'RECEIVED' : 'SENT'} / ${tradeStatusLabels[trade.status] || trade.status}`));
    card.append(node('div', 'trade-entry-title', `@${trade.sender_username} ↔ @${trade.recipient_username}`));
    card.append(node('small', '', `${new Date(trade.created_at).toLocaleString('ja-JP')} / 期限 ${new Date(trade.expires_at).toLocaleString('ja-JP')}`));
    const fighters = node('div', 'trade-preview');
    addTradeFighterPreview(fighters, trade.offered_fighter, `@${trade.sender_username} GIVES`);
    addTradeFighterPreview(fighters, trade.requested_fighter, `@${trade.recipient_username} GIVES`);
    card.append(fighters);
    if (trade.status === 'pending') {
      const actions = node('div', 'trade-actions');
      for (const [action, label] of incoming ? [['accept', '[ 交換を承認 ]'], ['decline', '[ 拒否 ]']] : [['cancel', '[ 申請を取消 ]']]) {
        const button = node('button', action === 'accept' ? 'primary-button' : 'secondary-button', label);
        button.type = 'button';
        button.addEventListener('click', async () => {
          if (action === 'accept' && !confirm(`「${trade.offered_fighter.name}」を受け取り、自分の「${trade.requested_fighter.name}」を相手に渡します。交換を確定しますか？`)) return;
          button.disabled = true;
          try {
            await api(`trades/${trade.id}/${action}`, { method: 'POST', body: '{}' });
            notify(action === 'accept' ? '交換成立！ AAの所有者が入れ替わりました。' : '交換申請を更新しました。');
            if (action === 'accept') { resetTradeTarget(); await loadFighters(); }
            await refreshTrades();
          } catch (error) { notify(error.message, true); }
          finally { button.disabled = false; }
        });
        actions.append(button);
      }
      card.append(actions);
    }
    list.append(card);
  }
}

async function refreshTrades() {
  if (!app.user) return;
  try {
    const { trades } = await api('trades');
    renderTrades(trades);
  } catch (error) { notify(error.message, true); }
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
    $(`battle-hp-${key}`).textContent = `${fighter.hp} / ${fighter.maxHp} HP${fighter.shield ? ` / SHIELD ${fighter.shield}` : ''}${battleStatus(fighter)}`;
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
$('ai-status-refresh').addEventListener('click', () => { void refreshAiStatus(); });
function updateGenerationStatus(message = '') {
  $('generation-time').textContent = app.pendingGenerations
    ? `AI生成中・順番待ち: ${app.pendingGenerations}体${message ? ` / ${message}` : ''}`
    : message;
}
function showGenerationError(name, message) {
  const errors = $('generation-errors');
  errors.prepend(node('p', 'generation-error', `${name}: ${message}`));
  while (errors.children.length > 3) errors.lastElementChild.remove();
}
async function resumeGenerationJobs() {
  try {
    const { jobs } = await api('fighters/jobs');
    for (const job of jobs) {
      if (app.pollingJobIds.has(job.jobId)) continue;
      const inputKey = `job:${job.jobId}`;
      app.pendingGenerationInputs.add(inputKey);
      app.pendingGenerations++;
      void pollGeneration(job.jobId, job.name, inputKey);
    }
    updateGenerationStatus();
  } catch (error) {
    notify(`進行中の生成を確認できませんでした: ${error.message}`, true);
  }
}
async function pollGeneration(jobId, name, inputKey) {
  if (app.pollingJobIds.has(jobId)) return;
  app.pollingJobIds.add(jobId);
  const ownerId = app.user?.id;
  let finalMessage = '';
  try {
    const started = Date.now();
    let lastSuccessfulPoll = started;
    while (Date.now() - started < 55 * 60 * 1000) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (app.user?.id !== ownerId) return;
      let result;
      try {
        result = await api(`fighters/jobs/${jobId}`, { timeoutMs: 15000 });
        lastSuccessfulPoll = Date.now();
      } catch (error) {
        if (error.status === 401) throw error;
        if (error.status === 404) throw new Error('生成ジョブが見つかりません。サーバー更新後は図鑑を確認し、未保存なら再生成してください。');
        if (Date.now() - lastSuccessfulPoll < 90_000) {
          updateGenerationStatus('通信を再試行中…');
          continue;
        }
        throw error;
      }
      if (result.status === 'running' || result.status === 'queued') continue;
      if (result.status === 'failed') throw new Error(result.error || '生成に失敗しました。');
      if (result.status !== 'done' || !result.fighter) throw new Error('生成結果が不正です。');
      renderDefinition(result.fighter.definition, $('generation-result'));
      let collectionUpdated = true;
      try {
        await loadFighters();
        app.selected = result.fighter.id;
        $('selected-fighter').value = result.fighter.id;
      } catch {
        collectionUpdated = false;
      }
      notify(collectionUpdated ? `${name}が誕生しました！ ${result.fighter.generation_mode === 'ollama' ? 'Ollama AI' : result.fighter.generation_mode === 'gemini' ? 'Gemini AI' : 'ローカル'}生成完了。` : '生成は完了しました。図鑑を再読み込みしてください。', !collectionUpdated);
      finalMessage = `生成時間: ${(result.generationMs / 1000).toFixed(1)}秒`;
      return;
    }
    throw new Error('生成待ちがタイムアウトしました。キャラクター一覧を確認してください。');
  } catch (error) {
    finalMessage = `${name}の生成に失敗しました: ${error.message}`;
    showGenerationError(name, error.message);
    notify(error.message, true);
  } finally {
    app.pollingJobIds.delete(jobId);
    app.pendingGenerationInputs.delete(inputKey);
    app.pendingGenerations--;
    updateGenerationStatus(finalMessage);
    void refreshAiStatus();
  }
}
$('fighter-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('fighter-name').value;
  const art = $('art-editor').value;
  const inputKey = JSON.stringify([name.trim(), art]);
  if (app.pendingGenerationInputs.has(inputKey)) {
    notify('同じキャラクターはすでに生成中です。別の名前やAAなら続けて送信できます。');
    return;
  }
  app.pendingGenerationInputs.add(inputKey);
  const button = $('generate-button');
  button.disabled = true;
  button.textContent = '>>> ANALYZING...';
  try {
    const { jobId } = await api('fighters/generate', {
      method: 'POST',
      body: JSON.stringify({ name, art, provider: app.generationMode })
    });
    if (!/^[a-f0-9]{64}$/.test(jobId || '')) throw new Error('生成ジョブ番号が不正です。');
    app.pendingGenerations++;
    updateGenerationStatus();
    void refreshAiStatus();
    void pollGeneration(jobId, name, inputKey);
  } catch (error) { app.pendingGenerationInputs.delete(inputKey); updateGenerationStatus(`生成に失敗しました: ${error.message}`); showGenerationError(name, error.message); notify(error.message, true); }
  finally { button.disabled = false; button.textContent = '>> GENERATE FIGHTER'; }
});
$('selected-fighter').addEventListener('change', (e) => { app.selected = e.target.value; });
$('trade-offer').addEventListener('change', renderTradePreview);
$('trade-request').addEventListener('change', renderTradePreview);
$('trade-target').addEventListener('input', resetTradeTarget);
$('trade-search').addEventListener('click', searchTradeTarget);
$('trade-refresh').addEventListener('click', refreshTrades);
$('trade-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const offered = $('trade-offer').value;
  const requested = $('trade-request').value;
  if (!app.tradeTarget || !offered || !requested) return notify('相手を検索し、交換する2体のAAを選んでください。', true);
  const button = $('trade-send');
  button.disabled = true;
  try {
    await api('trades', {
      method: 'POST',
      body: JSON.stringify({ toUsername: app.tradeTarget.username, offeredFighterId: offered, requestedFighterId: requested })
    });
    notify(`@${app.tradeTarget.username} に交換申請を送信しました！`);
    await refreshTrades();
  } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; }
});
$('pve-difficulty').addEventListener('change', renderPveEnemyPreview);
$('pve-skip').addEventListener('click', skipPveReplay);
$('pve-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (app.pvePlayback) return;
  const fighterId = $('pve-fighter').value;
  const difficulty = $('pve-difficulty').value;
  if (!fighterId) return notify('先にキャラクターを作ってください。', true);
  const button = $('pve-start');
  button.disabled = true;
  $('pve-status').textContent = '>>> CPUとの戦闘を計算しています…';
  try {
    const { battle } = await api('pve/battle', {
      method: 'POST', body: JSON.stringify({ fighterId, difficulty })
    });
    if (app.user) playPveReplay(battle);
  } catch (error) {
    notify(error.message, true);
    $('pve-status').textContent = '> 戦闘を開始できませんでした。再試行してください。';
  } finally {
    if (!app.pvePlayback) button.disabled = !app.fighters.length;
  }
});
setInterval(() => {
  if (app.user && !$('tab-trades').classList.contains('hidden') && !document.hidden) refreshTrades();
}, 20000);
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
    app.availableProviders = config.availableProviders || { gemini: config.generationMode === 'gemini', ollama: config.generationMode === 'ollama', local: true };
    const savedProvider = localStorage.getItem('aabattle-generation-provider');
    app.generationMode = savedProvider && app.availableProviders[savedProvider] ? savedProvider : app.availableProviders.gemini ? 'gemini' : config.generationMode;
    app.model = config.model;
    updateProviderControls();
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
