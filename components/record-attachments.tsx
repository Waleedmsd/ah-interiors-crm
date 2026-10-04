'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
type Attachment = { id: string; filename: string; bytes: number; mime: string };
export function RecordAttachments({ entity, entityId, readOnly = false }: { entity: string; entityId: string; readOnly?: boolean }) {
  const preview = process.env.NEXT_PUBLIC_CRM_MODE === 'preview' && process.env.NODE_ENV !== 'production';
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const mounted = useRef(false);
  const loadingRequest = useRef<AbortController | null>(null);
  const url = '/api/attachments?' + new URLSearchParams({ entity, entityId });
  const currentUrl = useRef(url);
  currentUrl.current = url;
  const load = useCallback(async () => {
    loadingRequest.current?.abort();
    const controller = new AbortController();
    loadingRequest.current = controller;
    if (mounted.current) setLoading(true);
    try {
      const result = await apiRequest<Attachment[]>(url, { signal: controller.signal });
      if (!controller.signal.aborted && mounted.current) { setFiles(result); setError(''); }
    } catch (failure) {
      if (!controller.signal.aborted && mounted.current) setError(failure instanceof Error ? failure.message : 'Unable to load attachments.');
    } finally {
      if (!controller.signal.aborted && mounted.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    mounted.current = true;
    setFiles([]);
    setError('');
    if (!preview) void load();
    return () => { mounted.current = false; loadingRequest.current?.abort(); };
  }, [preview, load]);
  if (preview) return null;
  return (
    <section className="panel no-print" style={{ padding: 24, minWidth: 0 }} aria-busy={busy || loading}>
      <h2>Attachments</h2>
      <p>PDFs and photos, up to 10 MB each. Downloads require staff access.</p>
      {error && <div role="alert"><p>{error}</p><button type="button" className="btn" disabled={busy || loading} onClick={() => void load()}>Refresh attachments</button></div>}
      {loading && <p role="status">Loading attachments…</p>}
      {files.length > 0 && <ul style={{ margin: '12px 0', paddingLeft: 20, overflowWrap: 'anywhere' }}>
        {files.map(file => <li key={file.id}><a href={'/api/attachments/' + file.id}>{file.filename}</a> · {(file.bytes / 1024).toFixed(0)} KB</li>)}
      </ul>}
      {!readOnly && <>
        <button type="button" className="btn" style={{ minHeight: 44, maxWidth: '100%', whiteSpace: 'normal' }} disabled={busy || loading} onClick={() => fileInput.current?.click()}>
          {busy ? 'Uploading…' : 'Add document or photo'}
        </button>
        <input ref={fileInput} type="file" hidden style={{ display: 'none' }} tabIndex={-1} aria-label="Add document or photo" disabled={busy} accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={async event => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file || uploading.current) return;
            if (!file.size || file.size > 10 * 1024 * 1024) { setError('Choose a non-empty file no larger than 10 MB.'); input.value = ''; return; }
            const recordUrl = url;
            uploading.current = true;
            setBusy(true);
            setError('');
            try {
              await apiRequest(recordUrl, { method: 'POST', body: file, headers: { 'X-Filename': file.name } });
              if (mounted.current && currentUrl.current === recordUrl) await load();
            } catch (failure) {
              if (mounted.current && currentUrl.current === recordUrl) setError(failure instanceof Error ? failure.message : 'The upload was not confirmed. Refresh the attachments before trying again.');
            } finally {
              uploading.current = false;
              if (mounted.current) setBusy(false);
              input.value = '';
            }
          }} />
      </>}
    </section>
  );
}
