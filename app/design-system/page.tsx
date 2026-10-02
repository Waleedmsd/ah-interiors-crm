'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Search,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { PageIntro, Panel, StatusPill, Stat } from '@/components/page-ui';
import { AppearanceSettings } from '@/components/appearance-settings';
export default function DesignSystemPage() {
  const [selected, setSelected] = useState('Orders');
  const [saved, setSaved] = useState(false);
  return (
    <div className="page">
      <Link href="/settings" className="back-link">
        <ArrowLeft size={15} />
        Settings
      </Link>
      <PageIntro
        eyebrow="LOCAL DESIGN SPECIMEN"
        title="One system. Every state."
        description="A working material, type and interaction reference. No business records are changed."
      />
      <div className="metric-grid">
        <Stat
          label="Orders"
          value="Cobalt"
          note="Module identity, not urgency"
          module="orders"
        />
        <Stat
          label="Purchasing"
          value="Violet"
          note="Supplier work and review"
          module="purchasing"
        />
        <Stat
          label="Fulfilment"
          value="Teal"
          note="Movements and evidence"
          module="fulfilment"
        />
        <Stat
          label="Finance"
          value="Ink"
          note="Invoices and payment records"
          module="finance"
        />
      </div>
      <div className="two-column">
        <div className="stack">
          <Panel title="Selection and status">
            <div className="section-body">
              <div className="segmented">
                {['Orders', 'Invoices', 'Customers'].map((item) => (
                  <button
                    key={item}
                    aria-pressed={selected === item}
                    onClick={() => setSelected(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="action-row specimen-statuses">
                <StatusPill>Draft</StatusPill>
                <StatusPill tone="gold">Waiting</StatusPill>
                <StatusPill tone="gold">Partially paid</StatusPill>
                <StatusPill tone="green">Paid</StatusPill>
                <StatusPill tone="red">Overdue</StatusPill>
                <StatusPill>Void</StatusPill>
              </div>
              <p className="liquid-proof-note">
                Selection, module identity and business status are independent.
              </p>
            </div>
          </Panel>
          <Panel title="Actions and feedback">
            <div className="section-body">
              <div className="action-row">
                <button
                  className="btn btn-primary"
                  onClick={() => setSaved(true)}
                >
                  {saved ? <Check size={16} /> : <ArrowRight size={16} />}Save
                  specimen
                </button>
                <button className="btn" onClick={() => setSaved(false)}>
                  Reset feedback
                </button>
                <button className="btn" disabled>
                  Unavailable
                </button>
              </div>
              <output className="liquid-proof-note">
                {saved
                  ? 'Specimen saved for this view only. No operational record changed.'
                  : 'Try hover, press, keyboard focus and Reduced motion.'}
              </output>
            </div>
          </Panel>
          <Panel title="Fields and validation">
            <div className="section-body stack">
              <label className="search-field">
                <Search size={17} />
                <input
                  placeholder="Search specimen"
                  aria-label="Search specimen"
                />
              </label>
              <label className="field">
                <span>Customer reference</span>
                <input
                  className="commerce-input"
                  placeholder="A long name should remain readable"
                />
              </label>
              <div className="form-error">
                <TriangleAlert size={16} />
                Example error: add a customer reference.
              </div>
              <div className="ops-warning">
                Read-only example. Actions that change business data are
                unavailable.
              </div>
            </div>
          </Panel>
          <section className="next-action-panel">
            <div className="next-action-label">
              <Sparkles size={16} />
              NEXT ACTION
            </div>
            <h2>A single clear decision.</h2>
            <p>
              The next-action surface is reserved for the record’s operational
              priority.
            </p>
            <button className="btn btn-primary" onClick={() => setSaved(true)}>
              Try the reaction
              <ArrowRight size={16} />
            </button>
          </section>
        </div>
        <div className="stack">
          <AppearanceSettings />
          <Panel title="Empty state">
            <div className="ops-empty">
              <Search size={25} />
              <h3>No matching records</h3>
              <p>Explain what happened and offer a useful way forward.</p>
              <button
                className="text-link"
                onClick={() => setSelected('Orders')}
              >
                Reset sample selection
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
