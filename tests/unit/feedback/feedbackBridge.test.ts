/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Node-environment tests for feedbackBridge's IPC handlers.
 * Covers the new feedback:capture-screenshot handler (main-process side).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { app } from 'electron';
import { collectFeedbackLogAttachment } from '@/process/feedback/logs';

// Table of handlers registered via ipcMain.handle during module import.
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

type FakeWebContents = {
  capturePage?: () => Promise<{ toPNG: () => Buffer }>;
};

type FakeWindow = {
  isDestroyed: () => boolean;
  webContents: FakeWebContents;
};

let currentWindow: FakeWindow | null = null;

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
    on: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => '/tmp/aionui-test-logs-nonexistent'),
    getVersion: vi.fn(() => '0.0.0'),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => currentWindow),
  },
}));

beforeEach(async () => {
  handlers.clear();
  currentWindow = null;
  vi.resetModules();
  // Importing registers the ipcMain.handle callbacks into our map.
  await import('@/process/bridge/feedbackBridge');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('feedbackBridge — capture-screenshot', () => {
  it('registers the feedback:capture-screenshot channel on import', () => {
    expect(handlers.has('feedback:capture-screenshot')).toBe(true);
  });

  it('returns png bytes and a timestamped filename on success', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => ({ toPNG: () => pngBytes })),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = (await handler({ sender: {} })) as { filename: string; data: number[] } | null;

    expect(result).not.toBeNull();
    expect(result!.filename).toMatch(/^screenshot-.*\.png$/);
    expect(result!.data).toEqual(Array.from(pngBytes));
  });

  it('returns null when no owning BrowserWindow is resolved', async () => {
    currentWindow = null;
    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null when the owning BrowserWindow is destroyed', async () => {
    currentWindow = {
      isDestroyed: () => true,
      webContents: {
        capturePage: vi.fn(),
      },
    };
    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
    expect(currentWindow.webContents.capturePage).not.toHaveBeenCalled();
  });

  it('returns null when capturePage yields an empty buffer', async () => {
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => ({ toPNG: () => Buffer.alloc(0) })),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null and does not throw when capturePage rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => {
          throw new Error('capture refused');
        }),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('feedback logs', () => {
  it('collects top-level frontend logs and nested backend logs through the IPC handler', async () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-bridge-'));
    try {
      const backendLogsDir = path.join(logsDir, 'logs');
      mkdirSync(backendLogsDir);
      writeFileSync(path.join(logsDir, '2026-05-25.log'), 'frontend renderer log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-25.log'), 'backend process log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-24.log'), 'second day backend log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-23.log'), 'third day backend log\n');
      writeFileSync(path.join(backendLogsDir, '2026-05-22.log'), 'too old backend log\n');

      vi.mocked(app.getPath).mockImplementation((name: string) => {
        if (name === 'logs') return logsDir;
        return path.join(logsDir, 'userData');
      });

      const handler = handlers.get('feedback:collect-logs')!;
      const result = (await handler({})) as { filename: string; data: number[] } | null;

      expect(result).not.toBeNull();
      const content = gunzipSync(Buffer.from(result!.data)).toString('utf8');
      expect(content).toContain('frontend renderer log');
      expect(content).toContain('backend process log');
      expect(content).toContain('second day backend log');
      expect(content).toContain('third day backend log');
      expect(content).not.toContain('too old backend log');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('collects the same recent three log days used by user feedback reports', () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-logs-'));
    try {
      writeFileSync(path.join(logsDir, '2026-05-25.log'), 'today frontend\n');
      writeFileSync(path.join(logsDir, '2026-05-25.aioncore.log'), 'today backend\n');
      writeFileSync(path.join(logsDir, '2026-05-24.aionrs.log'), 'yesterday rust\n');
      writeFileSync(path.join(logsDir, '2026-05-23.log'), 'third day frontend\n');
      writeFileSync(path.join(logsDir, '2026-05-22.log'), 'too old frontend\n');
      writeFileSync(path.join(logsDir, '2026-05-25.txt'), 'not a log\n');

      const attachment = collectFeedbackLogAttachment(logsDir);

      expect(attachment).not.toBeNull();
      expect(attachment!.filename).toBe('logs.gz');
      expect(attachment!.contentType).toBe('application/gzip');
      const content = gunzipSync(attachment!.data).toString('utf8');
      expect(content).toContain('today frontend');
      expect(content).toContain('today backend');
      expect(content).toContain('yesterday rust');
      expect(content).toContain('third day frontend');
      expect(content).not.toContain('too old frontend');
      expect(content).not.toContain('not a log');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('collects recent logs from dated year/month/day directories', () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-dated-logs-'));
    try {
      const recentDir = path.join(logsDir, '2026', '07', '02');
      const previousDir = path.join(logsDir, '2026', '07', '01');
      const oldDir = path.join(logsDir, '2026', '06', '30');
      mkdirSync(recentDir, { recursive: true });
      mkdirSync(previousDir, { recursive: true });
      mkdirSync(oldDir, { recursive: true });
      writeFileSync(path.join(recentDir, '2026-07-02.log'), 'today frontend nested\n');
      writeFileSync(path.join(recentDir, '2026-07-02.aioncore.log'), 'today backend nested\n');
      writeFileSync(path.join(previousDir, '2026-07-01.aionrs.log'), 'yesterday rust nested\n');
      writeFileSync(path.join(oldDir, '2026-06-30.log'), 'third day frontend nested\n');
      writeFileSync(path.join(logsDir, '2026-06-29.log'), 'too old flat\n');

      const attachment = collectFeedbackLogAttachment(logsDir);

      expect(attachment).not.toBeNull();
      const content = gunzipSync(attachment!.data).toString('utf8');
      expect(content).toContain('today frontend nested');
      expect(content).toContain('today backend nested');
      expect(content).toContain('yesterday rust nested');
      expect(content).toContain('third day frontend nested');
      expect(content).not.toContain('too old flat');
      expect(content).toContain('2026/07/02/2026-07-02.aioncore.log');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('redacts Telegram BotFather tokens, sk-* keys, and Bearer tokens inside logs.gz', () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-redact-'));
    try {
      const dummyTgSuffix = ['AAHdqTcvCH1vGWJxf', 'SeofSAs0K5PALDsaw'].join('');
      const tgSecret = `7123456789:${dummyTgSuffix}`;
      const skSecret = ['sk', 'proj', 'AbCdEfGhIjKlMnOpQr' + 'StUvWxYz0123456789'].join('-');
      const bearerSecret = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0=';
      writeFileSync(
        path.join(logsDir, '2026-11-12.aioncore.log'),
        [
          `2026-11-12T18:49:42.123Z WARN reqwest https://api.telegram.org/bot${tgSecret}/getUpdates timeout`,
          `2026-11-12T18:49:43.000Z INFO raw=${tgSecret} encoded=bot7123456789%3A${dummyTgSuffix}`,
          `2026-11-12T18:49:44.000Z INFO key=${skSecret} auth=Bearer ${bearerSecret}`,
          '2026-11-12T18:49:45.000Z INFO stack at server.ts:123 and 127.0.0.1:25810',
        ].join('\n') + '\n'
      );

      const attachment = collectFeedbackLogAttachment(logsDir);
      expect(attachment).not.toBeNull();
      const content = gunzipSync(attachment!.data).toString('utf8');

      expect(content).not.toContain(tgSecret);
      expect(content).not.toContain(dummyTgSuffix);
      expect(content).not.toContain(skSecret);
      expect(content).not.toContain(bearerSecret);
      expect(content).toContain('bot[REDACTED]/getUpdates');
      expect(content).toContain('sk-[REDACTED]');
      expect(content).toContain('Bearer [REDACTED]');
      expect(content).toContain('server.ts:123');
      expect(content).toContain('127.0.0.1:25810');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('bounds a 50 MB debug log file via tail slicing without stalling the main thread', () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-50mb-'));
    try {
      const dummyTgSuffix = ['AAHdqTcvCH1vGWJxf', 'SeofSAs0K5PALDsaw'].join('');
      const logPath = path.join(logsDir, '2026-11-12.aioncore.log');
      const fillerChunk = Buffer.from(('2026-11-12T10:00:00Z DEBUG noisy line without secrets\n').repeat(2000));
      const chunks = Math.ceil((50 * 1024 * 1024) / fillerChunk.length);
      writeFileSync(logPath, Buffer.alloc(0));
      const fd = openSync(logPath, 'w');
      try {
        for (let i = 0; i < chunks; i++) {
          writeSync(fd, fillerChunk);
        }
        writeSync(
          fd,
          Buffer.from(
            `2026-11-12T12:00:00Z WARN https://api.telegram.org/bot888888888:${dummyTgSuffix}/sendMessage TAIL_SENTINEL\n`
          )
        );
      } finally {
        closeSync(fd);
      }

      const start = performance.now();
      const attachment = collectFeedbackLogAttachment(logsDir);
      const elapsedMs = performance.now() - start;

      expect(attachment).not.toBeNull();
      expect(elapsedMs).toBeLessThan(150);
      const content = gunzipSync(attachment!.data).toString('utf8');
      expect(content).toContain('TAIL_SENTINEL');
      expect(content).toContain('bot[REDACTED]/sendMessage');
      expect(content).not.toContain(dummyTgSuffix);
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });
});
