'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Search, Upload } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { RecordAttachments } from '@/components/record-attachments';
import { BusinessFormPanel } from '@/components/business-form-panel';
import { PageIntro, Panel } from '@/components/page-ui';
type Doc = { id: string; entity: string; entityId: string; filename: string; bytes: number; createdAt: string; recordName: string; href: string };
type RecordChoice = { id: string; entity: string; name: string };
export default function DocumentsPage() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [choices, setChoices] = useState<RecordChoice[]>([]);
  const [query, setQuery] = useState('');
  const [entity, setEntity] = useState('All');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState(false);
  const [linked, setLinked] = useState('');
  async function load() {
    setLoading(true);
    try {
      const [docs, records] = await Promise.all([
        apiRequest<Doc[]>('/api/documents'),
        apiRequest<RecordChoice[]>('/api/records/choices'),
      ]);
      setRows(docs);
      setChoices(records.filter(value => !['product', 'supplier', 'stock-movement'].includes(value.entity)));
      setError('');
    } catch (failure) { setError((failure as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const record = choices.find(value => value.entity + ':' + value.id === linked);
  const filtered = rows.filter(value => (entity === 'All' || value.entity === entity) && [value.filename, value.recordName].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  return (
    <div className="page ops-page">
      <PageIntro title="Documents" description="Your shared files, linked to the customer, order or job they belong to."
        action={<button type="button" className="btn btn-primary" disabled={loading || !choices.length} onClick={() => setUpload(true)}><Upload size={16} aria-hidden="true" />Upload document</button>} />
      {error && <div role="alert" className="ops-error">{error} <button type="button" className="btn" disabled={loading} onClick={() => void load()}>Retry loading</button></div>}
      <Panel>
        <div className="record-toolbar">
          <label><Search size={16} aria-hidden="true" /><input className="input" aria-label="Search documents" placeholder="Search filenames and records" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <select className="input" aria-label="Document record type" value={entity} onChange={event => setEntity(event.target.value)}>{['All', ...new Set(rows.map(value => value.entity))].map(value => <option key={value}>{value}</option>)}</select>
          <span>{loading ? 'Loading files…' : `${filtered.length} files`}</span>
        </div>
        <div className="table-wrap" role="region" tabIndex={0} aria-label="Documents; scroll horizontally for record and download details" aria-busy={loading}>
          <table className="ops-table">
            <thead><tr>{['Document', 'Related record', 'Size', 'Uploaded', 'Download'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{filtered.map(value => <tr key={value.id}>
              <td><FileText size={16} aria-hidden="true" />{value.filename}</td>
              <td><Link href={value.href}>{value.recordName}</Link></td>
              <td>{(value.bytes / 1024).toFixed(0)} KB</td>
              <td>{new Date(value.createdAt).toLocaleDateString('en-GB')}</td>
              <td><a className="btn" aria-label={'Download ' + value.filename} href={'/api/attachments/' + value.id}>Download</a></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!error && !filtered.length && <div className="ops-empty"><FileText size={32} aria-hidden="true" /><h3>{loading ? 'Loading documents…' : 'No documents to show'}</h3><p>{choices.length ? 'Upload a PDF or photo and attach it to an existing record.' : 'Documents appear when a record you can access has an attached file.'}</p></div>}
      </Panel>
      {upload && <BusinessFormPanel title="Upload to a record" onClose={() => { setUpload(false); void load(); }}>
        <div style={{ padding: 24 }}>
          <label className="ops-field"><span>Related record</span><select className="input" value={linked} onChange={event => setLinked(event.target.value)}><option value="">Choose a record…</option>{choices.map(value => <option key={value.entity + ':' + value.id} value={value.entity + ':' + value.id}>{value.name} · {value.entity}</option>)}</select></label>
          {record && <RecordAttachments entity={record.entity} entityId={record.id} />}
        </div>
      </BusinessFormPanel>}
    </div>
  );
}
