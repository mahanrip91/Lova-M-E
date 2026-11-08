import fs from 'node:fs';
import readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const URL = 'https://kvxcgliptbpqhwkhjfgm.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eGNnbGlwdGJwcWh3a2hqZmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNTY3MzcsImV4cCI6MjEwOTYzMjczN30.lCeeKQVkRqzQD9t8NDEQReuiyRDJKwrqIU-Y9AffCRQ';

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const DIR = '/sdcard/download/Massage/';
const FILES = {
  rubika: '3_ִ𖹭𑪊ִ ᷼ᤢ.json',
  telegram1: 'ℯ𝑙𝑖𝓈𝒶_from_𝓶𝓪𝓱𝓪𝓷.json',
  telegram2: '𖹭_from_𝓶𝓪𝓱𝓪𝓷.json'
};

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, value => {
    rl.close();
    resolve(value.trim());
  }));
}

function askHidden(prompt) {
  return new Promise(resolve => {
    const input = process.stdin;
    let value = '';
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    const finish = () => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      process.stdout.write('\n');
      resolve(value);
    };

    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\u0003') {
          process.stdout.write('\nلغو شد.\n');
          process.exit(130);
        } else if (ch === '\r' || ch === '\n') {
          finish();
          return;
        } else if (ch === '\u0008' || ch === '\u007f') {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      }
    };
    input.on('data', onData);
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(DIR + file, 'utf8'));
}

function getText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(getText).join('');
  if (value && typeof value === 'object') return getText(value.text ?? '');
  return '';
}

function iso(ms) {
  if (!Number.isFinite(ms)) throw new Error('تاریخ نامعتبر پیدا شد.');
  return new Date(ms).toISOString();
}

function makeSource(id, platform, file, messages, metadata = {}) {
  const times = messages.map(m => Date.parse(m.occurred_at));
  return {
    id,
    platform,
    label: 'گفتگوی ماهان و الیسا',
    file_name: file,
    is_group: false,
    message_count: messages.length,
    from_at: iso(Math.min(...times)),
    to_at: iso(Math.max(...times)),
    metadata
  };
}

function buildRubika() {
  const file = FILES.rubika;
  const data = readJson(file);
  const chatGuid = String(data.chat_guid);
  const sourceId = 'rubika_private_main';
  const senderCounts = new Map();
  const messages = [];

  for (let i = 0; i < data.messages.length; i++) {
    const m = data.messages[i];
    const originalSender = String(m.author_object_guid);
    const side = originalSender === chatGuid ? 'E' : 'M';
    const senderKey = side;
    senderCounts.set(side, (senderCounts.get(side) || 0) + 1);

    const body = getText(m.text);
    const fileInfo = m.file_inline;
    const type = String(m.type || '');
    let kind = 'text';

    if (type === 'Sticker') kind = 'sticker';
    else if (type === 'RubinoPost') kind = 'post';
    else if (fileInfo) {
      const kinds = {
        Image: 'image', Gif: 'gif', Video: 'video',
        Voice: 'voice', Music: 'music', File: 'file'
      };
      kind = kinds[fileInfo.type] || 'file';
    } else if (!body) kind = 'nontext';

    const originalId = String(m.message_id);
    messages.push({
      uid: `${sourceId}:${originalId}`,
      source_id: sourceId,
      original_id: originalId,
      occurred_at: iso(Number(m.time) * 1000),
      sender_key: senderKey,
      sender_side: side,
      body,
      kind,
      original_order: i,
      reply_uid: m.reply_to_message_id
        ? `${sourceId}:${m.reply_to_message_id}` : null,
      media_label: fileInfo?.file_name || m.sticker?.emoji_character || null,
      is_edited: !!m.is_edited,
      is_forwarded: !!(m.forwarded_from || m.forwarded_no_link),
      metadata: {
        original_sender_id: originalSender,
        original_type: type,
        allow_transcription: !!m.allow_transcription,
        has_link: !!m.has_link
      }
    });
  }

  const senders = ['M', 'E'].map(side => ({
    source_id: sourceId,
    sender_key: side,
    display_name: side === 'M' ? 'ماهان' : 'الیسا',
    side,
    confirmed: false,
    guess_reason: 'تطبیق شناسه فرستنده با شناسه گفتگو در خروجی روبیکا',
    message_count: senderCounts.get(side) || 0
  }));

  return {
    source: makeSource(sourceId, 'rubika', file, messages, {
      original_chat_guid: chatGuid,
      original_chat_title: data.chat_title
    }),
    senders,
    messages
  };
}

