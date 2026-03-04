import Link from "next/link";
import { Plus } from "lucide-react";
import styles from "./FloatingAddButton.module.scss";

export function FloatingAddButton() {
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
