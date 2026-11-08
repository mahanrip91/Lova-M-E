import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  redirect,
  useLocation,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { initStore } from "@/lib/mae/store";
import { BottomNav } from "@/components/mae/Nav";
import { getGate, type Viewer } from "@/lib/gate.functions";
import { applyTheme, setViewer, useTheme, useViewer } from "@/lib/mae/viewer";
import { bypassArchiveGate } from "@/lib/chat/routing";
import { supabase } from "@/lib/supabase";

// Client-side cache of the server gate result so navigation stays instant.
let gateCache: { unlocked: boolean; viewer: Viewer | null } | null = null;
export function resetGateCache() { gateCache = null; }

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass max-w-md rounded-3xl p-8 text-center">
        <h1 className="font-display text-6xl text-love">۴۰۴</h1>
        <p className="mt-3 text-muted-foreground">این صفحه در کهکشان ما پیدا نشد.</p>
        <Link to="/" className="mt-6 inline-block rounded-full bg-love px-5 py-2 text-primary-foreground">
          بازگشت به خانه
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass max-w-md rounded-3xl p-8 text-center">
        <h1 className="text-xl font-bold">این صفحه بارگذاری نشد</h1>
        <p className="mt-2 text-sm text-muted-foreground">مشکلی پیش آمد. دوباره امتحان کن.</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-full bg-love px-5 py-2 text-primary-foreground"
        >
          تلاش دوباره
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#07061a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "M AND E" },
      { name: "robots", content: "noindex, nofollow" },
      { title: "M AND E" },
      { name: "description", content: "دفتر خاطرات کیهانی ماهان و الیسا" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/icons/icon-180.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Lalezar&family=Vazirmatn:wght@300;400;600;800&display=swap" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    if (bypassArchiveGate(location.pathname)) return { viewer: null as Viewer | null };
    const g = (typeof window !== "undefined" && gateCache) || (await getGate());
    if (typeof window !== "undefined") gateCache = g.unlocked ? g : null;
    if (!g.unlocked || !g.viewer) throw redirect({ to: "/unlock" });
    return { viewer: g.viewer as Viewer | null };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const router = useRouter();
  const { queryClient, viewer: ctxViewer } = Route.useRouteContext();
  const path = useLocation({ select: (l) => l.pathname });
  const viewer = useViewer();
  const theme = useTheme();
  useEffect(() => { setViewer(ctxViewer); }, [ctxViewer]);
  useEffect(() => { applyTheme(viewer, theme); }, [viewer, theme]);
  useEffect(() => {
    if (ctxViewer) initStore();
  }, [ctxViewer]);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (router.state.location.pathname !== "/chat" && router.state.location.pathname !== "/login") return;
      // Leave the synchronous Auth callback before revalidation requests.
      setTimeout(() => {
        if (event === "SIGNED_OUT") {
          void queryClient.cancelQueries().then(() => {
            queryClient.clear();
            void router.navigate({ to: "/login", replace: true });
          });
        } else { void router.invalidate(); }
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, [queryClient, router]);
  return (
    <QueryClientProvider client={queryClient}>
      <div className="starfield" aria-hidden />
      <div className={`relative z-10 min-h-screen ${bypassArchiveGate(path) ? "" : "pb-24"}`}>
        <Outlet />
      </div>
      {!bypassArchiveGate(path) && <BottomNav />}
    </QueryClientProvider>
  );
}
