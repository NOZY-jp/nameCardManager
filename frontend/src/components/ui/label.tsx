import { forwardRef, type LabelHTMLAttributes } from "react";
import styles from "./label.module.scss";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`${styles.label} ${className ?? ""}`}
        data-required={required ? "true" : undefined}
        {...props}
      />
    );
  },
);

Label.displayName = "Label";
