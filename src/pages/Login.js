import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useAuth } from "../AuthContext";

// 同事自己註冊帳號時要輸入的邀請碼，只有你跟同事知道
// 之後想換一組新的，改這裡重新部署一次就好
const INVITE_CODE = "0938888906";

export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState("login"); // login | signup

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPassword2, setSignupPassword2] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signingUp, setSigningUp] = useState(false);

  const onLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError("登入失敗，請確認帳號密碼是否正確");
    }
  };

  const onSignup = async (e) => {
    e.preventDefault();
    setSignupError("");

    if (!signupName.trim()) {
      setSignupError("請填寫你的姓名，讓同事之間分享資料時看得懂是誰");
      return;
    }
    if (inviteCode.trim() !== INVITE_CODE) {
      setSignupError("邀請碼不正確，請跟劉昭佑確認");
      return;
    }
    if (signupPassword.length < 6) {
      setSignupError("密碼至少要 6 個字元");
      return;
    }
    if (signupPassword !== signupPassword2) {
      setSignupError("兩次輸入的密碼不一樣");
      return;
    }

    setSigningUp(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, signupEmail.trim(), signupPassword);
      await setDoc(doc(db, "colleagues", cred.user.uid), {
        name: signupName.trim(),
        email: signupEmail.trim(),
        createdAt: serverTimestamp(),
      });
      // 註冊成功後 Firebase 會自動幫這個帳號登入，不用再額外做事
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setSignupError("這組信箱已經註冊過了，請直接登入");
      } else if (err.code === "auth/invalid-email") {
        setSignupError("信箱格式不正確");
      } else {
        setSignupError("註冊失敗，請再試一次");
      }
    }
    setSigningUp(false);
  };

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand-mark" aria-hidden="true">樂</div>
        <div className="login-eyebrow">LESHAN REALTY CRM</div>
        <h1>{mode === "login" ? "歡迎回來" : "建立同事帳號"}</h1>
        <p className="login-subtitle">
          {mode === "login" ? "登入案件控台，掌握今天的客戶與案件進度。" : "完成註冊後，即可與團隊安全共享工作資料。"}
        </p>
        <div className="auth-mode-tabs">
          <button
            type="button"
            className={mode === "login" ? "btn" : "btn ghost"}
            style={{ flex: 1 }}
            onClick={() => setMode("login")}
          >
            登入
          </button>
          <button
            type="button"
            className={mode === "signup" ? "btn" : "btn ghost"}
            style={{ flex: 1 }}
            onClick={() => setMode("signup")}
          >
            同事註冊
          </button>
        </div>

        {mode === "login" ? (
          <form className="form-grid" onSubmit={onLogin}>
            <div className="form-field">
              <label htmlFor="login-email">Email</label>
              <input id="login-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" autoComplete="email" required />
            </div>
            <div className="form-field">
              <label htmlFor="login-password">密碼</label>
              <input
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="輸入密碼"
                autoComplete="current-password"
                required
              />
            </div>
            {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
            <button className="btn login-submit" type="submit">
              登入
            </button>
          </form>
        ) : (
          <form className="form-grid" onSubmit={onSignup}>
            <div className="form-field">
              <label>姓名（分享資料時，同事會看到這個名字）</label>
              <input value={signupName} onChange={(e) => setSignupName(e.target.value)} required />
            </div>
            <div className="form-field">
              <label>Email（之後登入用這組）</label>
              <input value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} type="email" required />
            </div>
            <div className="form-field">
              <label>設定密碼（至少 6 個字元）</label>
              <input value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} type="password" required />
            </div>
            <div className="form-field">
              <label>再輸入一次密碼</label>
              <input value={signupPassword2} onChange={(e) => setSignupPassword2(e.target.value)} type="password" required />
            </div>
            <div className="form-field">
              <label>邀請碼（跟劉昭佑索取）</label>
              <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
            </div>
            {signupError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{signupError}</div>}
            <button className="btn login-submit" type="submit" disabled={signingUp}>
              {signingUp ? "註冊中…" : "註冊並登入"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
