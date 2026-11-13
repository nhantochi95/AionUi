/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebviewHost, { extractSafeConsoleNavigateUrl } from '@/renderer/components/media/WebviewHost';

const { reportBrowserWebContentsIdInvokeMock } = vi.hoisted(() => ({
  reportBrowserWebContentsIdInvokeMock: vi.fn(async () => undefined),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      reportBrowserWebContentsId: {
        invoke: reportBrowserWebContentsIdInvokeMock,
      },
    },
  },
}));

type ListenerMap = Map<string, Set<EventListener>>;

interface MockWebviewController {
  element: HTMLElement;
  listeners: ListenerMap;
  addEventListenerSpy: ReturnType<typeof vi.fn>;
  removeEventListenerSpy: ReturnType<typeof vi.fn>;
  loadURLSpy: ReturnType<typeof vi.fn>;
  getURLSpy: ReturnType<typeof vi.fn>;
  executeJavaScriptSpy: ReturnType<typeof vi.fn>;
  setDomReadyState: (ready: boolean) => void;
  setGuestUrl: (nextUrl: string) => void;
  emit: (type: string, detail?: Record<string, unknown>) => void;
}

function attachMockWebviewBehavior(el: HTMLElement): MockWebviewController {
  const listeners: ListenerMap = new Map();
  let domReady = false;
  let guestUrl = el.getAttribute('src') || '';

  const origAdd = el.addEventListener.bind(el);
  const origRemove = el.removeEventListener.bind(el);

  const addEventListenerSpy = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    const fn = typeof listener === 'function' ? listener : (e: Event) => listener.handleEvent(e);
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
    origAdd(type, listener);
  });

  const removeEventListenerSpy = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    const fn = typeof listener === 'function' ? listener : (e: Event) => listener.handleEvent(e);
    listeners.get(type)?.delete(fn);
    origRemove(type, listener);
  });

  const getURLSpy = vi.fn(() => {
    if (!domReady) {
      throw new Error('The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called.');
    }
    return guestUrl;
  });

  const loadURLSpy = vi.fn((nextUrl: string) => {
    if (!domReady) {
      throw new Error('The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called.');
    }
    guestUrl = nextUrl;
    return Promise.resolve();
  });

  const executeJavaScriptSpy = vi.fn(async () => undefined);

  Object.assign(el, {
    addEventListener: addEventListenerSpy,
    removeEventListener: removeEventListenerSpy,
    getURL: getURLSpy,
    loadURL: loadURLSpy,
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    getWebContentsId: vi.fn(() => 42),
    setZoomFactor: vi.fn(),
    insertCSS: vi.fn(async () => 'css-key'),
    executeJavaScript: executeJavaScriptSpy,
  });

  return {
    element: el,
    listeners,
    addEventListenerSpy,
    removeEventListenerSpy,
    loadURLSpy,
    getURLSpy,
    executeJavaScriptSpy,
    setDomReadyState: (ready: boolean) => {
      domReady = ready;
    },
    setGuestUrl: (nextUrl: string) => {
      guestUrl = nextUrl;
    },
    emit: (type: string, detail: Record<string, unknown> = {}) => {
      if (type === 'dom-ready') {
        domReady = true;
      }
      const event = Object.assign(new Event(type), detail);
      for (const handler of Array.from(listeners.get(type) ?? [])) {
        handler(event);
      }
    },
  };
}

