'use client';
import { useEffect, useSyncExternalStore } from 'react';
import {
  applyCommerce,
  createCommerceState,
  parseSavedCommerce,
  type CommerceAction,
  type CommerceState,
} from '@/lib/commerce';
const KEY = 'ah-interiors-local-workspace-v3';
type Snapshot = {
  data: CommerceState;
  ready: boolean;
  persistence: 'loading' | 'saved' | 'session-only' | 'read-only';
  recoveryNotice: boolean;
};
const serverSnapshot: Snapshot = {
  data: createCommerceState(),
  ready: false,
  persistence: 'loading',
  recoveryNotice: false,
};
let snapshot = serverSnapshot;
let initialized = false;
let writable = false;
let allowStorage = true;
let lastSaved = '';
let releaseWriter: (() => void) | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const emit = () => listeners.forEach((listener) => listener());
function save(data: CommerceState): Snapshot['persistence'] {
  if (!allowStorage) return 'session-only';
  try {
    const raw = JSON.stringify(data);
    localStorage.setItem(KEY, raw);
    lastSaved = raw;
    return 'saved';
  } catch {
    return 'session-only';
  }
}
function restore(canWrite: boolean) {
  writable = canWrite;
  let data = snapshot.data;
  let recoveryNotice = false;
  try {
    const raw = localStorage.getItem(KEY);
    lastSaved = raw || '';
    if (raw) {
      const restored = parseSavedCommerce(raw);
      if (restored) data = restored;
      else {
        recoveryNotice = true;
        if (canWrite) {
          try {
            localStorage.setItem(KEY + '-unreadable-backup-' + Date.now(), raw);
          } catch {
            allowStorage = false;
          }
        }
      }
    }
  } catch {
    allowStorage = false;
  }
  snapshot = {
    data,
    ready: canWrite,
    persistence: canWrite ? save(data) : 'read-only',
    recoveryNotice,
  };
  emit();
}
function onStorage(event: StorageEvent) {
  if (event.key !== KEY) return;
  if (!writable && event.newValue) {
    const restored = parseSavedCommerce(event.newValue);
    if (restored) {
      snapshot = { ...snapshot, data: restored };
      emit();
    }
  }
}
function initialize() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('storage', onStorage);
  if (!navigator.locks) {
    restore(false);
    return;
  }
  // One editing tab owns the ledger until it closes. Other tabs are read-only.
  void navigator.locks
    .request(KEY + '-writer', { ifAvailable: true }, async (lock) => {
      if (!lock) {
        restore(false);
        return;
      }
      restore(true);
      await new Promise<void>((resolve) => {
        releaseWriter = resolve;
      });
      writable = false;
    })
    .catch(() => restore(false));
}
export function commitCommerce(action: CommerceAction) {
  if (!snapshot.ready || !writable)
    return {
      state: snapshot.data,
      error:
        snapshot.persistence === 'read-only'
          ? 'This tab is read-only. Close the other editing tab and refresh here. An up-to-date browser with Web Locks support is required.'
          : 'The local workspace is still loading. Please try again.',
    };
  if (snapshot.persistence === 'saved') {
    try {
      const raw = localStorage.getItem(KEY) || '';
      if (raw !== lastSaved) {
        const restored = parseSavedCommerce(raw);
        if (restored) {
          snapshot = { ...snapshot, data: restored };
          lastSaved = raw;
          emit();
          return {
            state: snapshot.data,
            error:
              'Saved records changed elsewhere. Review the updated values and try again.',
          };
        }
        return {
          state: snapshot.data,
          error:
            'Saved data changed unexpectedly. Refresh to recover it before editing.',
        };
      }
    } catch {
      allowStorage = false;
      snapshot = { ...snapshot, persistence: 'session-only' };
      emit();
    }
  }
  const result = applyCommerce(snapshot.data, action);
  if (!result.error && result.state !== snapshot.data) {
    snapshot = {
      ...snapshot,
      data: result.state,
      persistence: save(result.state),
    };
    emit();
  }
  return result;
}
const hot = (
  import.meta as ImportMeta & {
    hot?: { dispose: (callback: () => void) => void };
  }
).hot;
hot?.dispose(() => {
  releaseWriter?.();
  if (typeof window !== 'undefined')
    window.removeEventListener('storage', onStorage);
});
export function useLocalCommerce(enabled = true) {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot,
  );
  useEffect(() => { if (enabled) initialize(); }, [enabled]);
  return { ...current, commit: commitCommerce };
}
