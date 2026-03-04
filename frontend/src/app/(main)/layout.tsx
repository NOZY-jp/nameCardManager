import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { FloatingAddButton } from "@/components/common/FloatingAddButton";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense>
        <Header />
      </Suspense>
      <main>{children}</main>
      <FloatingAddButton />
    </>
  );
}
