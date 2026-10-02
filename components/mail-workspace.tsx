'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Archive,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FilePenLine,
  FileText,
  Forward,
  Inbox,
  Mail,
  MailOpen,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { sampleMail } from '@/lib/mail-preview';
import { mailFlags, type MailDraft } from '@/lib/mail-state';
import { stableIdentity } from '@/lib/ui-preferences';
import { useMail } from '@/components/mail-provider';
import { MailComposer } from '@/components/mail-composer';
import { useWorkspace } from '@/components/workspace-provider';
import { StatusPill } from '@/components/page-ui';
import { DraftDialog } from '@/components/draft-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
type Folder = 'Inbox' | 'Starred' | 'Drafts' | 'Sent' | 'Archive';
type Sample = (typeof sampleMail)[number];
type LinkedDraft = {
  id: string;
  subject: string;
  body: string;
  to: string;
  source: string;
  href?: string;
  sessionId?: string;
  reviewed?: boolean;
};
const folders = [
  { name: 'Inbox', icon: Inbox },
  { name: 'Starred', icon: Star },
  { name: 'Drafts', icon: FilePenLine },
  { name: 'Sent', icon: Send },
  { name: 'Archive', icon: Archive },
] as const;
const address = (thread: Sample) => thread.id + '@example.invalid';
const messageDate = (thread: Sample) =>
  (thread.date.startsWith('Today') ? '5 Sep' : '4 Sep') +
  ' · ' +
  thread.date.split(', ')[1];
