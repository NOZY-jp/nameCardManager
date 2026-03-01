import { forwardRef, type InputHTMLAttributes } from "react";
import styles from "./input.module.scss";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className={styles.inputWrapper}>
        <input
          ref={ref}
          className={`${styles.input} ${className ?? ""}`}
          aria-invalid={error ? "true" : undefined}
          {...props}
        />
        {error && <span className={styles.errorMessage}>{error}</span>}
      </div>
    );
  },
);

Input.displayName = "Input";
