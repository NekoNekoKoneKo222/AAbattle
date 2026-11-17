export function initChaosBossUI({api,getUser,getDeck,getGame,setGame,onClear}){
  const panel=document.createElement('section');
  panel.className='boss-panel';
  panel.id='bossPanel';
  panel.innerHTML=[
    '<div class="boss-heading"><div><span class="eyebrow">BOSS SHOGI</span><h2>ボス戦（1～2人協力）</h2><p>同じ盤面・デッキを使い、仲間と交代でボスへ挑もう。</p></div></div>',
    '<div class="boss-controls">',
    '<label>ボス<select id="bossType"><option value="rookie">暴走する歩兵王 · 初級</option><option value="guardian">鉄壁の守護者 · 中級</option><option value="nightmare">深淵の王将 · 上級</option></select></label>',
    '<button id="bossCreate" type="button">ボス部屋を作成</button>',
    '<label>合言葉<input id="bossCode" maxlength="8" placeholder="8文字の部屋コード" aria-label="ボス部屋コード"/></label>',
    '<button id="bossJoin" type="button">友達のボス部屋に参加</button>',
    '</div>',
    '<div class="boss-lobby" id="bossLobby" hidden>',
    '<div class="boss-room-info"><strong id="bossRoomCode"></strong><span id="bossRoster"></span></div>',
    '<div class="boss-meter"><strong id="bossHpLabel"></strong><progress id="bossHpBar" value="100" max="100"></progress></div>',
    '<p id="bossInfo" role="status"></p>',
    '<div class="boss-actions"><button id="bossStart" type="button">ボス戦開始</button><button id="bossLeave" type="button">部屋を退出</button></div>',
    '</div>',
    '<p id="bossNotice" role="status">ボス戦はアカウントでログインすると遊べます。</p>'
  ].join('');
  document.getElementById('onlinePanel')?.after(panel);
  const $=id=>panel.querySelector('#'+id);
  let room=null,busy=false,notifiedClear=null;
  const notice=text=>{$('bossNotice').textContent=text;};
  function render(){
    const user=getUser();
    $('bossCreate').disabled=!user||busy||Boolean(room);
    $('bossJoin').disabled=!user||busy||Boolean(room);
    $('bossLobby').hidden=!room;
    if(!room)return;
    $('bossRoomCode').textContent='招待コード：'+room.code;
    $('bossRoster').textContent='参加者 '+room.players.map(x=>x.username).join('・')+'（'+room.players.length+'/2人）';
    $('bossHpLabel').textContent=room.boss.name+'　HP '+room.hp+' / '+room.maxHp;
    $('bossHpBar').max=room.maxHp;$('bossHpBar').value=room.hp;
    $('bossInfo').textContent=room.status==='lobby'?'1人でも開始できます。2人なら交互に駒とカードを使用します。':
      room.status==='playing'?'戦闘中：'+(room.players.find(x=>x.id===room.activeUserId)?.username||'仲間')+'の手番 · '+room.turns+' / '+room.boss.maxTurns+'ターン':
      room.status==='cleared'?'ボス撃破！ 参加者全員が報酬と称号を受け取ります。':'ボス戦敗北。もう一度挑戦できます。';
    $('bossStart').hidden=room.status!=='lobby'||room.hostId!==user?.id;
    $('bossStart').disabled=busy;
    $('bossLeave').disabled=busy||room.status==='playing';
  }
  function update(value){
    const next=value?.room??value;
    const before=room;
    if(next&&next.code&&next.bossId)room=next;
    if(next===null)room=null;
    render();
    if(room?.game){
      const current=getGame();
      if(current?.id!==room.game.id||current.revision!==room.game.revision||current.boss?.hp!==room.hp)setGame(room.game);
    }
    if(room?.status==='cleared'&&notifiedClear!==room.code){notifiedClear=room.code;notice('ボス撃破！コイン・欠片・称号を確認してください。');onClear?.();}
    else if(room?.status==='lost'&&before?.status!=='lost')notice('ボス戦敗北。部屋を退出すると新しい挑戦を開始できます。');
  }
  async function command(url,body={}){
    if(busy)return;
    busy=true;render();
    try{
      const result=await api('/boss'+url,'POST',body);
      if(result?.ok){room=null;render();notice('ボス部屋から退出しました。');}
      else update(result);
      return result;
    }catch(e){notice(e.message);return null;}finally{busy=false;render();}
  }
  $('bossCreate').onclick=()=>command('/rooms',{bossId:$('bossType').value,deck:getDeck()});
  $('bossJoin').onclick=()=>{const code=$('bossCode').value.trim().toUpperCase();if(!/^[A-F0-9]{8}$/.test(code)){notice('8文字の部屋コードを入力してください。');return;}command('/rooms/'+code+'/join');};
  $('bossStart').onclick=()=>room&&command('/rooms/'+room.code+'/start');
  $('bossLeave').onclick=()=>room&&command('/rooms/'+room.code+'/leave');
  async function refresh(){
    if(!getUser())return;
    try{
      const data=room?await api('/boss/rooms/'+room.code):await api('/boss/me');
      update(data?.room===undefined?data:data.room);
    }catch(e){if(room&&/見つかりません|ありません/.test(e.message)){room=null;render();}else notice(e.message);}
  }
  const polling=setInterval(()=>{if(room&&!busy)refresh().catch(()=>{});},2500);
  return {refresh,update,render,getRoom:()=>room,dispose:()=>{clearInterval(polling);panel.remove();}};
}