function buildTelegram(file, sourceId, elisaId) {
  const rows = readJson(file);
  const senderCounts = { M: 0, E: 0 };
  const messages = [];

  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];
    const originalSender = String(m.sender_id);
    let side;

    if (originalSender === '7001392382') side = 'M';
    else if (originalSender === elisaId) side = 'E';
    else throw new Error(`شناسه فرستنده ناشناخته در ${file}: ${originalSender}`);

    senderCounts[side]++;
    const body = getText(m.text);
    const originalId = String(m.id);

    messages.push({
      uid: `${sourceId}:${originalId}`,
      source_id: sourceId,
      original_id: originalId,
      occurred_at: iso(Date.parse(m.date)),
      sender_key: side,
      sender_side: side,
      body,
      kind: body ? 'text' : 'nontext',
      original_order: i,
      reply_uid: m.reply_to != null ? `${sourceId}:${m.reply_to}` : null,
      media_label: null,
      is_edited: !!m.edited,
      is_forwarded: !!m.forwarded_from,
      metadata: {
        original_sender_id: originalSender,
        original_sender_name: String(m.sender_name ?? '')
      }
    });
  }

  const senders = ['M', 'E'].map(side => ({
    source_id: sourceId,
    sender_key: side,
    display_name: side === 'M' ? 'ماهان' : 'الیسا',
    side,
    confirmed: false,
    guess_reason: 'تطبیق شناسه مشترک ماهان و فرستنده دوم در خروجی تلگرام',
    message_count: senderCounts[side]
  }));

  return {
    source: makeSource(sourceId, 'telegram', file, messages),
    senders,
    messages
  };
}


function cleanUnicode(value) {
  if (typeof value === 'string') {
    let out = '';
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);

      if (c === 0) {
        out += '\uFFFD';
      } else if (c >= 0xD800 && c <= 0xDBFF) {
        const next = value.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          out += value[i] + value[++i];
        } else {
          out += '\uFFFD';
        }
      } else if (c >= 0xDC00 && c <= 0xDFFF) {
        out += '\uFFFD';
      } else {
        out += value[i];
      }
    }
    return out;
  }

  if (Array.isArray(value)) return value.map(cleanUnicode);

  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      result[cleanUnicode(key)] = cleanUnicode(item);
    }
    return result;
  }

  return value;
}

async function upload(table, rows, conflict) {
  const size = 500;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size).map(cleanUnicode);
    const { error } = await supabase.from(table).upsert(batch, {
      onConflict: conflict
    });
    if (error) {
      throw new Error(`${table}، ردیف ${i + 1}: ${error.message}`);
    }
    const done = Math.min(i + batch.length, rows.length);
    if (done === rows.length || done % 5000 === 0) {
      console.log(`${table}: ${done.toLocaleString()} / ${rows.length.toLocaleString()}`);
    }
  }
}

async function main() {
  console.log('ساخت آرشیو یکپارچه M AND E');
  console.log('ایمیل حساب ماهان را وارد کن؛ رمز فقط در همین ترمینال گرفته می‌شود.');

  const email = await ask('Email: ');
  const password = await askHidden('Password: ');

  const { data: auth, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (authError) throw new Error('ورود ناموفق: ' + authError.message);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,display_name,side')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || profile.side !== 'M') {
    throw new Error('این حساب به پروفایل ماهان متصل نیست؛ آپلود انجام نشد.');
  }

  console.log('\nحساب ماهان تأیید شد. در حال خواندن آرشیوها...');

  const archives = [
    buildRubika(),
    buildTelegram(FILES.telegram1, 'telegram_elisa_mahan', '8130263711'),
    buildTelegram(FILES.telegram2, 'telegram_heart_mahan', '8816310115')
  ];

  const allMessages = archives.flatMap(a => a.messages);
  const allSources = archives.map(a => a.source);
  const allSenders = archives.flatMap(a => a.senders);

  if (allMessages.length !== 96355) {
    throw new Error(`تعداد پیام‌ها غیرمنتظره است: ${allMessages.length}`);
  }

  const unique = new Set(allMessages.map(m => m.uid));
  if (unique.size !== allMessages.length) {
    throw new Error('شناسه تکراری پیام پیدا شد؛ آپلود متوقف شد.');
  }

  console.log('\nآماده آپلود:');
  console.log('Sources:', allSources.length);
  console.log('Senders:', allSenders.length);
  console.log('Messages:', allMessages.length.toLocaleString());
  console.log('Mahan:', allSenders.filter(s => s.side === 'M')
    .reduce((n, s) => n + s.message_count, 0).toLocaleString());
  console.log('Elisa:', allSenders.filter(s => s.side === 'E')
    .reduce((n, s) => n + s.message_count, 0).toLocaleString());

  const confirm = await ask('\nبرای شروع آپلود عبارت UPLOAD را بنویس: ');
  if (confirm !== 'UPLOAD') {
    console.log('لغو شد؛ هیچ پیامی آپلود نشد.');
    return;
  }

  await upload('archive_sources', allSources, 'id');
  await upload('archive_senders', allSenders, 'source_id,sender_key');
  await upload('archive_messages', allMessages, 'uid');

  console.log('\n✅ آپلود کامل شد.');
  console.log('تعداد پیام‌های پردازش‌شده:', allMessages.length);
  await supabase.auth.signOut();
}

main().catch(error => {
  console.error('\n❌ خطا:', error.message || error);
  process.exitCode = 1;
});
