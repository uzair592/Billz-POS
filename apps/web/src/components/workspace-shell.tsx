"use client";

import {
  Building2,
  ClipboardList,
  Coffee,
  LogOut,
  Menu,
  Settings,
  Shield,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const navigation = [
  {
    href: "/workspace/billing",
    label: "Subscription & billing",
    icon: ClipboardList,
  },
  { href: "/workspace", label: "Overview", icon: Building2 },
  { href: "/workspace/branches", label: "Branches", icon: Building2 },
  { href: "/workspace/employees", label: "Employees", icon: Users },
  { href: "/workspace/roles", label: "Roles & permissions", icon: Shield },
  { href: "/workspace/audit", label: "Audit log", icon: ClipboardList },
  { href: "/workspace/settings", label: "Settings & devices", icon: Settings },
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const session = useQuery({
    queryKey: ["workspace-session"],
    queryFn: () =>
      api<{ user: { isOwner: boolean; restricted: boolean } }>("/auth/session"),
    refetchInterval: 30000,
  });

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    sessionStorage.removeItem("csrf");
    router.push("/login");
  }

  const links = (
    <nav aria-label="Workspace navigation">
      {navigation
        .filter(
          (item) =>
            (!session.data?.user.restricted ||
              item.href === "/workspace/billing") &&
            (item.href !== "/workspace/billing" || session.data?.user.isOwner),
        )
        .map(({ href, label, icon: Icon }) => {
          const active =
            href === "/workspace"
              ? pathname === href
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={active ? "active" : ""}
              onClick={() => setOpen(false)}
            >
              <Icon size={18} /> {label}
            </Link>
          );
        })}
    </nav>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Coffee size={20} />
          </span>{" "}
          Countertop
        </div>
        {links}
        <button className="button sidebar-signout" onClick={logout}>
          <LogOut size={16} /> Sign out
        </button>
      </aside>
      <header className="mobile-header">
        <div className="brand">
          <span className="brand-mark">
            <Coffee size={18} />
          </span>{" "}
          Countertop
        </div>
        <button
          className="icon-button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <Menu />
        </button>
      </header>
      {open && (
        <button
          className="drawer-backdrop"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        className={`mobile-drawer ${open ? "open" : ""}`}
        aria-hidden={!open}
      >
        <div className="drawer-head">
          <div className="brand">
            <span className="brand-mark">
              <Coffee size={18} />
            </span>{" "}
            Countertop
          </div>
          <button
            className="icon-button dark-icon"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        {links}
        <button className="button sidebar-signout" onClick={logout}>
          <LogOut size={16} /> Sign out
        </button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
