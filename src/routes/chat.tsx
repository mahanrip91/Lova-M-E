import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Trash2,
  X,
  Pin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Bubble, DayDivider } from "@/components/mae/Bubble";
import {
  chatError,
  getMyProfile,
  getSession,
  listMessages,
  signOut,
  subscribeMessages,
  subscribeMessageReceipts,
  listMessageReceipts,
  markMessagesDelivered,
  markMessagesRead,
  type MessageReceipt,
  editLiveMessage,
  deleteLiveMessage,
  getLiveMessageById,
  getPinnedMessage,
  pinMessage,
  unpinMessage,
  subscribePinnedMessage,
  subscribePresence,
} from "@/lib/chat/api";
import type { Profile } from "@/lib/chat/types";
import {
  syncRemoteArchiveAfterLogin,
  ensureArchiveRange,
  loadOlderArchiveMessages,
  hasOlderArchiveMessages,
  useStore,
  toggleBookmark,
  upsertLiveChatMessages,
  updateLiveMessageInStore,
  removeLiveMessageFromStore,
} from "@/lib/mae/store";
import { setViewer } from "@/lib/mae/viewer";
import { dayKey, fmtDate } from "@/lib/mae/time";
import { Composer } from "@/components/mae/Composer";

export const Route = createFileRoute("/chat")({
  validateSearch: (s: Record<string, unknown>) => ({
    u: typeof s["u"] === "string" ? s["u"] : "",
    at: Number(s["at"]) || 0,
  }),
  ssr: false,
  head: () => ({
    meta: [
      { title: "M AND E · چت" },
      { name: "description", content: "گفتگوی یکپارچهٔ ماهان و الیسا" },
      { property: "og:title", content: "M AND E · چت" },
      { property: "og:description", content: "آرشیو و گفتگوی زنده در یک صفحه" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    if (!(await getSession())) throw redirect({ to: "/login" });
  },
  component: Chat,
});

function Chat() {
  const { u: targetUid, at: targetAt } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const messages = useStore((s) => s.messages);
  const sources = useStore((s) => s.sources);
  const sides = useStore((s) => s.sides);
  const bookmarks = useStore((s) => s.bookmarks);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("CONNECTING");
  const [leaving, setLeaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [pinnedUid, setPinnedUid] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerLastSeen, setPeerLastSeen] = useState<string | null>(null);
  const nearBottomRef = useRef(true);
  const [editingMessage, setEditingMessage] = useState<{ uid: string; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [receiptByMessageId, setReceiptByMessageId] = useState<Record<string, MessageReceipt>>({});
  const loadingOlderRef = useRef(false);
  const initialScrollDone = useRef(false);
  const targetLoadRef = useRef("");

  const scrollRef = useRef<HTMLElement | null>(null);
  const activeProfile = useRef<Profile | null>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 100,
    getItemKey: (index) => messages[index]?.u ?? index,

    overscan: 18,
  });

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;

    setLoading(true);
    setError("");

    async function refresh() {
      const me = activeProfile.current;
      if (!me) return;

      try {
        const rows = await listMessages(me);
        if (!active) return;
        const liveRows = rows.filter((row) => row.source === "live");

        await upsertLiveChatMessages(liveRows, me);

        const incomingIds = liveRows.filter((row) => row.sender_id !== me.id).map((row) => row.id);

        if (incomingIds.length) {
          const receiptTask =
            document.visibilityState === "visible"
              ? markMessagesRead(incomingIds, me.id)
              : markMessagesDelivered(incomingIds, me.id);

          void receiptTask.catch((receiptError) => {
            console.warn("M AND E receipt update failed:", receiptError);
          });
        }

        const outgoingIds = liveRows.filter((row) => row.sender_id === me.id).map((row) => row.id);

        try {
          const receipts = await listMessageReceipts(outgoingIds);

          if (active) {
            setReceiptByMessageId(
              Object.fromEntries(receipts.map((receipt) => [receipt.message_id, receipt])),
            );
          }
        } catch (receiptError) {
          console.warn("M AND E receipt sync failed:", receiptError);
        }

        if (active) setError("");
      } catch (err) {
        if (active) setError(chatError(err));
      }
    }

    async function load() {
      try {
        const me = await getMyProfile();
        if (!active) return;

        if (!me) {
          setError("پروفایل این حساب پیدا نشد؛ دسترسی اعضا را بررسی کن.");
          return;
        }

        activeProfile.current = me;
        setProfile(me);
        setViewer(me.side);

        try {
          await syncRemoteArchiveAfterLogin();
        } catch (syncError) {
          console.warn("M AND E archive sync failed:", syncError);
        }

        if (!active) return;

        const cleanupMessages = subscribeMessages(
          (message) => {
            if (!active) return;

            void upsertLiveChatMessages([message], me);

            if (message.sender_id !== me.id) {
              const receiptTask =
                document.visibilityState === "visible"
                  ? markMessagesRead([message.id], me.id)
                  : markMessagesDelivered([message.id], me.id);

              void receiptTask.catch((receiptError) => {
                console.warn("M AND E receipt update failed:", receiptError);
              });
            }
          },
          (status) => {
            if (!active) return;
            setConnection(status);
            if (status === "SUBSCRIBED") void refresh();
          },
          (message) => {
            if (active) void updateLiveMessageInStore(message);
          },
          (id) => {
            if (active) void removeLiveMessageFromStore(id);
          },
        );

        const cleanupReceipts = subscribeMessageReceipts((receipt, event) => {
          if (!active) return;

          setReceiptByMessageId((current) => {
            const next = { ...current };

            if (event === "DELETE") {
              delete next[receipt.message_id];
            } else {
              next[receipt.message_id] = receipt;
            }

            return next;
          });
        });

        cleanup = () => {
          cleanupMessages();
          cleanupReceipts();
        };

        await refresh();
      } catch (err) {
        if (active) setError(chatError(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    const onFocus = () => {
      if (active) {
        void router.invalidate();
        void refresh();
      }
    };

    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      cleanup?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [attempt, router]);

  useEffect(() => {
    if (!profile) return;

    let active = true;
    void getPinnedMessage()
      .then((row) => {
        if (active) setPinnedUid(row?.message_uid ?? null);
      })
      .catch((err) => {
        console.warn("M AND E pinned message load failed:", err);
      });

    const stopPinned = subscribePinnedMessage((row) => {
      if (active) setPinnedUid(row?.message_uid ?? null);
    });

    const stopPresence = subscribePresence(profile, (presence) => {
      if (!active) return;
      setPeerOnline(presence.online);
      setPeerLastSeen(presence.lastSeenAt);
    });

    return () => {
      active = false;
      stopPinned();
      stopPresence();
    };
  }, [profile]);

  async function togglePinnedMessage(uid: string) {
    if (!profile) return;
    try {
      if (pinnedUid === uid) {
        await unpinMessage();
      } else {
        await pinMessage(uid, profile.id);
      }
    } catch (err) {
      setError(chatError(err));
    }
  }

  useEffect(() => {
    if (!targetUid || loading || !profile) return;

    const targetIndex = messages.findIndex((message) => message.u === targetUid);

    if (targetIndex >= 0) {
      const frame1 = window.requestAnimationFrame(() => {
        virtualizer.scrollToIndex(targetIndex, { align: "center" });
        window.requestAnimationFrame(() => {
          virtualizer.scrollToIndex(targetIndex, { align: "center" });
        });
      });

      return () => window.cancelAnimationFrame(frame1);
    }

    if (targetLoadRef.current === targetUid) return;
    targetLoadRef.current = targetUid;

    let cancelled = false;

    void (async () => {
      try {
        if (targetUid.startsWith("archive:")) {
          if (!targetAt) throw new Error("زمان پیام جست‌وجوشده مشخص نیست.");
          await ensureArchiveRange(targetAt, targetAt);
        } else if (targetUid.startsWith("live:")) {
          const row = await getLiveMessageById(targetUid.slice(5));
          if (!cancelled) await upsertLiveChatMessages([row], profile);
        } else {
          throw new Error("شناسهٔ پیام جست‌وجوشده معتبر نیست.");
        }
      } catch (err) {
        if (!cancelled) setError(chatError(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetUid, targetAt, loading, profile, messages, virtualizer]);

  useEffect(() => {
    if (!messages.length || loading || targetUid || initialScrollDone.current) return;
    initialScrollDone.current = true;

    const element = scrollRef.current;
    if (!element) return;

    const last = messages.length - 1;
    virtualizer.scrollToIndex(last, { align: "end" });

    const frame1 = window.requestAnimationFrame(() => {
      virtualizer.scrollToIndex(last, { align: "end" });

      const frame2 = window.requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });

      cleanupFrame2 = () => window.cancelAnimationFrame(frame2);
    });

    let cleanupFrame2 = () => {};
    return () => {
      window.cancelAnimationFrame(frame1);
      cleanupFrame2();
    };
  }, [messages.length, loading, targetUid, virtualizer]);

  function jumpToLatest() {
    const element = scrollRef.current;
    if (!element || !messages.length) return;
    virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior: "smooth" });
    window.requestAnimationFrame(() => {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    });
    nearBottomRef.current = true;
    setShowJumpLatest(false);
  }

  function handleChatScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.clientHeight - element.scrollTop;
    nearBottomRef.current = distance < 180;
    setShowJumpLatest(distance > 500);
    void loadOlder();
  }

  async function loadOlder() {
    const element = scrollRef.current;
    if (
      !element ||
      element.scrollTop > 220 ||
      loadingOlderRef.current ||
      !hasOlderArchiveMessages()
    )
      return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const oldHeight = element.scrollHeight;

    try {
      const added = await loadOlderArchiveMessages();
      if (added > 0) {
        window.requestAnimationFrame(() => {
          element.scrollTop += element.scrollHeight - oldHeight;
        });
      }
    } catch (err) {
      setError(chatError(err));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  function editMessage(uid: string, currentText: string) {
    if (!uid.startsWith("live:")) {
      setError("پیام‌های آرشیوی قابل ویرایش نیستند.");
      return;
    }

    setError("");
    setEditingMessage({ uid, text: currentText });
  }

  async function saveEditedMessage(uid: string, text: string) {
    const row = await editLiveMessage(uid.slice(5), text);
    await updateLiveMessageInStore(row);
    setEditingMessage(null);
  }

  function deleteMessage(uid: string) {
    if (!uid.startsWith("live:")) {
      setError("پیام‌های آرشیوی قابل حذف نیستند.");
      return;
    }

    setDeleteTarget(uid);
  }

  async function confirmDeleteMessage() {
    if (!deleteTarget) return;

    const uid = deleteTarget;

    try {
      await deleteLiveMessage(uid.slice(5));
      await removeLiveMessageFromStore(uid.slice(5));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حذف پیام انجام نشد.");
    }
  }

  async function logout() {
    setLeaving(true);
    setError("");
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await signOut();
      setProfile(null);
      await navigate({ to: "/login", replace: true });
    } catch (err) {
      setError(chatError(err));
    } finally {
      setLeaving(false);
    }
  }

  return (
    <main className="mx-auto flex h-dvh max-w-3xl flex-col">
      <header className="glass flex shrink-0 items-center justify-between gap-3 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <MessageCircle className="size-7 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl">چت</h1>
            <p className="text-xs text-muted-foreground">
              {profile ? `${profile.side} · ` : ""}
              {connection === "SUBSCRIBED"
                ? "متصل"
                : connection === "CONNECTING"
                  ? "در حال اتصال…"
                  : "اتصال زنده قطع است"}
              {" · "}
              {peerOnline
                ? "طرف مقابل آنلاین"
                : peerLastSeen
                  ? `آخرین بازدید ${new Date(peerLastSeen).toLocaleString("fa-IR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}`
                  : "وضعیت نامشخص"}
              {" · "}
              {messages.length.toLocaleString("fa-IR")} پیام
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button asChild variant="ghost" size="icon" title="خانه" aria-label="خانه">
            <Link to="/">
              <ArrowRight />
            </Link>
          </Button>
          <Button
            onClick={logout}
            disabled={leaving}
            variant="ghost"
            size="icon"
            title="خروج از حساب"
            aria-label="خروج از حساب"
          >
            <LogOut />
          </Button>
        </div>
      </header>

      {pinnedUid && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
          <Pin className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">پیام سنجاق‌شده</p>
            <p className="truncate text-sm">
              {messages.find((message) => message.u === pinnedUid)?.x ||
                "پیام رسانه‌ای یا خارج از بخش بارگذاری‌شده"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const index = messages.findIndex((message) => message.u === pinnedUid);
              if (index >= 0)
                virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });
              else setError("این پیام در بخش فعلی بارگذاری نشده است.");
            }}
          >
            نمایش
          </Button>
        </div>
      )}

      <section
        ref={scrollRef}
        onScroll={handleChatScroll}
        className="min-h-0 flex-1 overflow-y-auto py-4"
        aria-label="همه پیام‌ها"
      >
        {loadingOlder && (
          <p className="py-3 text-center text-xs text-muted-foreground">
            در حال بارگذاری پیام‌های قدیمی‌تر…
          </p>
        )}

        {loading && (
          <p
            role="status"
            className="flex items-center justify-center gap-2 p-8 text-muted-foreground"
          >
            <LoaderCircle className="size-5 animate-spin" />
            در حال دریافت پیام‌های اخیر…
          </p>
        )}

        {!loading && !messages.length && !error && (
          <p className="p-8 text-center text-muted-foreground">هنوز پیامی نیست.</p>
        )}

        {messages.length > 0 && (
          <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const message = messages[item.index];
              if (!message) return null;

              const previous = messages[item.index - 1];
              const side = sides[message.k]?.side;
              const source = sources.find((s) => s.id === message.s);
              const senderName = side === "O" ? sides[message.k]?.name : undefined;
              const bookmarked = bookmarks.includes(message.u);

              const receiptRow =
                message.s === "LIVE" && side === profile?.side
                  ? receiptByMessageId[message.u.slice(5)]
                  : undefined;

              const receipt = receiptRow?.read_at
                ? "read"
                : receiptRow?.delivered_at
                  ? "delivered"
                  : message.s === "LIVE" && side === profile?.side
                    ? "sent"
                    : undefined;

              return (
                <div
                  key={message.u}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  {(!previous || dayKey(message.t) !== dayKey(previous.t)) && (
                    <DayDivider label={fmtDate(message.t)} />
                  )}
                  <Bubble
                    m={message}
                    side={side}
                    senderName={senderName}
                    sourceLabel={source?.label}
                    bookmarked={bookmarked}
                    onBookmark={() => void toggleBookmark(message.u)}
                    canEdit={message.s === "LIVE" && side === profile?.side}
                    onEdit={() => void editMessage(message.u, message.x)}
                    onDelete={() => void deleteMessage(message.u)}
                    receipt={receipt}
                    pinned={pinnedUid === message.u}
                    onPin={() => void togglePinnedMessage(message.u)}
                    onMediaLoaded={() => {
                      if (!nearBottomRef.current) return;
                      const element = scrollRef.current;
                      if (element) {
                        window.requestAnimationFrame(() => {
                          element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
                        });
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showJumpLatest && (
        <Button
          type="button"
          onClick={jumpToLatest}
          className="fixed bottom-28 right-5 z-40 size-12 rounded-full shadow-xl"
          size="icon"
          title="رفتن به آخرین پیام‌ها"
          aria-label="رفتن به آخرین پیام‌ها"
        >
          <ArrowDown className="size-5" />
        </Button>
      )}

      {error && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            تلاش دوباره
          </Button>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setDeleteTarget(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-message-title"
            className="w-full max-w-sm rounded-3xl border border-white/15 bg-background p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-2xl bg-destructive/10 text-destructive">
                <Trash2 className="size-5" />
              </span>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground"
                aria-label="بستن"
              >
                <X className="size-4" />
              </button>
            </div>

            <h2 id="delete-message-title" className="text-lg font-bold">
              حذف این پیام؟
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              این پیام از گفتگوی زنده حذف می‌شود و این کار قابل بازگشت نیست.
            </p>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setDeleteTarget(null)}
              >
                انصراف
              </Button>

              <Button
                type="button"
                variant="destructive"
                className="flex-1 rounded-xl"
                onClick={() => void confirmDeleteMessage()}
              >
                حذف پیام
              </Button>
            </div>
          </section>
        </div>
      )}

      <Composer
        profile={profile}
        disabled={loading}
        editingMessage={editingMessage}
        onEditSubmit={saveEditedMessage}
        onCancelEdit={() => setEditingMessage(null)}
        onSent={(message) => {
          void upsertLiveChatMessages([message], profile!);
          window.requestAnimationFrame(() => {
            const element = scrollRef.current;
            if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
          });
        }}
        onError={setError}
        onVideoRecordingStarted={() => {
          window.requestAnimationFrame(() => {
            const element = scrollRef.current;
            if (element) {
              element.scrollTo({
                top: element.scrollHeight,
                behavior: "smooth",
              });
            }
          });
        }}
      />
    </main>
  );
}
