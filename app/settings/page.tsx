'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  Bot,
  Check,
  Database,
  LockKeyhole,
  Mail,
  Package,
  ShieldCheck,
} from 'lucide-react';
import { PageIntro, Panel, StatusPill } from '@/components/page-ui';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWorkspace } from '@/components/workspace-provider';
import { AppearanceSettings } from '@/components/appearance-settings';
const integrations = [
  {
    name: 'Magento',
    detail: 'Orders, products & payments',
    icon: Package,
    className: 'peach',
    permissions:
      'Read orders, products, invoices and verified payment records. Order processing will still require your explicit approval.',
  },
  {
    name: 'Gmail',
    detail: 'Customer & supplier conversations',
    icon: Mail,
    className: 'green',
    permissions:
      'Connect a chosen mailbox using OAuth in the backend phase. Customer messages will require review before sending.',
  },
  {
    name: 'Dropbox',
    detail: 'Files, invoices & confirmations',
    icon: Database,
    className: 'blue',
    permissions:
      'Connect the intended order folders using OAuth in the backend phase. Unmatched documents will remain in a review queue.',
  },
  {
    name: 'OpenAI',
    detail: 'Your operations assistant',
    icon: Bot,
    className: '',
    permissions:
      'Live assistant responses will run through a server-side API. Credentials will never be placed in frontend code. Current replies are scripted demo responses.',
  },
];
const rules = [
  [
    'New order received',
    'Notify the team. No external action starts automatically.',
  ],
  [
    'Process Order approval',
    'A person must approve before the supplier workflow begins.',
  ],
  [
    'Supplier purchase order',
    'Verify product codes and costs before any supplier email is sent.',
  ],
  [
    'Customer correspondence',
    'Review and approve every customer message before sending.',
  ],
  [
    'Price outside tolerance',
    'Pause the workflow and raise an exception for review.',
  ],
  [
    'Product substitution',
    'Require explicit approval before accepting any substitution.',
  ],
  [
    'Cancellation or refund',
    'Always require a person to approve the requested action.',
  ],
  [
    'Customer reports payment',
    'Wait for verification from a trusted payment source.',
  ],
];
export default function SettingsPage() {
  const { preferences, savePreferences } = useWorkspace();
  const [values, setValues] = useState(preferences);
  const [connection, setConnection] = useState<
    (typeof integrations)[number] | null
  >(null);
  const dirty = values.some((value, index) => value !== preferences[index]);
  return (
    <div className="page"><Link className="btn" href="/settings/business">Staff & business rules</Link><Link className="btn" href="/notifications">Notification centre</Link>
      <PageIntro
        title="Workspace settings"
        description="Connections, preferences, and the boundaries that keep your operations in control."
        action={<span className="preview-label">Local configuration</span>}
      />
      <div className="two-column">
        <div className="stack">
          <AppearanceSettings />
          <Panel
            title="App connections"
            description="Your connected workspace, once the backend is ready"
          >
            <div className="integration-grid">
              {integrations.map((item) => (
                <button
                  className="integration-tile"
                  key={item.name}
                  onClick={() => setConnection(item)}
                >
                  <div className="flex justify-between gap-3">
                    <span className={'avatar avatar-' + item.className}>
                      <item.icon size={20} />
                    </span>
                    <ArrowUpRight size={16} className="text-muted-foreground" />
                  </div>
                  <strong>{item.name}</strong>
                  <p>{item.detail}</p>
                  <StatusPill tone="grey">Not connected</StatusPill>
                </button>
              ))}
            </div>
          </Panel>
          <Panel
            title="Approval policies"
            description="Protected boundaries for the planned automation workflow"
            action={<ShieldCheck size={19} className="text-primary" />}
          >
            {rules.map(([title, detail], index) => (
              <div className="rule-row" key={title}>
                <span className="policy-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div style={{ flex: 1 }}>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
                <LockKeyhole
                  size={15}
                  className="text-muted-foreground shrink-0"
                  aria-label="Protected policy"
                />
              </div>
            ))}
          </Panel>
          <Panel
            title="Notification preferences"
            description="Choose which notifications you want in your workspace"
          >
            {[
              [
                'Action needed',
                'Price differences, missing confirmations, and scheduling issues.',
              ],
              [
                'Supplier updates',
                'New confirmations and replies linked to your orders.',
              ],
              [
                'Daily overview',
                'A summary of orders, payments, and outstanding work.',
              ],
            ].map(([title, description], index) => (
              <label
                className="rule-row"
                key={title}
                htmlFor={'notification-preference-' + index}
              >
                <div>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
                <Switch
                  id={'notification-preference-' + index}
                  checked={values[index]}
                  onCheckedChange={(checked) =>
                    setValues((current) =>
                      current.map((value, i) =>
                        i === index ? checked : value,
                      ),
                    )
                  }
                  aria-label={title}
                />
              </label>
            ))}
            <div className="section-footer">
              <span>
                {dirty
                  ? 'Unsaved changes'
                  : 'Preferences apply to this preview session'}
              </span>
              <Button
                className="btn btn-primary"
                disabled={!dirty}
                onClick={() => savePreferences(values)}
              >
                <Check />
                Save preferences
              </Button>
            </div>
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="You stay in control">
            <div className="section-body !pt-0">
              <span className="policy-count">
                8<span>/ 8</span>
              </span>
              <h3 className="text-base font-semibold mt-3">
                Approval policies defined
              </h3>
              <p className="text-sm text-muted-foreground leading-7 mt-3">
                AI can help interpret and prepare. Application rules will
                enforce decisions about money, messages, and changes to orders.
              </p>
              <p className="soft-notice mt-4">
                These are the intended policies. Live enforcement will be built
                with the backend; no external actions run here.
              </p>
            </div>
          </Panel>
          <Panel
            title="Supplier defaults"
            description="Rauch · sample configuration"
          >
            <div className="detail-grid section-body !pt-0">
              {[
                ['Ordering method', 'Email'],
                ['Price tolerance', '± £10'],
                ['Assembly timing', 'After delivery confirmed'],
                ['Preferred installer', 'Flatpack'],
                ['New order auto-start', 'Never'],
                ['Confirmation', 'Verified reply'],
              ].map(([label, value]) => (
                <div key={label}>
                  <span className="detail-label">{label}</span>
                  <span className="detail-value">{value}</span>
                </div>
              ))}
            </div>
          </Panel>
          <div className="soft-notice">
            <Bell size={18} className="mb-2" />
            Notification preferences are UI-only. No background jobs or
            scheduled messages have been enabled.
          </div>
        </aside>
      </div>
      <Dialog
        open={!!connection}
        onOpenChange={(open) => {
          if (!open) setConnection(null);
        }}
      >
        <DialogContent className="p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="detail-title">
              {connection?.name} connection
            </DialogTitle>
            <DialogDescription>
              Not connected · planned for the backend phase
            </DialogDescription>
          </DialogHeader>
          <p className="text-base leading-7 text-muted-foreground">
            {connection?.permissions}
          </p>
          <p className="soft-notice">
            No credentials are needed to review this frontend. Nothing is
            connected or shared by opening this panel.
          </p>
          <Button
            variant="outline"
            className="btn"
            onClick={() => setConnection(null)}
          >
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
