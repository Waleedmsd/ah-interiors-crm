'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Mail, Plus, FileEdit } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { PageIntro, Panel, StatusPill } from '@/components/page-ui';
import { BusinessFormPanel } from '@/components/business-form-panel';
type Draft = { id?: string; version: number; entity: string; entityId: string; to: string; subject: string; body: string; recordName?: string; href?: string; updatedAt?: string };
type RecordChoice = { id: string; entity: string; name: string };
export default function Communications() {
  const [rows, setRows] = useState<Draft[]>([]);
  const [records, setRecords] = useState<RecordChoice[]>([]);
  const [form, setForm] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const saving = useRef(false);
  async function load() {
    setLoading(true);
    try {
      const [drafts, choices] = await Promise.all([
        apiRequest<Draft[]>('/api/communication-drafts'),
        apiRequest<RecordChoice[]>('/api/records/choices'),
      ]);
      setRows(drafts); setRecords(choices); setError('');
    } catch (failure) { setError((failure as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const filtered = rows.filter(value => [value.subject, value.to, value.recordName].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  return (
    <div className="page ops-page">
      <PageIntro title="Communications" description="Prepare messages together, with the right customer or order attached."
        action={<button type="button" className="btn btn-primary" disabled={loading} onClick={() => { setError(''); setForm({ version: 0, entity: '', entityId: '', to: '', subject: '', body: '' }); }}><Plus size={16} aria-hidden="true" />New draft</button>} />
      <section className="shopify-connection"><Mail size={28} aria-hidden="true" /><div><h2>Shared message drafts</h2><p>Your drafts are saved to the CRM. Connect an email provider before messages can be sent or received here.</p></div><StatusPill tone="gold">Email not connected</StatusPill></section>
      {error && <div className="ops-error" role="alert">{error} <button type="button" className="btn" disabled={loading || busy} onClick={() => void load()}>Retry loading</button></div>}
      <Panel>
        <div className="record-toolbar"><input className="input" aria-label="Search drafts" placeholder="Search subject, recipient or record" value={query} onChange={event => setQuery(event.target.value)} /><span>{loading ? 'Loading drafts…' : `${filtered.length} shared drafts`}</span></div>
        <div className="table-wrap" role="region" tabIndex={0} aria-label="Shared message drafts; scroll horizontally for all details" aria-busy={loading}>
          <table className="ops-table"><thead><tr>{['Subject', 'Recipient', 'Linked record', 'Updated', 'Status'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{filtered.map(value => <tr key={value.id}>
              <td><button type="button" onClick={() => { setError(''); setForm(value); }}>{value.subject}</button></td><td>{value.to}</td>
              <td>{value.href && <Link href={value.href}>{value.recordName}</Link>}</td><td>{value.updatedAt && new Date(value.updatedAt).toLocaleString('en-GB')}</td><td><StatusPill>Draft · not sent</StatusPill></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!error && !filtered.length && <div className="ops-empty"><FileEdit size={32} aria-hidden="true" /><h3>{loading ? 'Loading message drafts…' : 'No message drafts'}</h3><p>Create a draft and link it to a record so your team has the context.</p></div>}
      </Panel>
      {form && <BusinessFormPanel title={form.id ? 'Edit shared draft' : 'New message draft'} onClose={() => { if (!busy) setForm(null); }}>
        <form className="integration-setup" aria-busy={busy} onSubmit={async event => {
          event.preventDefault();
          if (saving.current) return;
          saving.current = true; setBusy(true);
          try {
            const { id, version, entity, entityId, to, subject, body } = form;
            await apiRequest('/api/communication-drafts' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: JSON.stringify({ version, entity, entityId, to, subject, body }) });
            setForm(null); await load();
          } catch (failure) { setError((failure as Error).message); }
          finally { saving.current = false; setBusy(false); }
        }}>
          <label className="ops-field"><span>Linked record</span><select className="input" required disabled={busy} value={form.entity + ':' + form.entityId} onChange={event => {
            const value = records.find(record => record.entity + ':' + record.id === event.target.value);
            if (value) setForm({ ...form, entity: value.entity, entityId: value.id });
          }}><option value=":">Choose a record…</option>{records.map(value => <option key={value.entity + ':' + value.id} value={value.entity + ':' + value.id}>{value.name} · {value.entity}</option>)}</select></label>
          <label className="ops-field"><span>To</span><input className="input" type="email" required disabled={busy} value={form.to} onChange={event => setForm({ ...form, to: event.target.value })} /></label>
          <label className="ops-field"><span>Subject</span><input className="input" required maxLength={500} disabled={busy} value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} /></label>
          <label className="ops-field"><span>Message</span><textarea aria-label="Message" className="input" rows={12} required maxLength={30000} disabled={busy} value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} /></label>
          {error && <p role="alert" className="ops-error">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save shared draft'}</button><p>Saving a draft does not send an email.</p>
        </form>
      </BusinessFormPanel>}
    </div>
  );
}
