'use client';
import { useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  LockKeyhole,
  Mail,
  Paperclip,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWorkspace } from '@/components/workspace-provider';
import { useMail } from '@/components/mail-provider';
import { draftErrors, mailtoFor, type MailDraft } from '@/lib/mail-state';
export function MailComposer() {
  const { composer, setComposer, commit, loaded } = useMail();
  const { ready, notify, cases } = useWorkspace();
  const [stage, setStage] = useState<'write' | 'review' | 'discard'>('write');
  const [copies, setCopies] = useState(false);
  const [error, setError] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editable = ready && loaded;
  if (!composer) return null;
  const draft = composer;
  function update(patch: Partial<MailDraft>) {
    setComposer({ ...draft, ...patch });
    setError('');
  }
  function save(close: boolean) {
    if (!editable) {
      setError('This tab is read-only. Your open message has been kept.');
      return false;
    }
    if (
      ![
        draft.to,
        draft.cc,
        draft.bcc,
        draft.subject,
        draft.body,
        draft.orderId,
      ].some(Boolean) &&
      !draft.attachments.length &&
      draft.updatedAt === 0
    ) {
      if (close) setComposer(null);
      return true;
    }
    const saved = {
      ...draft,
      updatedAt: Math.max(Date.now(), draft.updatedAt + 1),
    };
    const result = commit({
      type: 'save',
      draft: saved,
      expectedUpdatedAt: draft.updatedAt || null,
    });
    if (result.error) {
      setError(result.error);
      return false;
    }
    notify(
      result.sessionOnly
        ? 'Draft kept for this session only. Not sent.'
        : 'Draft saved on this browser. Not sent.',
    );
    if (close) setComposer(null);
    else setComposer(saved);
    return true;
  }
  function review() {
    const errors = draftErrors(draft);
    if (errors.length) setError(errors.join(' '));
    else {
      setError('');
      setStage('review');
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) save(true);
      }}
    >
      <DialogContent className="mail-composer" showCloseButton={false}>
        <div className="mail-compose-head">
          <span className="mail-compose-mark">
            <Mail size={19} />
          </span>
          <div>
            <DialogTitle>
              {stage === 'discard'
                ? 'Discard this draft?'
                : stage === 'review'
                  ? 'Review your email'
                  : draft.mode === 'new'
                    ? 'New message'
                    : draft.mode === 'forward'
                      ? 'Forward message'
                      : 'Reply to conversation'}
            </DialogTitle>
            <DialogDescription>
              {stage === 'discard'
                ? 'Remove the local draft, not the conversation.'
                : 'AH Interiors · local draft · no email account connected'}
            </DialogDescription>
          </div>
          <button
            className="mail-icon"
            aria-label="Save draft and close"
            onClick={() => save(true)}
          >
            <X size={19} />
          </button>
        </div>
        {stage === 'discard' ? (
          <div className="mail-discard">
            <p>
              Remove “{draft.subject || 'Untitled message'}”? This cannot be
              undone.
            </p>
            <div className="action-row">
              <button className="btn" onClick={() => setStage('write')}>
                Keep editing
              </button>
              <button
                className="btn btn-danger"
                disabled={!editable}
                onClick={() => {
                  const result = commit({
                    type: 'discard',
                    id: draft.id,
                    expectedUpdatedAt: draft.updatedAt || null,
                  });
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  setComposer(null);
                  notify('Local draft discarded. No email was sent.');
                }}
              >
                <Trash2 size={16} />
                Discard draft
              </button>
            </div>
          </div>
        ) : stage === 'review' ? (
          <div className="mail-compose-scroll">
            <dl className="mail-envelope">
              <div>
                <dt>To</dt>
                <dd>{draft.to}</dd>
              </div>
              {draft.cc && (
                <div>
                  <dt>Cc</dt>
                  <dd>{draft.cc}</dd>
                </div>
              )}
              {draft.bcc && (
                <div>
                  <dt>Bcc</dt>
                  <dd>{draft.bcc}</dd>
                </div>
              )}
              <div>
                <dt>Subject</dt>
                <dd>{draft.subject}</dd>
              </div>
            </dl>
            <div className="mail-review-body">{draft.body}</div>
            {!!draft.attachments.length && (
              <div className="mail-attachment-note">
                <Paperclip size={17} />
                <span>
                  {draft.attachments.length} file(s) listed, not uploaded or
                  embedded. Attach the originals manually in your email app.
                </span>
              </div>
            )}
            <div className="mail-connection-note">
              <LockKeyhole size={18} />
              <div>
                <strong>Sending from Amiro is not connected yet</strong>
                <p>
                  Save this draft or hand it to your email app. Opening your
                  email app does not send it. Replace example.invalid sample
                  recipients before sending.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mail-compose-scroll">
            <div className="mail-compose-fields">
              <div className="mail-address-line">
                <label htmlFor="mail-to">To</label>
                <input
                  id="mail-to"
                  value={draft.to}
                  onChange={(e) => update({ to: e.target.value })}
                  placeholder="name@company.com"
                  autoComplete="off"
                  disabled={!editable}
                />
                <button
                  className="mail-text-action"
                  aria-expanded={copies || !!draft.cc || !!draft.bcc}
                  onClick={() => setCopies((v) => !v)}
                >
                  Cc / Bcc
                </button>
              </div>
              {(copies || !!draft.cc || !!draft.bcc) && (
                <>
                  <div className="mail-address-line">
                    <label htmlFor="mail-cc">Cc</label>
                    <input
                      id="mail-cc"
                      value={draft.cc}
                      onChange={(e) => update({ cc: e.target.value })}
                      placeholder="Separate addresses with commas"
                      disabled={!editable}
                    />
                  </div>
                  <div className="mail-address-line">
                    <label htmlFor="mail-bcc">Bcc</label>
                    <input
                      id="mail-bcc"
                      value={draft.bcc}
                      onChange={(e) => update({ bcc: e.target.value })}
                      placeholder="Hidden recipients"
                      disabled={!editable}
                    />
                  </div>
                </>
              )}
              <div className="mail-address-line">
                <label htmlFor="mail-subject">Subject</label>
                <input
                  id="mail-subject"
                  value={draft.subject}
                  onChange={(e) => update({ subject: e.target.value })}
                  placeholder="What is this about?"
                  disabled={!editable}
                />
              </div>
              <div className="mail-address-line">
                <label htmlFor="mail-order">Order</label>
                <select
                  id="mail-order"
                  value={draft.orderId || ''}
                  onChange={(e) =>
                    update({ orderId: e.target.value || undefined })
                  }
                  disabled={!editable}
                >
                  <option value="">No linked order</option>
                  {cases.map((order) => (
                    <option key={order.id} value={order.id}>
                      #{order.id} · {order.customer}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="sr-only" htmlFor="mail-body">
              Message
            </label>
            <textarea
              ref={editor}
              id="mail-body"
              className="mail-compose-body"
              placeholder="Write your message…"
              value={draft.body}
              onChange={(e) => update({ body: e.target.value })}
              disabled={!editable}
            />
            {!!draft.attachments.length && (
              <div className="mail-compose-attachments">
                {draft.attachments.map((file) => (
                  <div key={file.id}>
                    <FileText size={17} />
                    <span>
                      {file.name}
                      <small>
                        {Math.max(1, Math.round(file.size / 1024))} KB · listed
                        locally
                      </small>
                    </span>
                    <button
                      className="mail-icon"
                      aria-label={'Remove ' + file.name}
                      disabled={!editable}
                      onClick={() =>
                        update({
                          attachments: draft.attachments.filter(
                            (f) => f.id !== file.id,
                          ),
                        })
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mail-compose-tools">
              <input
                type="file"
                multiple
                ref={upload}
                className="sr-only"
                tabIndex={-1}
                aria-label="Select local attachments"
                onChange={(e) => {
                  const files = [...(e.target.files || [])];
                  e.target.value = '';
                  if (
                    files.length + draft.attachments.length > 10 ||
                    files.some((f) => f.size > 25 * 1024 * 1024)
                  ) {
                    setError(
                      'Choose up to 10 files, each no larger than 25 MB.',
                    );
                    return;
                  }
                  update({
                    attachments: [
                      ...draft.attachments,
                      ...files.map((f) => ({
                        id: crypto.randomUUID(),
                        name: f.name,
                        size: f.size,
                      })),
                    ],
                  });
                }}
              />
              <button
                className="mail-tool"
                disabled={!editable}
                onClick={() => upload.current?.click()}
              >
                <Paperclip size={17} />
                Attach files
              </button>
              <button
                className="mail-tool"
                disabled={!editable}
                onClick={() => {
                  update({
                    body:
                      draft.body.trimEnd() + '\n\nKind regards,\nAH Interiors',
                  });
                  editor.current?.focus();
                }}
              >
                Add signature
              </button>
              <span>Plain-text email</span>
            </div>
            {!!draft.attachments.length && (
              <p className="mail-small-note">
                Attachment names only. Original files are not uploaded or
                stored.
              </p>
            )}
          </div>
        )}
        {error && (
          <output className="mail-form-error" aria-live="polite">
            {error}
          </output>
        )}
        {stage !== 'discard' && (
          <div className="mail-compose-footer">
            {stage === 'review' ? (
              <>
                <button className="btn" onClick={() => setStage('write')}>
                  <ArrowLeft size={16} />
                  Edit
                </button>
                <button
                  className="btn"
                  disabled={!editable}
                  onClick={() => save(true)}
                >
                  Save draft
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!editable}
                  onClick={() => {
                    if (save(false)) window.location.href = mailtoFor(draft);
                  }}
                >
                  <ExternalLink size={16} />
                  Open email app
                </button>
                <button
                  className="btn"
                  disabled
                  title="Gmail will connect in the backend phase"
                >
                  <Send size={16} />
                  Send
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-primary"
                  disabled={!editable}
                  onClick={review}
                >
                  <Send size={16} />
                  Review email
                </button>
                <button
                  className="btn"
                  disabled={!editable}
                  onClick={() => save(true)}
                >
                  <Check size={16} />
                  Save draft
                </button>
                <span className="mail-save-hint">Closing saves your draft</span>
                <button
                  className="mail-icon"
                  aria-label="Discard draft"
                  disabled={!editable}
                  onClick={() => setStage('discard')}
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