function IconAction({
  label,
  children,
  onClick,
  disabled,
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      className="mail-icon"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export default function MailWorkspace() {
  const workspace = useWorkspace();
  const { data, loaded, warning, commit, composer, setComposer } = useMail();
  const [folder, setFolder] = useState<Folder>('Inbox');
  const [filter, setFilter] = useState<'all' | 'unread' | 'review'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>('rauch');
  const [mobileThread, setMobileThread] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<string | null>(null);
  const editable = loaded && workspace.ready;
  const linked: LinkedDraft[] = [
    ...workspace.invoices.flatMap((invoice) =>
      invoice.emailDraft
        ? [
            {
              id: 'invoice:' + invoice.id,
              subject: invoice.emailDraft.subject,
              body: invoice.emailDraft.body,
              to: invoice.emailDraft.to,
              source: 'Invoice · ' + invoice.id,
              href: '/invoices/' + invoice.id,
            },
          ]
        : [],
    ),
    ...workspace.cases.flatMap(
      (order) =>
        order.pack?.drafts.map((draft) => ({
          id: 'pack:' + order.id + ':' + draft.id,
          subject: draft.subject,
          body: draft.body,
          to: draft.to,
          source: 'Order pack · #' + order.id,
          href: '/orders/' + order.id + '/review',
          reviewed: draft.reviewed,
        })) || [],
    ),
    ...Object.entries(workspace.drafts).map(([id, draft]) => ({
      id: 'session:' + id,
      subject: draft.subject,
      body: draft.body,
      to:
        sampleMail.find((thread) => 'mail-' + thread.id === id)?.from ||
        'Review in the original workspace',
      source: 'Workspace · session draft',
      sessionId: id,
    })),
  ];
  const matches = (value: string) =>
    value.toLowerCase().includes(query.trim().toLowerCase());
  const threads = sampleMail.filter((thread) => {
    const flag = mailFlags(data, thread.id);
    const inFolder =
      folder === 'Archive'
        ? flag.archived
        : !flag.archived && (folder !== 'Starred' || flag.starred);
    return (
      !['Drafts', 'Sent'].includes(folder) &&
      inFolder &&
      (filter !== 'unread' || !flag.read) &&
      (filter !== 'review' || thread.status === 'Needs review') &&
      matches(
        thread.from +
          ' ' +
          thread.subject +
          ' ' +
          thread.body +
          ' ' +
          thread.order,
      )
    );
  });
  const localDrafts = data.drafts.filter((draft) =>
    matches(
      draft.to +
        ' ' +
        draft.subject +
        ' ' +
        draft.body +
        ' ' +
        (draft.orderId || ''),
    ),
  );
  const linkedDrafts = linked.filter((draft) =>
    matches(
      draft.to + ' ' + draft.subject + ' ' + draft.body + ' ' + draft.source,
    ),
  );
  const thread = ['Drafts', 'Sent'].includes(folder)
    ? undefined
    : sampleMail.find((item) => item.id === selected) || threads[0];
  const linkedDraft =
    linkedDrafts.find((item) => item.id === selected) || linkedDrafts[0];
  const flags = thread ? mailFlags(data, thread.id) : undefined;
  const order = workspace.cases.find((item) => item.id === thread?.order);
  const totalDrafts = data.drafts.length + linked.length;
  const visibleChecked = checked.filter((id) =>
    threads.some((t) => t.id === id),
  );
  function changeFolder(next: Folder) {
    setSelected('');
    setFolder(next);
    setFilter('all');
    setChecked([]);
    setMobileThread(false);
  }
  function mark(
    ids: string[],
    patch: Partial<ReturnType<typeof mailFlags>>,
    notice?: string,
  ) {
    if (!editable) return;
    const result = commit({ type: 'flags', ids, patch });
    if (result.error) workspace.notify(result.error);
    else {
      if (
        patch.archived !== undefined ||
        (patch.starred === false && folder === 'Starred')
      )
        setSelected('');
      if (notice) workspace.notify(notice);
    }
  }
  function selectThread(item: Sample) {
    setSelected(item.id);
    setMobileThread(true);
    mark([item.id], { read: true });
  }
  function start(mode: MailDraft['mode'], item?: Sample) {
    if (!editable) {
      workspace.notify(
        'This tab is read-only. Open the editing tab to compose.',
      );
      return;
    }
    const existing =
      mode === 'reply' && item
        ? data.drafts.find((d) => d.threadId === item.id && d.mode === 'reply')
        : undefined;
    setComposer(
      existing || {
        id: 'draft-' + crypto.randomUUID(),
        mode,
        threadId: item?.id,
        orderId: item?.order,
        to: mode === 'reply' && item ? address(item) : '',
        cc: '',
        bcc: '',
        subject: item
          ? (mode === 'forward' ? 'Fwd: ' : 'Re: ') + item.subject
          : '',
        body:
          mode === 'forward' && item
            ? '\n\n—— Forwarded sample message ——\nFrom: ' +
              item.from +
              ' <' +
              address(item) +
              '>\nSubject: ' +
              item.subject +
              '\n\n' +
              item.body +
              (item.file
                ? '\n\nAttachment reference: ' + item.file + ' (not included)'
                : '')
            : '',
        attachments: [],
        updatedAt: 0,
      },
    );
  }
  function folderCount(name: Folder) {
    if (name === 'Drafts') return totalDrafts;
    if (name === 'Sent') return 0;
    return sampleMail.filter((t) => {
      const f = mailFlags(data, t.id);
      return name === 'Inbox'
        ? !f.archived && !f.read
        : name === 'Starred'
          ? !f.archived && f.starred
          : f.archived;
    }).length;
  }
  const resultCount =
    folder === 'Drafts'
      ? localDrafts.length + linkedDrafts.length
      : threads.length;
  return (
    <div className="page inbox-page">
      <header className="inbox-heading">
        <div>
          <span className="inbox-eyebrow">AH INTERIORS / MAIL</span>
          <h1>
            Communications
            <span className="inbox-title-dot" />
          </h1>
        </div>
        <span className="inbox-preview">
          <span />
          Local preview · Gmail not connected
        </span>
      </header>
      {warning && <output className="mail-storage-note">{warning}</output>}
      <div className="inbox-shell" data-thread-open={mobileThread}>
        <aside className="inbox-folders" aria-label="Mail folders">
          <button
            className="btn btn-primary inbox-compose"
            disabled={!editable}
            onClick={() => start('new')}
          >
            <Plus size={19} />
            Compose
          </button>
          <nav aria-label="Mailbox">
            {folders.map(({ name, icon: Icon }) => (
              <button
                key={name}
                className={
                  'inbox-folder ' + (folder === name ? 'is-active' : '')
                }
                aria-current={folder === name ? 'page' : undefined}
                onClick={() => changeFolder(name)}
              >
                <Icon size={18} />
                <span>{name}</span>
                {folderCount(name) > 0 && <b>{folderCount(name)}</b>}
              </button>
            ))}
          </nav>
          <div className="inbox-folder-bottom">
            <div className="inbox-account-avatar">AH</div>
            <strong>AH Interiors</strong>
            <span>Preview mailbox</span>
            <p>
              No inbox is connected.
              <br />
              Messages below are samples.
            </p>
            <Link href="/settings">
              Connection settings
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </aside>
        <section
          className="inbox-collection"
          aria-label={folder + ' message list'}
        >
          <div className="inbox-list-head">
            <h2>
              {folder}
              <span>{resultCount}</span>
            </h2>
            <label className="inbox-search">
              <Search size={17} />
              <input
                aria-label="Search mail"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected('');
                }}
                placeholder="Search mail or order…"
              />
              {query && (
                <button
                  aria-label="Clear mail search"
                  onClick={() => setQuery('')}
                >
                  <X size={15} />
                </button>
              )}
            </label>
            {!['Drafts', 'Sent'].includes(folder) && (
              <fieldset className="inbox-filters" aria-label="Message filters">
                {(['all', 'unread', 'review'] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={filter === value}
                    onClick={() => {
                      setFilter(value);
                      setSelected('');
                      setChecked([]);
                    }}
                  >
                    {value === 'all'
                      ? 'All mail'
                      : value === 'unread'
                        ? 'Unread'
                        : 'Needs review'}
                  </button>
                ))}
              </fieldset>
            )}
          </div>
          {!!threads.length && (
            <div className="inbox-bulk">
              <label>
                <input
                  type="checkbox"
                  aria-label="Select all visible conversations"
                  checked={visibleChecked.length === threads.length}
                  onChange={(e) =>
                    setChecked(e.target.checked ? threads.map((t) => t.id) : [])
                  }
                />
                <span>
                  {visibleChecked.length
                    ? visibleChecked.length + ' selected'
                    : 'Newest first'}
                </span>
              </label>
              {!!visibleChecked.length && (
                <div>
                  <IconAction
                    label="Mark selected as read"
                    disabled={!editable}
                    onClick={() => {
                      mark(
                        visibleChecked,
                        { read: true },
                        'Selected conversations marked as read locally.',
                      );
                      setChecked([]);
                    }}
                  >
                    <CheckCheck size={17} />
                  </IconAction>
                  <IconAction
                    label={
                      folder === 'Archive'
                        ? 'Restore selected to inbox'
                        : 'Archive selected'
                    }
                    disabled={!editable}
                    onClick={() => {
                      mark(
                        visibleChecked,
                        { archived: folder !== 'Archive' },
                        folder === 'Archive'
                          ? 'Conversations restored to the inbox.'
                          : 'Conversations archived locally. Find them in Archive.',
                      );
                      setChecked([]);
                    }}
                  >
                    <Archive size={17} />
                  </IconAction>
                </div>
              )}
            </div>
          )}
          <div className="inbox-list">
            {threads.map((item) => {
              const flag = mailFlags(data, item.id);
              return (
                <div
                  key={item.id}
                  className={
                    'inbox-row ' +
                    (thread?.id === item.id ? 'is-selected ' : '') +
                    (!flag.read ? 'is-unread' : '')
                  }
                >
                  <div className="inbox-row-controls">
                    <input
                      type="checkbox"
                      aria-label={'Select conversation with ' + item.from}
                      checked={checked.includes(item.id)}
                      onChange={(e) =>
                        setChecked((ids) =>
                          e.target.checked
                            ? [...ids, item.id]
                            : ids.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <IconAction
                      label={(flag.starred ? 'Unstar ' : 'Star ') + item.from}
                      pressed={flag.starred}
                      disabled={!editable}
                      onClick={() =>
                        mark([item.id], { starred: !flag.starred })
                      }
                    >
                      <Star
                        size={15}
                        fill={flag.starred ? 'currentColor' : 'none'}
                      />
                    </IconAction>
                  </div>
                  <button
                    className="inbox-row-open"
                    aria-pressed={thread?.id === item.id}
                    onClick={() => selectThread(item)}
                  >
                    <div className="inbox-row-meta">
                      <strong>{item.from}</strong>
                      <time>
                        {item.date.startsWith('Today') ? '5 Sep' : '4 Sep'}
                      </time>
                    </div>
                    <span className="inbox-row-subject">{item.subject}</span>
                    <span className="inbox-row-snippet">{item.preview}</span>
                    <span className="inbox-row-foot">
                      <span
                        className={
                          'inbox-label ' +
                          (item.tone === 'red'
                            ? 'is-exception'
                            : item.status === 'Needs review'
                              ? 'needs-review'
                              : '')
                        }
                      >
                        {item.status}
                      </span>
                      <small>#{item.order}</small>
                      {item.file && <Paperclip size={13} />}
                    </span>
                  </button>
                </div>
              );
            })}
            {folder === 'Drafts' && (
              <>
                {localDrafts.map((draft) => (
                  <button
                    key={draft.id}
                    className="inbox-draft-row"
                    onClick={() =>
                      editable
                        ? setComposer(draft)
                        : workspace.notify(
                            'Open the editing tab to edit this draft.',
                          )
                    }
                  >
                    <span className="inbox-draft-type">
                      <FilePenLine size={16} />
                      Local draft · not sent
                    </span>
                    <strong>{draft.subject || 'Untitled message'}</strong>
                    <span>{draft.to || 'No recipient yet'}</span>
                    <p>{draft.body || 'Continue writing your message…'}</p>
                  </button>
                ))}
                {linkedDrafts.map((draft) => (
                  <button
                    key={draft.id}
                    className={
                      'inbox-draft-row ' +
                      (linkedDraft?.id === draft.id ? 'is-selected' : '')
                    }
                    onClick={() => {
                      setSelected(draft.id);
                      setMobileThread(true);
                    }}
                  >
                    <span className="inbox-draft-type">
                      <ShieldCheck size={16} />
                      {draft.source}
                    </span>
                    <strong>{draft.subject}</strong>
                    <span>{draft.to}</span>
                    <p>{draft.body}</p>
                  </button>
                ))}
              </>
            )}
            {resultCount === 0 && (
              <div className="inbox-empty">
                <Inbox size={30} />
                <h3>
                  {folder === 'Sent'
                    ? 'Nothing sent from Amiro'
                    : folder === 'Drafts'
                      ? 'No drafts here yet'
                      : 'No matching conversations'}
                </h3>
                <p>
                  {folder === 'Sent'
                    ? 'Gmail is not connected. Saved drafts and local approvals never appear as sent messages.'
                    : query
                      ? 'Try another name, subject or order reference.'
                      : folder === 'Drafts'
                        ? 'Compose a message, or prepare an order or invoice email.'
                        : 'Change your filters or return to the inbox.'}
                </p>
                {folder !== 'Sent' && (
                  <button
                    className="mail-text-action"
                    onClick={() => {
                      setQuery('');
                      setFilter('all');
                      if (folder !== 'Inbox') changeFolder('Inbox');
                    }}
                  >
                    Show inbox
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="inbox-list-footer">
            <span>
              {folder === 'Drafts'
                ? 'Drafts are never sent automatically'
                : 'Sample conversations · September 2026'}
            </span>
          </div>
        </section>
        <section className="inbox-reader" aria-label="Conversation reader">
          <div className="inbox-reader-toolbar">
            <IconAction
              label="Back to message list"
              onClick={() => setMobileThread(false)}
            >
              <ArrowLeft size={18} />
            </IconAction>
            {thread && (
              <>
                <IconAction
                  label={
                    flags?.archived ? 'Move to inbox' : 'Archive conversation'
                  }
                  disabled={!editable}
                  onClick={() => {
                    mark(
                      [thread.id],
                      { archived: !flags?.archived },
                      flags?.archived
                        ? 'Conversation restored to the inbox.'
                        : 'Conversation archived locally. Find it in Archive.',
                    );
                    setMobileThread(false);
                  }}
                >
                  <Archive size={18} />
                </IconAction>
                <IconAction
                  label={
                    flags?.read
                      ? 'Mark conversation unread'
                      : 'Mark conversation read'
                  }
                  disabled={!editable}
                  onClick={() => mark([thread.id], { read: !flags?.read })}
                >
                  {flags?.read ? <Mail size={18} /> : <MailOpen size={18} />}
                </IconAction>
              </>
            )}
            <span className="inbox-toolbar-caption">
              {folder === 'Drafts' ? 'Connected drafts' : 'Conversation'}
            </span>
            {thread && threads.includes(thread) && (
              <div className="inbox-thread-pager">
                <span>
                  {threads.indexOf(thread) + 1} of {threads.length}
                </span>
                <IconAction
                  label="Previous conversation"
                  disabled={threads.indexOf(thread) <= 0}
                  onClick={() =>
                    selectThread(threads[threads.indexOf(thread) - 1])
                  }
                >
                  <ChevronLeft size={18} />
                </IconAction>
                <IconAction
                  label="Next conversation"
                  disabled={threads.indexOf(thread) >= threads.length - 1}
                  onClick={() =>
                    selectThread(threads[threads.indexOf(thread) + 1])
                  }
                >
                  <ChevronRight size={18} />
                </IconAction>
              </div>
            )}
          </div>
          <div className="inbox-reader-scroll">
            {folder === 'Drafts' ? (
              linkedDraft ? (
                <div className="inbox-linked-draft">
                  <span className="inbox-eyebrow">{linkedDraft.source}</span>
                  <h2>{linkedDraft.subject}</h2>
                  <p className="inbox-recipient">To: {linkedDraft.to}</p>
                  <span className="inbox-label">
                    {linkedDraft.reviewed
                      ? 'Reviewed · not sent'
                      : 'Draft · not sent'}
                  </span>
                  <div className="mail-review-body">{linkedDraft.body}</div>
                  <div className="mail-connection-note">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>Managed by its original record</strong>
                      <p>
                        Review and edit this message in its own workflow. This
                        keeps invoice snapshots and order approval checks
                        intact.
                      </p>
                    </div>
                  </div>
                  {linkedDraft.href && (
                    <Link className="btn btn-primary" href={linkedDraft.href}>
                      Open original record
                      <ArrowUpRight size={17} />
                    </Link>
                  )}
                  {linkedDraft.sessionId && (
                    <DraftDialog
                      id={linkedDraft.sessionId}
                      recipient={linkedDraft.to}
                      subject={linkedDraft.subject}
                      body={linkedDraft.body}
                      label="Edit session draft"
                    />
                  )}
                </div>
              ) : (
                <div className="inbox-empty">
                  <FilePenLine size={32} />
                  <h3>Your drafts, ready when you are</h3>
                  <p>
                    Open a local draft from the list, or start a new message.
                    Closing the composer saves your changes.
                  </p>
                  <button
                    className="btn btn-primary"
                    disabled={!editable}
                    onClick={() => start('new')}
                  >
                    <Plus size={17} />
                    New message
                  </button>
                </div>
              )
            ) : thread ? (
              <article key={thread.id} className="inbox-thread">
                <div className="inbox-thread-title">
                  <div>
                    <span className="inbox-eyebrow">SAMPLE CONVERSATION</span>
                    <h2>{thread.subject}</h2>
                    <div className="inbox-thread-labels">
                      <StatusPill tone={thread.tone}>
                        {thread.status}
                      </StatusPill>
                      <span>2 sample messages</span>
                    </div>
                  </div>
                  <IconAction
                    label={
                      flags?.starred
                        ? 'Unstar conversation'
                        : 'Star conversation'
                    }
                    pressed={flags?.starred}
                    disabled={!editable}
                    onClick={() =>
                      mark([thread.id], { starred: !flags?.starred })
                    }
                  >
                    <Star
                      size={19}
                      fill={flags?.starred ? 'currentColor' : 'none'}
                    />
                  </IconAction>
                </div>
                <details className="inbox-order-context">
                  <summary>
                    <span className="inbox-context-mark">
                      <FileText size={17} />
                    </span>
                    <span>
                      <strong>Order #{thread.order}</strong>
                      <small>{order?.customer || 'Linked sample order'}</small>
                    </span>
                    <ChevronDown size={16} />
                  </summary>
                  <div>
                    <p>{thread.note}</p>
                    <small>
                      Context from the sample message. Check the live local
                      record before acting.
                    </small>
                    {order && (
                      <p className="inbox-current-state">
                        Current local payment:{' '}
                        {order.paid >= order.total
                          ? 'Paid'
                          : 'Balance outstanding'}
                      </p>
                    )}
                    <Link href={'/orders/' + thread.order}>
                      Open order workspace
                      <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </details>
                <details className="inbox-message is-history">
                  <summary>
                    <span className="inbox-avatar is-ah">AH</span>
                    <span className="inbox-sender">
                      <strong>
                        AH Interiors <small>Sample outgoing</small>
                      </strong>
                      <span>Regarding order #{thread.order}…</span>
                    </span>
                    <ChevronDown size={16} />
                  </summary>
                  <div className="inbox-message-content">
                    <p className="inbox-history-notice">
                      Illustrative earlier message · not a sent record
                    </p>
                    <p>Hello {thread.from},</p>
                    <p>
                      We are reviewing the details for order #{thread.order}.
                      Please share the information needed to confirm the next
                      step.
                    </p>
                    <p>
                      Kind regards,
                      <br />
                      AH Interiors
                    </p>
                  </div>
                </details>
                <details className="inbox-message" open>
                  <summary>
                    <span
                      className={
                        'inbox-avatar avatar-' + stableIdentity(thread.from)
                      }
                    >
                      {thread.initials}
                    </span>
                    <span className="inbox-sender">
                      <strong>{thread.from}</strong>
                      <span>
                        <ArrowDownLeft size={12} />
                        Sample incoming
                      </span>
                    </span>
                    <time>{messageDate(thread)}</time>
                    <ChevronDown size={16} />
                  </summary>
                  <div className="inbox-message-content">
                    <details className="inbox-recipient-details">
                      <summary>
                        to AH Interiors
                        <ChevronDown size={13} />
                      </summary>
                      <dl className="mail-envelope">
                        <div>
                          <dt>From</dt>
                          <dd>
                            {thread.from} &lt;{address(thread)}&gt;
                          </dd>
                        </div>
                        <div>
                          <dt>To</dt>
                          <dd>AH Interiors &lt;hello@example.invalid&gt;</dd>
                        </div>
                        <div>
                          <dt>Date</dt>
                          <dd>{messageDate(thread)} 2026</dd>
                        </div>
                        <div>
                          <dt>Source</dt>
                          <dd>Local sample · not synced from Gmail</dd>
                        </div>
                      </dl>
                    </details>
                    <div className="inbox-message-body">{thread.body}</div>
                    {thread.file && (
                      <button
                        className="inbox-attachment"
                        onClick={() => setAttachment(thread.file)}
                      >
                        <span>
                          <FileText size={22} />
                        </span>
                        <span>
                          <strong>{thread.file}</strong>
                          <small>PDF · sample reference</small>
                        </span>
                        <ArrowUpRight size={17} />
                      </button>
                    )}
                  </div>
                </details>
                <div className="inbox-reply-actions">
                  <button
                    className="btn btn-primary"
                    disabled={!editable}
                    onClick={() => start('reply', thread)}
                  >
                    <Reply size={17} />
                    Reply
                  </button>
                  <button
                    className="btn"
                    disabled={!editable}
                    onClick={() => start('forward', thread)}
                  >
                    <Forward size={17} />
                    Forward
                  </button>
                  <span>Nothing is sent without you.</span>
                </div>
                {data.drafts
                  .filter((d) => d.threadId === thread.id)
                  .map((draft) => (
                    <button
                      className="inbox-thread-draft"
                      key={draft.id}
                      disabled={!editable}
                      onClick={() => setComposer(draft)}
                    >
                      <FilePenLine size={18} />
                      <span>
                        <strong>Continue your {draft.mode} draft</strong>
                        <small>{draft.subject} · not sent</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                {workspace.drafts['mail-' + thread.id] && (
                  <div className="inbox-thread-draft">
                    <FilePenLine size={18} />
                    <span>
                      <strong>Existing session reply</strong>
                      <small>
                        {workspace.drafts['mail-' + thread.id].subject}
                      </small>
                    </span>
                    <DraftDialog
                      id={'mail-' + thread.id}
                      recipient={thread.from}
                      subject={thread.subject}
                      body={thread.draft}
                    />
                  </div>
                )}
              </article>
            ) : (
              <div className="inbox-empty inbox-reader-empty">
                <Mail size={36} />
                <h3>
                  {folder === 'Sent'
                    ? 'A clear record of what is actually sent'
                    : 'A little more space to focus'}
                </h3>
                <p>
                  {folder === 'Sent'
                    ? 'When the backend connects Gmail, genuine sent messages and replies can appear here. Nothing has been sent by this local preview.'
                    : 'Choose a conversation or change the filters to see its full thread.'}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
      {composer && <MailComposer key={composer.id} />}
      <Dialog
        open={!!attachment}
        onOpenChange={(open) => {
          if (!open) setAttachment(null);
        }}
      >
        <DialogContent className="sm:!max-w-[500px]">
          <DialogTitle className="mail-attachment-title">
            <FileText />
            {attachment}
          </DialogTitle>
          <DialogDescription>
            This is a sample attachment reference, not a fetched PDF. Its
            contents have not been downloaded or verified.
          </DialogDescription>
          <div className="mail-connection-note">
            <CircleAlert size={20} />
            <p>
              Real attachment preview and download will be available after the
              mail connection is implemented.
            </p>
          </div>
          <Link
            className="btn"
            href="/documents"
            onClick={() => setAttachment(null)}
          >
            Open document library
            <ArrowUpRight size={16} />
          </Link>
        </DialogContent>
      </Dialog>
    </div>
  );
}
