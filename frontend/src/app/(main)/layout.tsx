import { Suspense } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { FloatingAddButton } from "@/components/common/FloatingAddButton";
import { Header } from "@/components/layout/Header";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <Suspense>
        <Header />
      </Suspense>
      <main>{children}</main>
      <FloatingAddButton />
    </AuthGuard>
  );
}
