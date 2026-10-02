export const MAIL_STORAGE_KEY = 'amiro-mail-preview-v1';
export type MailAttachment = { id: string; name: string; size: number };
export type MailDraft = {
  id: string;
  threadId?: string;
  orderId?: string;
  mode: 'new' | 'reply' | 'forward';
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: MailAttachment[];
  updatedAt: number;
};
export type ThreadFlags = {
  read: boolean;
  starred: boolean;
  archived: boolean;
};
export type MailState = {
  version: 1;
  drafts: MailDraft[];
  flags: Record<string, ThreadFlags>;
};
export const emptyMailState = (): MailState => ({
  version: 1,
  drafts: [],
  flags: { rauch: { read: true, starred: false, archived: false } },
});
const text = (value: unknown, limit = 50000): value is string =>
  typeof value === 'string' && value.length <= limit;
export function parseMailState(raw: string | null): MailState {
  if (raw === null) return emptyMailState();
  const value = JSON.parse(raw);
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.drafts) ||
    value.drafts.length > 100 ||
    !value.flags ||
    typeof value.flags !== 'object' ||
    Array.isArray(value.flags)
  )
    throw new Error('Unreadable mail preview');
  const ids = new Set<string>();
  for (const draft of value.drafts) {
    if (
      !draft ||
      !text(draft.id, 120) ||
      !draft.id ||
      ids.has(draft.id) ||
      !['new', 'reply', 'forward'].includes(draft.mode) ||
      !['to', 'cc', 'bcc', 'subject', 'body'].every((field) =>
        text(draft[field]),
      ) ||
      !Number.isFinite(draft.updatedAt) ||
      (draft.threadId !== undefined && !text(draft.threadId, 120)) ||
      (draft.orderId !== undefined && !text(draft.orderId, 120)) ||
      !Array.isArray(draft.attachments) ||
      draft.attachments.length > 10 ||
      !draft.attachments.every(
        (file: MailAttachment) =>
          file &&
          text(file.id, 120) &&
          text(file.name, 512) &&
          Number.isFinite(file.size) &&
          file.size >= 0 &&
          file.size <= 25 * 1024 * 1024,
      )
    )
      throw new Error('Unreadable mail draft');
    ids.add(draft.id);
  }
  for (const [id, flag] of Object.entries(value.flags)) {
    const f = flag as ThreadFlags;
    if (
      !id ||
      id.length > 120 ||
      !f ||
      !['read', 'starred', 'archived'].every(
        (key) =>
          typeof (f as unknown as Record<string, unknown>)[key] === 'boolean',
      )
    )
      throw new Error('Unreadable mail flags');
  }
  return {
    version: 1,
    drafts: value.drafts.map((d: MailDraft) => ({
      id: d.id,
      threadId: d.threadId,
      orderId: d.orderId,
      mode: d.mode,
      to: d.to,
      cc: d.cc,
      bcc: d.bcc,
      subject: d.subject,
      body: d.body,
      attachments: d.attachments.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
      })),
      updatedAt: d.updatedAt,
    })),
    flags: Object.fromEntries(
      Object.entries(value.flags).map(([id, f]) => [
        id,
        {
          read: (f as ThreadFlags).read,
          starred: (f as ThreadFlags).starred,
          archived: (f as ThreadFlags).archived,
        },
      ]),
    ),
  };
}
export function mailFlags(state: MailState, id: string): ThreadFlags {
  return state.flags[id] || { read: false, starred: false, archived: false };
}
export type MailAction =
  | { type: 'save'; draft: MailDraft; expectedUpdatedAt?: number | null }
  | { type: 'discard'; id: string; expectedUpdatedAt?: number | null }
  | { type: 'flags'; ids: string[]; patch: Partial<ThreadFlags> };
