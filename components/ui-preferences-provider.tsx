'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { type UIPreferences } from '@/lib/ui-preferences';
import { createUIPreferenceStore } from '@/lib/ui-preference-store';
type UIContext = {
  preferences: UIPreferences;
  ready: boolean;
  sessionOnly: boolean;
  update: (next: Partial<Omit<UIPreferences, 'version'>>) => void;
};
const Context = createContext<UIContext | null>(null);
export function UIPreferencesProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createUIPreferenceStore);
  const { preferences, ready, sessionOnly } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  useEffect(() => {
    const stop = store.start();
    const initial = store.getSnapshot().preferences;
    document.documentElement.dataset.entrance =
      initial.motion === 'full' ? 'playing' : 'complete';
    const timer = window.setTimeout(() => {
      document.documentElement.dataset.entrance = 'complete';
    }, 650);
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [store]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = preferences.motion;
    root.dataset.materials = preferences.materials;
    root.dataset.navigation = preferences.navigation || 'responsive';
    root.dataset.uiReady = ready ? 'true' : 'false';
  }, [preferences, ready]);
  return (
    <Context.Provider
      value={{ preferences, ready, sessionOnly, update: store.update }}
    >
      {children}
    </Context.Provider>
  );
}
export function useUIPreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('UI preferences require UIPreferencesProvider.');
  return value;
}
