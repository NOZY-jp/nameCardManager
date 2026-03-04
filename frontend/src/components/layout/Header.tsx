"use client";

import {
  BookOpen,
  FolderTree,
  HelpCircle,
  LogOut,
  Menu,
  Moon,
  Plus,
  Sun,
  Tag,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search/SearchBar";
import { useAuth } from "@/hooks/useAuth";
import styles from "./header.module.scss";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  isPrimary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/relationships",
    label: "組織管理",
    icon: <FolderTree size={16} />,
  },
  { href: "/tags", label: "タグ管理", icon: <Tag size={16} /> },
  {
    href: "/import-export",
    label: "エクスポート/インポート",
    icon: <Upload size={16} />,
  },
  { href: "/help", label: "ヘルプ", icon: <HelpCircle size={16} /> },
];

export function Header() {
  const { resolvedTheme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const handleSearch = useCallback(
    (query: string) => {
      if (query.trim()) {
        router.push(`/namecards?search=${encodeURIComponent(query.trim())}`);
      } else {
        router.push("/namecards");
      }
    },
    [router],
  );

  useEffect(() => setMounted(true), []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    if (pathname) {
      setMobileOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const isActive = (href: string) => {
    if (href === "/namecards") {
      return pathname === "/namecards";
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <BookOpen size={20} />
          名刺管理
        </Link>

        <nav className={styles.desktopNav}>
          {NAV_ITEMS.map((item) =>
            item.isPrimary ? (
              <Link
                key={item.href}
                href={item.href}
                className={styles.primaryLink}
              >
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navLink}
                data-active={isActive(item.href) ? "true" : undefined}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className={styles.headerSearch}>
          <SearchBar onSearch={handleSearch} placeholder="名刺を検索..." />
        </div>

        <div className={styles.actions}>
          <Link
            href="/namecards/new"
            className={styles.addButton}
            aria-label="新規登録"
          >
            <Plus size={20} />
          </Link>

          {mounted ? (
            <button
              type="button"
              className={styles.themeToggle}
              onClick={toggleTheme}
              aria-label="テーマ切替"
            >
              {resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          ) : (
            <button
              type="button"
              className={styles.themeToggle}
              aria-label="テーマ切替"
            >
              <span className={styles.themeTogglePlaceholder} />
            </button>
          )}

          {user && (
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut size={16} />
              ログアウト
            </Button>
          )}

          <button
            type="button"
            className={styles.hamburger}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "メニューを閉じる" : "メニューを開く"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <button
          type="button"
          className={styles.overlay}
          onClick={closeMobile}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeMobile();
          }}
          tabIndex={-1}
          aria-label="メニューを閉じる"
        />
      )}

      <nav
        className={styles.mobileNav}
        data-open={mobileOpen ? "true" : undefined}
        aria-hidden={!mobileOpen}
      >
        <div className={styles.mobileSearch}>
          <SearchBar onSearch={(q) => { handleSearch(q); closeMobile(); }} placeholder="名刺を検索..." />
        </div>
        <ul className={styles.mobileList}>
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={
                  item.isPrimary ? styles.mobilePrimaryLink : styles.mobileLink
                }
                data-active={isActive(item.href) ? "true" : undefined}
                onClick={closeMobile}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        {user && (
          <div className={styles.mobileFooter}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout();
                closeMobile();
              }}
            >
              <LogOut size={16} />
              ログアウト
            </Button>
          </div>
        )}
      </nav>
    </>
  );
}
