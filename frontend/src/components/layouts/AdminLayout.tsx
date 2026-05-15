import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, CreditCard, BarChart3, Menu } from "lucide-react";
import { MobileDrawer } from "@/components/ui/MobileDrawer";

export function AdminLayout() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = [
    { to: "/admin/users", label: t("nav.users"), icon: Users },
    { to: "/admin/subscriptions", label: t("nav.subscriptions"), icon: CreditCard },
    { to: "/admin/analytics", label: t("nav.analytics"), icon: BarChart3 }
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
    </>
  );

  return (
    <div className="md:grid md:grid-cols-[230px_1fr] min-h-[calc(100vh-64px)]">
      <aside className="bg-white border-r border-slate-200 p-4 hidden md:block">
        <div className="text-xs font-semibold uppercase text-slate-400 px-2.5 py-2 tracking-wider">
          {t("nav.admin")}
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
          <Menu size={18} /> {t("nav.admin")}
        </button>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={t("nav.admin")}>
        {nav(true)}
      </MobileDrawer>

      <main className="p-4 md:p-7">
        <Outlet />
      </main>
    </div>
  );
}
