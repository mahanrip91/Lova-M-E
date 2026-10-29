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
