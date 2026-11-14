export function installChaosLayout(){
  const header=document.querySelector('header'),grid=document.querySelector('.arena-grid');
  const top=document.createElement('nav');top.className='chaos-top-nav';top.setAttribute('aria-label','CHAOS SHOGI メニュー');
  top.innerHTML='<button type="button" data-go="home">⌂ ホーム</button><button type="button" data-go="deck">▣ デッキ</button><button type="button" data-go="catalog">▤ カード図鑑</button><button type="button" data-go="collection">✦ 収集・ガチャ</button><button type="button" data-go="online">♜ オンライン</button>';
  header.querySelector('.brand').after(top);
  const nav=document.createElement('aside');nav.className='chaos-side-nav';nav.setAttribute('aria-label','対局メニュー');
  nav.innerHTML='<button type="button" class="active" data-go="match">⚔ <span>対局</span></button><button type="button" data-go="deck">▣ <span>デッキ編集</span></button><button type="button" data-go="catalog">▤ <span>カード図鑑</span></button><button type="button" data-go="online">♟ <span>友達・観戦</span></button><button type="button" data-go="log">◉ <span>対局ログ</span></button><button type="button" data-go="collection">✦ <span>収集・ガチャ</span></button>';
  const preview=document.createElement('aside');preview.className='chaos-preview';preview.innerHTML='<div class="preview-frame"><div class="preview-top"><span id="previewType">CARD PREVIEW</span><b id="previewRarity">—</b></div><div id="previewArt" class="preview-art">✦</div><h3 id="previewName">カードを選択</h3><div id="previewCost" class="preview-cost">カードに触れると詳細を表示</div><p id="previewDescription">カードの効果と必要CPをここで確認できます。</p></div>';
  grid.prepend(nav,preview);
  document.querySelector('.journal').append(document.querySelector('#ruleDisplay'),document.querySelector('.equipment-row'));
  const scrollTo=id=>document.querySelector(id)?.scrollIntoView({behavior:'smooth',block:'start'});
  function navigate(target){
    if(target==='home')return scrollTo('.intro');
    if(target==='match')return scrollTo('#arena');
    if(target==='online')return scrollTo('#onlinePanel');
    if(target==='collection')return scrollTo('#collectionPanel');
    if(target==='log')return scrollTo('.journal');
    const body=document.querySelector('#deckBody');if(body?.hidden)document.querySelector('#deckToggle')?.click();
    scrollTo(target==='catalog'?'#deckCatalog':'#deckBuilder');
    if(target==='catalog')document.querySelector('#deckSearch')?.focus({preventScroll:true});
  }
  for(const button of [...top.querySelectorAll('[data-go]'),...nav.querySelectorAll('[data-go]')])button.addEventListener('click',()=>navigate(button.dataset.go));
  let shown='';
  function showCard(card){
    const key=card?.id||'';if(key===shown)return;shown=key;
    const frame=preview.querySelector('.preview-frame');frame.dataset.rarity=card?.rarity||'none';
    preview.querySelector('#previewType').textContent=card?.type==='equipment'?'装備カード':card?.type==='counter'?'カウンター':card?.type==='rule'?'ルールカード':'インスタント';
    preview.querySelector('#previewRarity').textContent={common:'C',rare:'R',superRare:'SR',ultraRare:'UR',mythic:'MYTHIC'}[card?.rarity]||'—';
    preview.querySelector('#previewArt').textContent=card?.type==='equipment'?'⚙':card?.type==='counter'?'◆':card?.type==='rule'?'♜':'✦';
    preview.querySelector('#previewName').textContent=card?.name||'カードを選択';
    preview.querySelector('#previewCost').textContent=card?`コスト ${card.cost} CP`:'カードに触れると詳細を表示';
    preview.querySelector('#previewDescription').textContent=card?.description||'カードの効果と必要CPをここで確認できます。';
  }
  function update(game,catalog,selection){
    document.querySelector('.chaos-top-nav')?.classList.toggle('in-match',Boolean(game));
    const hand=game?.cards?.currentHand||[];showCard(catalog[selection?.cardId]||catalog[hand[0]]||null);
    document.querySelectorAll('#cardHand .hand-card').forEach((button,index)=>{
      const card=catalog[hand[index]];button.addEventListener('mouseenter',()=>showCard(card));button.addEventListener('focus',()=>showCard(card));
    });
  }
  return {update,showCard};
}
