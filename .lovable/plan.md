# M AND E — File inspection report and build plan

## Part A — Verified findings (all three files opened and parsed in full, read-only)

| # | File | Format | Size | Source app (inferred) | Messages | Range (UTC) |
|---|------|--------|------|------|------|------|
| 1 | `3_ִ𖹭𑪊ִ_᷼ᤢ.json` | JSON object | ~7.95 MB | Rubika (field names match Rubika API) | 20,534 (matches `message_count`, `complete: true`) | 2026-04-14 23:58 → 2026-08-31 21:50 |
| 2 | `ℯ𝑙𝑖𝓈𝒶_from_𝓶𝓪𝓱𝓪𝓷.json` | JSON array | ~7.18 MB | Telegram (simplified export) | 33,806 | 2026-07-19 23:16 → 2026-09-26 20:45 |
| 3 | `𖹭_from_𝓶𝓪𝓱𝓪𝓷.json` | JSON array | ~8.85 MB | Telegram (simplified export) | 41,179 | 2026-08-18 17:06 → 2026-10-29 07:34 |

Total: 95,519 messages. Performance work is essential.

### 1. Structure and keys
- **File 1 (Rubika):** top level is `{chat_title, chat_guid, message_count, complete, exported_at, messages[]}`. Each message has `message_id` (string), `time` (string), `type`, `is_edited`, `author_type` (always "User"), `author_object_guid`, `allow_transcription`, and an optional `text`. Optional fields: `reply_to_message_id`, `file_inline`, `forwarded_from`, `forwarded_no_link`, `reactions`, `metadata` (text-format ranges), `sticker`, `rubino_post_data`, `has_link`.
  Redacted example: `{message_id:"16303…", time:"1776211116", type:"Text", author_object_guid:"u0IX…", text:"<136 chars>", is_edited:false}`
- **Files 2 and 3 (Telegram):** a flat array of `{id:int, date:string, sender_id:int, sender_name:string, text:string, reply_to:int|null}`. No other fields.

### 2. Counts and duplicates
- No duplicate IDs in any file.
- About 12 messages in file 1 and about 125 in each of files 2 and 3 share the same second and the same text. These look like real repeated sends, not export duplicates. Keep them all.
- Files 2 and 3 have zero messages that match exactly (same time and text), even though their dates overlap. They are separate chats.
- The Telegram IDs have large gaps (about 66k and 18k). These are likely deleted or service messages, so IDs can't be used to check completeness.

### 3. Timestamps
- **File 1:** Unix epoch seconds stored as a string, sorted ascending. `exported_at` has no timezone, probably Tehran local time (an assumption).
- **Files 2 and 3:** ISO 8601 with `+00:00`, at one-second precision, sorted ascending, none missing.
- No Jalali dates appear in any file. Jalali has to be computed.

### 4. Who sent each message
- **File 2:** `7001392382` "𝓶𝓪𝓱𝓪𝓷" sent 16,339 messages and `8130263711` "ℯ𝑙𝑖𝓈𝒶" sent 17,467.
- **File 3:** `7001392382` "𝓶𝓪𝓱𝓪𝓷" sent 20,096 messages and `8816310115` "꣄𐇽̼ᩘْْ.𖹭ִ" sent 21,083.
- **File 1:** there are two authors: `u0IX…` (9,635 messages) and `u0Efd…` (10,899). `chat_guid` equals `u0Efd…`.
- **Assumptions:**
  - The file 3 sender ID is Elisa's second account, because the 𖹭 symbol appears in both her name there and the file 1 title.
  - In Rubika, `u0Efd…` is Elisa (a private chat's ID is usually the other person's) and `u0IX…` is Mahan.
- A one-time "confirm sides" screen lets you swap either assignment.

### 5. Message types, media, replies, forwards, edits
- **File 1:**
  - Types: Text 20,082, FileInline 333, FileInlineCaption 113, Sticker 5, RubinoPost 1.
  - Attachments are listed with their details only (Gif 231, Image 179, Video 18, Voice 10, Music 6, zip 2). 428 include a tiny `thumb_inline` preview.
  - **No actual media files are included.**
  - Replies: 11,132, and 11,116 can be traced to their original. Forwards: 240. Edited: 203. Reactions: 41. No deletion info.
- **Files 2 and 3:**
  - Only `reply_to` exists. File 2: 17,118 of 17,136 replies can be traced. File 3: 20,124 of 20,137.
  - No type, media, forward or edit info.
  - Empty-text messages (2,179 and 2,021) are probably media whose details were dropped. They'll show as "Media / non-text message".

### 6. Overlap and merging
- Three separate conversations: Rubika (Apr to Aug), Telegram A (Jul to Sep) and Telegram B (Aug to Oct), with no duplicated records.
- About 100 long texts appear in both Telegram files, and about 20 appear in both Rubika and Telegram. These are likely copy-pastes or forwards. Keep them.
- **Merging:** convert every time to UTC ms and sort by time, then source, then original order. Each message keeps a source label.

