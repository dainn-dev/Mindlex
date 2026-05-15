import { Link, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

export function PublicLayout() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-navy to-navy-600 text-white">
      <header className="px-4 md:px-6 py-4 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 font-display text-lg md:text-xl font-bold">
          <span className="w-8 h-8 bg-navy-700 text-gold rounded-md flex items-center justify-center text-sm font-extrabold">
            M
          </span>
          {t("brand")}
        </Link>
        <nav className="flex items-center gap-2 md:gap-3">
          <LanguageSwitcher theme="light" />
          <Link to="/login" className="btn-ghost text-white hover:bg-white/10">
            {t("auth.signIn")}
          </Link>
          <Link to="/register" className="btn-gold">
            {t("auth.signUp")}
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-navy-900 px-4 md:px-6 py-5 text-xs text-slate-300 text-center">
        © {year} MINDLEX LIMITED ·{" "}
        <Link to="/terms" className="text-gold mx-2">{t("footer.terms")}</Link>·
        <Link to="/privacy" className="text-gold mx-2">{t("footer.privacy")}</Link>·
        <Link to="/usage" className="text-gold mx-2">{t("footer.usage")}</Link>
      </footer>
    </div>
  );
}
