export type MotionPreference = 'full' | 'reduced';
export type MaterialPreference = 'glass' | 'solid';
export type NavigationPreference = 'expanded' | 'collapsed';
export type UIPreferences = {
  version: 1;
  motion: MotionPreference;
  materials: MaterialPreference;
  navigation?: NavigationPreference;
};
export const UI_PREFERENCES_KEY = 'amiro-ui-preferences-v1';
export const defaultUIPreferences: UIPreferences = {
  version: 1,
  motion: 'full',
  materials: 'glass',
};
export function parseUIPreferences(value: string | null): UIPreferences {
  if (!value) return { ...defaultUIPreferences };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || parsed.version !== 1) return { ...defaultUIPreferences };
    return {
      version: 1,
      motion: parsed.motion === 'reduced' ? 'reduced' : 'full',
      materials: parsed.materials === 'solid' ? 'solid' : 'glass',
      ...(parsed.navigation === 'expanded' || parsed.navigation === 'collapsed'
        ? { navigation: parsed.navigation }
        : {}),
    };
  } catch {
    return { ...defaultUIPreferences };
  }
}
export type WorkspaceModule =
  | 'workspace'
  | 'orders'
  | 'purchasing'
  | 'fulfilment'
  | 'finance'
  | 'assistant';
export function moduleForPath(path: string): WorkspaceModule {
  if (path.startsWith('/invoices') || path === '/accounts') return 'finance';
  if (path.startsWith('/orders') || path === '/reviews') return 'orders';
  if (path === '/purchasing') return 'purchasing';
  if (path === '/assembly') return 'fulfilment';
  if (path === '/assistant') return 'assistant';
  return 'workspace';
}
export function stableIdentity(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ['blue', 'violet', 'teal', 'slate'][hash % 4];
}
