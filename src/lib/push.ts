import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/lib/supabase";

const KEY = "mae:push-token:";
let profileId: string | null = null;
let listenerSetup: Promise<void> | null = null;
let waiter: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null;

const keyFor = (id: string) => KEY + id;

async function persistToken(token: string) {
  if (!profileId) throw new Error("حساب گفتگو مشخص نیست.");
  const oldToken = localStorage.getItem(keyFor(profileId));

  if (oldToken && oldToken !== token) {
    await supabase.from("push_tokens").delete()
      .eq("profile_id", profileId).eq("token", oldToken);
  }

  const { error } = await supabase.from("push_tokens").upsert({
    token,
    profile_id: profileId,
    platform: "android",
    enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "token" });

  if (error) throw error;
  localStorage.setItem(keyFor(profileId), token);
}

async function ensureListeners() {
  if (!listenerSetup) {
    listenerSetup = (async () => {
      await PushNotifications.addListener("registration", ({ value }) => {
        void persistToken(value)
          .then(() => waiter?.resolve(value))
          .catch((error: unknown) => waiter?.reject(
            error instanceof Error ? error : new Error("ذخیره توکن ناموفق بود.")
          ));
      });

      await PushNotifications.addListener("registrationError", (error) => {
        waiter?.reject(new Error(error.error || "ثبت دستگاه ناموفق بود."));
      });
    })();
  }
  await listenerSetup;
}

async function ensureChannel() {
  try {
    await PushNotifications.createChannel({
      id: "chat_messages",
      name: "پیام‌های گفتگو",
      description: "اعلان پیام‌های جدید M AND E",
      importance: 4,
      sound: "default",
      vibration: true,
    });
  } catch (error) {
    console.warn("M AND E notification channel setup failed:", error);
  }
}

export async function getPushEnabled(id: string) {
  if (!Capacitor.isNativePlatform()) return false;
  const token = localStorage.getItem(keyFor(id));
  if (!token) return false;

  const { data, error } = await supabase.from("push_tokens")
    .select("enabled").eq("profile_id", id).eq("token", token).maybeSingle();

  if (error) throw error;
  return data?.enabled ?? false;
}

export async function enablePushNotifications(id: string) {
  if (!Capacitor.isNativePlatform()) throw new Error("اعلان فقط در نسخه اندروید فعال است.");

  profileId = id;
  const permission = await PushNotifications.checkPermissions();
  const result = permission.receive === "granted"
    ? permission
    : await PushNotifications.requestPermissions();

  if (result.receive !== "granted") {
    throw new Error("مجوز اعلان داده نشد؛ دسترسی اعلان برنامه را در تنظیمات اندروید فعال کن.");
  }

  await ensureListeners();
  await ensureChannel();

  const tokenPromise = new Promise<string>((resolve, reject) => {
    waiter = { resolve, reject };
  });

  try {
    await PushNotifications.register();
    return await Promise.race([
      tokenPromise,
      new Promise<string>((_, reject) => {
        window.setTimeout(() => reject(new Error("زمان ثبت دستگاه تمام شد؛ دوباره تلاش کن.")), 15000);
      }),
    ]);
  } finally {
    waiter = null;
  }
}

export async function disablePushNotifications(id: string) {
  const token = localStorage.getItem(keyFor(id));
  if (!token) return;

  const { error } = await supabase.from("push_tokens")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("profile_id", id).eq("token", token);

  if (error) throw error;
}

export async function refreshPushRegistration(id: string) {
  if (!Capacitor.isNativePlatform()) return;
  if (!(await getPushEnabled(id))) return;

  profileId = id;
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") return;

  await ensureListeners();
  await ensureChannel();
  await PushNotifications.register();
}
