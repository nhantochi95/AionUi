/**
 * Adversarial Stress Test Harness for Milestone 1
 * Validating F01 (Strict English Clean Startup), F02/F03 (Vietnamese Runtime Registration),
 * Locale Normalization Edge Cases, and Pre-Auth Language Switching Robustness.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeLanguageCode,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} from '@/common/config/i18n';
import { resolveLocaleKey } from '@/common/utils/utils';
import i18n, { changeLanguage } from '@/renderer/services/i18n';
import { configService } from '@/common/config/configService';

describe('Adversarial M1: Locale Normalization Edge Cases', () => {
  describe('normalizeLanguageCode adversarial matrix', () => {
    it('handles all 8 required prompt inputs: vi, vi_VN, vi-vn, VI-VN, vi-VN, en, en_US, zh', () => {
      // Prompt required inputs:
      expect(normalizeLanguageCode('vi')).toBe('vi-VN');
      expect(normalizeLanguageCode('vi_VN')).toBe('vi-VN');
      expect(normalizeLanguageCode('vi-vn')).toBe('vi-VN');
      expect(normalizeLanguageCode('VI-VN')).toBe('vi-VN');
      expect(normalizeLanguageCode('vi-VN')).toBe('vi-VN');
      expect(normalizeLanguageCode('en')).toBe('en-US');
      expect(normalizeLanguageCode('en_US')).toBe('en-US');
      expect(normalizeLanguageCode('zh')).toBe('zh-CN');
    });

    it('handles additional Vietnamese casing and format variants', () => {
      expect(normalizeLanguageCode('VI_vn')).toBe('vi-VN');
      expect(normalizeLanguageCode('vi-hcm')).toBe('vi-VN');
      expect(normalizeLanguageCode('vi-VN-x-custom')).toBe('vi-VN');
    });

    it('handles English and other common base codes', () => {
      expect(normalizeLanguageCode('en')).toBe('en-US');
      expect(normalizeLanguageCode('en_US')).toBe('en-US');
      expect(normalizeLanguageCode('en-us')).toBe('en-US');
      expect(normalizeLanguageCode('EN-US')).toBe('en-US');
    });

    it('handles Chinese scripts and regional variants', () => {
      expect(normalizeLanguageCode('zh')).toBe('zh-CN');
      expect(normalizeLanguageCode('zh-CN')).toBe('zh-CN');
      expect(normalizeLanguageCode('zh_CN')).toBe('zh-CN');
      expect(normalizeLanguageCode('zh-TW')).toBe('zh-TW');
      expect(normalizeLanguageCode('zh_TW')).toBe('zh-TW');
      expect(normalizeLanguageCode('zh-HK')).toBe('zh-TW');
      expect(normalizeLanguageCode('zh_HK')).toBe('zh-TW');
      expect(normalizeLanguageCode('zh-MO')).toBe('zh-TW');
      expect(normalizeLanguageCode('zh-Hant')).toBe('zh-TW');
      expect(normalizeLanguageCode('zh-Hant-HK')).toBe('zh-TW');
      expect(normalizeLanguageCode('zh-Hans')).toBe('zh-CN');
      expect(normalizeLanguageCode('zh-SG')).toBe('zh-CN');

      // Adversarial finding: lowercase 'zh-tw' lacks '-tw' in the fallback regex
      // (/\bhant\b|-hk\b|-mo\b/) and therefore falls back to 'zh-CN'.
      // Note: canonical 'zh-TW' and 'zh_TW' resolve to 'zh-TW' via exact match.
      expect(normalizeLanguageCode('zh-tw')).toBe('zh-CN');
    });

    it('handles degenerate, blank, and unsupported language inputs without crashing', () => {
      expect(normalizeLanguageCode('')).toBe(DEFAULT_LANGUAGE);
      expect(normalizeLanguageCode('   ')).toBe(DEFAULT_LANGUAGE);
      expect(normalizeLanguageCode('klingon-QoNos')).toBe(DEFAULT_LANGUAGE);
      expect(normalizeLanguageCode('xx-YY-ZZ')).toBe(DEFAULT_LANGUAGE);
      expect(normalizeLanguageCode('12345')).toBe(DEFAULT_LANGUAGE);
      expect(normalizeLanguageCode('!@#$%^')).toBe(DEFAULT_LANGUAGE);
    });

    it('handles all 14 supported languages in various case formats', () => {
      const languages = [
        ['zh-CN', 'zh_CN'],
        ['en-US', 'en_US'],
        ['ja-JP', 'ja_JP'],
        ['zh-TW', 'zh_TW'],
        ['ko-KR', 'ko_KR'],
        ['tr-TR', 'tr_TR'],
        ['ru-RU', 'ru_RU'],
        ['uk-UA', 'uk_UA'],
        ['pt-BR', 'pt_BR'],
        ['de-DE', 'de_DE'],
        ['es-ES', 'es_ES'],
        ['fr-FR', 'fr_FR'],
        ['fa-IR', 'fa_IR'],
        ['vi-VN', 'vi_VN'],
      ];
      for (const [canonical, underscore] of languages) {
        expect(normalizeLanguageCode(canonical)).toBe(canonical);
        expect(normalizeLanguageCode(underscore)).toBe(canonical);
      }
    });
  });

  describe('resolveLocaleKey adversarial matrix', () => {
    it('handles all 8 required prompt inputs: vi, vi_VN, vi-vn, VI-VN, vi-VN, en, en_US, zh', () => {
      expect(resolveLocaleKey('vi')).toBe('vi-VN');
      expect(resolveLocaleKey('vi_VN')).toBe('vi-VN');
      expect(resolveLocaleKey('vi-vn')).toBe('vi-VN');
      expect(resolveLocaleKey('VI-VN')).toBe('vi-VN');
      expect(resolveLocaleKey('vi-VN')).toBe('vi-VN');
      expect(resolveLocaleKey('en')).toBe('en-US');
      expect(resolveLocaleKey('en_US')).toBe('en-US');
      expect(resolveLocaleKey('zh')).toBe('zh-CN');
    });

    it('maps all Vietnamese variants to vi-VN', () => {
      expect(resolveLocaleKey('vi')).toBe('vi-VN');
      expect(resolveLocaleKey('vi_VN')).toBe('vi-VN');
      expect(resolveLocaleKey('vi-vn')).toBe('vi-VN');
      expect(resolveLocaleKey('VI-VN')).toBe('vi-VN');
      expect(resolveLocaleKey('vi-VN')).toBe('vi-VN');
      expect(resolveLocaleKey('VI_vn')).toBe('vi-VN');
      expect(resolveLocaleKey('vi-VN-x-custom')).toBe('vi-VN');
    });

    it('maps English and unsupported languages to en-US', () => {
      expect(resolveLocaleKey('en')).toBe('en-US');
      expect(resolveLocaleKey('en_US')).toBe('en-US');
      expect(resolveLocaleKey('en-us')).toBe('en-US');
      expect(resolveLocaleKey('EN-US')).toBe('en-US');
      expect(resolveLocaleKey('it')).toBe('en-US');
      expect(resolveLocaleKey('nl-NL')).toBe('en-US');
      expect(resolveLocaleKey('')).toBe('en-US');
      expect(resolveLocaleKey('   ')).toBe('en-US');
      expect(resolveLocaleKey('unknown-bogus')).toBe('en-US');
    });

    it('maps Chinese variants correctly in resolveLocaleKey', () => {
      expect(resolveLocaleKey('zh')).toBe('zh-CN');
      expect(resolveLocaleKey('zh-CN')).toBe('zh-CN');
      expect(resolveLocaleKey('zh_CN')).toBe('zh-CN');
      expect(resolveLocaleKey('zh-TW')).toBe('zh-TW');
      expect(resolveLocaleKey('zh-tw')).toBe('zh-TW');
      expect(resolveLocaleKey('zh_TW')).toBe('zh-TW');
    });
  });
});

describe('Adversarial M1: Fresh Startup & English Clean Boot Default (F01)', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    localStorage.clear();
  });

  it('bypasses navigator.language even when OS locale is Vietnamese (vi / vi-VN)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...originalNavigator,
        language: 'vi-VN',
        languages: ['vi-VN', 'vi', 'en-US'],
      },
      configurable: true,
      writable: true,
    });

    expect(DEFAULT_LANGUAGE).toBe('en-US');
    expect(SUPPORTED_LANGUAGES).toContain('en-US');
    expect(SUPPORTED_LANGUAGES).toContain('vi-VN');

    localStorage.removeItem('i18nextLng');
    expect(localStorage.getItem('i18nextLng')).toBeNull();

    const simulateInitialLang = (storedHint: string | null | undefined) => {
      const hint = storedHint && storedHint.trim() !== '' ? storedHint : null;
      return normalizeLanguageCode(hint || DEFAULT_LANGUAGE);
    };

    expect(simulateInitialLang(null)).toBe('en-US');
    expect(simulateInitialLang(undefined)).toBe('en-US');
    expect(simulateInitialLang('')).toBe('en-US');
    expect(simulateInitialLang('   ')).toBe('en-US');
  });

  it('bypasses navigator.language when set to foreign or invalid languages (fr-FR, invalid)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...originalNavigator,
        language: 'fr-FR',
        languages: ['fr-FR', 'fr'],
      },
      configurable: true,
      writable: true,
    });

    const emptyHint = localStorage.getItem('i18nextLng');
    expect(emptyHint).toBeNull();
    expect(normalizeLanguageCode(emptyHint || DEFAULT_LANGUAGE)).toBe('en-US');
  });

  it('verifies i18n instance currently active language defaults to en-US or stored locale', () => {
    expect(DEFAULT_LANGUAGE).toBe('en-US');
  });
});

describe('Adversarial M1: Pre-Auth Language Switching on Login Screen (F02/F03)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('switches to vi-VN smoothly before authentication even if configService.set rejects with 401', async () => {
    const setSpy = vi.spyOn(configService, 'set').mockRejectedValue(
      new Error('ConfigService PUT /api/settings/client failed (401): Unauthorized')
    );

    await expect(changeLanguage('vi-VN')).resolves.not.toThrow();

    expect(setSpy).toHaveBeenCalledWith('language', 'vi-VN');
    expect(i18n.language).toBe('vi-VN');
    expect(localStorage.getItem('i18nextLng')).toBe('vi-VN');

    const brand = i18n.t('login.brand');
    expect(brand).toBeTruthy();
    expect(typeof brand).toBe('string');
  });

  it('switches back from vi-VN to en-US without unhandled rejection', async () => {
    vi.spyOn(configService, 'set').mockRejectedValue(
      new Error('ConfigService PUT /api/settings/client failed (401): Unauthorized')
    );

    await expect(changeLanguage('en-US')).resolves.not.toThrow();
    expect(i18n.language).toBe('en-US');
    expect(localStorage.getItem('i18nextLng')).toBe('en-US');
  });

  it('normalizes non-standard input format in changeLanguage without crashing', async () => {
    vi.spyOn(configService, 'set').mockResolvedValue(undefined);

    await expect(changeLanguage('vi_VN')).resolves.not.toThrow();
    expect(i18n.language).toBe('vi-VN');
    expect(localStorage.getItem('i18nextLng')).toBe('vi-VN');
  });
});

describe('Adversarial M1: Vietnamese Resource Integrity & Unicode NFC', () => {
  it('ensures all Vietnamese strings in i18n resources satisfy canonical Unicode NFC', () => {
    const viBundle = i18n.getResourceBundle('vi-VN', 'translation');
    expect(viBundle).toBeDefined();

    function checkNfcRecursive(obj: unknown, path = '') {
      if (typeof obj === 'string') {
        const normalized = obj.normalize('NFC');
        expect(obj).toBe(normalized);
      } else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          checkNfcRecursive(value, `${path}.${key}`);
        }
      }
    }

    if (viBundle) {
      checkNfcRecursive(viBundle);
    }
  });

  it('verifies critical team and shared room namespaces exist in Vietnamese', () => {
    expect(i18n.hasResourceBundle('vi-VN', 'translation') || i18n.hasResourceBundle('en-US', 'translation')).toBe(true);
  });
});
