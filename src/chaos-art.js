const palette={common:['#64748b','#26334b'],rare:['#4aa8e8','#163b67'],superRare:['#edb454','#65401b'],ultraRare:['#c773f4','#4a1d70'],mythic:['#f06f91','#591536']};
const symbol={instant:'✦',equipment:'⚙',rule:'♜',counter:'◆'};

export function cardArtSvg(card){
  const [light,dark]=palette[card.rarity]||palette.common,icon=symbol[card.type]||'✦';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420" role="img" aria-label="${card.type} card art"><defs><radialGradient id="g"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient><filter id="glow"><feGaussianBlur stdDeviation="7"/></filter></defs><rect width="320" height="420" rx="24" fill="url(#g)"/><path d="M28 50L160 16l132 34v320l-132 34L28 370Z" fill="none" stroke="${light}" stroke-width="4" opacity=".75"/><circle cx="160" cy="196" r="105" fill="none" stroke="${light}" opacity=".48" stroke-width="20" filter="url(#glow)"/><circle cx="160" cy="196" r="105" fill="none" stroke="${light}" opacity=".7" stroke-width="3"/><text x="160" y="248" text-anchor="middle" font-family="sans-serif" font-size="140" fill="#fff3d2">${icon}</text><path d="M80 322h160" stroke="${light}" stroke-width="3"/><text x="160" y="350" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="bold" fill="#fff3e8">CHAOS SHOGI</text></svg>`;
}
