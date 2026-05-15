import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { User as UserIcon, CreditCard, Wallet, Shield, LogOut, Menu } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { MobileDrawer } from "@/components/ui/MobileDrawer";

export function AccountLayout() {
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = [
    { to: "/account/profile", label: t("nav.profile"), icon: UserIcon },
    { to: "/account/subscription", label: t("nav.subscription"), icon: CreditCard },
    { to: "/account/billing", label: t("nav.billing"), icon: Wallet },
    { to: "/account/privacy", label: t("nav.privacy"), icon: Shield }
  ];

  const nav = (closeOnClick = false) => (
    <>
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          onClick={closeOnClick ? () => setDrawerOpen(false) : undefined}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm mb-0.5 ${
              isActive ? "bg-navy text-white" : "text-slate-700 hover:bg-slate-100"
            }`
          }
        >
          <it.icon size={16} /> {it.label}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={logout}
        className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100 mt-2"
      >
        <LogOut size={16} /> {t("nav.logout")}
      </button>
    </>
  );

  return (
    <div className="md:grid md:grid-cols-[230px_1fr] min-h-[calc(100vh-64px)]">
      <aside className="bg-white border-r border-slate-200 p-4 hidden md:block">
        <div className="text-xs font-semibold uppercase text-slate-400 px-2.5 py-2 tracking-wider">
          {t("nav.account")}
        </div>
        {nav()}
      </aside>

      <div className="md:hidden flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("nav.menu")}
          className="flex items-center gap-2 text-sm text-navy font-semibold rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <Menu size={18} /> {t("nav.account")}
        </button>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={t("nav.account")}>
        {nav(true)}
      </MobileDrawer>

      <main className="p-4 md:p-7">
        <Outlet />
      </main>
    </div>
  );
}
