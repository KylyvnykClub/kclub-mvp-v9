"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const t = useTranslations("common");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-16" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative flex h-8 w-16 shrink-0 cursor-pointer items-center rounded-full bg-zinc-900 p-1 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-white"
      aria-label={t("toggleTheme")}
      type="button"
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 text-white dark:text-zinc-900">
        <Sun
          className={`size-4 transition-opacity duration-300 ${isDark ? "opacity-100" : "opacity-0"}`}
        />
        <Moon
          className={`size-4 transition-opacity duration-300 ${isDark ? "opacity-0" : "opacity-100"}`}
        />
      </div>
      <div
        className={`z-10 size-6 rounded-full bg-white transition-transform duration-300 dark:bg-zinc-900 ${
          isDark ? "translate-x-8" : "translate-x-0"
        }`}
      />
    </button>
  );
}
