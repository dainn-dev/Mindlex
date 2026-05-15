import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";

interface Lang {
  code: string;
  label: string;
}

const LANGS: Lang[] = [
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" }
];

interface Props {
  /** Color theme: 'navy' for light backgrounds, 'light' for dark backgrounds */
  theme?: "navy" | "light";
}

export function LanguageSwitcher({ theme = "navy" }: Props) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage ?? "en";
  const currentLabel = LANGS.find((l) => l.code === current)?.code.toUpperCase() ?? "EN";

  const triggerClass = theme === "navy"
    ? "text-slate-500 hover:text-navy"
    : "text-white/80 hover:text-white";

  return (
    <Dropdown
      width="w-36"
      align="right"
      menuLabel={t("language")}
      trigger={({ toggle, open, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t("language")}
          className={`flex items-center gap-1 text-xs font-medium rounded px-2 py-1 ${triggerClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-gold`}
        >
          <Globe size={14} /> {currentLabel}
        </button>
      )}
      items={LANGS.map((l) => ({
        key: l.code,
        label: (
          <span className={l.code === current ? "font-semibold text-navy" : ""}>
            {l.label}
          </span>
        ),
        onSelect: () => i18n.changeLanguage(l.code)
      }))}
    />
  );
}
