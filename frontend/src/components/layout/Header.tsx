"use client";

import {
  BookOpen,
  CreditCard,
  FolderTree,
  HelpCircle,
  LogOut,
  Menu,
  Moon,
  Sun,
  Tag,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { SearchBar } from "@/components/search/SearchBar";
import { Button } from "@/components/ui/button";
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
    href: "/namecards",
    label: "名刺一覧",
    icon: <CreditCard size={16} />,
    isPrimary: true,
  },
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
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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
        <Link href="/namecards" className={styles.brand}>
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
                <span className={styles.navLinkIcon}>{item.icon}</span>
                <span className={styles.navLinkLabel}>{item.label}</span>
              </Link>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navLink}
                data-active={isActive(item.href) ? "true" : undefined}
              >
                <span className={styles.navLinkIcon}>{item.icon}</span>
                <span className={styles.navLinkLabel}>{item.label}</span>
              </Link>
            ),
          )}
        </nav>

        <div className={styles.searchWrapper}>
          <SearchBar
            onSearch={handleSearch}
            placeholder="名刺を検索..."
            initialValue={searchParams.get("search") ?? ""}
          />
        </div>

        <div className={styles.actions}>
          {mounted ? (
            <button
              type="button"
              className={`${styles.themeToggle} ${styles.themeToggleDesktop}`}
              onClick={toggleTheme}
              aria-label="テーマ切替"
            >
              {resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.themeToggle} ${styles.themeToggleDesktop}`}
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
        <div className={styles.mobileSearchWrapper}>
          <SearchBar
            onSearch={(query) => {
              handleSearch(query);
              closeMobile();
            }}
            placeholder="名刺を検索..."
            initialValue={searchParams.get("search") ?? ""}
          />
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
          <li>
            {mounted ? (
              <button
                type="button"
                className={styles.mobileThemeToggle}
                onClick={toggleTheme}
              >
                {resolvedTheme === "dark" ? (
                  <Sun size={16} />
                ) : (
                  <Moon size={16} />
                )}
                {resolvedTheme === "dark" ? "ライトモード" : "ダークモード"}
              </button>
            ) : (
              <button
                type="button"
                className={styles.mobileThemeToggle}
                disabled
              >
                <span className={styles.themeTogglePlaceholder} />
                テーマ切替
              </button>
            )}
          </li>
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
