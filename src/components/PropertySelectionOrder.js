import React,{useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,GripVertical} from 'lucide-react';
import './PropertySelectionOrder.css';

function moved(ids,id,index){const next=ids.filter(value=>value!==id);next.splice(Math.max(0,Math.min(next.length,index)),0,id);return next;}

export default function PropertySelectionOrder({properties,onChange,disabled=false,show=false}) {
  const ids=properties.map(property=>property.id),key=JSON.stringify(ids),map=new Map(properties.map(property=>[property.id,property]));
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(null),[dragging,setDragging]=useState(''),[message,setMessage]=useState('');
  const rows=useRef(new Map()),gesture=useRef(null);
  useEffect(()=>{if(show)setOpen(true);},[show]);
  useEffect(()=>{gesture.current=null;setDraft(null);setDragging('');},[key,disabled]);
  useEffect(()=>setMessage(''),[properties.length]);
  const ordered=draft||ids;
  function commit(next){if(disabled||JSON.stringify(next)===key)return;onChange(next);setMessage('順序已更新，分享編號、地圖與 PDF 會使用相同順序。');}
  function start(event,id){
    if(disabled||event.button!==0)return;
    const boxes=ids.map(value=>{const box=rows.current.get(value)?.getBoundingClientRect();return {id:value,center:box?box.top+box.height/2:0};});
    gesture.current={id,pointerId:event.pointerId,y:event.clientY,boxes,ids:[...ids],next:[...ids],changed:false};
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function move(event){
    const g=gesture.current;if(!g||g.pointerId!==event.pointerId||disabled)return;
    if(!g.changed&&Math.abs(event.clientY-g.y)<6)return;
    event.preventDefault();g.changed=true;setDragging(g.id);
    const target=g.boxes.reduce((best,box,index)=>Math.abs(box.center-event.clientY)<Math.abs(g.boxes[best].center-event.clientY)?index:best,0);
    g.next=moved(g.ids,g.id,target);setDraft(g.next);
  }
  function finish(event,cancel=false){
    const g=gesture.current;if(!g||g.pointerId!==event.pointerId)return;
    gesture.current=null;setDragging('');setDraft(null);
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(!cancel&&g.changed)commit(g.next);
  }
  return <details className="property-selection-order" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><strong>調整帶看順序</strong><span>{ids.length} 間・拖曳或點箭頭</span></summary>
    <p className="property-selection-order-help">先排好順序，再製作分享文字、地圖或 PDF。重新排序會更新分享文字，請先排好再修改文案。</p>
    <ol aria-label="帶看物件順序">{ordered.map((id,index)=>{const property=map.get(id);if(!property)return null;return <li key={id} ref={el=>{if(el)rows.current.set(id,el);else rows.current.delete(id);}} className={dragging===id?'is-dragging':''}>
      <button type="button" className="property-order-handle" aria-label={`拖曳調整 ${property.title||'物件'} 的順序`} disabled={disabled} onPointerDown={event=>start(event,id)} onPointerMove={move} onPointerUp={finish} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)} onKeyDown={event=>{if(event.key==='Escape'){gesture.current=null;setDraft(null);setDragging('');}}}><GripVertical size={20} aria-hidden="true"/></button>
      <b className="property-order-number">{index+1}</b><div className="property-order-copy"><strong>{property.title||'未命名物件'}</strong><small>{property.listingNo||''}{property.totalPrice?` · ${Number(property.totalPrice).toLocaleString()} 萬`:''}</small></div>
      <div className="property-order-arrows"><button type="button" aria-label={`上移 ${property.title||'物件'}`} disabled={disabled||index===0||!!dragging} onClick={()=>commit(moved(ids,id,index-1))}><ArrowUp size={17} aria-hidden="true"/></button><button type="button" aria-label={`下移 ${property.title||'物件'}`} disabled={disabled||index===ids.length-1||!!dragging} onClick={()=>commit(moved(ids,id,index+1))}><ArrowDown size={17} aria-hidden="true"/></button></div>
    </li>;})}</ol>
    <p role="status" className="property-selection-order-status">{disabled?'正在製作資料表，完成後可再調整順序。':dragging?'拖曳中，放開即可套用順序。':message}</p>
  </details>;
}
