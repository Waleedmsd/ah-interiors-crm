import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { PageIntro, Panel, Stat, StatusPill, Toolbar } from '@/components/page-ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Tone = 'green' | 'gold' | 'red' | 'blue' | 'grey';
type Row = { cells: ReactNode[]; status?: { label: string; tone: Tone } };

export function OperationsModule({ eyebrow, title, description, action, stats, panelTitle, panelDescription, searchPlaceholder, columns, rows, side }: { eyebrow: string; title: string; description: string; action?: ReactNode; stats: { label: string; value: string; note: string }[]; panelTitle: string; panelDescription: string; searchPlaceholder: string; columns: string[]; rows: Row[]; side?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1640px] p-3 sm:p-5 xl:p-7">
      <PageIntro eyebrow={eyebrow} title={title} description={description} action={action} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat, index) => <Stat key={stat.label} {...stat} index={`0${index + 1}`} action={index === 0 || index === 3} />)}</div>
      <div className={side ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]' : ''}>
        <Panel title={panelTitle} description={panelDescription}>
          <Toolbar placeholder={searchPlaceholder} />
          <div className="overflow-x-auto"><Table><TableHeader><TableRow className="border-white/55 bg-white/22 hover:bg-white/22"><TableHead className="h-9 w-12 px-4 text-[7px] font-bold text-[#8992a6]">No.</TableHead>{columns.map((column) => <TableHead key={column} className="h-9 whitespace-nowrap px-4 text-[7px] font-bold text-[#7c869c]">{column}</TableHead>)}{rows.some((row) => row.status) ? <TableHead className="h-9 px-4 text-[7px] font-bold text-[#7c869c]">Status</TableHead> : null}<TableHead className="h-9 w-10 px-3" /></TableRow></TableHeader><TableBody>{rows.map((row, rowIndex) => <TableRow key={rowIndex} className="group border-white/55 hover:bg-white/30"><TableCell className="px-4 py-4 text-[8px] font-bold text-[#9aa2b3]">{String(rowIndex + 1).padStart(2, '0')}</TableCell>{row.cells.map((cell, cellIndex) => <TableCell key={cellIndex} className={`whitespace-nowrap px-4 py-4 text-[8px] ${cellIndex === 0 ? 'font-bold text-[#394159]' : 'font-medium text-[#69738a]'}`}>{cell}</TableCell>)}{row.status ? <TableCell className="px-4 py-4"><StatusPill tone={row.status.tone}>{row.status.label}</StatusPill></TableCell> : null}<TableCell className="px-3 py-4 text-right"><ArrowUpRight className="size-3.5 text-[#929bad] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#6474d5]" /></TableCell></TableRow>)}</TableBody></Table></div>
          <div className="flex items-center justify-between border-t border-white/55 bg-white/20 px-5 py-3 text-[7px] font-semibold text-[#7e879b]"><span>{rows.length} live records</span><span>Updated now</span></div>
        </Panel>
        {side}
      </div>
    </div>
  );
}

export function SideList({ title, description, items }: { title: string; description?: string; items: { icon?: ReactNode; title: string; detail: string; value?: string }[] }) {
  return <Panel title={title} description={description}><div>{items.map((item, index) => <button key={item.title} className="group grid w-full grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-white/55 px-4 py-3.5 text-left last:border-0 hover:bg-white/30"><span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#e5e9ff] to-[#daeefa] text-[#6575d2] shadow-sm [&>svg]:size-3.5">{item.icon ?? <span className="text-[8px] font-bold">0{index + 1}</span>}</span><span className="min-w-0"><span className="block text-[8px] font-bold text-[#3e465d]">{item.title}</span><span className="mt-1 block truncate text-[7px] text-[#80899d]">{item.detail}</span></span>{item.value ? <span className="text-[8px] font-bold text-[#69738a]">{item.value}</span> : <ArrowUpRight className="size-3.5 text-[#919aac] group-hover:text-[#6878d9]" />}</button>)}</div></Panel>;
}
