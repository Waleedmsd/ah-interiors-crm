'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommerceState, CommerceAction, CommerceResult } from '@/lib/commerce';
import { emptyCommerceState } from '@/lib/empty-commerce';
import { apiRequest } from '@/lib/api-client';

type Snapshot = { data: CommerceState; version: number; ready: boolean; persistence: 'loading' | 'saved' | 'session-only' | 'read-only'; recoveryNotice: boolean };
type ServerSnapshot = { data: CommerceState; version: number; id?: string };

export function useServerCommerce(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({ data: emptyCommerceState(), version: 0, ready: false, persistence: 'loading', recoveryNotice: false }));
  const [error, setError] = useState('');
  const latest = useRef(snapshot);
  const saving = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const loadingRequest = useRef<AbortController | null>(null);
  const publish = useCallback((value: Snapshot) => {
    latest.current = value;
    if (mounted.current) setSnapshot(value);
  }, []);
  const load = useCallback(async () => {
    if (!enabled || saving.current || !mounted.current) return;
    loadingRequest.current?.abort();
    const controller = new AbortController();
    loadingRequest.current = controller;
    const request = ++generation.current;
    publish({ ...latest.current, ready: false, persistence: 'loading' });
    try {
      const response = await apiRequest<ServerSnapshot>('/api/commerce', { signal: controller.signal });
      if (request !== generation.current || controller.signal.aborted || !mounted.current) return;
      publish({ ...response, ready: true, persistence: 'saved', recoveryNotice: false });
      setError('');
    } catch (failure) {
      if (controller.signal.aborted || request !== generation.current || !mounted.current) return;
      setError(failure instanceof Error ? failure.message : 'Unable to load records.');
      publish({ ...latest.current, ready: false, persistence: 'read-only' });
    }
  }, [enabled, publish]);
  useEffect(() => {
    mounted.current = true;
    if (enabled) void load();
    return () => { mounted.current = false; generation.current++; loadingRequest.current?.abort(); };
  }, [enabled, load]);

  const commit = useCallback(async (action: CommerceAction): Promise<CommerceResult> => {
    const base = latest.current;
    if (!enabled || !mounted.current || !base.ready || saving.current) {
      return { state: base.data, error: saving.current ? 'A change is already being saved. Wait for it to finish.' : 'The shared workspace is unavailable. Reload and try again.' };
    }
    // A synchronous lock prevents two clicks from sharing an old version before
    // React has committed a render. The server remains authoritative and atomic.
    saving.current = true;
    loadingRequest.current?.abort();
    generation.current++;
    publish({ ...base, ready: false });
    try {
      const result = await apiRequest<ServerSnapshot>('/api/commerce', {
        method: 'POST',
        body: JSON.stringify({ requestId: crypto.randomUUID(), version: base.version, action }),
      });
      publish({ ...result, ready: true, persistence: 'saved', recoveryNotice: false });
      if (mounted.current) setError('');
      return { state: result.data, id: result.id };
    } catch (failure) {
      // A failed response is not proof a payment or order was not written.
      // Refresh before another edit; never replay a mutation automatically.
      saving.current = false;
      await load();
      const message = failure instanceof Error ? failure.message : 'The server did not confirm this change. Check the refreshed record before trying again.';
      if (mounted.current) setError(message);
      return { state: latest.current.data, error: message };
    } finally { saving.current = false; }
  }, [enabled, load, publish]);
  return { ...snapshot, commit, error, reload: load };
}
