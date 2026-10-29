# M AND E — File inspection report and build plan

## Part A — Verified findings (all three files opened and parsed in full, read-only)

| # | File | Format | Size | Source app (inferred) | Messages | Range (UTC) |
|---|------|--------|------|------|------|------|
| 1 | `3_ִ𖹭𑪊ִ_᷼ᤢ.json` | JSON object | ~7.95 MB | Rubika (field names match Rubika API) | 20,534 (matches `message_count`, `complete: true`) | 2026-04-14 23:58 → 2026-08-31 21:50 |
| 2 | `ℯ𝑙𝑖𝓈𝒶_from_𝓶𝓪𝓱𝓪𝓷.json` | JSON array | ~7.18 MB | Telegram (simplified export) | 33,806 | 2026-07-19 23:16 → 2026-09-26 20:45 |
| 3 | `𖹭_from_𝓶𝓪𝓱𝓪𝓷.json` | JSON array | ~8.85 MB | Telegram (simplified export) | 41,179 | 2026-08-18 17:06 → 2026-10-29 07:34 |

Total: about 95,500 messages. That is far more than 20k, so performance work is essential.

### 1. Structure and keys
- **File 1 (Rubika):** top level is `{chat_title, chat_guid, message_count, complete, exported_at, messages[]}`. Each message has `message_id` (string), `time` (string), `type`, `is_edited`, `author_type` (always "User"), `author_object_guid`, `allow_transcription`, and an optional `text`. Optional fields: `reply_to_message_id`, `file_inline`, `forwarded_from`, `forwarded_no_link`, `reactions`, `metadata` (text-format ranges), `sticker`, `rubino_post_data`, `has_link`.
  Redacted example: `{message_id:"16303…", time:"1776211116", type:"Text", author_object_guid:"u0IX…", text:"<136 chars>", is_edited:false}`
- **Files 2 and 3 (Telegram):** a flat array of `{id:int, date:string, sender_id:int, sender_name:string, text:string, reply_to:int|null}`. No other fields.

### 2. Counts and duplicates
- No duplicate IDs in any file.
- File 1 has 12 messages that share the same second and the same text. Files 2 and 3 have about 125 each. These look like real repeated sends (such as emoji spam), not export duplicates. Keep them all.
- Files 2 and 3 have **zero** messages that match exactly (same time and same text), even though their dates overlap from 18 Aug to 26 Sep. That means they are two separate chats, not copies of each other.
- The Telegram IDs have large gaps (about 66k in file 2 and about 18k in file 3). Those messages were probably deleted or are service messages, so the IDs can't be used to judge whether a file is complete.

### 3. Timestamps
- **File 1:** Unix epoch in seconds, stored as a 10-digit string, sorted ascending. `exported_at` is ISO time with no timezone, probably Tehran local time (an assumption).
- **Files 2 and 3:** ISO 8601 with `+00:00`, at one-second precision, sorted ascending, none missing.
- No Jalali or Persian dates appear in any file. Every date is Gregorian or Unix, so Jalali display has to be computed.

### 4. Who sent each message
- **File 2:** `7001392382` "𝓶𝓪𝓱𝓪𝓷" sent 16,339 messages and `8130263711` "ℯ𝑙𝑖𝓈𝒶" sent 17,467.
- **File 3:** `7001392382` "𝓶𝓪𝓱𝓪𝓷" sent 20,096 messages and `8816310115` "꣄𐇽̼ᩘْْ.𖹭ִ" sent 21,083.
- **File 1:** there are only two authors: `u0IX…` (9,635 messages) and `u0Efd…` (10,899). `chat_guid` equals `u0Efd…`.
- **Ambiguities:**
  - (a) Elisa uses a different Telegram ID in file 3 and the name there has no letters, only symbols. I'm assuming it's still Elisa because the 𖹭 symbol appears in that name and in the file 1 title.
  - (b) File 1 has no names at all. In Rubika, a private chat's ID is normally the other person's ID, so `u0Efd…` would be Elisa and `u0IX…` would be Mahan. This is an assumption.
  - Plan: auto-assign sides using these rules, then show a one-time "confirm sides" screen that lets you swap them.

