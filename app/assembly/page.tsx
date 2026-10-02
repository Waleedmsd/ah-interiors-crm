'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
} from 'lucide-react';
import { PageIntro, Panel, Stat, StatusPill } from '@/components/page-ui';
import { RecordTable, type RecordRow } from '@/components/record-table';
import { DraftDialog } from '@/components/draft-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
const jobs: RecordRow[] = [
  {
    id: '918',
    cells: ['ASM-918', 'John Smith', 'Flatpack', '£180', 'Unscheduled'],
    status: 'Waiting supplier',
    tone: 'gold',
    orderId: '10004821',
    note: 'Wait for the approved supplier order and delivery estimate before contacting the assembly team.',
  },
  {
    id: '914',
    cells: ['ASM-914', 'Nadia Khan', 'Flatpack', '£180', 'To be agreed'],
    status: 'Date issue',
    tone: 'red',
    orderId: '10004786',
    note: '18 September is unavailable. The proposed 22 September is also before supplier Week 42; verify delivery before agreeing an appointment.',
  },
  {
    id: '909',
    cells: ['ASM-909', 'Peter Hall', 'Flatpack', '£220', '22 Sep 2026'],
    status: 'Booked',
    tone: 'green',
    orderId: '10004761',
    note: 'Sample booking for 22 September, 09:00–12:00. Delivery readiness must be checked before the appointment.',
  },
  {
    id: '907',
    cells: [
      'ASM-907',
      'Maria Lewis',
      'Northwest Fitters',
      '£145',
      'Awaiting reply',
    ],
    status: 'Contacting',
    tone: 'blue',
    note: 'The installer has been asked for availability. No appointment has been agreed.',
  },
  {
    id: '901',
    cells: ['ASM-901', 'James Reed', 'Flatpack', '£180', '08 Sep 2026'],
    status: 'Ready',
    tone: 'green',
    note: 'Sample appointment for 8 September, 10:00–13:00. Product delivery is recorded as complete.',
  },
];
export default function AssemblyPage() {
  const [view, setView] = useState('Calendar');
  const [week, setWeek] = useState(0);
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const start = 7 + week * 7;
  return (
    <div className="page">
      <PageIntro
        title="Fulfilment"
        description="Coordinate the final step. The right team, on the right day, after delivery."
        action={
          <div className="segmented">
            {[
              { title: 'Calendar', icon: CalendarDays },
              { title: 'Job list', icon: List },
            ].map((item) => (
              <button
                className="flex items-center gap-2"
                key={item.title}
                aria-pressed={view === item.title}
                onClick={() => setView(item.title)}
              >
                <item.icon size={15} />
                {item.title}
              </button>
            ))}
          </div>
        }
      />
      <div className="metric-grid">
        <Stat
          label="Assembly jobs"
          value="05"
          note="In this sample workspace"
        />
        <Stat label="Scheduled" value="02" note="1 ready · 1 booked" />
        <Stat
          label="Awaiting scheduling"
          value="02"
          note="Supplier or installer reply needed"
        />
        <Stat
          label="Date exceptions"
          value="01"
          note="Nadia Khan · review delivery first"
          action
        />
      </div>
      <div className="stack">
        {view === 'Calendar' && (
          <Panel
            title="September 2026"
            description="Sample assembly schedule"
            action={
              <div className="action-row">
                <Button
                  variant="outline"
                  className="icon-btn"
                  disabled={week === 0}
                  onClick={() => setWeek(week - 1)}
                  aria-label="Previous week"
                >
                  <ChevronLeft />
                </Button>
                <span className="text-sm whitespace-nowrap">
                  {start}–{start + 4} Sep
                </span>
                <Button
                  variant="outline"
                  className="icon-btn"
                  disabled={week === 2}
                  onClick={() => setWeek(week + 1)}
                  aria-label="Next week"
                >
                  <ChevronRight />
                </Button>
              </div>
            }
          >
            <div className="schedule-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, index) => {
                const date = start + index;
                const booked = jobs.filter(
                  (job) =>
                    job.cells[4] ===
                    String(date).padStart(2, '0') + ' Sep 2026',
                );
                return (
                  <div className="schedule-day" key={day}>
                    <h3>
                      <b>{date}</b>
                      {day}
                    </h3>
                    {booked.map((job) => (
                      <button
                        className={
                          'booking w-full text-left ' +
                          (job.status === 'Ready' ? 'green' : '')
                        }
                        key={job.id}
                        onClick={() => setSelected(job)}
                      >
                        <strong>{job.cells[1]}</strong>
                        <p>
                          {job.id === '901' ? '10:00–13:00' : '09:00–12:00'}
                        </p>
                        <p>
                          {job.cells[2]} · {job.cells[0]}
                        </p>
                      </button>
                    ))}
                    {!booked.length && (
                      <p className="schedule-empty">No bookings</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="section-footer">
              <span>Appointments shown in UK local time</span>
              <span>2 scheduled jobs in September</span>
            </div>
          </Panel>
        )}
        <RecordTable
          title="Assembly jobs"
          description="Keep unscheduled jobs visible until a date is agreed"
          columns={['Job', 'Customer', 'Installer', 'Cost', 'Appointment']}
          rows={jobs}
          detailAction={(job) => (
            <DraftDialog
              key={job.id}
              id={'asm-' + job.id}
              recipient={job.cells[2]}
              subject={'Assembly availability — ' + job.cells[0]}
              body={
                'Hello,\n\nPlease could you advise on assembly availability for ' +
                job.cells[1] +
                '?\n\nWe will verify the product delivery date before confirming an appointment. No booking should be made until we approve the date.\n\nKind regards,\nAH Interiors'
              }
              label="Draft installer message"
            />
          )}
        />
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="detail-title">
              {selected?.cells[1]}
            </DialogTitle>
            <DialogDescription>
              {selected?.cells[0]} · Assembly appointment
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <StatusPill tone={selected.tone}>{selected.status}</StatusPill>
              <div className="detail-grid detail-section">
                <div>
                  <span className="detail-label">Date</span>
                  <strong className="detail-value">{selected.cells[4]}</strong>
                </div>
                <div>
                  <span className="detail-label">Installer</span>
                  <strong className="detail-value">{selected.cells[2]}</strong>
                </div>
              </div>
              <p className="soft-notice">{selected.note}</p>
              {selected.orderId && (
                <Link
                  className="btn"
                  href={'/orders/' + selected.orderId}
                  onClick={() => setSelected(null)}
                >
                  View customer order
                  <ArrowUpRight />
                </Link>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
