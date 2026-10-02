import { notFound } from 'next/navigation';
import { demoOrders } from '@/lib/demo-data';
import { OrderReview } from '@/components/order-review';
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!demoOrders.some((order) => order.id === id) && !/^L-\d{6}$/.test(id)) notFound();
  return <OrderReview id={id} />;
}