### 7. Limitations and privacy
- No malformed records and no missing timestamps.
- Times are only accurate to the second, so many messages share the same second. Ties are broken by original file order.
- Names use decorative Unicode. Show display names you set, with the original as a tooltip.
- About 30 replies point to messages that aren't in the export. They'll show "Original message not available".
- **Privacy:** these are intimate conversations. The Rubika `access_hash_rec` and `file_id` fields work like access tokens and are dropped when the file is read. Chat data is never bundled into the app or uploaded anywhere.

## Part B — Core architecture

**Principle:** the app ships with no chat data. On each device, you pick the three files once. Everything is processed in your browser and saved only on that device.

```text
File picker -> Web Worker (parse + normalize + sessions + search index)
            -> IndexedDB (messages, days, sessions, events, bookmarks, settings)
UI (main thread) <- paged queries <- IndexedDB
```

**Screens (Persian, right-to-left, neon/cosmic, dark only)**
- **Import:** detects each source type automatically, shows progress, then asks you to confirm sides.
- **Unified timeline:** chat bubbles (Mahan in neon cyan, Elisa in neon magenta), a source label (Rubika / Telegram A / Telegram B), sticky Jalali day headers, tap-to-jump replies, and placeholders for media and forwards.
- **Search:** Persian-aware (treats ي/ی and ك/ک as the same, ignores ZWNJ and diacritics), with filters for source, sender and date.
- **Bookmarks:** star any message and add a note.
- **Settings:** display names, sides, re-import, and delete all data from this device.

**Technical:**
- The existing TanStack Start app, all client-side. No cloud services or server functions touch chat data.
- Normalized record: `{uid, source, ts (UTC ms), side, senderRaw, text, kind, replyUid?, media?, edited?, forwarded?, reactions?, ord}`.
- Storage: Dexie with indexes on `ts`, `[source+ts]` and `side`. The worker writes in batches of 2,000.
- Rendering: `@tanstack/react-virtual` with windows of about 200 messages. Jumping to a time uses a binary search on `ts`.
- Search: an inverted index built and queried in the worker.
- Jalali: `Intl.DateTimeFormat('fa-IR-u-ca-persian', {timeZone:'Asia/Tehran'})`, plus a small Jalali-to-Gregorian converter. Persian digits.
- App install and offline: manifest and icons, plus `vite-plugin-pwa` (generateSW, NetworkFirst for pages). Registration is guarded so it never runs in the preview or inside an iframe.
- Every page gets its own head metadata.
- AGENTS.md records the local-first rule, that chat files are never committed, and the normalized schema.

## Part C — Memory Journal (animated)

### Verified timing facts (Tehran time, UTC+3:30, converted from source UTC and Unix times; no message text read)
- **The earliest archived message** is 15 Apr 2026, 03:28 (Rubika). It is after midnight, and **14 Apr has no archived messages**. So any pre-midnight part of the first conversation is **missing from the exports**.
- 15 Apr has only 10 messages: 3 at 03:28 and 7 at 12:17.
- **Sessions that actually cross midnight in the first week** (a session ends after a gap of 90 minutes or more):
  - 17 Apr 20:06 → 18 Apr 00:58 (65 messages)
  - 20 Apr 19:51 → 21 Apr 00:57 (396 messages)
- **Which night is «روز اول ما» is unconfirmed.** It could be:
  - the 14 → 15 Apr night, with the pre-midnight part not exported
  - the 17 → 18 Apr or 20 → 21 Apr night
  - an earlier conversation that isn't in any export
- **Birthday words** appear in 86 messages across about 40 days. These are candidates only. Birthdays and celebration days are **unknown**.

### Home screen order
1. **Featured, pinned card «روز اول ما»**, always first and large. It shows a status badge (Verified range / Needs confirmation) and how much of that night each source covers.
2. **Live counter «چند وقته با همیم؟»**
3. Memory gallery: «چطور شروع شد», random memory, Mahan's birthday, Elisa's birthday, the day Mahan celebrated Elisa's birthday, the day Elisa congratulated Mahan, and custom memories.
4. Entry points to the time-travel explorer, timeline, search and bookmarks.
5. A neutral **«تازه‌ترین پیام‌های آرشیو»** shortcut that only jumps to the end of the timeline. It is not a scene and has no closing language.
- No scene or wording anywhere suggests an ending.

### «روز اول ما»: one conversation across midnight
- **Model:** one session `{startUid, endUid}` replayed as one continuous stream.
- **Visual split:** **Segment A, before 00:00** (Jalali date D) and **Segment B, after 00:00** (Jalali date D+1), separated by a glowing midnight divider in the replay and on the scrub bar. Both dates are shown, and it is always labelled as the same conversation.
- **Detection:** suggest the earliest session overall and the earliest session crossing 00:00 in Tehran time, with spans, counts and source coverage. You confirm, or edit the start and end messages or times.
- **Coverage display:** a bar for each source over the session window.
  - If there are no messages before midnight, it says plainly that no archived messages exist before 00:00 for this night.
  - The missing part is never filled in or recreated.