export function updateMail(state: MailState, action: MailAction): MailState {
  if (action.type !== 'flags' && action.expectedUpdatedAt !== undefined) {
    const id = action.type === 'save' ? action.draft.id : action.id;
    const saved = state.drafts.find((draft) => draft.id === id);
    if ((saved?.updatedAt ?? null) !== action.expectedUpdatedAt)
      throw new Error(
        'This draft changed elsewhere. Your open text is retained. Copy it before reopening the latest saved draft.',
      );
  }
  if (action.type === 'save') {
    const existing = state.drafts.some((d) => d.id === action.draft.id);
    if (!existing && state.drafts.length >= 100)
      throw new Error(
        'This local preview supports 100 saved drafts. Remove an unneeded draft first.',
      );
    return parseMailState(
      JSON.stringify({
        ...state,
        drafts: [
          action.draft,
          ...state.drafts.filter((d) => d.id !== action.draft.id),
        ],
      }),
    );
  }
  if (action.type === 'discard')
    return { ...state, drafts: state.drafts.filter((d) => d.id !== action.id) };
  return {
    ...state,
    flags: {
      ...state.flags,
      ...Object.fromEntries(
        action.ids.map((id) => [
          id,
          { ...mailFlags(state, id), ...action.patch },
        ]),
      ),
    },
  };
}
export function draftErrors(draft: MailDraft): string[] {
  const errors: string[] = [];
  const addresses = (field: string) =>
    field
      .split(/[,;]/)
      .map((v) => v.trim())
      .filter(Boolean);
  const valid = (address: string) =>
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
  if (!addresses(draft.to).length) errors.push('Add at least one recipient.');
  for (const [label, field] of [
    ['To', draft.to],
    ['Cc', draft.cc],
    ['Bcc', draft.bcc],
  ])
    if (addresses(field).some((address) => !valid(address)))
      errors.push('Check the email addresses in ' + label + '.');
  if (!draft.subject.trim()) errors.push('Add a subject.');
  if (!draft.body.trim()) errors.push('Write a message.');
  return errors;
}
export function mailtoFor(draft: MailDraft): string {
  if (draftErrors(draft).length)
    throw new Error('Review the recipient, subject and message first.');
  const query = new URLSearchParams({
    subject: draft.subject,
    body: draft.body,
  });
  if (draft.cc.trim()) query.set('cc', draft.cc.replaceAll(';', ','));
  if (draft.bcc.trim()) query.set('bcc', draft.bcc.replaceAll(';', ','));
  // Encode recipients separately; never allow query/header characters to escape.
  const to = draft.to
    .split(/[,;]/)
    .map((address) => encodeURIComponent(address.trim()))
    .filter(Boolean)
    .join(',');
  return 'mailto:' + to + '?' + query.toString().replaceAll('+', '%20');
}
type Snapshot = {
  data: MailState;
  loaded: boolean;
  sessionOnly: boolean;
  warning: string;
};
export function createMailStore() {
  const initial: Snapshot = {
    data: emptyMailState(),
    loaded: false,
    sessionOnly: false,
    warning: '',
  };
  let snapshot = initial;
  let lastRaw: string | null = null;
  let preserveUnreadable = false;
  const listeners = new Set<() => void>();
  function publish(next: Snapshot) {
    snapshot = next;
    listeners.forEach((fn) => fn());
  }
  function receive(event: StorageEvent) {
    if (event.key !== MAIL_STORAGE_KEY && event.key !== null) return;
    if (snapshot.sessionOnly || preserveUnreadable) {
      publish({
        ...snapshot,
        warning:
          'Mail changed elsewhere. Your session-only drafts have been retained; copy them before refreshing.',
      });
      return;
    }
    try {
      const raw = localStorage.getItem(MAIL_STORAGE_KEY);
      publish({ ...snapshot, data: parseMailState(raw), warning: '' });
      lastRaw = raw;
    } catch {
      publish({
        ...snapshot,
        warning:
          'Mail changed in another tab but could not be read. Your open draft is retained; refresh before saving.',
      });
      preserveUnreadable = true;
    }
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => {
      try {
        lastRaw = localStorage.getItem(MAIL_STORAGE_KEY);
        publish({
          data: parseMailState(lastRaw),
          loaded: true,
          sessionOnly: false,
          warning: '',
        });
      } catch {
        preserveUnreadable = true;
        publish({
          ...snapshot,
          loaded: true,
          sessionOnly: true,
          warning:
            'Mail storage is unavailable or unreadable. Original data is retained. Mail edits are session-only.',
        });
      }
      window.addEventListener('storage', receive);
      return () => window.removeEventListener('storage', receive);
    },
    commit: (action: MailAction): { error?: string; sessionOnly?: boolean } => {
      if (!snapshot.loaded) return { error: 'Mail is still loading.' };
      let data: MailState;
      try {
        data = updateMail(snapshot.data, action);
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : 'The draft could not be saved.',
        };
      }
      let sessionOnly = preserveUnreadable || snapshot.sessionOnly;
      if (!sessionOnly) {
        try {
          if (localStorage.getItem(MAIL_STORAGE_KEY) !== lastRaw)
            return {
              error:
                'Mail changed in another tab. Refresh before saving; your open draft has not been cleared.',
            };
          const raw = JSON.stringify(data);
          localStorage.setItem(MAIL_STORAGE_KEY, raw);
          lastRaw = raw;
        } catch {
          sessionOnly = true;
        }
      }
      publish({
        data,
        loaded: true,
        sessionOnly,
        warning: sessionOnly
          ? 'Mail edits are session-only. Keep this tab open or copy your draft before refreshing.'
          : '',
      });
      return { sessionOnly };
    },
  };
}
