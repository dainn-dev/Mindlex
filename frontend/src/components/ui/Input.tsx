import { InputHTMLAttributes, forwardRef } from "react";
import { cls } from "@/lib/utils";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className, id, ...rest }, ref) => {
    const inputId = id ?? rest.name;
    return (
      <div className="mb-3.5">
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cls("input", error && "border-red-500", className)}
          aria-invalid={!!error}
          {...rest}
        />
        {error && <div className="field-error">{error}</div>}
      </div>
    );
  }
);
Input.displayName = "Input";
