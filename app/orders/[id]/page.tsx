import { notFound } from 'next/navigation';
import { OrderDetail } from '@/components/order-detail';
import { demoOrders } from '@/lib/demo-data';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!demoOrders.some((order) => order.id === id) && !/^L-\d{6}$/.test(id)) notFound();
  return <OrderDetail id={id} />;
}
