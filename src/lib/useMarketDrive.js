import {useEffect,useRef,useState} from 'react';
// Same public OAuth client as the existing CRM. This flow asks only for app-created Drive files.
const CLIENT_ID='67951666720-k1qder1i93lrm8kjp4p6f1iubt91qra9.apps.googleusercontent.com';
export function useMarketDrive(){
 const client=useRef(null),[session,setSession]=useState(null),[gsiReady,setReady]=useState(false),[connecting,setConnecting]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;const initialize=()=>{
  if(!window.google?.accounts?.oauth2)return false;
  client.current=window.google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:'https://www.googleapis.com/auth/drive.file',callback:response=>{
   if(!active)return;setConnecting(false);if(response.error||!response.access_token){setError('Google 連線未完成，請重新嘗試。');return;}
   setSession({token:response.access_token,expiresAt:Date.now()+(Number(response.expires_in||3600)-60)*1000});setError('');
  },error_callback:()=>{if(active){setConnecting(false);setError('Google 視窗已關閉或尚未完成連線，請重試。');}}});
  setReady(true);return true;
 };
 if(initialize())return()=>{active=false;};const timer=setInterval(()=>{if(initialize())clearInterval(timer);},300);return()=>{active=false;clearInterval(timer);};},[]);
 return {gsiReady,connecting,error,isConnected:!!session&&session.expiresAt>Date.now(),connectionExpiresAt:session?.expiresAt||0,
  connect:()=>{if(client.current){setError('');setConnecting(true);try{client.current.requestAccessToken();}catch{setConnecting(false);setError('無法開啟 Google 連線視窗，請重試。');}}},
  getDriveAccessToken:()=>{if(!session||session.expiresAt<=Date.now())throw new Error('Google 連線已過期，請重新連結。');return session.token;}};
}
