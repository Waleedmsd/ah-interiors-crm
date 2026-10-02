import {
  defaultUIPreferences,
  parseUIPreferences,
  UI_PREFERENCES_KEY,
  type UIPreferences,
} from '@/lib/ui-preferences';
type Snapshot = {
  preferences: UIPreferences;
  ready: boolean;
  sessionOnly: boolean;
};
type Patch = Partial<Omit<UIPreferences, 'version'>>;
const serverSnapshot: Snapshot = {
  preferences: defaultUIPreferences,
  ready: false,
  sessionOnly: false,
};
export function createUIPreferenceStore() {
  let snapshot: Snapshot = serverSnapshot;
  const listeners = new Set<() => void>();
  function publish(next: Snapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  function sync(event: StorageEvent) {
    if (event.key === UI_PREFERENCES_KEY)
      publish({ ...snapshot, preferences: parseUIPreferences(event.newValue) });
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => {
      try {
        publish({
          preferences: parseUIPreferences(
            localStorage.getItem(UI_PREFERENCES_KEY),
          ),
          ready: true,
          sessionOnly: false,
        });
      } catch {
        publish({
          preferences: { ...defaultUIPreferences },
          ready: true,
          sessionOnly: true,
        });
      }
      window.addEventListener('storage', sync);
      return () => window.removeEventListener('storage', sync);
    },
    update: (next: Patch) => {
      const preferences = parseUIPreferences(
        JSON.stringify({ ...snapshot.preferences, ...next, version: 1 }),
      );
      let sessionOnly = false;
      try {
        localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify(preferences));
      } catch {
        sessionOnly = true;
      }
      publish({ ...snapshot, preferences, sessionOnly });
    },
  };
}
