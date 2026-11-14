export function initChaosAdmin({api,catalog,refreshCollection}){
  const root=document.createElement('section');root.className='chaos-admin';root.hidden=true;
  root.innerHTML='<h2>CHAOS SHOGI 管理者パネル</h2><p>プレイヤーの所持状況を確認し、テスト用のコイン・カードを付与できます。</p><div class="chaos-admin-row"><label>プレイヤー名<input id="chaosAdminName" maxlength="20" autocomplete="off"></label><button id="chaosAdminLookup" type="button">確認</button></div><div id="chaosAdminProfile" role="status"></div><div class="chaos-admin-row"><label>コインを付与<input id="chaosAdminCoins" type="number" min="0" max="100000" value="0"></label><label>カードを付与<select id="chaosAdminCard"><option value="">選択なし</option></select></label><label>枚数<input id="chaosAdminCount" type="number" min="0" max="20" value="0"></label><button id="chaosAdminGrant" type="button">付与</button></div><p id="chaosAdminMessage" role="status"></p>';
  document.getElementById('collectionPanel').after(root);
  const $=id=>root.querySelector('#'+id);
  const message=text=>{$('chaosAdminMessage').textContent=text;};
  const name=()=>$('chaosAdminName').value.trim();
  let busy=false;
  const run=async(task)=>{if(busy)return;busy=true;$('chaosAdminLookup').disabled=true;$('chaosAdminGrant').disabled=true;try{await task();}catch(error){message(error.message);}finally{busy=false;$('chaosAdminLookup').disabled=false;$('chaosAdminGrant').disabled=false;}};
  const show=result=>{$('chaosAdminProfile').textContent=`${result.username} · ${result.profile.coins}コイン · ${result.profile.shards}欠片 · 所持カード${Object.values(result.profile.cards).reduce((sum,count)=>sum+count,0)}枚 · 対局${result.profile.wins+result.profile.losses}戦`;};
  $('chaosAdminLookup').onclick=()=>run(async()=>{const result=await api('/online/admin/players/'+encodeURIComponent(name()));show(result);message('所持状況を読み込みました。');});
  $('chaosAdminGrant').onclick=()=>run(async()=>{const coins=Number($('chaosAdminCoins').value),count=Number($('chaosAdminCount').value),cardId=$('chaosAdminCard').value||null;if(!name())throw Error('プレイヤー名を入力してください。');if(!Number.isInteger(coins)||coins<0||coins>100000||!Number.isInteger(count)||count<0||count>20||(!coins&&!count)||Boolean(cardId)!==Boolean(count))throw Error('付与内容を確認してください。');if(!confirm(`${name()} に ${coins}コイン${count?`と ${catalog()[cardId]?.name||cardId} ${count}枚`:''}を付与しますか？`))return;const result=await api('/online/admin/grant','POST',{username:name(),coins,cardId,count});show(result);message(`${result.username} に付与しました。`);refreshCollection();});
  return {setAdmin(value){root.hidden=!value;if(value){const select=$('chaosAdminCard'),selected=select.value;select.replaceChildren(new Option('選択なし',''));for(const card of Object.values(catalog()))select.add(new Option(card.name,card.id));select.value=selected;}}};
}
