"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./FloatingAddButton.module.scss";

export function FloatingAddButton() {
  const pathname = usePathname();

  if (pathname === "/namecards/new" || pathname.startsWith("/namecards/new/")) {
    return null;
  }

  return (
    <Link
      href="/namecards/new"
      className={styles.fab}
      aria-label="新規名刺登録"
    >
      <Plus size={24} />
    </Link>
  );
}
