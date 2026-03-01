import type { RenderOptions } from "@testing-library/react";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

// TODO: wrap with AuthProvider, ToastProvider, ThemeProvider once created
function AllProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { renderWithProviders };
export { default as userEvent } from "@testing-library/user-event";
