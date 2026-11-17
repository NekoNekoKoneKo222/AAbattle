// SPRA leaderboard: results are calculated by the PvP server, never clients.
// If Neon is configured, standings survive restarts. If not, session-only.
export function createSpraLeaderboard(pool = null) {
  const memory=new Map();
  let ready = null;
  const initialize = async () => {
    if (!pool?.query) return false;
    if (!ready) ready = pool.query(
      'CREATE TABLE IF NOT EXISTS spra_rankings ('+
        'player_key VARCHAR(40) PRIMARY KEY,'+
        'display_name VARCHAR(24) NOT NULL,'+
        'wins INTEGER NOT NULL DEFAULT 0,'+
        'losses INTEGER NOT NULL DEFAULT 0,'+
        'matches INTEGER NOT NULL DEFAULT 0,'+
        'kos INTEGER NOT NULL DEFAULT 0,'+
        'points INTEGER NOT NULL DEFAULT 0,'+
        'updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)'
      ).then(() => true).catch(error => {
        console.warn('[SPRA] Neon leaderboard disabled:',error.message);
        return false;
      });
    return ready;
  };
  function award(players,winner,mode='turf'){
    if(mode==='training')return Promise.resolve();
    const updates=players.filter(p=>!p.bot&&typeof p.name==='string').map(p=>{
      const name=p.name.trim().slice(0,18)||'PLAYER';
      const key=name.toLowerCase();
      const won=winner===p.team, lost=winner>=0&&!won;
      const ko=Math.max(0,Math.min(500,Math.floor(p.ko||0)));
      const point=(won?100:lost?25:50)+Math.min(100,ko*4);
      const existing=memory.get(key)||{key,name,wins:0,losses:0,matches:0,kos:0,points:0};
      existing.name=name;
      existing.matches++;
      existing.wins+=+won;
      existing.losses+=+lost;
      existing.kos+=ko;
      existing.points+=point;
      memory.set(key,existing);
      return {key,name,won:+won,lost:+lost,ko,point};
    });
    return (async()=>{
      if(!await initialize())return;
      for(const p of updates){
        try{
          await pool.query(
            'INSERT INTO spra_rankings(player_key,display_name,wins,losses,matches,kos,points) '+
            'VALUES($1,$2,$3,$4,1,$5,$6) '+
            'ON CONFLICT(player_key) DO UPDATE SET '+
            'display_name=EXCLUDED.display_name,'+
            'wins=spra_rankings.wins+EXCLUDED.wins,'+
            'losses=spra_rankings.losses+EXCLUDED.losses,'+
            'matches=spra_rankings.matches+1,'+
            'kos=spra_rankings.kos+EXCLUDED.kos,'+
            'points=spra_rankings.points+EXCLUDED.points,'+
            'updated_at=CURRENT_TIMESTAMP',
            [p.key,p.name,p.won,p.lost,p.ko,p.point]);
        }catch(error){console.warn('[SPRA] leaderboard write failed:',error.message);}
      }
    })();
  }
  async function top(limit=20){
    const take=Math.max(1,Math.min(50,Number(limit)||20));
    if(await initialize()){
      try{
        const result=await pool.query(
          'SELECT display_name AS name,wins,losses,matches,kos,points '+
          'FROM spra_rankings ORDER BY points DESC,wins DESC,kos DESC,updated_at ASC LIMIT $1',
          [take]);
        return {scope:'global',players:result.rows};
      }catch(error){console.warn('[SPRA] leaderboard read failed:',error.message);}
    }
    const players=[...memory.values()]
      .sort((a,b)=>b.points-a.points||b.wins-a.wins||b.kos-a.kos)
      .slice(0,take)
      .map(({name,wins,losses,matches,kos,points})=>({name,wins,losses,matches,kos,points}));
    return {scope:'session',players};
  }
  return {award,top};
}
