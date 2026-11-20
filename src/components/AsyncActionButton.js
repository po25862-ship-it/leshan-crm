import React, { useEffect, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import './AsyncActionButton.css';

export default function AsyncActionButton({busy=false,success=false,busyLabel='處理中…',successLabel='已完成',icon:Icon,children,className='btn',disabled=false,...props}) {
  const [confirmed,setConfirmed]=useState(false);
  useEffect(()=>{setConfirmed(success);if(!success)return;const timer=setTimeout(()=>setConfirmed(false),2500);return()=>clearTimeout(timer);},[success]);
  return <button {...props} className={`${className} async-action-button${confirmed&&!busy?' is-confirmed':''}`} disabled={disabled||busy} aria-busy={busy} data-state={busy?'busy':confirmed?'success':'idle'}>
    {busy?<LoaderCircle className="async-action-spinner" size={16} aria-hidden="true"/>:confirmed?<Check size={16} aria-hidden="true"/>:Icon?<Icon size={16} aria-hidden="true"/>:null}
    <span>{busy?busyLabel:confirmed?successLabel:children}</span>
  </button>;
}
