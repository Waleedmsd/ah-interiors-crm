'use client';
import { useState } from 'react';
import { Check, FilePenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useWorkspace } from '@/components/workspace-provider';
export function DraftDialog({
  id,
  recipient,
  subject: initialSubject,
  body: initialBody,
  label = 'Draft email',
}: {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  label?: string;
}) {
  const { drafts, saveDraft } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setSubject(drafts[id]?.subject ?? initialSubject);
          setBody(drafts[id]?.body ?? initialBody);
        }
      }}
    >
      <DialogTrigger
        render={<Button className="btn btn-subtle" variant="outline" />}
      >
        <FilePenLine />
        {drafts[id] ? 'Edit saved draft' : label}
      </DialogTrigger>
      <DialogContent className="!max-w-[620px] p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="detail-title">Prepare a message</DialogTitle>
          <DialogDescription>
            To {recipient} · This is a local draft. No email will be sent.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveDraft(id, { subject: subject.trim(), body: body.trim() });
            setOpen(false);
          }}
        >
          <label className="input-label mt-3" htmlFor={'subject-' + id}>
            Subject
          </label>
          <input
            id={'subject-' + id}
            className="text-field"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
          />
          <label className="input-label mt-4" htmlFor={'body-' + id}>
            Message
          </label>
          <textarea
            id={'body-' + id}
            className="text-field min-h-[230px] leading-7"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          <div className="action-row justify-end mt-5">
            <Button
              type="button"
              variant="outline"
              className="btn"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="btn btn-primary"
              type="submit"
              disabled={!subject.trim() || !body.trim()}
            >
              <Check />
              Save local draft
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
