'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace-provider';
import { isPaid, packHref } from '@/lib/operations';

export function ProcessButton({
  id,
  compact = false,
}: {
  id: string;
  compact?: boolean;
}) {
  const { cases, processOrder, ready } = useWorkspace();
  const router = useRouter();
  const order = cases.find((item) => item.id === id);
  if (!order) return null;
  if (order.pack)
    return (
      <Link
        className={'btn ' + (compact ? 'btn-small btn-subtle' : 'btn-primary')}
        href={packHref(id)}
      >
        {order.pack.state === 'Approved' ? 'View approved pack' : 'Review pack'}
        <ArrowRight size={15} />
      </Link>
    );
  if (order.status !== 'New')
    return (
      <Link className="btn btn-small" href={'/orders/' + id}>
        Open order
        <ArrowRight size={15} />
      </Link>
    );
  if (!isPaid(order))
    return (
      <Link
        className="btn btn-small ops-payment-hold"
        href={'/orders/' + id + '?tab=payment'}
      >
        <LockKeyhole size={14} />
        Payment hold
      </Link>
    );
  return (
    <Button
      className={'btn ' + (compact ? 'btn-small btn-subtle' : 'btn-primary')}
      disabled={!ready}
      onClick={() => {
        if (processOrder(id)) router.push(packHref(id));
      }}
    >
      Process order
      <ArrowRight size={15} />
    </Button>
  );
}
