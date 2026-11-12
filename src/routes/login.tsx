import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chatError, getSession, signIn } from "@/lib/chat/api";
import { useViewer } from "@/lib/mae/viewer";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "M AND E · ورود به گفتگو" },
      { name: "description", content: "ورود به حساب گفتگوی خصوصی ماهان و الیسا" },
      { property: "og:title", content: "M AND E · ورود به گفتگو" },
      { property: "og:description", content: "ورود به حساب گفتگوی خصوصی ماهان و الیسا" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    if (await getSession()) throw redirect({ to: "/chat", search: { u: "", at: 0 } });
  },
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const viewer = useViewer();
  const accountEmail =
    viewer === "M"
      ? "mahan.r.i.p.91@gmail.com"
      : viewer === "E"
        ? "elisa.muichiro.1800@gmail.com"
        : "";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (!accountEmail) throw new Error("ابتدا کاربر برنامه را انتخاب کن.");
      await signIn(accountEmail, String(data.get("password") || ""));
      await navigate({ to: "/chat", search: { u: "", at: 0 }, replace: true });
    } catch (err) {
      setError(chatError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-8">
      <div className="anim-rise text-center">
        <p dir="ltr" className="text-xs text-muted-foreground">
          M · AND · E
        </p>
        <h1 className="mt-2 font-display text-5xl text-love">ماهان و الیسا</h1>
        <p className="mt-2 text-muted-foreground">گفتگوی خصوصی ما</p>
      </div>
      <form onSubmit={submit} className="glass anim-rise mt-8 w-full max-w-sm rounded-lg p-6">
        <LockKeyhole className="mx-auto mb-5 size-7 text-primary" />
        <p className="mb-4 text-center text-sm text-muted-foreground">
          حساب {viewer === "M" ? "ماهان" : viewer === "E" ? "الیسا" : "انتخاب‌نشده"}
        </p>
        <label htmlFor="chat-password" className="mb-2 block text-sm">
          رمز حساب
        </label>
        <div className="relative">
          <input
            id="chat-password"
            name="password"
            type={visible ? "text" : "password"}
            dir="ltr"
            autoComplete="current-password"
            required
            disabled={busy}
            className="w-full rounded-lg border border-input bg-background/60 py-2.5 pr-3 pl-12"
          />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "پنهان کردن رمز" : "نمایش رمز"}
            title={visible ? "پنهان کردن رمز" : "نمایش رمز"}
            className="absolute inset-y-0 left-1 my-auto"
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !accountEmail} className="mt-5 w-full">
          {busy ? (
            <>
              <LoaderCircle className="animate-spin" /> در حال ورود…
            </>
          ) : (
            "ورود به گفتگو"
          )}
        </Button>
      </form>
      <Button asChild variant="link" className="mt-5">
        <Link to="/unlock">ورود به خاطرات</Link>
      </Button>
    </main>
  );
}
