import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PageHeader } from "@/components/mae/Nav";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { getMyProfile } from "@/lib/chat/api";
import { disablePushNotifications, enablePushNotifications, getPushEnabled } from "@/lib/push";
import { Camera, Mic, Settings, Download, RefreshCw, Smartphone } from "lucide-react";

type NativeTools = {
  getMediaPermissions(): Promise<{ camera: string; microphone: string }>;
  requestMediaPermissions(): Promise<{ camera: string; microphone: string }>;
  openAppSettings(): Promise<void>;
  getAppInfo(): Promise<{ version: string; platform: string }>;
  downloadAndInstall(options: { url: string }): Promise<void>;
};

const Native = registerPlugin<NativeTools>("NativeTools");

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "M AND E · تنظیمات" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [permissions, setPermissions] = useState({ camera: "نامشخص", microphone: "نامشخص" });
  const [version, setVersion] = useState("1.1.0");
  const [latest, setLatest] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const native = Capacitor.isNativePlatform();

  async function refresh() {
    if (!native) return;
    try {
      const [p, info] = await Promise.all([
        Native.getMediaPermissions(),
        Native.getAppInfo(),
      ]);
      setPermissions(p);
      setVersion(info.version || "نامشخص");
    } catch {
      setMessage("دریافت اطلاعات برنامه ممکن نشد.");
    }
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    let active = true;
    if (!native) return () => { active = false; };

    void getMyProfile().then(async (profile) => {
      if (!active || !profile) return;
      setProfileId(profile.id);
      const enabled = await getPushEnabled(profile.id);
      if (active) setPushEnabled(enabled);
    }).catch(() => {
      if (active) setProfileId(null);
    });

    return () => { active = false; };
  }, [native]);

  async function togglePush() {
    if (!profileId) {
      setMessage("برای فعال‌کردن اعلان‌ها، اول وارد گفتگوی خودت شو.");
      return;
    }

    setPushBusy(true);
    setMessage("");
    try {
      if (pushEnabled) {
        await disablePushNotifications(profileId);
        setPushEnabled(false);
        setMessage("اعلان‌های این دستگاه خاموش شد.");
      } else {
        await enablePushNotifications(profileId);
        setPushEnabled(true);
        setMessage("اعلان پیام‌های جدید فعال شد. 🔔");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تنظیم اعلان‌ها ناموفق بود.");
    } finally {
      setPushBusy(false);
    }
  }

  async function requestPermissions() {
    setBusy(true);
    setMessage("");
    try {
      await Native.requestMediaPermissions();
      await refresh();
      setMessage("درخواست مجوزها انجام شد.");
    } catch {
      setMessage("برای فعال‌سازی مجوزها، تنظیمات برنامه را بررسی کن.");
    } finally {
      setBusy(false);
    }
  }

  async function checkUpdate() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        "https://raw.githubusercontent.com/mahanrip91/Lova-M-E/main/public/update.json",
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("update");
      const data = await response.json();
      setLatest(data.versionName || "");
      setMessage(data.versionName && data.versionName !== version
        ? `نسخه جدید ${data.versionName} در دسترس است.`
        : "برنامه به‌روز است.");
    } catch {
      setMessage("بررسی به‌روزرسانی انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function installUpdate() {
    setBusy(true);
    setMessage("");
    try {
      await Native.downloadAndInstall({
        url: "https://github.com/mahanrip91/Lova-M-E/releases/latest/download/M-AND-E.apk",
      });
      setMessage("دانلود شروع شد؛ پس از پایان، نصب‌کننده باز می‌شود.");
    } catch {
      setMessage("دانلود یا اجرای نصب‌کننده ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-32">
      <PageHeader title="تنظیمات" subtitle="مدیریت برنامه و دسترسی‌ها" />

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <Link to="/import" className="glass rounded-3xl p-4">
          <h2 className="font-bold">مدیریت آرشیو</h2>
          <p className="mt-1 text-xs text-muted-foreground">منابع، فرستنده‌ها و وضعیت آرشیو</p>
        </Link>
        <Link to="/theme" className="glass rounded-3xl p-4">
          <h2 className="font-bold">تم و رنگ‌ها</h2>
          <p className="mt-1 text-xs text-muted-foreground">ساخت، ذخیره و اشتراک تم</p>
        </Link>
        <Link to="/switch-user" className="glass rounded-3xl p-4">
          <h2 className="font-bold">تعویض کاربر</h2>
          <p className="mt-1 text-xs text-muted-foreground">تغییر پروفایل ماهان یا الیسا</p>
        </Link>
      </section>


      <section className="glass mb-4 rounded-3xl p-4">
        <div className="mb-4 flex items-center gap-3">
          <Smartphone className="size-6 text-primary" />
          <div>
            <h2 className="font-bold">اطلاعات برنامه</h2>
            <p className="text-xs text-muted-foreground">M AND E · نسخه {version}</p>
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 size-4" /> تازه‌سازی اطلاعات
        </Button>
      </section>

      <section className="glass mb-4 rounded-3xl p-4">
        <h2 className="mb-4 font-bold">دسترسی‌ها</h2>
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm"><Camera className="size-4" /> دوربین</span>
          <span className="text-xs text-muted-foreground">{permissions.camera}</span>
        </div>
        <div className="mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm"><Mic className="size-4" /> میکروفون</span>
          <span className="text-xs text-muted-foreground">{permissions.microphone}</span>
        </div>
        <Button className="w-full" disabled={!native || busy} onClick={() => void requestPermissions()}>
          درخواست مجوز دوربین و میکروفون
        </Button>
        <Button variant="outline" className="mt-2 w-full" disabled={!native} onClick={() => void Native.openAppSettings()}>
          <Settings className="mr-2 size-4" /> تنظیمات مجوزهای اندروید
        </Button>
      </section>


      <section className="glass mb-4 rounded-3xl p-4">
        <div className="mb-3 flex items-center gap-3">
          {pushEnabled ? <Bell className="size-5 text-primary" /> : <BellOff className="size-5 text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">اعلان پیام‌های جدید</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {pushEnabled ? "اعلان این دستگاه روشن است." : "وقتی پیام جدیدی برسد، باخبر می‌شوی."}
            </p>
          </div>
          <span className={pushEnabled ? "text-xs text-primary" : "text-xs text-muted-foreground"}>
            {pushEnabled ? "روشن" : "خاموش"}
          </span>
        </div>
        {profileId ? (
          <Button className="w-full" variant={pushEnabled ? "outline" : "default"} disabled={!native || pushBusy} onClick={() => void togglePush()}>
            {pushBusy ? "در حال ثبت…" : pushEnabled ? "خاموش‌کردن اعلان‌ها" : "فعال‌کردن اعلان‌ها"}
          </Button>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">ورود به گفتگو برای فعال‌سازی</Link>
          </Button>
        )}
        {!native && <p className="mt-2 text-xs text-muted-foreground">این قابلیت در نسخه اندروید فعال می‌شود.</p>}
      </section>

      <section className="glass rounded-3xl p-4">
        <h2 className="mb-2 font-bold">به‌روزرسانی برنامه</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          نسخه نصب‌شده: {version}{latest ? ` · آخرین نسخه: ${latest}` : ""}
        </p>
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => void checkUpdate()}>
          <RefreshCw className="mr-2 size-4" /> بررسی نسخه جدید
        </Button>
        {latest && latest !== version && (
          <Button className="mt-2 w-full" disabled={busy || !native} onClick={() => void installUpdate()}>
            <Download className="mr-2 size-4" /> دانلود و نصب نسخه جدید
          </Button>
        )}
      </section>

      {message && <p role="status" className="mt-4 text-center text-sm text-muted-foreground">{message}</p>}
    </main>
  );
}
