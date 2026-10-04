'use client';
import { useId, useState } from 'react';
import { useAuth } from '@/components/auth-context';
import { hasPermission } from '@/server/permissions';
import { Plus, UserRound } from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
export function CustomerPicker({
  value,
  onChange,
  disabled = false,
  createOnly = false,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  createOnly?: boolean;
}) {
  const { customers, mutate, ready } = useWorkspace();
  const { user } = useAuth();
  const preview = process.env.NEXT_PUBLIC_CRM_MODE === 'preview' && process.env.NODE_ENV !== 'production';
  const mayCreate = preview || !!user && hasPermission(user, 'customers.write');
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postcode: '',
  });
  const selected = customers.find((customer) => customer.id === value);
  return (
    <>
      {createOnly ? (
        <Button
          type="button"
          className="btn btn-primary"
          disabled={!ready || !mayCreate}
          onClick={() => setOpen(true)}
        >
          <Plus size={16} /> Add customer
        </Button>
      ) : (
        <>
          <div className="field-label-row">
            <label htmlFor={fieldId}>Customer account</label>
            <Button
              type="button"
              variant="ghost"
              className="text-link"
              disabled={disabled || !ready || !mayCreate}
              onClick={() => setOpen(true)}
            >
              <Plus size={14} /> New customer
            </Button>
          </div>
          <select
            id={fieldId}
            className="select-field commerce-input"
            required
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Select a customer…</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {customer.email}
              </option>
            ))}
          </select>
          {selected && (
            <div className="customer-mini">
              <span className="customer-mini-icon">
                <UserRound size={18} />
              </span>
              <div>
                <strong>{selected.name}</strong>
                <span>{selected.email}</span>
                <small>
                  {selected.address}, {selected.city}, {selected.postcode}
                </small>
              </div>
              <span className="micro-label">{selected.id}</span>
            </div>
          )}
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="commerce-dialog">
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            One account for their orders, invoices and payment history. Saved in
            your workspace.
          </DialogDescription>
          <div className="form-grid">
            {(
              ['name', 'email', 'phone', 'address', 'city', 'postcode'] as const
            ).map((key) => (
              <div
                className={'field ' + (key === 'address' ? 'span-2' : '')}
                key={key}
              >
                <label htmlFor={fieldId + key}>
                  {
                    {
                      name: 'Full name',
                      email: 'Email address',
                      phone: 'Phone (optional)',
                      address: 'Street address',
                      city: 'Town / city',
                      postcode: 'Postcode',
                    }[key]
                  }
                </label>
                <input
                  id={fieldId + key}
                  className="commerce-input"
                  type={
                    key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'
                  }
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                />
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="action-row justify-end">
            <Button
              type="button"
              variant="outline"
              className="btn"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="btn btn-primary"
              disabled={!ready || !mayCreate}
              onClick={async () => {
                const result = await mutate({
                  type: 'create-customer',
                  customer: form,
                  now: Date.now(),
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                onChange(result.id!);
                setOpen(false);
                setForm({
                  name: '',
                  email: '',
                  phone: '',
                  address: '',
                  city: '',
                  postcode: '',
                });
                setError('');
              }}
            >
              Save customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
