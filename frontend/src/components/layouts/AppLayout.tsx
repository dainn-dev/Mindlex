import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { MobileDrawer } from "@/components/ui/MobileDrawer";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

export function AppLayout() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [hasUnreadNews, setHasUnreadNews] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api.get("/news/unread-count")
      .then((r) => setHasUnreadNews(!!r.data?.hasUnread))
      .catch(() => undefined);
  }, []);

  const navItems = [
    { to: "/chatbot", label: t("nav.chatbot") },
    { to: "/news", label: t("nav.news"), badge: hasUnreadNews },
    { to: "/drive", label: t("nav.drive") },
    { to: "/account/subscription", label: t("nav.plans") }
  ];
  if (user?.roles.includes("Admin")) {
    navItems.push({ to: "/admin/users", label: t("nav.admin") });
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `relative px-3.5 py-2 rounded-md text-sm font-medium ${
      isActive ? "bg-navy-100 text-navy" : "text-slate-500 hover:bg-slate-100 hover:text-navy"
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 h-16 flex items-center gap-3 md:gap-6 sticky top-0 z-30">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("nav.menu")}
          className="md:hidden text-navy p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <Menu size={20} />
        </button>

        <Link to="/chatbot" className="flex items-center gap-2 font-display text-lg font-bold text-navy">
          <span className="w-7 h-7 bg-navy text-gold rounded-md flex items-center justify-center text-xs font-extrabold">
            M
          </span>
          {t("brand")}
          {user?.roles.includes("Admin") && (
            <span className="chip ml-2 bg-navy text-gold hidden sm:inline-flex">{t("nav.admin")}</span>
          )}
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1">
          {navItems.map((it) => (
            <NavLink key={it.to} to={it.to} className={navClass}>
              {it.label}
              {it.badge && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-3 ml-auto md:ml-0">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => navigate("/account/profile")}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-dark text-white text-sm font-bold flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            aria-label={t("nav.account")}
          >
            {user?.fullName?.[0]?.toUpperCase() ?? "?"}
          </button>
          <button
            type="button"
            onClick={logout}
            className="text-xs text-slate-500 hover:text-navy hidden sm:inline"
            title={t("nav.logout")}
          >
            {t("nav.logout")}
          </button>
        </div>
      </header>

      <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} title={t("nav.menu")}>
        {navItems.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `relative flex items-center px-3 py-2.5 rounded-md text-sm mb-0.5 ${
                isActive ? "bg-navy text-white" : "text-slate-700 hover:bg-slate-100"
              }`
            }
          >
            {it.label}
            {it.badge && (
              <span className="ml-2 w-1.5 h-1.5 bg-red-500 rounded-full" />
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => { setMenuOpen(false); logout(); }}
          className="w-full text-left flex items-center px-3 py-2.5 rounded-md text-sm text-slate-700 hover:bg-slate-100 mt-2"
        >
          {t("nav.logout")}
        </button>
      </MobileDrawer>

      <Outlet />
    </div>
  );
}
