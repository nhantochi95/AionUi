/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { closeSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readLogFileTailUtf8Sync,
  redactSensitiveLogText,
  sliceTextTailAligned,
} from '@/process/utils/redactSensitiveLogText';

describe('redactSensitiveLogText', () => {
  const DUMMY_TG_SUFFIX = ['AAHdqTcvCH1vGWJxf', 'SeofSAs0K5PALDsaw'].join('');
  const makeTgToken = (botId: string, extra = '') => `${botId}:${DUMMY_TG_SUFFIX}${extra}`;

  it('returns clean log text unchanged via fast short-circuit', () => {
    const clean = [
      'INFO starting desktop shell pid=12345',
      'DEBUG loaded 14 locale bundles successfully',
      'INFO ready in 412ms',
    ].join('\n');

    expect(redactSensitiveLogText(clean)).toBe(clean);
    expect(redactSensitiveLogText('')).toBe('');
  });

  it('redacts prefixed Telegram BotFather tokens in API and file URLs', () => {
    const secret = makeTgToken('7123456789');
    const raw = [
      `WARN error sending request for url (https://api.telegram.org/bot${secret}/getUpdates): operation timed out`,
      `INFO downloading attachment from https://api.telegram.org/file/bot${secret}/photos/file_42.jpg`,
    ].join('\n');

    const redacted = redactSensitiveLogText(raw);
    expect(redacted).toContain('https://api.telegram.org/bot[REDACTED]/getUpdates');
    expect(redacted).toContain('https://api.telegram.org/file/bot[REDACTED]/photos/file_42.jpg');
    expect(redacted).not.toContain(secret);
    expect(redacted).not.toContain(DUMMY_TG_SUFFIX);
  });

  it('redacts unprefixed raw BotFather tokens and URL-encoded (%3A / %3a) tokens', () => {
    const rawToken = makeTgToken('1234567890', '_99');
    const encodedUpper = `bot1234567890%3A${DUMMY_TG_SUFFIX}_99`;
    const encodedLower = `1234567890%3a${DUMMY_TG_SUFFIX}_99`;

    const input = `token="${rawToken}" url_upper=${encodedUpper} url_lower=${encodedLower}`;
    const redacted = redactSensitiveLogText(input);

    expect(redacted).toBe('token="[REDACTED]" url_upper=bot[REDACTED] url_lower=[REDACTED]');
    expect(redacted).not.toContain(DUMMY_TG_SUFFIX);
  });

  it('redacts OpenAI/Anthropic sk-* API keys and Bearer tokens (case-insensitive)', () => {
    const skOpenAi = ['sk', 'proj', '1234567890abcdefghij' + 'klmnopqrstuvwxyzABCD'].join('-');
    const skAnt = ['sk', 'ant', 'api03', 'abcdefghij' + 'klmnopqrstuvwxyz0123456789'].join('-');
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0=';
    const rawToken = ['ghp', '1234567890abcdefghij' + 'klmnopqrstuvwx'].join('_');

    const input = [
      `OPENAI_API_KEY=${skOpenAi}`,
      `ANTHROPIC_API_KEY=${skAnt}`,
      `Authorization: Bearer ${jwt}`,
      `header=bearer ${rawToken}`,
    ].join('\n');

    const redacted = redactSensitiveLogText(input);
    expect(redacted).toBe(
      [
        'OPENAI_API_KEY=sk-[REDACTED]',
        'ANTHROPIC_API_KEY=sk-[REDACTED]',
        'Authorization: Bearer [REDACTED]',
        'header=Bearer [REDACTED]',
      ].join('\n')
    );
  });

  it('produces zero false-positives on file:line:col, ISO timestamps, localhost ports, SHA digests, and short sk- strings', () => {
    const benign = [
      '2026-11-12T18:49:42.123456Z INFO aionui_app::main: listening on 127.0.0.1:25810',
      'at AutoUpdaterService.checkForUpdates (packages/desktop/src/process/services/autoUpdaterService.ts:653:28)',
      'at C:\\Users\\HeroTCN\\AppData\\Local\\Programs\\Rakazo\\resources\\app.asar\\out\\main\\index.js:104921:18',
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'model=sk-short-id status=200',
    ].join('\n');

    expect(redactSensitiveLogText(benign)).toBe(benign);
  });

  it('aligns tail slices to newline boundaries and processes 1 MB slices rapidly', () => {
    const partialLine = `2026-11-12T10:00:00Z WARN https://api.telegram.org/bot${makeTgToken('123456789')}/getMe\n`;
    const safeLine = '2026-11-12T10:00:01Z INFO healthy heartbeat line\n';
    const combined = partialLine + safeLine.repeat(20);

    // Slice mid-way inside `partialLine` so a naive slice would leave half a token:
    const sliced = sliceTextTailAligned(combined, combined.length - 45);
    expect(sliced.truncated).toBe(true);
    expect(sliced.content.startsWith('2026-11-12T10:00:01Z')).toBe(true);
    expect(sliced.content).not.toContain(DUMMY_TG_SUFFIX);

    // Large 1 MB text slice benchmark
    const oneMb = (
      '2026-11-12T18:49:42.123Z INFO server.ts:123 request ok\n'.repeat(18_000) +
      `2026-11-12T18:49:43.000Z WARN https://api.telegram.org/bot${makeTgToken('999888777')}/getUpdates\n`
    );
    const start = performance.now();
    const out = redactSensitiveLogText(oneMb);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(100);
    expect(out).toContain('bot[REDACTED]/getUpdates');
    expect(out).not.toContain(DUMMY_TG_SUFFIX);
  });

  it('seeks directly to the UTF-8 tail of a multi-megabyte log file without reading the full file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rakazo-tail-read-'));
    try {
      const filePath = path.join(dir, 'huge.log');
      const chunk = Buffer.from('2026-11-12T00:00:00Z DEBUG filler log entry Tiếng Việt chuẩn NFC\n'.repeat(1000), 'utf8');
      const fd = openSync(filePath, 'w');
      try {
        for (let i = 0; i < 300; i++) {
          writeSync(fd, chunk);
        }
        writeSync(fd, Buffer.from('2026-11-12T23:59:59Z INFO FINAL_TAIL_LINE\n', 'utf8'));
      } finally {
        closeSync(fd);
      }

      const start = performance.now();
      const tail = readLogFileTailUtf8Sync(filePath, 256 * 1024);
      const elapsedMs = performance.now() - start;

      expect(tail.truncated).toBe(true);
      expect(Buffer.byteLength(tail.content, 'utf8')).toBeLessThanOrEqual(256 * 1024);
      expect(tail.content).toContain('FINAL_TAIL_LINE');
      expect(tail.content).not.toContain('\uFFFD');
      expect(elapsedMs).toBeLessThan(50);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
