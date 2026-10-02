import type { ReactNode } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceModule } from '@/lib/ui-preferences';

export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="action-row">{action}</div>}
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = '',
  module,
  surface = 'content',
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  module?: WorkspaceModule;
  surface?: 'content' | 'inset' | 'raised';
}) {
  return (
    <section
      className={cn('section-card', className)}
      data-module={module}
      data-surface={surface}
    >
      {title && (
        <div className="section-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function StatusPill({
  children,
  tone = 'grey',
  status,
}: {
  children: ReactNode;
  tone?: 'green' | 'gold' | 'red' | 'blue' | 'grey';
  status?: 'draft' | 'waiting' | 'confirmed' | 'exception' | 'info';
}) {
  const semantics = {
    draft: 'grey',
    waiting: 'gold',
    confirmed: 'green',
    exception: 'red',
    info: 'blue',
  };
  const label = typeof children === 'string' ? children : '';
  const resolved = status
    ? semantics[status]
    : /^(Draft|New)$/.test(label)
      ? 'grey'
      : /^(Waiting|Awaiting|Partially paid|Part paid|Unpaid|Payment hold|In review)/.test(
            label,
          )
        ? 'gold'
        : tone;
  return (
    <span className={cn('pill', 'pill-' + resolved)} data-status={status}>
      {children}
    </span>
  );
}
export function Stat({
  label,
  value,
  note,
  action,
  index,
  module,
}: {
  label: string;
  value: string;
  note: string;
  action?: boolean;
  index?: string;
  module?: WorkspaceModule;
}) {
  return (
    <article
      className="metric-card"
      data-module={module || 'inherit'}
      data-emphasis={action ? 'attention' : 'informational'}
    >
      <div className="metric-top">{label}</div>
      <div className="metric-value-line">
        <strong className="metric-value">{value}</strong>
        {index && <span className="count-tag">{index}</span>}
      </div>
      <p className="metric-note">
        <span className={action ? 'warning' : ''}>{note}</span>
      </p>
    </article>
  );
}
export function Toolbar({
  placeholder,
  actionLabel,
}: {
  placeholder?: string;
  actionLabel?: string;
}) {
  return (
    <div className="toolbar">
      <label className="search-field">
        <Search />
        <input
          aria-label={placeholder || 'Search'}
          placeholder={placeholder || 'Search'}
        />
      </label>
      {actionLabel && (
        <span className="preview-label">
          <SlidersHorizontal size={14} />
          {actionLabel}
        </span>
      )}
    </div>
  );
}
