"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "../lib/api";

export type SessionUser = { id: string; fullName: string; email: string; role: string };

const SessionContext = createContext<SessionUser | null>(null);

/** The signed-in user, or null while the session is still loading. */
export function useSession() {
  return useContext(SessionContext);
}

type NavItem = { label: string; href: string; hideFor?: (role: string) => boolean };
type NavGroup = { heading: string; items: NavItem[] };

const notAdminPersonnel = (role: string) => role === "ADMIN_PERSONNEL";
const notOwner = (role: string) => role !== "COMPANY_OWNER";

export const navGroups: NavGroup[] = [
  { heading: "WORKSPACE", items: [{ label: "Overview", href: "/" }, { label: "My account", href: "/account" }] },
  { heading: "PEOPLE", items: [
    { label: "Employees", href: "/employees" },
    { label: "Documents", href: "/documents" },
    { label: "Posting sites", href: "/postings" }
  ] },
  { heading: "TIME & LEAVE", items: [
    { label: "Leave register", href: "/leave" },
    { label: "Weekend overtime", href: "/overtime" },
    { label: "Work calendar", href: "/calendar" }
  ] },
  { heading: "RECORDS & REPORTS", items: [
    { label: "Disciplinary records", href: "/disciplinary", hideFor: notAdminPersonnel },
    { label: "Recommendations", href: "/recommendations", hideFor: notAdminPersonnel },
    { label: "Reports", href: "/reports" }
  ] },
  { heading: "ADMINISTRATION", items: [
    { label: "User administration", href: "/users", hideFor: notOwner },
    { label: "Audit log", href: "/audit", hideFor: notOwner }
  ] }
];

const roleLabels: Record<string, string> = {
  COMPANY_OWNER: "Company Owner",
  HR_MANAGER: "HR Manager",
  ADMIN_PERSONNEL: "Administrative Personnel"
};

export function roleLabel(role: string) {
  return roleLabels[role] ?? role.replaceAll("_", " ").toLowerCase();
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

type Health = "checking" | "online" | "offline";

function useHealth(): Health {
  const [health, setHealth] = useState<Health>("checking");
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const result = await api<{ status?: string }>("/health");
        if (active) setHealth(result?.status === "ok" ? "online" : "offline");
      } catch {
        if (active) setHealth("offline");
      }
    }
    void check();
    const timer = window.setInterval(check, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return health;
}

const healthText: Record<Health, string> = { checking: "Checking system…", online: "All systems operational", offline: "Service unavailable" };

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const health = useHealth();
  const bare = pathname === "/login" || pathname.startsWith("/login/");

  useEffect(() => {
    if (bare) return;
    let active = true;
    api<{ user: SessionUser }>("/auth/me")
      .then(result => { if (active) setUser(result.user); })
      .catch(() => { /* a 401 is redirected to /login by the API client; other failures leave pages to show their own errors */ });
    return () => { active = false; };
  }, [bare]);

  if (bare) return <>{children}</>;

  const role = user?.role ?? "";
  const current = navGroups.flatMap(group => group.items).find(item => isActive(pathname, item.href));
  const initials = (user?.fullName ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");

  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); }
  }

  return (
    <SessionContext.Provider value={user}>
      <div className="layout">
        <aside className="sidebar">
          <Link href="/" className="brand" aria-label="CIT Business Solutions — home">
            <img src="/brand/cit-logo-white.png" alt="" className="brand-logo" />
            <div><strong>CIT-LMS</strong><small>People administration</small></div>
          </Link>
          <nav className="side-nav" aria-label="Main">
            {navGroups.map(group => {
              const items = group.items.filter(item => !(user && item.hideFor?.(role)));
              if (!items.length) return null;
              return (
                <div className="nav-group" key={group.heading}>
                  <p className="nav-heading">{group.heading}</p>
                  {items.map(item => (
                    <Link key={item.href} href={item.href} className={`nav-link${isActive(pathname, item.href) ? " active" : ""}`} aria-current={isActive(pathname, item.href) ? "page" : undefined}>{item.label}</Link>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="sidebar-foot" role="status"><span className={`dot dot-${health}`} /> {healthText[health]}</div>
        </aside>
        <section className="main">
          <header className="topbar">
            <span className="crumbs">CIT Business Solutions <span className="muted">/</span> <strong>{current?.label ?? "Workspace"}</strong></span>
            <div className="top-actions">
              {user && (
                <span className="user-chip">
                  <b className="avatar" aria-hidden="true">{initials || "•"}</b>
                  <span className="user-meta"><strong>{user.fullName}</strong><small>{roleLabel(user.role)}</small></span>
                </span>
              )}
              <button className="text-button" onClick={logout}>Sign out</button>
            </div>
          </header>
          {children}
        </section>
      </div>
    </SessionContext.Provider>
  );
}