### 5. Message types, media, replies, forwards, edits
- **File 1:**
  - Types: Text 20,082, FileInline 333, FileInlineCaption 113, Sticker 5, RubinoPost 1.
  - `file_inline` holds only metadata: `file_name, mime, size, width/height, type`. Media types: Gif 231, Image 179, Video 18, Voice 10, Music 6, zip 2. 428 of these include a small `thumb_inline`, a tiny base64 preview that can be shown blurred.
  - **No actual media files are included.**
  - Replies: 11,132, and 11,116 of them point to a message in the file.
  - Forwards: 240 (User 235, Channel 3, Bot 2), plus 3 hidden-source forwards.
  - Edited: 203. Reactions: 41. Deletion info: none.
- **Files 2 and 3:**
  - Only `reply_to` exists. File 2 has 17,136 replies, 17,118 of which can be traced. File 3 has 20,137, with 20,124 traceable.
  - No type, media, forward, edit or delete info.
  - Messages with empty text (2,179 and 2,021) are probably media or stickers whose details were dropped. They'll be labelled "Media / non-text message".

### 6. Overlap and merging
- These are three separate conversations: Rubika (Apr to Aug), Telegram account A (Jul to Sep) and Telegram account B (Aug to Oct). The date ranges overlap, but no records are duplicated.
- About 100 longer texts appear in both Telegram files, and about 20 appear in both Rubika and Telegram. These are likely copy-pastes or forwards. Don't remove them.
- **Merging works reliably:** convert every time to UTC epoch ms and sort by time, then source, then original order. Each message keeps a source label.

### 7. Limitations and privacy
- No malformed records, no missing timestamps, and all three files parse as valid JSON.
- One-second precision means ties are common. Breaking ties by original file order keeps conversation order intact.
- Names use decorative Unicode, and some symbols may not show in all fonts. Show friendly names you set, with the original name as a tooltip.
- About 30 replies point to messages that aren't in the export. They'll show "Original message not available".
- **Privacy:** these files contain intimate personal conversations plus internal IDs. The Rubika `access_hash_rec` and `file_id` fields work like access tokens. They must **never** be bundled into the app or uploaded anywhere. The published app would be public, so the chats can't be built into it.

## Part B — Architecture plan

**Principle:** the app ships with no chat data. On each device, you pick the three JSON files once. Everything is processed in your browser and saved only on that device.

```text
File picker -> Web Worker (parse + normalize + build search index)
            -> IndexedDB (messages, index, bookmarks, settings)
UI (main thread) <- paged queries <- IndexedDB
```

**Screens (Persian, right-to-left, neon/cosmic theme)**
1. **Import:** drop or pick the files. Each source type is detected automatically, with a progress bar and a "confirm sides" step (Mahan or Elisa for each sender ID).
2. **Timeline:** one stream merging all sources, chat bubbles (Mahan on one side, Elisa on the other), a small source label (Rubika / Telegram A / Telegram B), sticky Jalali day headers, reply previews you can tap to jump to the original, and icons for media placeholders, forwards and edits.
3. **Jump to date/time:** a Jalali date and time picker that goes straight to the nearest message.
4. **Search:** Persian-aware matching that treats ي/ی and ك/ک as the same, ignores ZWNJ and diacritics, and can be filtered by source, sender and date. Tapping a result opens it in the timeline.
5. **Bookmarks:** star any message, add an optional note, and see them in a list.
6. **Settings:** source filters, display names, re-import, and "delete all data from this device".

**Design:** deep-space background with a subtle starfield, neon cyan for Mahan and neon magenta for Elisa, the Vazirmatn font, glowing accents, and dark only.

