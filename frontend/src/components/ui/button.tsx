import { forwardRef, type ButtonHTMLAttributes } from "react";
import styles from "./button.module.scss";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "ghost" | "link";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={`${styles.button} ${className ?? ""}`}
        data-variant={variant}
        data-size={size}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <span className={styles.spinner} data-loading="" />}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
