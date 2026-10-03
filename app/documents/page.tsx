'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Search, Upload } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { RecordAttachments } from '@/components/record-attachments';
import { BusinessFormPanel } from '@/components/business-form-panel';
import { PageIntro, Panel } from '@/components/page-ui';
type Doc = {
  id: string;
  entity: string;
  entityId: string;
  filename: string;
  bytes: number;
  createdAt: string;
  recordName: string;
  href: string;
};
type RecordChoice = { id: string; entity: string; name: string };
export default function DocumentsPage() {
  const [rows, setRows] = useState<Doc[]>([]),
    [choices, setChoices] = useState<RecordChoice[]>([]),
    [query, setQuery] = useState(''),
    [entity, setEntity] = useState('All'),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [upload, setUpload] = useState(false),
    [linked, setLinked] = useState('');
  async function load() {
    try {
      const [docs, records] = await Promise.all([
        apiRequest<Doc[]>('/api/documents'),
        apiRequest<RecordChoice[]>('/api/records/choices'),
      ]);
      setRows(docs);
      setChoices(
        records.filter(
          (v) => !['product', 'supplier', 'stock-movement'].includes(v.entity),
        ),
      );
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const record = choices.find((v) => v.entity + ':' + v.id === linked);
  const filtered = rows.filter(
    (v) =>
      (entity === 'All' || v.entity === entity) &&
      [v.filename, v.recordName]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="page ops-page">
      <PageIntro
        title="Documents"
        description="Your shared files, linked to the customer, order or job they belong to."
        action={
          <button className="btn btn-primary" onClick={() => setUpload(true)}>
            <Upload size={16} /> Upload document
          </button>
        }
      />
      {error && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
      <Panel>
        <div className="record-toolbar">
          <label>
            <Search size={16} />
            <input
              className="input"
              aria-label="Search documents"
              placeholder="Search filenames and records"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            className="input"
            aria-label="Document record type"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            {['All', ...new Set(rows.map((v) => v.entity))].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <span>{filtered.length} files</span>
        </div>
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Related record</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td>
                    <FileText size={16} /> {v.filename}
                  </td>
                  <td>
                    <Link href={v.href}>{v.recordName}</Link>
                  </td>
                  <td>{(v.bytes / 1024).toFixed(0)} KB</td>
                  <td>{new Date(v.createdAt).toLocaleDateString('en-GB')}</td>
                  <td>
                    <a className="btn" href={'/api/attachments/' + v.id}>
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="ops-empty">
            <FileText size={32} />
            <h3>{loading ? 'Loading documents…' : 'No documents to show'}</h3>
            <p>Upload a PDF or photo and attach it to an existing record.</p>
          </div>
        )}
      </Panel>
      {upload && (
        <BusinessFormPanel
          title="Upload to a record"
          onClose={() => {
            setUpload(false);
            void load();
          }}
        >
          <div style={{ padding: 24 }}>
            <label className="ops-field">
              <span>Related record</span>
              <select
                className="input"
                value={linked}
                onChange={(e) => setLinked(e.target.value)}
              >
                <option value="">Choose a record…</option>
                {choices.map((v) => (
                  <option
                    key={v.entity + ':' + v.id}
                    value={v.entity + ':' + v.id}
                  >
                    {v.name} · {v.entity}
                  </option>
                ))}
              </select>
            </label>
            {record && (
              <RecordAttachments entity={record.entity} entityId={record.id} />
            )}
          </div>
        </BusinessFormPanel>
      )}
    </div>
  );
}
