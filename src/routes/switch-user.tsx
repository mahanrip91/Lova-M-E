import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Capacitor } from "@capacitor/core";
import { lockNative } from "@/lib/native-gate";
import { lockSite } from "@/lib/gate.functions";
import { setViewer } from "@/lib/mae/viewer";
import { resetGateCache } from "./__root";
import { PageHeader } from "@/components/mae/Nav";

export const Route = createFileRoute("/switch-user")({
  head: () => ({ meta: [{ title: "M AND E · تعویض کاربر" }] }),
  component: SwitchUser,
});

function SwitchUser() {
  const router = useRouter();
  const lock = useServerFn(lockSite);

  async function changeUser() {
    if (Capacitor.isNativePlatform()) lockNative();
    else await lock();
    resetGateCache();
    setViewer(null);
    await router.navigate({ to: "/unlock" });
  }

  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader title="تعویض کاربر" subtitle="خروج از پروفایل فعلی و انتخاب ماهان یا الیسا" />
      <section className="glass rounded-3xl p-5">
        <p className="text-sm text-muted-foreground">برای تغییر کاربر، نشست فعلی قفل می‌شود و صفحهٔ انتخاب کاربر باز خواهد شد.</p>
        <button type="button" onClick={() => void changeUser()} className="mt-4 w-full rounded-full bg-love px-5 py-3 font-bold text-primary-foreground">خروج و انتخاب کاربر</button>
      </section>
    </main>
  );
}
