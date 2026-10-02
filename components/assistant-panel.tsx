'use client';
import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  FileText,
  LockKeyhole,
  Paperclip,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useAssistantDraft } from '@/components/assistant-drafts';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace-provider';
import { useUIPreferences } from '@/components/ui-preferences-provider';
import { cn } from '@/lib/utils';

const prompts = [
  'What needs my attention?',
  'Show unpaid orders',
  'Draft a follow-up to Hypnos',
];
export function AssistantPanel({
  full = false,
  drawer = false,
  orderId,
}: {
  full?: boolean;
  drawer?: boolean;
  orderId?: string;
}) {
  const {
    messages: allMessages,
    ask,
    updateAction,
    resetChat,
    cases,
    setAssistantOpen,
  } = useWorkspace();
  const { preferences, ready: appearanceReady } = useUIPreferences();
  const reduced = !appearanceReady || preferences.motion === 'reduced';
  const pathname = usePathname();
  const contextId =
    orderId || pathname?.match(/^\/orders\/(1000\d{4}|L-\d{6})/)?.[1];
  const contextOrder = cases.find((order) => order.id === contextId);
  const messages = contextId
    ? allMessages.filter((message) => message.orderId === contextId)
    : allMessages;
  const visiblePrompts = contextOrder
    ? [
        'Summarise this order',
        'What is blocking this order?',
        'Draft a supplier follow-up',
      ]
    : prompts;
  const { input, files, setInput, setFiles } = useAssistantDraft(contextId);
  const filePicker = useRef<HTMLInputElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const area = scrollArea.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [messages]);
  function submit() {
    if (!input.trim() && !files.length) return;
    ask(input, files, contextId);
    setInput('');
    setFiles([]);
  }
  return (
    <section
      className={cn(
        'assistant-card',
        full && 'chat-full',
        drawer && 'drawer-chat',
      )}
      aria-label="Amiro assistant"
    >
      <div className="assistant-heading">
        <span className="assistant-mark">
          <Sparkles />
        </span>
        <div>
          <strong>Amiro assistant</strong>
          <small>Your operations, in conversation</small>
        </div>
        {full ? (
          <Button
            variant="ghost"
            className="icon-btn"
            onClick={resetChat}
            aria-label="New conversation"
          >
            <Plus />
          </Button>
        ) : (
          <Link
            href={contextId ? '/assistant?order=' + contextId : '/assistant'}
            className="icon-btn"
            aria-label="Open full assistant"
            onClick={() => {
              if (drawer) setAssistantOpen(false);
            }}
          >
            <ArrowUpRight />
          </Link>
        )}
      </div>
      {contextOrder && (
        <div className="ops-context-bar">
          <FileText size={14} />#{contextOrder.id} · {contextOrder.customer}
        </div>
      )}
      {messages.length === 0 ? (
        <div className="assistant-initial">
          <h3>
            {full
              ? 'What can I help you with?'
              : 'A little clarity for your day.'}
          </h3>
          <p>
            Review orders, find answers, and prepare the next step with your
            business in context.
          </p>
          <div className="prompt-list">
            {visiblePrompts.map((prompt) => (
              <button
                className="prompt-button"
                key={prompt}
                onClick={() => ask(prompt, [], contextId)}
              >
                {prompt}
                <ArrowUpRight />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="chat-messages"
          ref={scrollArea}
          style={!full && !drawer ? { maxHeight: 395 } : undefined}
          role="log"
          aria-live="polite"
          aria-label="Conversation"
        >
          {messages.map((message) => (
            <motion.div
              key={message.id}
              className={cn('chat-turn', message.role)}
              initial={{ opacity: 0, y: reduced ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                type: 'tween',
                duration: reduced ? 0.1 : 0.24,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {message.role === 'assistant' && (
                <div className="message-author">
                  <Sparkles /> Amiro · demo response
                </div>
              )}
              <p>{message.text}</p>
              {message.files?.map((name) => (
                <span className="attach-chip" key={name}>
                  <FileText />
                  <span>{name}</span>
                </span>
              ))}
              {message.action && (
                <div className="action-preview">
                  <h4>{message.action.title}</h4>
                  <p>{message.action.description}</p>
                  {message.action.status === 'pending' ? (
                    <div className="action-row">
                      <Button
                        className="btn btn-primary btn-small"
                        onClick={() => updateAction(message.id, 'prepared')}
                      >
                        Prepare draft
                      </Button>
                      <Button
                        variant="outline"
                        className="btn btn-small"
                        onClick={() => updateAction(message.id, 'dismissed')}
                      >
                        Dismiss
                      </Button>
                    </div>
                  ) : message.action.status === 'prepared' ? (
                    <>
                      <div className="message-author">
                        <Check /> Prepared locally · not sent
                      </div>
                      <div className="draft-content">
                        {message.action.content}
                      </div>
                    </>
                  ) : (
                    <span className="cell-sub">Dismissed</span>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
      <form
        className="composer-wrap"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="composer">
          {files.map((file) => (
            <span className="attach-chip" key={file}>
              <FileText />
              <span>{file}</span>
              <button
                type="button"
                aria-label={'Remove ' + file}
                onClick={() =>
                  setFiles((current) => current.filter((name) => name !== file))
                }
              >
                <X />
              </button>
            </span>
          ))}
          <textarea
            aria-label="Message Amiro"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={
              full
                ? 'Ask about orders, suppliers, or payments…'
                : 'Ask Amiro anything…'
            }
          />
          <div className="composer-footer">
            <input
              type="file"
              multiple
              ref={filePicker}
              className="sr-only"
              aria-label="Attach files to preview"
              tabIndex={-1}
              onChange={(event) => {
                const names = Array.from(event.target.files ?? []).map(
                  (file) => file.name,
                );
                setFiles((current) =>
                  Array.from(new Set([...current, ...names])),
                );
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => filePicker.current?.click()}
              aria-label="Attach files"
            >
              <Paperclip />
            </button>
            <button
              type="submit"
              className="send-button"
              disabled={!input.trim() && !files.length}
              aria-label="Send message"
            >
              <ArrowUp />
            </button>
          </div>
        </div>
        <p className="composer-hint">
          <LockKeyhole /> Demo data. Actions stay local.
        </p>
      </form>
    </section>
  );
}
