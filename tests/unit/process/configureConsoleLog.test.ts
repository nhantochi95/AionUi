/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

const { logHooks } = vi.hoisted(() => ({
  logHooks: [] as Array<(message: any, transport?: unknown, transportName?: string) => any>,
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}));

vi.mock('electron-log/main', () => ({
  default: {
    functions: {},
    hooks: logHooks,
    initialize: vi.fn(),
    transports: {
      console: { level: undefined },
      file: {
        fileName: undefined,
        level: undefined,
        maxSize: undefined,
        resolvePathFn: undefined,
      },
    },
  },
}));

import { buildDatedLogFileName, parseTracingLine } from '@/process/utils/configureConsoleLog';

describe('configureConsoleLog', () => {
  it('uses year/month/day directories for frontend log files', () => {
    const date = new Date(Date.UTC(2026, 6, 2, 12));

    expect(buildDatedLogFileName(date)).toBe('2026/07/02/2026-07-02.log');
  });

  it('strips full ANSI CSI sequences before matching Rust tracing lines', () => {
    const raw =
      '\u001B[2K\u001B[1G\u001B[2m2026-11-12T10:15:30.123456Z\u001B[0m  \u001B[38;5;34mINFO\u001B[0m aionui_team::service: leader ready';
    const parsed = parseTracingLine(raw);

    expect(parsed).toEqual({
      matched: true,
      level: 'info',
      body: 'aionui_team::service: leader ready',
    });
  });

  it('parses optional JSON tracing lines when emitted', () => {
    const raw = JSON.stringify({
      timestamp: '2026-11-12T10:15:30.123456Z',
      level: 'WARN',
      target: 'aionui_channel::telegram',
      fields: { message: 'retrying upload', attempt: 2 },
    });

    expect(parseTracingLine(raw)).toEqual({
      matched: true,
      level: 'warn',
      body: 'aionui_channel::telegram: retrying upload attempt=2',
    });
  });

  it('deduplicates routine [aioncore] INFO/DEBUG/TRACE lines on file transport while keeping dev console output', () => {
    const hook = logHooks[0];
    expect(hook).toBeTypeOf('function');

    const infoMsg = {
      level: 'info',
      data: ['[aioncore] \u001B[2m2026-11-12T10:15:30.000Z\u001B[0m  INFO aionui_app: request ok'],
      date: new Date(),
    };
    const debugMsg = {
      level: 'info',
      data: ['[aioncore] 2026-11-12T10:15:30.000Z DEBUG aionui_db: query'],
      date: new Date(),
    };
    const traceMsg = {
      level: 'info',
      data: ['[aioncore] 2026-11-12T10:15:30.000Z TRACE aionui_session: frame'],
      date: new Date(),
    };

    expect(hook(infoMsg, undefined, 'file')).toBe(false);
    expect(hook(debugMsg, undefined, 'file')).toBe(false);
    expect(hook(traceMsg, undefined, 'file')).toBe(false);

    expect(hook(infoMsg, undefined, 'console')).toEqual({
      ...infoMsg,
      level: 'info',
      data: ['[aioncore] aionui_app: request ok'],
    });
  });

  it('preserves WARN/ERROR tracing lines and never downgrades multi-line panic/stderr levels on file transport', () => {
    const hook = logHooks[0];

    const warnTracingMsg = {
      level: 'info',
      data: ['[aioncore] 2026-11-12T10:15:30.000Z  WARN aionui_team: slow turn'],
      date: new Date(),
    };
    const errorTracingMsg = {
      level: 'info',
      data: ['[aioncore] 2026-11-12T10:15:30.000Z ERROR aionui_team: fatal failure'],
      date: new Date(),
    };
    const panicFrameMsg = {
      level: 'error',
      data: ["[aioncore] \u001B[31mthread 'tokio-runtime-worker' panicked at crates/foo/src/lib.rs:42:9:\u001B[0m"],
      date: new Date(),
    };
    const stderrWarnMsg = {
      level: 'warn',
      data: ['[aioncore]   0: rust_begin_unwind'],
      date: new Date(),
    };

    expect(hook(warnTracingMsg, undefined, 'file')).toEqual({
      ...warnTracingMsg,
      level: 'warn',
      data: ['[aioncore] aionui_team: slow turn'],
    });
    expect(hook(errorTracingMsg, undefined, 'file')).toEqual({
      ...errorTracingMsg,
      level: 'error',
      data: ['[aioncore] aionui_team: fatal failure'],
    });
    expect(hook(panicFrameMsg, undefined, 'file')).toEqual({
      ...panicFrameMsg,
      level: 'error',
      data: ["[aioncore] thread 'tokio-runtime-worker' panicked at crates/foo/src/lib.rs:42:9:"],
    });
    expect(hook(stderrWarnMsg, undefined, 'file')).toEqual({
      ...stderrWarnMsg,
      level: 'warn',
      data: ['[aioncore]   0: rust_begin_unwind'],
    });
  });
});
