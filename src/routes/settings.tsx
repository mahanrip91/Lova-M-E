import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  fetchUpdateManifest,
  formatBytes,
  isBelowMinimum,
  isNewerVersion,
  type UpdateManifest,
} from "@/lib/update-manifest";
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
  getAppInfo(): Promise<{ version: string; versionCode?: number; platform: string }>;
  getUpdateNotificationStatus(): Promise<{ permission: string; enabled: boolean }>;
  requestUpdateNotificationPermission(): Promise<{ permission: string; enabled: boolean }>;
  showTestNotification(): Promise<{ sent: boolean }>;
  downloadSmartAndInstall(): Promise<{
    status: string;
    verified: boolean;
    method: "delta" | "full";
    fallbackReason?: string;
  }>;
  addListener(
    eventName: "updateProgress",
    listenerFunc: (progress: UpdateProgress) => void,
  ): Promise<{ remove(): Promise<void> }>;
};

type UpdateProgress = {
  stage: "checking" | "downloading" | "rebuilding" | "verifying" | "fallback";
  method: "delta" | "full" | "";
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
};

const Native = registerPlugin<NativeTools>("NativeTools");

function exactBytes(bytes: number): string {
  const value = Math.max(0, Math.floor(bytes));
  const kb = value / 1024;
  return `${value.toLocaleString("fa-IR")} بایت (${kb.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلوبایت)`;
}

