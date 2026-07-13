import React, { useState } from "react";
import { useAuth } from "../AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError("登入失敗，請確認帳號密碼是否正確");
    }
  };

  return (
    <main style={{ maxWidth: 380, margin: "80px auto" }}>
      <div className="section-title">登入案件控台</div>
      <div className="panel">
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="form-field">
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>
          <div className="form-field">
            <label>密碼</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </div>
          {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
          <button className="btn" type="submit">
            登入
          </button>
        </form>
      </div>
    </main>
  );
}
