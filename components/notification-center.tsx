'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api-client';
import { recordHref } from '@/lib/record-links';
import { PageIntro } from '@/components/page-ui';
type Notice = {
  id: string;
  title: string;
  message: string;
  entity: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};
export function NotificationCenter() {
  const [items, setItems] = useState<Notice[]>([]),
    [error, setError] = useState(''),
    [unread, setUnread] = useState(true);
  async function load() {
    try {
      setItems(await apiRequest<Notice[]>('/api/notifications'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const visible = items.filter((v) => !unread || !v.readAt);
  return (
    <div className="page ops-page">
      <PageIntro
        title="Notifications"
        description="Follow up on the work that needs your attention."
      />
      <div className="record-toolbar">
        <button
          className={'btn ' + (unread ? 'btn-primary' : '')}
          onClick={() => setUnread(true)}
        >
          Unread ({items.filter((v) => !v.readAt).length})
        </button>
        <button
          className={'btn ' + (!unread ? 'btn-primary' : '')}
          onClick={() => setUnread(false)}
        >
          All notifications
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!visible.length && (
        <div className="ops-empty">
          <h3>You’re up to date</h3>
          <p>No notifications in this view.</p>
        </div>
      )}
      {visible.map((v) => (
        <article
          className="panel"
          key={v.id}
          style={{ padding: 24, marginBottom: 12 }}
        >
          <h2>{v.title}</h2>
          <p>{v.message}</p>
          <small>{new Date(v.createdAt).toLocaleString('en-GB')}</small>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            {v.entity && v.entityId && (
              <Link
                className="btn btn-primary"
                href={recordHref(v.entity, v.entityId)}
              >
                Open record
              </Link>
            )}
            {!v.readAt && (
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await apiRequest('/api/notifications/' + v.id, {
                      method: 'PATCH',
                    });
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Mark read
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
