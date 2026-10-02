'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileCheck2, ShieldCheck } from 'lucide-react';
import { PageIntro, StatusPill } from '@/components/page-ui';
import { ProcessButton } from '@/components/process-button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useWorkspace } from '@/components/workspace-provider';
import { approvalBlockers, isPaid } from '@/lib/operations';
import { money } from '@/lib/demo-data';
export default function Reviews() {
  const { cases } = useWorkspace();
  const [tab, setTab] = useState('Review queue');
  const tabs = ['Review queue', 'Approved locally', 'Not yet processed'];
  const filtered = cases.filter((order) =>
    tab === tabs[0]
      ? order.pack?.state === 'Draft'
      : tab === tabs[1]
        ? order.pack?.state === 'Approved'
        : !order.pack && order.status === 'New',
  );
  return (
    <div className="page ops-page">
      <PageIntro
        eyebrow="YOUR APPROVAL DESK"
        title="Review & approve"
        description="Every supplier order, message and delivery plan. One considered decision."
        action={
          <Link href="/" className="btn">
            Back to Today
            <ArrowRight size={15} />
          </Link>
        }
      />
      <div className="ops-muted-box mb-6 flex gap-3 items-start">
        <ShieldCheck size={20} className="shrink-0 mt-1" />
        <p>
          Process prepares the pack. Go ahead records your approval. This local
          preview never sends messages, places purchases or books jobs.
        </p>
      </div>
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <div className="ops-tabs-scroll mb-6">
          <TabsList variant="line" className="ops-tabs">
            {tabs.map((value) => (
              <TabsTrigger key={value} value={value}>
                {value}
                <span className="ops-tab-count">
                  {
                    cases.filter((order) =>
                      value === tabs[0]
                        ? order.pack?.state === 'Draft'
                        : value === tabs[1]
                          ? order.pack?.state === 'Approved'
                          : !order.pack && order.status === 'New',
                    ).length
                  }
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((value) => (
          <TabsContent key={value} value={value}>
            <div className="ops-review-list">
              {filtered.length ? (
                filtered.map((order) => (
                  <article className="ops-review-card" key={order.id}>
                    <span className={'avatar avatar-' + order.color}>
                      {order.initials}
                    </span>
                    <div>
                      <Link href={'/orders/' + order.id}>
                        <h2>
                          {order.customer}{' '}
                          <span className="text-muted-foreground font-normal">
                            #{order.id}
                          </span>
                        </h2>
                      </Link>
                      <p>
                        {order.channel} · {order.groups.length} supplier group
                        {order.groups.length > 1 ? 's' : ''} ·{' '}
                        {order.pack
                          ? order.pack.drafts.length + ' drafts'
                          : 'Not prepared'}
                      </p>
                      <div className="mt-3">
                        <StatusPill
                          tone={
                            order.pack?.state === 'Approved'
                              ? 'green'
                              : !isPaid(order)
                                ? 'gold'
                                : 'blue'
                          }
                        >
                          {order.pack?.state === 'Approved'
                            ? 'Approved · not executed'
                            : order.pack
                              ? approvalBlockers(order).length
                                ? 'Review required'
                                : 'Ready for approval'
                              : isPaid(order)
                                ? 'Ready to process'
                                : 'Payment hold'}
                        </StatusPill>
                      </div>
                    </div>
                    <div className="ops-review-value">
                      <strong>{money(order.total, 2)}</strong>
                      <span>
                        {order.pack
                          ? 'Revision ' + order.pack.revision
                          : order.sourceRef}
                      </span>
                    </div>
                    <ProcessButton id={order.id} compact />
                  </article>
                ))
              ) : (
                <div className="section-card ops-empty">
                  <FileCheck2 size={35} />
                  <h3>
                    {tab === tabs[0]
                      ? 'No packs waiting for review'
                      : 'Nothing here yet'}
                  </h3>
                  <p>
                    {tab === tabs[0]
                      ? 'Process a paid order to prepare its supplier, provider and customer drafts.'
                      : 'Your local order decisions will appear here.'}
                  </p>
                  {tab === tabs[0] && (
                    <button
                      className="btn btn-primary"
                      onClick={() => setTab('Not yet processed')}
                    >
                      Choose an order
                      <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
