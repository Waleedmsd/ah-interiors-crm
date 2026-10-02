'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
type Draft = { input: string; files: string[] };
type Drafts = Record<string, Draft>;
type ContextValue = {
  drafts: Drafts;
  update: (key: string, apply: (draft: Draft) => Draft) => void;
};
const Context = createContext<ContextValue | null>(null);
export function AssistantDraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Drafts>({});
  function update(key: string, apply: (draft: Draft) => Draft) {
    setDrafts((current) => ({
      ...current,
      [key]: apply(current[key] || { input: '', files: [] }),
    }));
  }
  return (
    <Context.Provider value={{ drafts, update }}>{children}</Context.Provider>
  );
}
export function useAssistantDraft(contextId?: string) {
  const context = useContext(Context);
  if (!context) throw new Error('AssistantDraftProvider is required.');
  const key = contextId || 'workspace';
  const draft = context.drafts[key] || { input: '', files: [] };
  return {
    ...draft,
    setInput: (input: string) =>
      context.update(key, (previous) => ({ ...previous, input })),
    setFiles: (files: string[] | ((previous: string[]) => string[])) =>
      context.update(key, (previous) => ({
        ...previous,
        files: typeof files === 'function' ? files(previous.files) : files,
      })),
  };
}
