const KEY='csh-experience-v1';
const $=id=>document.getElementById(id);
const defaults={sound:true,volume:35,reduceMotion:false};
function read(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{return {...defaults};}}

export function installExperience(){
  const settings=read();let audio=null;
  const panel=document.createElement('section');panel.id='experiencePanel';panel.className='experience-panel';panel.innerHTML='<span class="eyebrow">PHASE 9 · EXPERIENCE</span><h2>演出・操作設定</h2><label><input id="experienceSound" type="checkbox"> 効果音を再生する</label><label>音量 <input id="experienceVolume" type="range" min="0" max="100" step="5"><output id="experienceVolumeText"></output></label><label><input id="experienceMotion" type="checkbox"> アニメーションを減らす</label><p>iPadではカードを長押しすると詳細を表示し、カードを盤面へドラッグすると対象を選べます。PCでは矢印キーで盤面を移動し、Enterで選択できます。</p>';
  document.querySelector('#collectionPanel').after(panel);
  const apply=()=>{document.body.classList.toggle('reduce-motion',settings.reduceMotion);$('experienceSound').checked=settings.sound;$('experienceVolume').value=settings.volume;$('experienceVolumeText').textContent=`${settings.volume}%`;$('experienceMotion').checked=settings.reduceMotion;try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}};
  $('experienceSound').onchange=event=>{settings.sound=event.target.checked;apply();if(settings.sound)beep(620,.1);};
  $('experienceVolume').oninput=event=>{settings.volume=Math.max(0,Math.min(100,Number(event.target.value)));apply();};
  $('experienceMotion').onchange=event=>{settings.reduceMotion=event.target.checked;apply();};
  function beep(frequency=430,duration=.1){if(!settings.sound||settings.volume<=0)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});const oscillator=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;oscillator.type='triangle';oscillator.frequency.setValueAtTime(frequency,now);oscillator.frequency.exponentialRampToValueAtTime(Math.max(60,frequency*.78),now+duration);gain.gain.setValueAtTime(Math.max(.0001,settings.volume/1000),now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);oscillator.connect(gain).connect(audio.destination);oscillator.start(now);oscillator.stop(now+duration);}catch{}}
  const cue=tone=>{const frequencies={move:440,capture:290,promote:710,card:620,equip:560,steal:380,rule:180};beep(frequencies[tone]||440,tone==='rule'?.22:.09);if(tone==='rule')setTimeout(()=>beep(245,.18),90);};
  apply();
  return {beep,cue,reducedMotion:()=>settings.reduceMotion||window.matchMedia('(prefers-reduced-motion: reduce)').matches};
}