describe('WebviewHost redirect stability, dom-ready contract, listener hygiene, and scheme guard', () => {
  let originalCreateElement: typeof document.createElement;
  let lastController: MockWebviewController | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    lastController = null;
    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const el = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'webview') {
        lastController = attachMockWebviewBehavior(el);
      }
      return el;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps <webview src={initialSrc}> static across Cloudflare redirect chains and echoed url props (0 ERR_ABORTED reloads)', () => {
    const initialUrl = 'https://example.com/app';
    const cfChallengeUrl = 'https://example.com/app?__cf_chl_rt_tk=abc123';
    const onUrlChange = vi.fn();

    const { rerender } = render(<WebviewHost url={initialUrl} onUrlChange={onUrlChange} showNavBar={false} />);
    expect(lastController).not.toBeNull();
    const ctrl = lastController!;

    expect(ctrl.element.getAttribute('src')).toBe(initialUrl);

    act(() => {
      ctrl.emit('dom-ready');
      ctrl.setGuestUrl(cfChallengeUrl);
      ctrl.emit('did-navigate', { url: cfChallengeUrl });
    });

    expect(onUrlChange).toHaveBeenCalledWith(cfChallengeUrl);
    // DOM `src` attribute MUST stay frozen at `initialUrl` so Electron never aborts the guest navigation!
    expect(ctrl.element.getAttribute('src')).toBe(initialUrl);
    expect(ctrl.loadURLSpy).not.toHaveBeenCalled();

    // Parent echoes the guest-reported redirect URL back into `url` prop
    act(() => {
      rerender(<WebviewHost url={cfChallengeUrl} onUrlChange={onUrlChange} showNavBar={false} />);
    });

    expect(ctrl.element.getAttribute('src')).toBe(initialUrl);
    expect(ctrl.loadURLSpy).not.toHaveBeenCalled();
  });

  it('queues pre-dom-ready url prop changes without synchronous throws and drives post-dom-ready changes via loadURL', async () => {
    const urlA = 'https://example.com/first';
    const urlB = 'https://example.com/queued-before-dom-ready';
    const urlC = 'https://example.com/after-dom-ready';

    const { rerender } = render(<WebviewHost url={urlA} showNavBar={false} />);
    const ctrl = lastController!;

    // Changing `url` prop BEFORE `dom-ready` must NOT call `getURL()` or `loadURL()` (which throw synchronously in Electron)
    expect(() => {
      rerender(<WebviewHost url={urlB} showNavBar={false} />);
    }).not.toThrow();
    expect(ctrl.loadURLSpy).not.toHaveBeenCalled();
    expect(ctrl.element.getAttribute('src')).toBe(urlA);

    // First `dom-ready` flushes `pendingUrlRef` (`urlB`) safely
    act(() => {
      ctrl.emit('dom-ready');
    });
    expect(ctrl.loadURLSpy).toHaveBeenCalledTimes(1);
    expect(ctrl.loadURLSpy).toHaveBeenCalledWith(urlB);

    // Subsequent external `url` prop updates AFTER `dom-ready` keep `isGuestAttachedRef === true` and call `loadURL`
    // Even if `loadURL` rejects with ERR_ABORTED during a fast redirect, the rejection is caught cleanly.
    ctrl.loadURLSpy.mockImplementationOnce((nextUrl: string) => {
      ctrl.setGuestUrl(nextUrl);
      return Promise.reject(Object.assign(new Error('ERR_ABORTED'), { errno: -3 }));
    });

    await act(async () => {
      rerender(<WebviewHost url={urlC} showNavBar={false} />);
    });

    expect(ctrl.loadURLSpy).toHaveBeenCalledTimes(2);
    expect(ctrl.loadURLSpy).toHaveBeenLastCalledWith(urlC);
    expect(ctrl.element.getAttribute('src')).toBe(urlA);
  });

  it('attaches the 10 <webview> listeners once per mount across callback/url churn and swallows mid-redirect executeJavaScript rejections', async () => {
    const onDidFinishLoad1 = vi.fn();
    const onDidFinishLoad2 = vi.fn();

    const { rerender } = render(
      <WebviewHost url='http://127.0.0.1:18791/office' onDidFinishLoad={onDidFinishLoad1} showNavBar={false} />
    );
    const ctrl = lastController!;

    // Exactly 10 event listeners attached once on mount
    expect(ctrl.addEventListenerSpy).toHaveBeenCalledTimes(10);

    // Simulate executeJavaScript rejecting mid-redirect
    ctrl.executeJavaScriptSpy.mockRejectedValue(new Error('Script failed to execute, frame navigated'));

    act(() => {
      ctrl.emit('dom-ready');
      ctrl.setGuestUrl('http://127.0.0.1:18791/office?step=2');
      ctrl.emit('did-navigate', { url: 'http://127.0.0.1:18791/office?step=2' });
    });

    act(() => {
      rerender(
        <WebviewHost url='http://127.0.0.1:18791/office?step=2' onDidFinishLoad={onDidFinishLoad2} showNavBar={false} />
      );
    });

    await act(async () => {
      ctrl.emit('did-finish-load');
    });

    // Zero listener churn across navigations + callback identity swaps!
    expect(ctrl.addEventListenerSpy).toHaveBeenCalledTimes(10);
    expect(ctrl.removeEventListenerSpy).not.toHaveBeenCalled();
    expect(onDidFinishLoad1).not.toHaveBeenCalled();
    expect(onDidFinishLoad2).toHaveBeenCalledTimes(1);
  });

  it('blocks non-http(s) console-message __WEBVIEW_HOST_NAVIGATE__ schemes and allows valid http/https URLs', () => {
    expect(extractSafeConsoleNavigateUrl('__WEBVIEW_HOST_NAVIGATE__:file:///etc/passwd')).toBeNull();
    expect(extractSafeConsoleNavigateUrl('__WEBVIEW_HOST_NAVIGATE__:{"url":"file:///C:/Windows/win.ini"}')).toBeNull();
    expect(extractSafeConsoleNavigateUrl('__WEBVIEW_HOST_NAVIGATE__:javascript:alert(1)')).toBeNull();
    expect(extractSafeConsoleNavigateUrl('__WEBVIEW_HOST_NAVIGATE__:data:text/html,<h1>x</h1>')).toBeNull();
    expect(extractSafeConsoleNavigateUrl('__WEBVIEW_HOST_NAVIGATE__:chrome://settings')).toBeNull();
    expect(extractSafeConsoleNavigateUrl('__WEBVIEW_HOST_NAVIGATE__:not-a-valid-url')).toBeNull();

    expect(extractSafeConsoleNavigateUrl('__WEBVIEW_HOST_NAVIGATE__:https://docs.example.com/guide')).toBe(
      'https://docs.example.com/guide'
    );
    expect(extractSafeConsoleNavigateUrl('prefix __WEBVIEW_HOST_NAVIGATE__ {"url":"http://localhost:3000/test"}')).toBe(
      'http://localhost:3000/test'
    );

    render(<WebviewHost url='https://example.com' showNavBar={false} />);
    const ctrl = lastController!;

    act(() => {
      ctrl.emit('dom-ready');
      ctrl.emit('console-message', { message: '__WEBVIEW_HOST_NAVIGATE__:file:///etc/passwd' });
      ctrl.emit('console-message', { message: '__WEBVIEW_HOST_NAVIGATE__:javascript:alert(1)' });
    });
    expect(ctrl.loadURLSpy).not.toHaveBeenCalled();

    act(() => {
      ctrl.emit('console-message', { message: '__WEBVIEW_HOST_NAVIGATE__:https://example.com/safe-path' });
    });
    expect(ctrl.loadURLSpy).toHaveBeenCalledTimes(1);
    expect(ctrl.loadURLSpy).toHaveBeenCalledWith('https://example.com/safe-path');
  });
});
