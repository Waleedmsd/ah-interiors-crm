'use client';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/components/auth-context';
import { type VariableCosts } from '@/lib/margin';
type Sheet = {
  version: number;
  costs: VariableCosts;
  notes: string;
  reviewed: boolean;
  productCostsVerified: boolean;
  profit: {
    grossProfitPence: number;
    contributionProfitPence: number;
    contributionMarginBps: number;
  };
};
const labels: Record<keyof VariableCosts, string> = {
  inboundFreightPence: 'Inbound freight',
  deliveryPence: 'Delivery cost',
  assemblyPence: 'Assembly cost',
  paymentFeePence: 'Payment fees',
  financeFeePence: 'Finance fees',
  marketplaceFeePence: 'Marketplace fees',
  marketingPence: 'Marketing',
  otherPence: 'Other costs',
};
export function OrderCostSheet({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const permitted =
    !!user && ['Management', 'Team Lead', 'Accounts'].includes(user.role);
  const [data, setData] = useState<Sheet | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const url = '/api/orders/' + encodeURIComponent(orderId) + '/costs';
  useEffect(() => {
    if (permitted)
      apiRequest<Sheet>(url)
        .then(setData)
        .catch((e) => setError(e.message));
  }, [url, permitted]);
  if (!permitted) return null;
  return (
    <section className="panel cost-sheet">
      <h2>Order profitability</h2>
      <p>
        Record the total actual cost for each category, including any linked job
        or expense. These amounts are counted once. Customer delivery charges
        remain sales revenue.
      </p>
      {error && (
        <p className="ops-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {data && (
        <>
          <div className="cost-summary">
            <span>
              Gross profit{' '}
              <strong>
                £{(data.profit.grossProfitPence / 100).toFixed(2)}
              </strong>
            </span>
            <span>
              Contribution{' '}
              <strong>
                £{(data.profit.contributionProfitPence / 100).toFixed(2)}
              </strong>
            </span>
            <span>
              Cost status{' '}
              <strong>
                {data.reviewed && data.productCostsVerified
                  ? 'Reviewed'
                  : 'Provisional'}
              </strong>
            </span>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setNotice('');
              try {
                setData(
                  await apiRequest<Sheet>(url, {
                    method: 'PUT',
                    body: JSON.stringify({
                      version: data.version,
                      costs: data.costs,
                      notes: data.notes,
                      reviewed: data.reviewed,
                    }),
                  }),
                );
                setError('');
                setNotice('Costs saved. Reports now use these amounts.');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="practical-form-grid">
              {(Object.entries(labels) as [keyof VariableCosts, string][]).map(
                ([key, label]) => (
                  <label className="ops-field" key={key}>
                    <span>{label} (£)</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="10000000"
                      step="0.01"
                      required
                      value={data.costs[key] / 100}
                      onChange={(e) =>
                        setData({
                          ...data,
                          reviewed: false,
                          costs: {
                            ...data.costs,
                            [key]: Math.round(Number(e.target.value) * 100),
                          },
                        })
                      }
                    />
                  </label>
                ),
              )}
            </div>
            <label className="ops-field">
              <span>Cost evidence / notes</span>
              <textarea
                aria-label="Cost evidence / notes"
                className="input"
                rows={3}
                value={data.notes}
                onChange={(e) => setData({ ...data, notes: e.target.value })}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={data.reviewed}
                onChange={(e) =>
                  setData({ ...data, reviewed: e.target.checked })
                }
              />
              All variable costs have been checked, including categories with no
              cost.
            </label>
            {!data.productCostsVerified && (
              <p>
                Product cost verification is still required before this order
                has complete cost coverage.
              </p>
            )}
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save order costs'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
