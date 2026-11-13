/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';

const TELEGRAM_BOT_TOKEN_RE = /(?:bot)?\d{6,15}(?::|%3[Aa])[A-Za-z0-9_-]{30,64}/g;
const API_SECRET_KEY_RE = /\bsk-[A-Za-z0-9_-]{20,}\b/g;
const BEARER_TOKEN_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi;

/**
 * Scrub sensitive credentials (Telegram BotFather tokens in raw, `bot`-prefixed,
 * or URL-encoded `%3A` forms, `sk-*` API keys, and `Bearer` tokens) from log text.
 *
 * Uses a fast substring short-circuit so clean log slices incur zero regex overhead.
 */
export function redactSensitiveLogText(raw: string): string {
  if (
    raw.indexOf(':') === -1 &&
    raw.indexOf('%3') === -1 &&
    raw.indexOf('sk-') === -1 &&
    raw.indexOf('Bearer') === -1 &&
    raw.indexOf('bearer') === -1 &&
    raw.indexOf('BEARER') === -1
  ) {
    return raw;
  }

  return raw
    .replace(TELEGRAM_BOT_TOKEN_RE, (match) => (match.startsWith('bot') ? 'bot[REDACTED]' : '[REDACTED]'))
    .replace(API_SECRET_KEY_RE, 'sk-[REDACTED]')
    .replace(BEARER_TOKEN_RE, 'Bearer [REDACTED]');
}

/**
 * Slice a string to at most `maxChars` from the tail, aligning to the first
 * newline within a small prefix window so a truncation cut never leaves a
 * half-sliced secret token at index 0.
 */
export function sliceTextTailAligned(text: string, maxChars: number): { content: string; truncated: boolean } {
  if (maxChars <= 0) {
    return { content: '', truncated: text.length > 0 };
  }
  if (text.length <= maxChars) {
    return { content: text, truncated: false };
  }

  let sliced = text.slice(text.length - maxChars);
  const maxAlignScan = Math.min(512, Math.floor(sliced.length / 4));
  if (maxAlignScan > 0) {
    const newlineIdx = sliced.indexOf('\n');
    if (newlineIdx !== -1 && newlineIdx < maxAlignScan) {
      sliced = sliced.slice(newlineIdx + 1);
    }
  }
  return { content: sliced, truncated: true };
}

/**
 * Read at most the last `maxBytes` of a UTF-8 log file from disk without
 * allocating the entire file into memory, keeping Electron main-thread I/O
 * bounded even on multi-10MB historical debug logs.
 */
export function readLogFileTailUtf8Sync(filePath: string, maxBytes: number): { content: string; truncated: boolean } {
  const stat = fs.statSync(filePath);
  if (stat.size <= 0 || maxBytes <= 0) {
    return { content: '', truncated: stat.size > 0 };
  }
  if (stat.size <= maxBytes) {
    return { content: fs.readFileSync(filePath, 'utf8'), truncated: false };
  }

  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(maxBytes);
    const startOffset = stat.size - maxBytes;
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, startOffset);
    if (bytesRead <= 0) {
      return { content: '', truncated: true };
    }

    // Skip any leading UTF-8 continuation bytes (10xxxxxx) at the seek boundary.
    let sliceStart = 0;
    while (sliceStart < bytesRead && sliceStart < 4 && (buf[sliceStart] & 0xc0) === 0x80) {
      sliceStart++;
    }

    let content = buf.subarray(sliceStart, bytesRead).toString('utf8');
    const maxAlignScan = Math.min(512, Math.floor(content.length / 4));
    if (maxAlignScan > 0) {
      const newlineIdx = content.indexOf('\n');
      if (newlineIdx !== -1 && newlineIdx < maxAlignScan) {
        content = content.slice(newlineIdx + 1);
      }
    }

    return { content, truncated: true };
  } finally {
    fs.closeSync(fd);
  }
}
