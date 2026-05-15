import { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="text-center py-12 px-6">
      <div className="w-16 h-16 mx-auto rounded-full bg-gold/15 text-navy text-3xl flex items-center justify-center mb-4">
        {icon}
      </div>
      <h4 className="text-navy text-lg font-semibold mb-1">{title}</h4>
      {description && (
        <p className="text-slate-500 text-sm max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}
