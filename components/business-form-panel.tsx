'use client';
import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
export function BusinessFormPanel({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="ops-drawer business-form-drawer">
        <div className="ops-drawer-header">
          <div className="ops-eyebrow">AH Interiors / Workspace</div>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {description ??
              'Add the details your team needs. Changes are saved to the shared workspace.'}
          </SheetDescription>
        </div>
        <div className="business-form-body">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
