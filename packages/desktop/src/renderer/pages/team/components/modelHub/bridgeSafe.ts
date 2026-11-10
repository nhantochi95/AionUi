/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as ipcBridgeNs from '@/common/adapter/ipcBridge';
import type {
  conversation as ConversationApi,
  mode as ModeApi,
  team as TeamApi,
  teamHub as TeamHubApi,
} from '@/common/adapter/ipcBridge';

/**
 * Safe module-namespace accessors that check `'key' in ipcBridgeNs` first
 * so Vitest suites with partial `vi.mock('@/common/adapter/ipcBridge', ...)`
 * never throw missing-export errors.
 */
export function getTeamHubBridge(): typeof TeamHubApi | undefined {
  if (ipcBridgeNs && 'teamHub' in ipcBridgeNs) {
    return ipcBridgeNs.teamHub;
  }
  return undefined;
}

export function getTeamBridge(): typeof TeamApi | undefined {
  if (ipcBridgeNs && 'team' in ipcBridgeNs) {
    return ipcBridgeNs.team;
  }
  return undefined;
}

export function getModeBridge(): typeof ModeApi | undefined {
  if (ipcBridgeNs && 'mode' in ipcBridgeNs) {
    return ipcBridgeNs.mode;
  }
  return undefined;
}

export function getConversationBridge(): typeof ConversationApi | undefined {
  if (ipcBridgeNs && 'conversation' in ipcBridgeNs) {
    return ipcBridgeNs.conversation;
  }
  return undefined;
}
