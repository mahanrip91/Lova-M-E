import { Link } from "@tanstack/react-router";
import { Home, MessagesSquare, Orbit, Search, Star, Settings } from "lucide-react";

const items = [
  { to: "/", label: "خانه", icon: Home },
  { to: "/timeline", label: "تایم‌لاین", icon: MessagesSquare },
  { to: "/explore", label: "سفر در زمان", icon: Orbit },
  { to: "/search", label: "جستجو", icon: Search },
  { to: "/bookmarks", label: "نشان‌ها", icon: Star },
  { to: "/settings", label: "تنظیمات", icon: Settings },
] as const;

export function BottomNav() {
  return (
    <nav aria-label="ناوبری اصلی" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <ul className="glass mx-auto flex max-w-lg items-center justify-around rounded-full px-2 py-1.5">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex flex-col items-center gap-0.5 rounded-full px-3 py-1.5 text-[11px] text-muted-foreground transition-colors data-[status=active]:text-primary"
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <header className="mx-auto flex max-w-3xl items-end justify-between gap-3 px-4 pt-8 pb-4">
      <div className="anim-rise">
        <h1 className="font-display text-3xl text-love">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
