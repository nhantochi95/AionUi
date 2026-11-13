/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Redirect main-process console output to electron-log so that all
 * console.log / console.warn / console.error calls are persisted to
 * daily log files on disk.
 *
 * Log file location (managed by electron-log):
 *   - macOS:   ~/Library/Logs/AionUi/YYYY/MM/DD/YYYY-MM-DD.log
 *   - Windows: %USERPROFILE%\AppData\Roaming\AionUi\logs\YYYY\MM\DD\YYYY-MM-DD.log
 *   - Linux:   ~/.config/AionUi/logs/YYYY/MM/DD/YYYY-MM-DD.log
 *
 * Users can share the relevant date's file for debugging (#1157).
 *
 * Must be imported as early as possible in the main process entry point,
 * BEFORE any other module emits console output.
 */

import { app } from 'electron';
import log from 'electron-log/main';
import fs from 'node:fs';
import path from 'node:path';

const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10 MB
const FILE_LOG_LEVEL = 'info';
const CONSOLE_LOG_LEVEL = 'silly';

type LogPathMessage = {
  date?: Date | number | string;
};

function formatLocalDateParts(date: Date): { year: string; month: string; day: string; dateStr: string } {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return {
    year,
    month,
    day,
    dateStr: `${year}-${month}-${day}`,
  };
}

export function buildDatedLogFileName(date = new Date()): string {
  const { year, month, day, dateStr } = formatLocalDateParts(date);
  return `${year}/${month}/${day}/${dateStr}.log`;
}

function resolveMessageDate(message?: LogPathMessage): Date {
  const rawDate = message?.date;
  const date = rawDate instanceof Date ? rawDate : rawDate ? new Date(rawDate) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

// Daily log file: e.g. 2026/03/12/2026-03-12.log
log.transports.file.fileName = buildDatedLogFileName();
log.transports.file.resolvePathFn = (variables, message?: LogPathMessage) => {
  const filePath = path.join(variables.libraryDefaultDir, buildDatedLogFileName(resolveMessageDate(message)));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return filePath;
};

// --- Main-process logger (frontend) ---
log.transports.file.level = FILE_LOG_LEVEL;
log.transports.file.maxSize = FILE_SIZE_LIMIT;
log.transports.console.level = app.isPackaged ? false : CONSOLE_LOG_LEVEL;

const BACKEND_PREFIX = '[aioncore]';

// Strip full ECMA-48 ANSI CSI sequences (colors, cursor movement, line clear, etc.).
const ANSI_CSI_RE = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'g');

export type ElectronLogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly';

export type ParsedTracingLine = {
  matched: boolean;
  level?: ElectronLogLevel;
  body: string;
};

const TRACING_LEVEL_MAP: Record<string, ElectronLogLevel> = {
  TRACE: 'verbose',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

// Parse plain-text tracing output: "2026-04-25T11:17:43.184875Z  INFO target: message"
const TRACING_RE = /^\s*\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+([\s\S]*)$/;

export function parseTracingLine(raw: string): ParsedTracingLine {
  const clean = raw.replace(ANSI_CSI_RE, '');
  const m = TRACING_RE.exec(clean);
  if (m) {
    return {
      matched: true,
      level: TRACING_LEVEL_MAP[m[1]] ?? 'info',
      body: m[2],
    };
  }

  const trimmed = clean.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsedJson = JSON.parse(trimmed) as {
        level?: unknown;
        target?: unknown;
        message?: unknown;
        fields?: Record<string, unknown>;
      };
      const rawLevel = typeof parsedJson?.level === 'string' ? parsedJson.level.toUpperCase() : '';
      const mappedLevel = TRACING_LEVEL_MAP[rawLevel];
      if (mappedLevel) {
        const target = typeof parsedJson.target === 'string' ? parsedJson.target : '';
        const fields = parsedJson.fields && typeof parsedJson.fields === 'object' ? parsedJson.fields : undefined;
        const msgText =
          (fields && typeof fields.message === 'string' ? fields.message : undefined) ??
          (typeof parsedJson.message === 'string' ? parsedJson.message : undefined);
        const extraFields = fields
          ? Object.entries(fields)
              .filter(([k]) => k !== 'message')
              .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
              .join(' ')
          : '';
        const messagePart = [msgText, extraFields].filter(Boolean).join(' ') || trimmed;
        const body = target ? `${target}: ${messagePart}` : messagePart;
        return { matched: true, level: mappedLevel, body };
      }
    } catch {
      // Not valid JSON tracing output — treat as unmatched raw/stderr line.
    }
  }

  return { matched: false, body: clean };
}

// Clean up backend subprocess log lines:
// - Suppress routine INFO/DEBUG/TRACE lines on the shared `file` transport only
//   (they already live in YYYY-MM-DD.aioncore.log; dev console still sees them).
// - Preserve WARN/ERROR tracing lines and all unmatched lines (multi-line Rust panics,
//   stack frames, backend-launcher stderr) at their true severity without overwriting `message.level`.
log.hooks.push((message, _transport, transportName) => {
  const first = message.data[0];
  if (typeof first !== 'string' || !first.startsWith(BACKEND_PREFIX)) return message;

  const raw = first.startsWith(`${BACKEND_PREFIX} `)
    ? first.slice(BACKEND_PREFIX.length + 1)
    : first.slice(BACKEND_PREFIX.length);
  const parsed = parseTracingLine(raw);

  if (
    transportName === 'file' &&
    parsed.matched &&
    (parsed.level === 'info' || parsed.level === 'debug' || parsed.level === 'verbose')
  ) {
    return false;
  }

  const resolvedLevel = parsed.matched && parsed.level ? parsed.level : message.level;
  const formattedFirst = parsed.body.length > 0 ? `${BACKEND_PREFIX} ${parsed.body}` : BACKEND_PREFIX;

  return { ...message, level: resolvedLevel, data: [formattedFirst, ...message.data.slice(1)] };
});

// Patch global console so every console.log/warn/error from any module
// goes through electron-log (and thus to the file transport).
log.initialize();

// log.initialize() only patches the renderer via preload.
// Explicitly redirect main-process console to electron-log.
Object.assign(console, log.functions);
