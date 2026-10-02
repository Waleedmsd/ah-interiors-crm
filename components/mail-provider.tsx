'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createMailStore, type MailDraft } from '@/lib/mail-state';
function useMailState() {
  const [store] = useState(createMailStore);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [composer, setComposer] = useState<MailDraft | null>(null);
  useEffect(() => store.start(), [store]);
  return { ...snapshot, commit: store.commit, composer, setComposer };
}
const Context = createContext<ReturnType<typeof useMailState> | null>(null);
export function MailProvider({ children }: { children: ReactNode }) {
  const state = useMailState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useMail() {
  const value = useContext(Context);
  if (!value) throw new Error('Mail requires the local MailProvider.');
  return value;
}
