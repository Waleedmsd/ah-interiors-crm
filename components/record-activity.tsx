'use client';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
type Event = {
  id: number;
  action: string;
  body: string;
  at: string;
  author: string | null;
};
export function RecordActivity({
  entity,
  entityId,
}: {
  entity: string;
  entityId: string;
}) {
  const [rows, setRows] = useState<Event[]>([]),
    [body, setBody] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const url = '/api/activity?' + new URLSearchParams({ entity, entityId });
  useEffect(() => {
    let active = true;
    apiRequest<Event[]>(url)
      .then((v) => {
        if (active) setRows(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <section className="record-activity">
      <h3>Team activity</h3>
      <p className="muted">
        Notes and changes shared with staff who can access this record.
      </p>
      {error && (
        <p className="ops-error" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            setRows(
              await apiRequest<Event[]>(url, {
                method: 'POST',
                body: JSON.stringify({ body }),
              }),
            );
            setBody('');
            setError('');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="ops-field">
          <span>Add a team note</span>
          <textarea
            aria-label="Add a team note"
            className="input"
            required
            maxLength={5000}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button className="btn" disabled={busy || !body.trim()}>
          {busy ? 'Saving…' : 'Post note'}
        </button>
      </form>
      <ol className="activity-list">
        {rows.map((v) => (
          <li key={v.id}>
            <div>
              <strong>{v.author ?? 'System'}</strong>
              <time dateTime={v.at}>
                {new Date(v.at).toLocaleString('en-GB')}
              </time>
            </div>
            <span>{v.action.replaceAll('-', ' ')}</span>
            {v.body && <p style={{ whiteSpace: 'pre-wrap' }}>{v.body}</p>}
          </li>
        ))}
      </ol>
      {!rows.length && <p>No activity recorded yet.</p>}
    </section>
  );
}
