import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { outreachToday } from '../lib/outreachModel';
const cache = new Map();
export default function OutreachReminder({ uid }) {
  const [state, setState] = useState({ uid, count: null });
  useEffect(() => {
    let active = true; const today = outreachToday(), existing = cache.get(uid);
    if (existing?.day === today && existing.expires > Date.now()) { setState({ uid, count: existing.count }); return; }
    getDocs(query(collection(db, 'outreachPrivate', uid, 'records'), where('followOn', '>', ''), where('followOn', '<=', today), limit(200))).then(snapshot => {
      const count = snapshot.docs.filter(d => !['不再寄送', '暫停追蹤'].includes(d.data().status)).length;
      cache.set(uid, { day: today, count, expires: Date.now()+60000 }); if (active) setState({ uid, count });
    }).catch(() => { if (active) setState({ uid, count: null }); });
    return () => { active = false; };
  }, [uid]);
  return <Link to="/outreach" className="panel" style={{display:'block',textDecoration:'none',color:'inherit',padding:18,margin:'16px 0'}}><strong>私人開發信・標籤列印</strong><span style={{display:'block',marginTop:5,color:'var(--muted)'}}>{state.uid===uid&&state.count!==null?`今天／逾期待追蹤 ${state.count}${state.count===200?'+':''} 筆`:'上傳開發信、保存寄送名單，一次整理信件與標籤'}</span></Link>;
}
