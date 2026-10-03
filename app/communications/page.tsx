'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, Plus, FileEdit } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { PageIntro, Panel, StatusPill } from '@/components/page-ui';
import { BusinessFormPanel } from '@/components/business-form-panel';
type Draft = {
  id?: string;
  version: number;
  entity: string;
  entityId: string;
  to: string;
  subject: string;
  body: string;
  recordName?: string;
  href?: string;
  updatedAt?: string;
};
type RecordChoice = { id: string; entity: string; name: string };
export default function Communications() {
  const [rows, setRows] = useState<Draft[]>([]),
    [records, setRecords] = useState<RecordChoice[]>([]),
    [form, setForm] = useState<Draft | null>(null),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [drafts, choices] = await Promise.all([
        apiRequest<Draft[]>('/api/communication-drafts'),
        apiRequest<RecordChoice[]>('/api/records/choices'),
      ]);
      setRows(drafts);
      setRecords(choices);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const filtered = rows.filter((v) =>
    [v.subject, v.to, v.recordName]
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="page ops-page">
      <PageIntro
        title="Communications"
        description="Prepare messages together, with the right customer or order attached."
        action={
          <button
            className="btn btn-primary"
            onClick={() =>
              setForm({
                version: 0,
                entity: '',
                entityId: '',
                to: '',
                subject: '',
                body: '',
              })
            }
          >
            <Plus size={16} />
            New draft
          </button>
        }
      />
      <section className="shopify-connection">
        <Mail size={28} />
        <div>
          <h2>Shared message drafts</h2>
          <p>
            Your drafts are saved to the CRM. Connect an email provider before
            messages can be sent or received here.
          </p>
        </div>
        <StatusPill tone="gold">Email not connected</StatusPill>
      </section>
      {error && (
        <p className="ops-error" role="alert">
          {error}
        </p>
      )}
      <Panel>
        <div className="record-toolbar">
          <input
            className="input"
            aria-label="Search drafts"
            placeholder="Search subject, recipient or record"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span>{filtered.length} shared drafts</span>
        </div>
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Recipient</th>
                <th>Linked record</th>
                <th>Updated</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td>
                    <button onClick={() => setForm(v)}>{v.subject}</button>
                  </td>
                  <td>{v.to}</td>
                  <td>{v.href && <Link href={v.href}>{v.recordName}</Link>}</td>
                  <td>
                    {v.updatedAt &&
                      new Date(v.updatedAt).toLocaleString('en-GB')}
                  </td>
                  <td>
                    <StatusPill>Draft · not sent</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="ops-empty">
            <FileEdit size={32} />
            <h3>No message drafts</h3>
            <p>
              Create a draft and link it to a record so your team has the
              context.
            </p>
          </div>
        )}
      </Panel>
      {form && (
        <BusinessFormPanel
          title={form.id ? 'Edit shared draft' : 'New message draft'}
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <form
            className="integration-setup"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const { id, version, entity, entityId, to, subject, body } =
                  form;
                const input = { version, entity, entityId, to, subject, body };
                await apiRequest(
                  '/api/communication-drafts' + (id ? '/' + id : ''),
                  { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) },
                );
                setForm(null);
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="ops-field">
              <span>Linked record</span>
              <select
                className="input"
                required
                value={form.entity + ':' + form.entityId}
                onChange={(e) => {
                  const v = records.find(
                    (v) => v.entity + ':' + v.id === e.target.value,
                  );
                  if (v) setForm({ ...form, entity: v.entity, entityId: v.id });
                }}
              >
                <option value=":">Choose a record…</option>
                {records.map((v) => (
                  <option
                    key={v.entity + ':' + v.id}
                    value={v.entity + ':' + v.id}
                  >
                    {v.name} · {v.entity}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              <span>To</span>
              <input
                className="input"
                type="email"
                required
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
              />
            </label>
            <label className="ops-field">
              <span>Subject</span>
              <input
                className="input"
                required
                maxLength={500}
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </label>
            <label className="ops-field">
              <span>Message</span>
              <textarea
                aria-label="Message"
                className="input"
                rows={12}
                required
                maxLength={30000}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>
            {error && (
              <p role="alert" className="ops-error">
                {error}
              </p>
            )}
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save shared draft'}
            </button>
            <p>Saving a draft does not send an email.</p>
          </form>
        </BusinessFormPanel>
      )}
    </div>
  );
}
