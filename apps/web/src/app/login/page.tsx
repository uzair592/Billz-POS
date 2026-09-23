"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Coffee } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { loginSchema, type LoginInput } from "@cafe-pos/contracts";
import { Button, Input, Notice } from "../../components/ui";
import { api, saveCsrf } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const submit = handleSubmit(async (values) => {
    setMessage("");
    try {
      const result = await api<{
        csrfToken: string;
        user: { mustChangePassword: boolean; restricted: boolean };
      }>("/auth/login", { method: "POST", body: JSON.stringify(values) });
      saveCsrf(result.csrfToken);
      router.push(
        result.user.mustChangePassword
          ? "/change-password"
          : result.user.restricted
            ? "/workspace/billing"
            : "/workspace",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed.");
    }
  });
  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <div className="brand">
          <span className="brand-mark">
            <Coffee size={20} />
          </span>{" "}
          Countertop
        </div>
        <div>
          <h1>Welcome back.</h1>
          <p>
            Sign in to your business workspace. Your organization keeps every
            branch, employee, and permission isolated from other businesses.
          </p>
        </div>
        <small>Secure sessions · Pakistan-ready defaults</small>
      </aside>
      <section className="auth-main">
        <form className="auth-form" onSubmit={submit}>
          <h2>Business sign in</h2>
          <p className="muted">
            Enter the username or email assigned to you. No business URL is
            needed.
          </p>
          {message && <Notice>{message}</Notice>}
          <Input
            label="Username or email"
            placeholder="owner or owner@example.com"
            autoComplete="username"
            error={errors.identifier?.message}
            {...register("identifier")}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <p>
            <Link className="text-link" href="/forgot-password">
              Forgot password?
            </Link>
          </p>
          <Button disabled={isSubmitting} style={{ width: "100%" }}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}
