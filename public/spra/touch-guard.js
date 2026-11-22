// Prevent the browser (not the game) from handling iPad Safari gestures.
// The game still receives independent pointers for movement/aim/shoot.
const editable = target => target instanceof Element &&
  Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
const isGameSurface = target => target instanceof Element &&
  Boolean(target.closest('#spraMain,#shopOverlay,#facilityOverlay'));
export function installSpraTouchGuards() {
  // Safari's proprietary gesture events are independent of PointerEvents.
  for (const kind of ['gesturestart','gesturechange','gestureend']) {
    document.addEventListener(kind,event=>{
      if(isGameSurface(event.target) && !editable(event.target) && event.cancelable)
        event.preventDefault();
    },{passive:false});
  }
  document.addEventListener('selectstart',event=>{
    if(isGameSurface(event.target)&&!editable(event.target))
      event.preventDefault();
  },{passive:false});
  document.addEventListener('contextmenu',event=>{
    if(isGameSurface(event.target)&&!editable(event.target))
      event.preventDefault();
  },{passive:false});
  document.addEventListener('dblclick',event=>{
    if(isGameSurface(event.target)&&!editable(event.target))
      event.preventDefault();
  },{passive:false});
  // Two fingers on the *same* canvas are a browser pinch, not independent
  // joystick+fire controls; block the pinch without blocking two-thumb play.
  for (const kind of ['touchstart','touchmove']) {
    document.addEventListener(kind,event=>{
      const surface=event.target;
      if(surface instanceof HTMLCanvasElement && event.touches.length>1 &&
         isGameSurface(surface) && event.cancelable) event.preventDefault();
    },{passive:false});
  }
}
