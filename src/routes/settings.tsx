import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { fetchUpdateManifest, formatBytes, isBelowMinimum, isNewerVersion, type UpdateManifest } from "@/lib/update-manifest";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Ota } from "@/lib/ota-native";
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
  downloadAndInstall(options: { url: string; sha256?: string }): Promise<{ status: string; verified: boolean }>;
};

const Native = registerPlugin<NativeTools>("NativeTools");

type OtaChannel = {
  schema: number;
  enabled: boolean;
  bundleId: string;
  manifestUrl: string;
  signatureUrl: string;
};

const OTA_CHANNEL_URL =
  "https://raw.githubusercontent.com/mahanrip91/Lova-M-E/main/public/ota/channel.json";

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
  const [profileId, setProfileId] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [otaStatus, setOtaStatus] = useState<{
    activeBundle: string;
    previousBundle: string;
    storageReady: boolean;
  } | null>(null);
  const [otaChannel, setOtaChannel] = useState<OtaChannel | null>(null);
  const [otaStaged, setOtaStaged] = useState<{
    bundleId: string;
    totalSize: number;
    downloadedBytes: number;
    reusedBytes: number;
    fileCount: number;
    releaseNotes: string;
  } | null>(null);

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
      setVersionCode(typeof info.versionCode === "number" ? info.versionCode : null);
      setNotif(await Native.getUpdateNotificationStatus().catch(() => null));
    } catch {
      setMessage("دریافت اطلاعات برنامه ممکن نشد.");
    }
  }

  useEffect(() => {
    void refresh();
    if (native) void refreshOtaStatus();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mae.update.lastCheck");
      if (raw) setLastCheck(JSON.parse(raw));
    } catch { /* ignore */ }
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

  function recordCheck(result: string) {
    const entry = { at: new Date().toISOString(), result };
    setLastCheck(entry);
    try { localStorage.setItem("mae.update.lastCheck", JSON.stringify(entry)); } catch { /* ignore */ }
  }

  async function checkUpdate() {
    setBusy(true);
    setMessage("");
    const res = await fetchUpdateManifest();
    if (!res.ok) {
      setManifest(null);
      recordCheck(res.error);
      setMessage(res.error);
    } else {
      setManifest(res.manifest);
      const result = versionCode == null
        ? `آخرین نسخه ${res.manifest.versionName}؛ شمارهٔ نسخهٔ نصب‌شده نامشخص است.`
        : isNewerVersion(res.manifest, versionCode)
          ? `نسخهٔ جدید ${res.manifest.versionName} در دسترس است.`
          : "برنامه به‌روز است.";
      recordCheck(result);
      setMessage(result);
    }
    setBusy(false);
  }

  async function requestNotificationPermission() {
    setBusy(true);
    try {
      const st = await Native.requestUpdateNotificationPermission();
      setNotif(st);
      setMessage(st.enabled ? "اعلان نسخهٔ جدید فعال است." : "اجازهٔ اعلان داده نشد؛ از تنظیمات اندروید فعالش کن.");
    } catch {
      setMessage("درخواست اجازهٔ اعلان ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function installUpdate() {
    if (!manifest || !isNewerVersion(manifest, versionCode)) return;
    setBusy(true);
    setMessage("دانلود شروع شد؛ پس از پایان، نصب‌کنندهٔ اندروید باز می‌شود.");
    try {
      const r = await Native.downloadAndInstall({
        url: manifest.apkUrl,
        ...(manifest.apkSha256 ? { sha256: manifest.apkSha256 } : {}),
      });
      setMessage(r.verified
        ? "فایل بررسی شد و نصب‌کننده باز شد؛ نصب را آنجا تأیید کن."
        : "نصب‌کننده باز شد؛ نصب را آنجا تأیید کن.");
    } catch (e) {
      setMessage(e instanceof Error && e.message ? e.message : "دانلود یا اجرای نصب‌کننده ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshOtaStatus() {
    if (!native) return;
    try {
      setOtaStatus(await Ota.getOtaStatus());
    } catch {
      setMessage("دریافت وضعیت به‌روزرسانی OTA ناموفق بود.");
    }
  }

  async function checkOta() {
    if (!native) return;
    setBusy(true);
    setMessage("");
    setOtaStaged(null);
    try {
      const response = await fetch(OTA_CHANNEL_URL, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("دریافت کانال OTA ناموفق بود.");
      const channel = await response.json() as OtaChannel;

      if (
        channel.schema !== 1 ||
        typeof channel.enabled !== "boolean" ||
        typeof channel.bundleId !== "string" ||
        typeof channel.manifestUrl !== "string" ||
        typeof channel.signatureUrl !== "string"
      ) {
        throw new Error("ساختار کانال OTA معتبر نیست.");
      }

      setOtaChannel(channel);
      await refreshOtaStatus();

      if (!channel.enabled) {
        setMessage("انتشار OTA هنوز فعال نشده است.");
      } else if (
        !channel.bundleId ||
        !channel.manifestUrl.startsWith("https://") ||
        !channel.signatureUrl.startsWith("https://")
      ) {
        throw new Error("اطلاعات انتشار OTA ناقص یا نامعتبر است.");
      } else if (channel.bundleId === otaStatus?.activeBundle) {
        setMessage("بستهٔ OTA فعلی فعال است.");
      } else {
        setMessage(`نسخهٔ OTA جدید پیدا شد: ${channel.bundleId}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "بررسی OTA ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadOta() {
    if (!native || !otaChannel?.enabled) return;
    setBusy(true);
    setMessage("در حال دانلود و بررسی امن فایل‌های OTA…");
    setOtaStaged(null);
    try {
      const result = await Ota.downloadAndVerifyBundle({
        manifestUrl: otaChannel.manifestUrl,
        signatureUrl: otaChannel.signatureUrl,
      });

      if (result.status !== "verified") {
        throw new Error("تأیید بستهٔ OTA انجام نشد.");
      }
      if (result.bundleId !== otaChannel.bundleId) {
        throw new Error("شناسهٔ بسته با کانال انتشار مطابقت ندارد.");
      }

      setOtaStaged(result);
      setMessage(
        `بستهٔ ${result.bundleId} با موفقیت بررسی شد؛ ${formatBytes(result.downloadedBytes)} دانلود و ${formatBytes(result.reusedBytes)} از فایل‌های قبلی استفاده شد.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "دانلود OTA ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function activateOta() {
    if (!native || !otaStaged) return;
    if (!window.confirm("نسخهٔ بررسی‌شده فعال شود؟ برنامه دوباره بارگذاری می‌شود.")) return;

    setBusy(true);
    setMessage("در حال فعال‌سازی نسخهٔ جدید…");
    try {
      await Ota.activateBundle({ bundleId: otaStaged.bundleId });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "فعال‌سازی OTA ناموفق بود.");
      setBusy(false);
    }
  }

  async function rollbackOta() {
    if (!native) return;
    if (!window.confirm("به نسخهٔ قبلی OTA برگردیم؟")) return;
    setBusy(true);
    try {
      await Ota.rollbackOta();
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "بازگشت به نسخهٔ قبلی ناموفق بود.");
      setBusy(false);
    }
  }

  async function resetOta() {
    if (!native) return;
    if (!window.confirm("نسخهٔ OTA حذف از حالت فعال شود و فایل داخلی APK اجرا شود؟")) return;
    setBusy(true);
    try {
      await Ota.resetToBuiltIn();
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "بازنشانی OTA ناموفق بود.");
      setBusy(false);
    }
  }

  const hasUpdate = manifest != null && isNewerVersion(manifest, versionCode);
  const size = manifest ? formatBytes(manifest.apkSizeBytes) : null;

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

      <section id="updates" ref={updatesRef} tabIndex={-1} aria-labelledby="updates-title" className="glass scroll-mt-4 rounded-3xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <h2 id="updates-title" className="mb-3 font-bold">به‌روزرسانی برنامه</h2>
        <dl className="mb-4 grid gap-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2"><dt>نسخهٔ نصب‌شده</dt><dd dir="ltr">{version}{versionCode != null ? ` (${versionCode})` : ""}</dd></div>
          {manifest && <div className="flex justify-between gap-2"><dt>آخرین نسخه</dt><dd dir="ltr">{manifest.versionName} ({manifest.versionCode})</dd></div>}
          {size && <div className="flex justify-between gap-2"><dt>حجم فایل</dt><dd>{size}</dd></div>}
          {lastCheck && <div className="flex justify-between gap-2"><dt>آخرین بررسی</dt><dd>{new Date(lastCheck.at).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}</dd></div>}
          {lastCheck && <div className="flex justify-between gap-2"><dt>نتیجه</dt><dd>{lastCheck.result}</dd></div>}
        </dl>
        {manifest && manifest.releaseNotes.length > 0 && (
          <div className="mb-4 rounded-2xl bg-background/30 p-3">
            <h3 className="mb-1 text-xs font-bold">تغییرات این نسخه</h3>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {manifest.releaseNotes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}
        {manifest && isBelowMinimum(manifest, versionCode) && (
          <p className="mb-3 text-xs text-destructive">این نسخه دیگر پشتیبانی نمی‌شود؛ لطفاً به‌روزرسانی کن.</p>
        )}
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => void checkUpdate()}>
          <RefreshCw className="mr-2 size-4" /> بررسی نسخهٔ جدید
        </Button>
        {hasUpdate && (
          <Button className="mt-2 w-full" disabled={busy || !native} onClick={() => void installUpdate()}>
            <Download className="mr-2 size-4" /> دانلود و نصب نسخهٔ جدید
          </Button>
        )}
        {native && notif && !notif.enabled && (
          <Button variant="outline" className="mt-2 w-full" disabled={busy} onClick={() => void requestNotificationPermission()}>
            <Bell className="mr-2 size-4" /> اجازهٔ اعلان نسخهٔ جدید
          </Button>
        )}
        {native && notif?.enabled && <p className="mt-2 text-xs text-muted-foreground">اعلان نسخهٔ جدید روشن است.</p>}
      </section>

      <section className="glass mb-4 rounded-3xl p-4">
        <div className="mb-3">
          <h2 className="font-bold">به‌روزرسانی سریع (OTA)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            دریافت تغییرات ظاهری و امکانات وب، بدون نصب APK. فایل‌ها پیش از فعال‌سازی بررسی می‌شوند.
          </p>
        </div>

        <dl className="mb-3 grid gap-2 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>نسخهٔ فعال</dt>
            <dd dir="ltr">{otaStatus?.activeBundle || "نسخهٔ داخلی APK"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>نسخهٔ قبلی</dt>
            <dd dir="ltr">{otaStatus?.previousBundle || "ندارد"}</dd>
          </div>
          {otaChannel?.enabled && (
            <div className="flex justify-between gap-2">
              <dt>آخرین انتشار</dt>
              <dd dir="ltr">{otaChannel.bundleId}</dd>
            </div>
          )}
        </dl>

        {otaStaged && (
          <div className="mb-3 rounded-2xl bg-background/30 p-3 text-xs">
            <p className="font-bold">بسته آمادهٔ فعال‌سازی است</p>
            <p className="mt-1 text-muted-foreground">
              حجم کل: {formatBytes(otaStaged.totalSize)} · دانلود جدید: {formatBytes(otaStaged.downloadedBytes)} · فایل‌ها: {otaStaged.fileCount}
            </p>
            {otaStaged.releaseNotes && (
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{otaStaged.releaseNotes}</p>
            )}
          </div>
        )}

        <Button
          variant="outline"
          className="w-full"
          disabled={!native || busy}
          onClick={() => void checkOta()}
        >
          <RefreshCw className="mr-2 size-4" /> بررسی انتشار OTA
        </Button>

        {native && otaChannel?.enabled &&
          otaChannel.bundleId !== otaStatus?.activeBundle && (
          <Button
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => void downloadOta()}
          >
            <Download className="mr-2 size-4" /> دانلود و بررسی فایل‌های تغییرکرده
          </Button>
        )}

        {native && otaStaged && (
          <Button
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => void activateOta()}
          >
            فعال‌سازی نسخهٔ بررسی‌شده
          </Button>
        )}

        {native && otaStatus?.previousBundle && (
          <Button
            variant="outline"
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => void rollbackOta()}
          >
            بازگشت به نسخهٔ قبلی
          </Button>
        )}

        {native && otaStatus?.activeBundle && (
          <Button
            variant="outline"
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => void resetOta()}
          >
            بازگشت به نسخهٔ داخلی APK
          </Button>
        )}

        {!native && (
          <p className="mt-2 text-xs text-muted-foreground">
            به‌روزرسانی OTA فقط در نسخهٔ اندروید فعال است.
          </p>
        )}
      </section>

      {message && <p role="status" className="mt-4 text-center text-sm text-muted-foreground">{message}</p>}
    </main>
  );
}