function progressLabel(progress: UpdateProgress): string {
  if (progress.stage === "checking") return "در حال بررسی نسخه و سازگاری پچ…";
  if (progress.stage === "fallback") return "پچ قابل استفاده نبود؛ دریافت APK کامل شروع می‌شود…";
  if (progress.stage === "rebuilding") return "دانلود تمام شد؛ در حال بازسازی APK از روی پچ…";
  if (progress.stage === "verifying") return "در حال بررسی صحت فایل و امضای برنامه…";
  return progress.method === "delta"
    ? "در حال دریافت پچ کم‌حجم داخل برنامه…"
    : "در حال دریافت APK کامل داخل برنامه…";
}

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "M AND E · تنظیمات" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [permissions, setPermissions] = useState({ camera: "نامشخص", microphone: "نامشخص" });
  const [version, setVersion] = useState("1.1.0");
  const [versionCode, setVersionCode] = useState<number | null>(null);
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);
  const [lastCheck, setLastCheck] = useState<{ at: string; result: string } | null>(null);
  const [notif, setNotif] = useState<{ permission: string; enabled: boolean } | null>(null);
  const updatesRef = useRef<HTMLElement>(null);
  const hash = useLocation({ select: (l) => l.hash });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const native = Capacitor.isNativePlatform();

  async function refresh() {
    if (!native) return;
    try {
      const [p, info] = await Promise.all([Native.getMediaPermissions(), Native.getAppInfo()]);
      setPermissions(p);
      setVersion(info.version || "نامشخص");
      setVersionCode(typeof info.versionCode === "number" ? info.versionCode : null);
      setNotif(await Native.getUpdateNotificationStatus().catch(() => null));
    } catch {
      setMessage("دریافت اطلاعات برنامه ممکن نشد.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mae.update.lastCheck");
      if (raw) setLastCheck(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (hash !== "updates") return;
    const el = updatesRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, [hash]);

  useEffect(() => {
    let active = true;
    if (!native)
      return () => {
        active = false;
      };

    void getMyProfile()
      .then(async (profile) => {
        if (!active || !profile) return;
        setProfileId(profile.id);
        const enabled = await getPushEnabled(profile.id);
        if (active) setPushEnabled(enabled);
      })
      .catch(() => {
        if (active) setProfileId(null);
      });

    return () => {
      active = false;
    };
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
        await refresh();
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

  function recordCheck(result: string) {
    const entry = { at: new Date().toISOString(), result };
    setLastCheck(entry);
    try {
      localStorage.setItem("mae.update.lastCheck", JSON.stringify(entry));
    } catch {
      /* ignore */
    }
  }

  async function checkUpdate() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetchUpdateManifest();
      if (res.ok) setManifest(res.manifest);
      else setManifest(null);
      const result =
        res.ok && isNewerVersion(res.manifest, versionCode)
          ? "به‌روزرسانی برنامه " + res.manifest.versionName + " آماده است."
          : res.ok
            ? "برنامه به‌روز است."
            : res.error;
      recordCheck(result);
      setMessage(result);
    } catch {
      const result = "بررسی به‌روزرسانی ناموفق بود.";
      recordCheck(result);
      setMessage(result);
    } finally {
      setBusy(false);
    }
  }

  async function requestNotificationPermission() {
    setBusy(true);
    try {
      const st = await Native.requestUpdateNotificationPermission();
      setNotif(st);
      setMessage(
        st.enabled
          ? "اعلان نسخهٔ جدید فعال است."
          : "اجازهٔ اعلان داده نشد؛ از تنظیمات اندروید فعالش کن.",
      );
    } catch {
      setMessage("درخواست اجازهٔ اعلان ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function installUpdate() {
    const apkAvailable = manifest != null && isNewerVersion(manifest, versionCode);
    if (!apkAvailable) return;
    setBusy(true);
    setUpdateProgress({
      stage: "checking",
      method: "",
      downloadedBytes: 0,
      totalBytes: 0,
      percent: 0,
    });
    let progressListener: { remove(): Promise<void> } | null = null;
    try {
      progressListener = await Native.addListener("updateProgress", (progress) =>
        setUpdateProgress(progress),
      );
      setMessage("دریافت امن به‌روزرسانی داخل برنامه شروع شد…");
      const r = await Native.downloadSmartAndInstall();
      setUpdateProgress((current) =>
        current ? { ...current, stage: "verifying", percent: 100 } : current,
      );
      setMessage(
        r.method === "delta"
          ? "پچ کم‌حجم اعمال و APK جدید بازسازی و بررسی شد؛ نصب را در پنجرهٔ اندروید تأیید کن."
          : r.fallbackReason
            ? `پچ قابل اعمال نبود: ${r.fallbackReason} فایل کامل دریافت و بررسی شد؛ نصب را در پنجرهٔ اندروید تأیید کن.`
            : "APK کامل دریافت و بررسی شد؛ نصب را در پنجرهٔ اندروید تأیید کن.",
      );
    } catch (e) {
      setMessage(e instanceof Error && e.message ? e.message : "به‌روزرسانی ناموفق بود.");
    } finally {
      await progressListener?.remove().catch(() => undefined);
      setBusy(false);
    }
  }

  const apkAvailable = manifest != null && isNewerVersion(manifest, versionCode);
  const hasUpdate = apkAvailable;
  const size = manifest
    ? formatBytes(
        manifest.delta?.fromVersionCode === versionCode
          ? manifest.delta.patchSizeBytes
          : manifest.apkSizeBytes,
      )
    : null;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-32">
      <PageHeader title="تنظیمات" subtitle="مدیریت برنامه و دسترسی‌ها" />

      <section className="mb-4 grid gap-3 sm:grid-cols-2">
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
          <span className="flex items-center gap-2 text-sm">
            <Camera className="size-4" /> دوربین
          </span>
          <span className="text-xs text-muted-foreground">{permissions.camera}</span>
        </div>
        <div className="mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm">
            <Mic className="size-4" /> میکروفون
          </span>
          <span className="text-xs text-muted-foreground">{permissions.microphone}</span>
        </div>
        <Button
          className="w-full"
          disabled={!native || busy}
          onClick={() => void requestPermissions()}
        >
          درخواست مجوز دوربین و میکروفون
        </Button>
        <Button
          variant="outline"
          className="mt-2 w-full"
          disabled={!native}
          onClick={() => void Native.openAppSettings()}
        >
          <Settings className="mr-2 size-4" /> تنظیمات مجوزهای اندروید
        </Button>
      </section>

      <section className="glass mb-4 rounded-3xl p-4">
        <div className="mb-3 flex items-center gap-3">
          {pushEnabled ? (
            <Bell className="size-5 text-primary" />
          ) : (
            <BellOff className="size-5 text-muted-foreground" />
          )}
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
          <Button
            className="w-full"
            variant={pushEnabled ? "outline" : "default"}
            disabled={!native || pushBusy}
            onClick={() => void togglePush()}
          >
            {pushBusy ? "در حال ثبت…" : pushEnabled ? "خاموش‌کردن اعلان‌ها" : "فعال‌کردن اعلان‌ها"}
          </Button>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">ورود به گفتگو برای فعال‌سازی</Link>
          </Button>
        )}
        {!native && (
          <p className="mt-2 text-xs text-muted-foreground">
            این قابلیت در نسخه اندروید فعال می‌شود.
          </p>
        )}
        {native && (
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full border-love/25 bg-love/5 hover:bg-love/10"
            disabled={pushBusy || !notif?.enabled}
            onClick={() => {
              setPushBusy(true);
              setMessage("");
              void Native.showTestNotification()
                .then(() =>
                  setMessage("اعلان آزمایشی ارسال شد؛ نوار اعلان‌های گوشی رو بررسی کن. 🔔"),
                )
                .catch((error: unknown) =>
                  setMessage(
                    error instanceof Error ? error.message : "ارسال اعلان آزمایشی ناموفق بود.",
                  ),
                )
                .finally(() => setPushBusy(false));
            }}
          >
            <Bell className="mr-2 size-4" /> تست اعلان روی همین گوشی
          </Button>
        )}
        {native && !notif?.enabled && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            برای تست، ابتدا مجوز اعلان برنامه را فعال کن.
          </p>
        )}
      </section>

      <section
        id="updates"
        ref={updatesRef}
        tabIndex={-1}
        aria-labelledby="updates-title"
        className="glass scroll-mt-4 rounded-3xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <h2 id="updates-title" className="mb-3 font-bold">
          به‌روزرسانی برنامه
        </h2>
        <dl className="mb-4 grid gap-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>نسخهٔ نصب‌شده</dt>
            <dd dir="ltr">
              {version}
              {versionCode != null ? ` (${versionCode})` : ""}
            </dd>
          </div>
          {manifest && (
            <div className="flex justify-between gap-2">
              <dt>آخرین نسخه</dt>
              <dd dir="ltr">
                {manifest.versionName} ({manifest.versionCode})
              </dd>
            </div>
          )}
          {size && (
            <div className="flex justify-between gap-2">
              <dt>حجم دانلود</dt>
              <dd>
                {manifest?.delta?.fromVersionCode === versionCode
                  ? exactBytes(manifest.delta.patchSizeBytes)
                  : size}
              </dd>
            </div>
          )}
          {lastCheck && (
            <div className="flex justify-between gap-2">
              <dt>آخرین بررسی</dt>
              <dd>{new Date(lastCheck.at).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}</dd>
            </div>
          )}
          {lastCheck && (
            <div className="flex justify-between gap-2">
              <dt>نتیجه</dt>
              <dd>{lastCheck.result}</dd>
            </div>
          )}
        </dl>
        {manifest && manifest.releaseNotes.length > 0 && (
          <div className="mb-4 rounded-2xl bg-background/30 p-3">
            <h3 className="mb-1 text-xs font-bold">تغییرات این نسخه</h3>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {manifest.releaseNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {manifest && isBelowMinimum(manifest, versionCode) && (
          <p className="mb-3 text-xs text-destructive">
            این نسخه دیگر پشتیبانی نمی‌شود؛ لطفاً به‌روزرسانی کن.
          </p>
        )}
        <Button
          className="w-full"
          variant={hasUpdate ? "default" : "outline"}
          disabled={busy || (!native && hasUpdate)}
          onClick={() => void (hasUpdate ? installUpdate() : checkUpdate())}
        >
          {hasUpdate ? <Download className="mr-2 size-4" /> : <RefreshCw className="mr-2 size-4" />}
          {hasUpdate ? "دریافت و اعمال به‌روزرسانی" : "بررسی به‌روزرسانی"}
        </Button>
        {updateProgress && busy && (
          <div className="mt-4 rounded-2xl bg-background/40 p-3" aria-live="polite">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-medium">{progressLabel(updateProgress)}</span>
              <span dir="ltr" className="shrink-0 tabular-nums">
                {updateProgress.percent.toLocaleString("fa-IR")}%
              </span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="پیشرفت دریافت به‌روزرسانی"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={updateProgress.percent}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${updateProgress.percent}%` }}
              />
            </div>
            {updateProgress.totalBytes > 0 && (
              <div
                className="mt-2 flex flex-wrap justify-between gap-1 text-[11px] text-muted-foreground"
                dir="rtl"
              >
                <span>
                  {exactBytes(updateProgress.downloadedBytes)} از{" "}
                  {exactBytes(updateProgress.totalBytes)}
                </span>
                <span>{updateProgress.method === "delta" ? "پچ کم‌حجم" : "APK کامل"}</span>
              </div>
            )}
          </div>
        )}
        {native && notif && !notif.enabled && (
          <Button
            variant="outline"
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => void requestNotificationPermission()}
          >
            <Bell className="mr-2 size-4" /> اجازهٔ اعلان نسخهٔ جدید
          </Button>
        )}
        {native && notif?.enabled && (
          <p className="mt-2 text-xs text-muted-foreground">اعلان نسخهٔ جدید روشن است.</p>
        )}
      </section>

      {message && (
        <p role="status" className="mt-4 text-center text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </main>
  );
}
