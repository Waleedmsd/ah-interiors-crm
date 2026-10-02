'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, X } from 'lucide-react';
import {
  currentStatus,
  PREVIEW_NOW,
  isPaid,
  type OperationsAction,
} from '@/lib/operations';
import { useLocalCommerce } from '@/components/local-commerce-store';
import type { CommerceAction } from '@/lib/commerce';
import { type ChatMessage } from '@/lib/assistant-preview';
import { operationsReply } from '@/lib/operations-assistant';

function useWorkspaceState() {
  const local = useLocalCommerce();
  const commit = local.commit;
  const operations = local.data.operations;
  const dispatch = useCallback(
    (action: OperationsAction) => commit({ type: 'operation', action }),
    [commit],
  );
  const [now, setNow] = useState(PREVIEW_NOW);
  useEffect(() => {
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<
    Record<string, { subject: string; body: string }>
  >({});
  const [preferences, setPreferences] = useState([true, true, false]);
  const sequence = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const orders = useMemo(
    () =>
      operations.cases.map((order) => ({
        ...order,
        status: currentStatus(order),
      })),
    [operations],
  );
  const processed = operations.cases
    .filter((order) => order.pack)
    .map((order) => order.id);
  const notify = useCallback((text: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(''), 5000);
  }, []);
  const processOrder = useCallback(
    (id: string) => {
      const order = operations.cases.find((item) => item.id === id);
      if (!order || !isPaid(order)) {
        notify('Verified full payment is required before processing.');
        return false;
      }
      if (!order.pack && order.status !== 'New') return false;
      const result = dispatch({ type: 'prepare', id, now });
      if (result.error) {
        notify(result.error);
        return false;
      }
      notify('Order pack prepared for your review. Nothing sent or booked.');
      return true;
    },
    [notify, operations.cases, now, dispatch],
  );
  function savePreferences(values: boolean[]) {
    setPreferences([...values]);
    notify('Preferences saved for this preview session.');
  }
  function saveDraft(id: string, draft: { subject: string; body: string }) {
    setDrafts((current) => ({ ...current, [id]: draft }));
    notify('Draft saved for this session. Nothing was sent.');
  }
  function ask(text: string, files: string[] = [], contextId?: string) {
    if (!text.trim() && files.length === 0) return;
    const prompt = text.trim() || 'Review the attached files';
    const userId = 'user-' + ++sequence.current;
    const replyId = 'assistant-' + ++sequence.current;
    const reply = operationsReply(prompt, operations.cases, contextId, now);
    if (files.length)
      reply.text =
        'Attached locally: ' +
        files.join(', ') +
        '. File contents have not been uploaded or analysed.\n\n' +
        reply.text;
    setMessages((current) => [
      ...current,
      { id: userId, role: 'user', text: prompt, files, orderId: reply.orderId },
      { ...reply, id: replyId },
    ]);
  }
  function updateAction(id: string, status: 'prepared' | 'dismissed') {
    setMessages((current) =>
      current.map((message) =>
        message.id === id && message.action?.status === 'pending'
          ? { ...message, action: { ...message.action, status } }
          : message,
      ),
    );
  }
  return {
    commerce: local.data,
    customers: local.data.customers,
    invoices: local.data.invoices,
    ready: local.ready,
    persistence: local.persistence,
    recoveryNotice: local.recoveryNotice,
    mutate: (action: CommerceAction) => {
      const result = local.commit(action);
      if (result.error) notify(result.error);
      return result;
    },
    cases: operations.cases,
    dispatch,
    now,
    orders,
    processed,
    processOrder,
    messages,
    ask,
    updateAction,
    resetChat: () => setMessages([]),
    assistantOpen,
    setAssistantOpen,
    notice,
    setNotice,
    notify,
    drafts,
    saveDraft,
    preferences,
    savePreferences,
  };
}
type WorkspaceState = ReturnType<typeof useWorkspaceState>;
const WorkspaceContext = createContext<WorkspaceState | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const state = useWorkspaceState();
  return (
    <WorkspaceContext.Provider value={state}>
      {children}
      {state.notice && (
        <output className="toast-notice">
          <Check size={17} />
          <span>{state.notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => state.setNotice('')}
          >
            <X size={15} />
          </button>
        </output>
      )}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error('Workspace provider is required.');
  return state;
}
