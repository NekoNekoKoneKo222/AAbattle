import type {MapDefinition} from './data.js';

/**
 * First collision along an aimed projectile segment.
 * This tests each wall's bounding box exactly once, not each sampled point.
 * Return value is a DISTANCE in game units, so it can also be used by the
 * shooting guide while both touch joysticks are active.
 */
export function aimWallDistance(
  map:Pick<MapDefinition,'walls'>,
  x:number,z:number,dx:number,dz:number,
  requestedDistance:number,radius=.08
):number{
  if(!Number.isFinite(x+z+dx+dz+requestedDistance)||requestedDistance<=0)return 0;
  let nearest=requestedDistance;
  for(const wall of map.walls){
    const minX=wall.x-wall.w/2-radius,maxX=wall.x+wall.w/2+radius;
    const minZ=wall.z-wall.h/2-radius,maxZ=wall.z+wall.h/2+radius;
    // Narrow phase: avoid per-wall allocations.
    let entry=0,exit=nearest;
    if(Math.abs(dx)<1e-7){
      if(x<minX||x>maxX)continue;
    }else{
      const t1=(minX-x)/dx,t2=(maxX-x)/dx;
      entry=Math.max(entry,Math.min(t1,t2));
      exit=Math.min(exit,Math.max(t1,t2));
    }
    if(entry>exit)continue;
    if(Math.abs(dz)<1e-7){
      if(z<minZ||z>maxZ)continue;
    }else{
      const t1=(minZ-z)/dz,t2=(maxZ-z)/dz;
      entry=Math.max(entry,Math.min(t1,t2));
      exit=Math.min(exit,Math.max(t1,t2));
    }
    if(entry<=exit&&exit>=0&&entry<nearest){
      nearest=Math.max(0,entry-.1);
    }
  }
  return nearest;
}
