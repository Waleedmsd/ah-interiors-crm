'use client';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
type Attachment = { id: string; filename: string; bytes: number; mime: string };
export function RecordAttachments({
  entity,
  entityId,
  readOnly = false,
}: {
  entity: string;
  entityId: string;
  readOnly?: boolean;
}) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const url = '/api/attachments?' + new URLSearchParams({ entity, entityId });
  async function load() {
    try {
      setFiles(await apiRequest<Attachment[]>(url));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CRM_MODE !== 'preview') void load();
  }, [entity, entityId]);
  if (process.env.NEXT_PUBLIC_CRM_MODE === 'preview') return null;
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>Attachments</h2>
      <p>PDFs and photos, up to 10 MB each. Downloads require staff access.</p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {files.map((file) => (
          <li key={file.id}>
            <a href={'/api/attachments/' + file.id}>{file.filename}</a> ·{' '}
            {(file.bytes / 1024).toFixed(0)} KB
          </li>
        ))}
      </ul>
      {!readOnly && (
        <label className="btn">
          {busy ? 'Uploading…' : 'Add document or photo'}
          <input
            type="file"
            className={
              entity === 'flooring-fitting' ? 'floor-file-input' : undefined
            }
            aria-label="Add document or photo"
            disabled={busy}
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                setError('Maximum file size is 10 MB.');
                return;
              }
              setBusy(true);
              setError('');
              try {
                await apiRequest(url, {
                  method: 'POST',
                  body: file,
                  headers: { 'X-Filename': file.name },
                });
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
                e.target.value = '';
              }
            }}
          />
        </label>
      )}
    </section>
  );
}
