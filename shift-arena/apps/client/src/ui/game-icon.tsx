import type { ReactNode, SVGProps } from 'react';

export type GameIconName =
  | 'sun' | 'coins' | 'diamond' | 'ticket' | 'cube' | 'gift'
  | 'move' | 'target' | 'zap' | 'trophy' | 'lock'
  | 'home' | 'fighter' | 'friends' | 'settings'
  | 'warning' | 'pin' | 'play' | 'star' | 'sparkles';

const shapes: Record<GameIconName, ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4.2"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12m9.9 9.9 2.12 2.12M2 12h3m14 0h3M4.93 19.07l2.12-2.12m9.9-9.9 2.12-2.12"/></>,
  coins: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6.3"/><path d="M14.7 8.6H11a2.1 2.1 0 0 0 0 4.2h2a2.1 2.1 0 0 1 0 4.2H9.3M12 6.5v11"/></>,
  diamond: <><path d="M6 3.5h12L23 9l-11 12L1 9zM1 9h22M6 3.5 9 9l3 12 3-12 3-5.5"/></>,
  ticket: <><path d="M3 5h18v4a3 3 0 0 0 0 6v4H3v-4a3 3 0 0 0 0-6zM12 5v2m0 4v2m0 4v2"/></>,
  cube: <><path d="m12 2 9 5v10l-9 5-9-5V7zM12 12 3 7m9 5 9-5m-9 5v10"/></>,
  gift: <><rect x="3" y="10" width="18" height="11" rx="1"/><path d="M2 7.5h20V11H2zM12 7.5V21M12 7.5C7 7.5 5 5.2 6.4 3.5c1.8-2.4 5.6.6 5.6 4m0 0c0-3.4 3.8-6.4 5.6-4 1.4 1.7-.6 4-5.6 4"/></>,
  move: <><path d="M12 2v20M2 12h20M8.5 5.5 12 2l3.5 3.5M8.5 18.5 12 22l3.5-3.5M5.5 8.5 2 12l3.5 3.5m13-7L22 12l-3.5 3.5"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="M12 1v4M12 19v4M1 12h4m14 0h4"/></>,
  zap: <><path d="M13.5 2 4.5 13h7l-1 9 9-12h-7z"/></>,
  trophy: <><path d="M7 3h10v7c0 4-2 6-5 6s-5-2-5-6zM7 5H3v3c0 3 1.8 5 5.5 5m8-8H21v3c0 3-1.8 5-5.5 5M12 16v4m-4 2h8m-8-2h8"/></>,
  lock: <><rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v3"/></>,
  home: <><path d="m2 11 10-9 10 9M5 10v11h14V10m-10 11v-7h6v7"/></>,
  fighter: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2c0-4 3-6 8-6s8 2 8 6v2M9 14l3 3 3-3"/></>,
  friends: <><circle cx="9" cy="8" r="3"/><path d="M2 21v-2c0-4 2-6 7-6s7 2 7 6v2H2ZM17 5c2.5 0 4 1.5 4 4s-1.5 4-4 4m1 2c3 .2 5 2 5 5"/></>,
  settings: <><circle cx="12" cy="12" r="3.2"/><path d="m10 2-.6 2.4-2.1.9-2.1-1.3-2.4 2.4 1.3 2.1-.9 2.1L1 11v3l2.2.5.9 2.1-1.3 2.1 2.4 2.4 2.1-1.3 2.1.9L10 23h4l.6-2.3 2.1-.9 2.1 1.3 2.4-2.4-1.3-2.1.9-2.1L23 14v-3l-2.2-.4-.9-2.1 1.3-2.1-2.4-2.4-2.1 1.3-2.1-.9L14 2z"/></>,
  warning: <><path d="M10 3a2.2 2.2 0 0 1 4 0l9 16a2 2 0 0 1-1.8 3H2.8A2 2 0 0 1 1 19zM12 9v5m0 4v.2"/></>,
  pin: <><path d="M19 10c0 5.5-7 12-7 12S5 15.5 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2.4"/></>,
  play: <><path d="M7 3 21 12 7 21z"/></>,
  star: <><path d="m12 2 3.2 6.5 7.2 1.1-5.2 5.1 1.2 7.3-6.4-3.5-6.4 3.5 1.2-7.3-5.2-5.1 7.2-1.1z"/></>,
  sparkles: <><path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6zM4 2v3m-1.5-1.5h3M20 19v3m-1.5-1.5h3"/></>
};

export function GameIcon({
  name, size=22, className='', ...props
}: {name:GameIconName;size?:number;className?:string} & Omit<SVGProps<SVGSVGElement>,'name'|'children'>) {
  return <svg xmlns="http://www.w3.org/2000/svg" className={'game-icon '+className}
    width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" {...props}>{shapes[name]}</svg>;
}
