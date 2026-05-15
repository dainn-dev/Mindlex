import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cls } from "@/lib/utils";

type Variant = "primary" | "gold" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  /**
   * When true the button is disabled and shows a spinner. To avoid stacking
   * two icons when the consumer also passes an icon inside `children`, pass
   * `loadingText` to render a clean spinner + label combo while loading.
   */
  loading?: boolean;
  loadingText?: string;
}

const map: Record<Variant, string> = {
  primary: "btn-primary",
  gold: "btn-gold",
  outline: "btn-outline",
  ghost: "btn-ghost",
  danger: "btn-danger"
};

const sizeMap: Record<Size, string> = {
  sm: "btn-sm",
  md: "",
  lg: "px-5 py-3 text-base"
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", size = "md", full, loading, loadingText, disabled, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cls(
        map[variant],
        sizeMap[size],
        full && "w-full",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1",
        className
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" size={14} aria-hidden="true" />
          {loadingText ?? null}
        </>
      ) : (
        children
      )}
    </button>
  )
);
Button.displayName = "Button";