- **Day boundaries** are always calculated in Asia/Tehran from UTC ms, never the device timezone. Rubika and Telegram times go through one shared converter.
- **Tests (synthetic data):**
  - A session from 23:40 to 00:30 Tehran stays one session with 2 segments.
  - Midnight falls exactly at UTC 20:30.
  - Unix and ISO inputs give identical results.
  - A user-edited range is respected.
  - A missing pre-midnight part gives a "no coverage" result with no invented messages.
  - Jalali labels for D and D+1 are correct.

### «چند وقته با همیم؟» live counter
- **Start:** the confirmed start date and time. It defaults to the confirmed «روز اول ما» start and can be edited (Jalali date and time, Tehran). Until confirmed it shows a "start not confirmed" badge.
- **End:** the actual current time, read live every second. It never uses the archive's last message date.
- **Display:**
  - years / months / days / hours / minutes / seconds on the Jalali calendar in Asia/Tehran, borrowing correctly across month lengths
  - plus total days
  - Persian digits, animated digit flips and a soft orbit pulse (static when reduced motion is on)
- **Label:** «از تاریخ شروعِ تأییدشده تا الان», meaning time since the confirmed start date. It makes no claim about relationship status.
- **Tests:**
  - Known start and now pairs give exact components.
  - Borrowing works at the end of Esfand and in leap years.
  - The counter ticks forward each second.
  - The end comes from the injected clock, never the archive.

### Other memories
- **«چطور شروع شد»:** the earliest archived messages plus the first sessions of 15–17 Apr. Verified.
- **Random memory:** picks a real day, session or message (weighted toward days with real activity), shows its intro and replay, and offers «یک خاطره‌ی دیگر». It only uses records that exist.
- **Four birthday and celebration scenes:** «نیاز به تنظیم» (needs setup) until confirmed.
  - **Suggestion signals:** birthday keywords and emoji, the sender side, an activity spike, and clustering within 48 hours.
  - **Confidence:** high (3 or more matches from one side plus a spike), medium or low.
  - **Review screen:** Confirm / Not this / Another day / Edit range / Enter date manually. Snippets are blurred until tapped.
  - Nothing is treated as fact until confirmed. Everything stays editable and can be undone.

### Replay (every scene)
- The intro shows only verified figures: Jalali dates, span, message count, sources, and who wrote first.
- After the intro, messages replay in time order.
- **Controls:** play/pause, speed (1×, 2×, 5×, 20×, or compressed gaps capped at 2 seconds), skip to the previous or next session or segment, a scrub bar with the midnight marker, and "open in timeline".
- The end card says «ادامه در تایم‌لاین» (continue in timeline). There is no closing wording.

### Time-travel explorer (instead of a plain date picker)
- **Orbit/constellation view:** each month is a ring and each day is a star, with brightness showing message volume and color showing the Mahan/Elisa share. Confirmed memories glow as constellations.
- **Slider:** Jalali months (فروردین to آبان 1405) with an activity histogram. Zoom levels: year, month, day, hour wheel, minute, then jump into the timeline.
- Month and year controls, keyboard navigation (arrows, PageUp/PageDown, Enter), and screen-reader labels.

### Performance, accessibility and privacy
- Day, hour and session counts are calculated once at import, giving about 170 day records. Stars are drawn on one canvas, and animation uses only transform and opacity. Replay and timeline windows hold 200 messages each.
- Reduced motion (system setting or toggle) switches to fades and a static counter. Contrast is 4.5:1 and focus is visible throughout.
- Everything stays on the device. No chat contents go to any cloud or AI service, the repository or the published app. Tests use synthetic data only.

### Technical additions
- **Stores:** `days`, `sessions {start,end,count,crossesMidnight,sources}` and `events {kind, range, confidence, status, manual}`. Settings hold `relationshipStart`.
- **Pure, tested modules:** `tehranTime`, `sessionize`, `splitAtMidnight`, `elapsedJalali`, `birthdayScore` and `randomMemory`.
- **Pages:** `/` (home with featured card and counter), `/memories/$sceneId`, `/explore`, `/timeline`, `/search`, `/bookmarks`.

### Key uncertainties and questions
1. The first archived message is at 03:28 on 15 Apr, with nothing on 14 Apr. Did the first conversation start the evening of 14 Apr, with that part not exported? Or is it 17→18 Apr or 20→21 Apr?
2. What exact start date and time should the live counter use?
3. What are Mahan's and Elisa's birthdays, if you'd like to enter them directly?
4. Should the optional PIN lock be on by default?
