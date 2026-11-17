import {useCallback,useEffect,useRef,useState} from 'react';
import model from '../lib/propertySurveyModel';

const key=uid=>'leshan-survey-sales-defaults-'+uid;
export function readSalesDefaults(uid){try{const cached=JSON.parse(localStorage.getItem(key(uid)));return cached?{salesData:model.salesRepDefaults(cached.salesData),pending:cached.pending===true}:null;}catch{return null;}}
function cache(uid,salesData,pending){try{localStorage.setItem(key(uid),JSON.stringify({salesData,pending}));}catch{/* Cloud preferences remain available if local storage is full. */}}

export default function useSurveySalesDefaults(user,request){
  const initial=useRef(readSalesDefaults(user.uid)),latest=useRef(initial.current),version=useRef(0),timer=useRef(null),writing=useRef(false),mounted=useRef(true);
  const [data,setData]=useState(initial.current?.salesData||null),[status,setStatus]=useState(initial.current?.pending?'pending':initial.current?'saved':'idle');
  const flush=useCallback(async function flushPending(){
    clearTimeout(timer.current);
    if(writing.current||!latest.current?.pending)return;
    const snapshot=latest.current,sequence=version.current;writing.current=true;
    try{
      await request(user,{action:'sales-defaults',salesData:snapshot.salesData});
      if(sequence===version.current){latest.current={salesData:snapshot.salesData,pending:false};cache(user.uid,snapshot.salesData,false);if(mounted.current)setStatus('saved');}
    }catch{if(sequence===version.current&&mounted.current)setStatus('error');}
    finally{writing.current=false;if(sequence!==version.current&&mounted.current)timer.current=setTimeout(flushPending,0);}
  },[user,request]);
  const remember=useCallback(value=>{
    const salesData=model.salesRepDefaults(value);
    if(JSON.stringify(latest.current?.salesData)===JSON.stringify(salesData))return;
    version.current++;latest.current={salesData,pending:true};cache(user.uid,salesData,true);setData(salesData);setStatus('pending');clearTimeout(timer.current);timer.current=setTimeout(flush,600);
  },[user.uid,flush]);
  const acceptRemote=useCallback(value=>{
    if(!value||version.current>0||latest.current?.pending)return null;
    const salesData=model.salesRepDefaults(value);latest.current={salesData,pending:false};cache(user.uid,salesData,false);setData(salesData);setStatus('saved');return salesData;
  },[user.uid]);
  useEffect(()=>{mounted.current=true;if(latest.current?.pending)timer.current=setTimeout(flush,600);return()=>{mounted.current=false;clearTimeout(timer.current);};},[flush]);
  const getData=useCallback(()=>latest.current?.salesData||null,[]);
  return {data,status,remember,acceptRemote,retry:flush,getData};
}
