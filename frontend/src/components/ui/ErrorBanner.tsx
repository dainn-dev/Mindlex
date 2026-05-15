import { AlertCircle } from "lucide-react";

interface Props {
  message: string;
  kind?: "danger" | "warn" | "info";
}

const variants = {
  danger: "bg-red-50 border-red-200 text-red-800",
  warn: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-blue-50 border-blue-200 text-blue-800"
};

export function ErrorBanner({ message, kind = "danger" }: Props) {
  return (
    <div
      className={`flex items-start gap-2 px-3.5 py-3 rounded-md border text-sm ${variants[kind]} mb-4`}
      role="alert"
    >
      <AlertCircle size={18} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}