## Technical details
- **Stack:** the existing TanStack Start app, all client-side. No Lovable Cloud and no server functions touch chat data.
- **Normalized record:** `{uid: source+id, source, ts (ms UTC), side: 'M'|'E'|'?', senderRaw, text, kind, replyUid?, media?: {type,mime,name,size,thumb?}, edited?, forwarded?, reactions?, ord}`. Secret Rubika fields (`access_hash_rec`, `file_id`, `dc_id`) are dropped when the file is read.
- **Parsing:** a dedicated Web Worker that detects the format by its keys and writes to IndexedDB (via Dexie) in batches of 2,000, with indexes on `ts`, `[source+ts]` and `side`.
- **Rendering:** a virtualized list (`@tanstack/react-virtual`) loading pages of about 200 messages around a position. Jumping to a date or time uses a binary search on the `ts` index.
- **Search:** an inverted index of normalized words built in the worker (MiniSearch or a simple custom one) and stored in IndexedDB. Queries run in the worker.
- **Jalali:** `Intl.DateTimeFormat('fa-IR-u-ca-persian', {timeZone:'Asia/Tehran'})` for display. A small Jalali-to-Gregorian converter handles the picker. Persian digits throughout.
- **App install and offline:** a manifest with icons, plus offline caching via `vite-plugin-pwa` (generateSW, NetworkFirst for pages). Registration is guarded so it never runs in the preview or inside an iframe, and offline works only on the published site.
- **Head metadata** for each page, and the placeholder home page is replaced by the Timeline (or Import when nothing is loaded yet).
- **Tests:** format detection, side mapping, UTC timestamp conversion, merge order including tie-breaks, Persian search normalization and Jalali conversion, all run against small synthetic samples (never real chat data).
- **Record in AGENTS.md:** local-first only, never commit chat files, and the normalized schema.

## Open decisions (defaults used unless you say otherwise)
- The file 3 sender is treated as Elisa, and in Rubika `u0Efd…` is treated as Elisa. You can change both on the confirm screen.
- Empty-text Telegram messages are shown as media placeholders, not hidden.
- No passcode lock. Adding an optional PIN screen is recommended, since this content is private.

## Part C — Memory Journey (animated experience)

### Verified facts for memories (times in Tehran; checked on counts and times only, no message text read)
- **First message ever:** 15 Apr 2026, 03:28, on Rubika.
- **Last message:** 29 Oct 2026, 11:04, on Telegram B. Several goodbye-style words appear among the last 300 messages, but not necessarily as a final farewell.
- **First calendar day (15 Apr):** only 10 messages, in two short bursts at 03:28 and 12:17.
- **No conversation in the first week ends with a goodbye around 5 AM.** The first long night is 17 Apr, 02:28 to 03:15 (48 messages, with a goodbye-like word near the end). The first very long session is 20 Apr, 19:51 to 00:57 (396 messages).
- **The "5 AM goodbye" can't be confirmed.** The app will find candidate nights automatically (sessions that end between 04:00 and 06:30 with a goodbye-like word in the last messages) and let you pick the one you remember. It won't invent anything.
- **Birthday-related words** (تولد, 🎂, happy birthday) appear in 86 messages across about 40 days. The busiest days are 27 Sep, 1 Oct and 2 Oct (6 to 8 matches each). These are only **candidates**. The actual birthday dates for Mahan and Elisa are **unknown**.
- **Coverage:** 169 active days. The busiest day is 15 Aug, with 2,244 messages.

### Memory scenes
| Scene | How the date is chosen | Default status |
|------|------|------|
| How it began | First message ever, plus the first sessions of 15–17 Apr | Verified |
| First day | The whole first Tehran calendar day, or a first night you pick | Verified, with a choice |
| First long night | First session longer than 45 minutes | Verified (17 Apr) |
| Goodbye night (around 5 AM) | Candidate list you confirm | Unknown, needs your confirmation |
| Last message | Final message plus the last session before it | Verified |
| Mahan's birthday / Elisa's birthday | Your input, or confirming a suggested day | Unknown |
| Mahan celebrates Elisa's birthday / Elisa greets Mahan | Birthday-word days, split by sender side | Suggested only, with confidence labels |
| Custom memories | Any date or message range you save | Set by you |

