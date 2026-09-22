"use client";

import { useState } from "react";
import { Button, Input, Notice } from "../../components/ui";
import { api } from "../../lib/api";

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ identifier }),
      });
      setMessage(result.message);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to submit request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <div className="brand">Countertop</div>
        <div>
          <h1>Recover access.</h1>
          <p>Reset links are single-use and expire after 30 minutes.</p>
        </div>
      </aside>
      <section className="auth-main">
        <form className="auth-form" onSubmit={submit}>
          <h2>Forgot password</h2>
          <p className="muted">
            Enter your username or email. We will locate the correct business
            account.
          </p>
          {message && (
            <Notice tone={message.startsWith("If") ? "success" : "error"}>
              {message}
            </Notice>
          )}
          <Input
            label="Username or email"
            value={identifier}
            autoComplete="username"
            onChange={(event) => setIdentifier(event.target.value)}
          />
          <Button disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </section>
    </main>
  );
}
