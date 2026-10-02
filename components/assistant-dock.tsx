'use client';

import { FormEvent, useState } from 'react';
import { ArrowUp, Bot, Check, Maximize2, Mic, Paperclip, ShieldCheck, Sparkles, X } from 'lucide-react';
import Link from 'next/link';

type ChatMessage = { from: 'assistant' | 'user'; text: string };

export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { from: 'assistant', text: 'I’m ready. Ask me about orders, supplier replies, customers, assembly, documents or money.' },
  ]);

  function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      { from: 'user', text },
      { from: 'assistant', text: responseFor(text) },
    ]);
    setInput('');
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="assistant-glow glass-shine fixed bottom-5 right-5 z-50 flex h-14 items-center gap-3 rounded-full border border-white/70 bg-white/70 px-3 pr-5 backdrop-blur-2xl transition hover:-translate-y-1" aria-label="Open Amiro assistant">
        <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#7f8dff] via-[#9c81e9] to-[#ff8c90] text-white shadow-[0_7px_22px_rgb(105_112_230/35%)]"><Sparkles className="size-4" /></span>
        <span className="text-left"><span className="block font-display text-[12px] font-semibold tracking-[-0.02em]">Ask Amiro</span><span className="block text-[8px] font-semibold text-[#65708b]">Your operations copilot</span></span>
        <span className="size-2 rounded-full bg-[#58c69a] shadow-[0_0_12px_#58c69a]" />
      </button>
    );
  }

  return (
    <aside className="assistant-glow glass-panel fixed inset-x-3 bottom-3 z-50 flex max-h-[calc(100vh-24px)] flex-col overflow-hidden sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[620px] sm:w-[410px]">
      <header className="flex items-center justify-between border-b border-white/60 px-4 py-3.5">
        <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-2xl bg-gradient-to-br from-[#7888ff] to-[#ad79df] text-white shadow-lg"><Bot className="size-4" /></span><span><span className="flex items-center gap-2 font-display text-[12px] font-semibold">Amiro <span className="rounded-full bg-[#dff7ec] px-2 py-0.5 text-[7px] font-bold text-[#398366]">LIVE</span></span><span className="mt-0.5 block text-[8px] font-medium text-[#737b91]">Connected to your local workspace</span></span></div>
        <div className="flex items-center gap-1"><Link href="/assistant" className="grid size-8 place-items-center rounded-full text-[#687189] hover:bg-white/60" aria-label="Open full assistant"><Maximize2 className="size-3.5" /></Link><button onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full text-[#687189] hover:bg-white/60" aria-label="Close assistant"><X className="size-4" /></button></div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        <div className="glass-soft flex items-center gap-3 rounded-2xl px-3 py-2.5"><ShieldCheck className="size-4 shrink-0 text-[#6576db]" /><p className="text-[8px] font-semibold leading-4 text-[#606982]">I can prepare work. Sending, purchasing, refunds and sensitive changes still stop for your approval.</p></div>
        {messages.map((message, index) => message.from === 'assistant' ? (
          <div key={index} className="flex items-start gap-2.5"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#8291ff] to-[#a67de0] text-white"><Sparkles className="size-3" /></span><p className="max-w-[85%] rounded-[6px_18px_18px_18px] border border-white/70 bg-white/60 px-3.5 py-3 text-[9px] font-medium leading-5 text-[#343b52] shadow-sm">{message.text}</p></div>
        ) : (
          <div key={index} className="flex justify-end"><p className="max-w-[82%] rounded-[18px_6px_18px_18px] bg-[#1d2440] px-3.5 py-3 text-[9px] font-medium leading-5 text-white">{message.text}</p></div>
        ))}
        {messages.length === 1 ? <div className="grid grid-cols-2 gap-2">{['What needs attention?', 'Draft a customer update', 'Show unpaid orders', 'Check supplier replies'].map((prompt) => <button key={prompt} onClick={() => setInput(prompt)} className="rounded-2xl border border-white/60 bg-white/38 p-3 text-left text-[8px] font-bold leading-4 text-[#566078] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/60">{prompt}</button>)}</div> : null}
      </div>

      <form onSubmit={send} className="border-t border-white/55 p-3">
        <div className="glass-input rounded-[22px] p-2.5"><textarea value={input} onChange={(event) => setInput(event.target.value)} rows={2} placeholder="Ask Amiro to find, explain or prepare work…" className="min-h-[44px] w-full resize-none bg-transparent px-1.5 py-1 text-[9px] font-medium leading-5 outline-none placeholder:text-[#7f879b]" /><div className="flex items-center justify-between pt-1"><div className="flex"><button type="button" className="grid size-8 place-items-center rounded-full text-[#687189] hover:bg-white/65" aria-label="Attach file"><Paperclip className="size-3.5" /></button><button type="button" className="grid size-8 place-items-center rounded-full text-[#687189] hover:bg-white/65" aria-label="Use microphone"><Mic className="size-3.5" /></button></div><button type="submit" className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#7787ff] to-[#9c75dd] text-white shadow-[0_8px_20px_rgb(102_113_224/35%)] transition hover:scale-105" aria-label="Send message"><ArrowUp className="size-4" /></button></div></div>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[7px] font-semibold text-[#7b8398]"><Check className="size-2.5" /> Local preview · no external action</p>
      </form>
    </aside>
  );
}

function responseFor(text: string) {
  const question = text.toLowerCase();
  if (question.includes('attention')) return 'Three items need you: a £350 Rauch price variance, an overdue Hypnos confirmation, and Nadia Khan’s unavailable assembly date.';
  if (question.includes('unpaid') || question.includes('payment')) return 'Eight invoices are overdue for £6,430. I can prepare reminders, but I will show them to you before anything is sent.';
  if (question.includes('supplier') || question.includes('reply')) return 'Rauch replied with one mismatch. Hypnos is two days beyond target. Wiemann is on schedule.';
  if (question.includes('draft') || question.includes('customer')) return 'I can draft that. Open the full assistant and choose the customer or order you want me to use.';
  return 'I’ve understood the request. In this frontend preview I can demonstrate the workflow; live actions will connect when we build the backend.';
}