- Every scene card shows a badge: **Verified**, **Suggested (high / medium / low confidence)** or **Needs setup**.
- An unconfirmed scene is locked behind a "Confirm this memory" step.

### Event discovery and confirmation
- **Detection runs locally in the worker and scores each candidate day.** Signals:
  - birthday keywords, emoji and greeting phrases
  - which side sent them
  - a spike in activity that day
  - a cluster of matches within 48 hours
  - mentions of the same date across the sources
- **High confidence** means at least 3 matches from one side plus an activity spike. **Medium** means 2 matches or keywords only. **Low** means a single match.
- **Review screen:** for each candidate you see the date (Jalali and Gregorian), counts, the sender side and a blurred snippet you can tap to reveal. Buttons: Confirm / Not this / Pick another day / Edit time range.
- **Manual corrections:** set or change any event date, rename events, reassign the sender side, and change a scene's start and end messages. Every change is stored on the device and can be undone.

### Cinematic replay
- **Intro (3 to 6 seconds):** animated title, the Jalali date, and a few verified figures (message count, duration, sources, who wrote first). Every line comes from the real data, with no generated story.
- **Then messages replay one by one in time order**, with typing-style reveals.
- **Controls:**
  - Play / pause
  - Speed: 1×, 2×, 5×, 20×, or "real time compressed", where long gaps are capped at 2 seconds
  - Skip to next or previous session
  - Scrub bar
  - "Open in timeline" jumps to the same message in the main stream
- A visible end card shows the real final message of that scene. Nothing is added after it.

### Date exploration
- **Orbit view:** months orbit as rings. Each day is a star whose brightness and size reflect how many messages it has, and its color shows the share from Mahan, Elisa or both. Confirmed memories glow as constellations.
- **Time-travel slider:** a horizontal timeline from Apr to Oct 2026 with Jalali month labels (فروردین to آبان) and an activity histogram. Drag to scrub, pinch or wheel to zoom from year to month, day and hour.
- **Hour wheel** for the chosen day, then a jump straight to that minute in the timeline.
- Keyboard: arrow keys move day by day, PageUp/PageDown move month by month, and Enter opens the selection. Screen-reader labels give the Jalali date and the message count.

### Performance and accessibility
- Daily and hourly counts are calculated once at import and cached, so views draw from about 170 day records instead of 95k messages.
- Star fields are drawn on a single canvas (Canvas2D, with device pixel ratio limited to 2). Transitions use only transform and opacity (Framer Motion), and replays load messages in windows of 200.
- **Reduced motion:** with `prefers-reduced-motion`, or the in-app toggle, everything switches to cross-fades with no drifting stars and instant reveals.
- Focus rings, 4.5:1 contrast and captioned controls.

### Privacy
- Scenes, detected events and confirmations live only in the on-device database. No message text is sent to any AI or cloud service, and nothing is built into the published app.
- Any test data is synthetic.

### Technical additions
- New stores: `days {date, counts by side and source}`, `sessions {start, end, count, endsWithBye}` and `events {kind, date, range, confidence, status: suggested|confirmed|rejected, manual}`.
- Detectors are pure functions with unit tests: session split (gap of 90 minutes or more), goodbye-like ending, birthday scoring and Jalali boundaries in Tehran time.
- Pages: `/memories` (scene gallery), `/memories/$sceneId` (player), `/explore` (orbit and slider).

### Questions for you
1. What are Mahan's and Elisa's real birthdays, or should the app only suggest them from the chats?
2. Which "goodbye around 5 AM" night do you mean: the first one, or a specific later date?
3. Should "first day" mean 15 Apr only (10 messages), or the first real long night?
4. Should private snippets on the review screen be blurred by default?
5. Should there be an optional PIN to open the app?
