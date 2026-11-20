import {useLayoutEffect} from 'react';

export default function useStickyToolbarOffset(ref,layoutKey) {
  useLayoutEffect(()=>{
    const bar=ref.current;if(!bar)return;
    const headers=[...document.querySelectorAll('.desktop-topbar,.m-topbar,.editor-core-mobile-head')];
    const measure=()=>{const heights=headers.filter(el=>['sticky','fixed'].includes(getComputedStyle(el).position)&&el.getBoundingClientRect().width>0).map(el=>el.getBoundingClientRect().height);bar.style.setProperty('--survey-header-height',Math.ceil(Math.max(0,...heights))+'px');};
    measure();window.addEventListener('resize',measure);
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);headers.forEach(el=>observer?.observe(el));
    return()=>{window.removeEventListener('resize',measure);observer?.disconnect();};
  },[ref,layoutKey]);
}
