'use client';
import { useEffect, useState } from 'react';
import { Bell, ChevronRight, Sparkles } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { StudioHeader, StudioSidebar } from '@/components/studio-navigation';
import { UIPreferencesProvider } from '@/components/ui-preferences-provider';
import { AssistantDraftProvider } from '@/components/assistant-drafts';
import { MailProvider } from '@/components/mail-provider';
import { moduleForPath } from '@/lib/ui-preferences';
import { StudioMotion, RouteTransition } from '@/components/studio-motion';
import { navigation } from '@/app/dashboard-data';
import {
  WorkspaceProvider,
  useWorkspace,
} from '@/components/workspace-provider';
import { AssistantPanel } from '@/components/assistant-panel';
import { apiRequest } from '@/lib/api-client';
type SearchResult = {
  id: string;
  type: string;
  label: string;
  detail: string;
  href: string;
};
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';

const pageTitles: Record<string, string> = {
  '/': 'Today',
  '/reviews': 'Review & approve',
  '/assistant': 'AI assistant',
  '/orders': 'Orders',
  '/purchasing': 'Purchasing',
  '/communications': 'Communications',
  '/assembly': 'Fulfilment',
  '/accounts': 'Invoices',
  '/invoices': 'Invoices',
  '/invoices/new': 'Create invoice',
  '/orders/new': 'Create order',
  '/documents': 'Documents',
  '/customers': 'Customers',
  '/settings': 'Settings',
  '/integrations/shopify': 'Shopify',
  '/notifications': 'Notifications',
  '/reports': 'Reports',
  '/deliveries': 'Deliveries',
  '/assembly-jobs': 'Assembly jobs',
  '/flooring': 'Flooring',
  '/flooring/fitting': 'Materials & fitting',
  '/service-cases': 'Customer service',
  '/tasks': 'Tasks & follow-ups',
  '/expenses': 'Expenses',
  '/approvals': 'Approvals',
  '/products': 'Products',
  '/suppliers': 'Suppliers',
  '/inventory': 'Inventory',
};

export function OperationsShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <UIPreferencesProvider>
        <AssistantDraftProvider>
          <MailProvider>
            <StudioMotion>
              <Shell>{children}</Shell>
            </StudioMotion>
          </MailProvider>
        </AssistantDraftProvider>
      </UIPreferencesProvider>
    </WorkspaceProvider>
  );
}
function Shell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState === 'visible')
        apiRequest<{ readAt: string | null }[]>('/api/notifications')
          .then((v) => {
            if (active) setUnreadCount(v.filter((n) => !n.readAt).length);
          })
          .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pathname = usePathname() || '/';
  const router = useRouter();
  const {
    assistantOpen,
    setAssistantOpen,
    cases,
    now,
    persistence,
    recoveryNotice,
    invoices,
    customers,
  } = useWorkspace();
  const notifications = cases.flatMap((order) =>
    order.tasks
      .filter((task) => task.dueAt <= now)
      .map((task) => ({
        ...task,
        order: order.id,
        href: '/orders/' + order.id,
        description: order.customer + ' · ' + task.detail,
      })),
  );
  const title =
    pageTitles[pathname] ||
    (pathname.endsWith('/review')
      ? 'Review & approve'
      : pathname.startsWith('/orders/')
        ? 'Order details'
        : pathname.startsWith('/invoices/')
          ? 'Invoice details'
          : 'Workspace');
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      apiRequest<SearchResult[]>(
        '/api/search?q=' + encodeURIComponent(searchQuery),
      )
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  function go(path: string) {
    setSearchOpen(false);
    router.push(path);
  }
  return (
    <div
      className="app-frame liquid-shell"
      data-module={moduleForPath(pathname)}
    >
      <a href="#workspace-content" className="sr-only focus:not-sr-only">
        Skip to workspace
      </a>
      <StudioSidebar pathname={pathname} />
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="mobile-nav-sheet !w-[284px] !p-0"
          showCloseButton
        >
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Navigate AH Interiors operations
          </SheetDescription>
          <StudioSidebar
            pathname={pathname}
            mobile
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>
      <div className="workspace-main">
        <StudioHeader
          pathname={pathname}
          title={title}
          onSearch={() => setSearchOpen(true)}
          onMenu={() => setMobileOpen(true)}
          onHelp={() => setHelpOpen(true)}
          onNotifications={() => router.push('/notifications')}
          notifications={unreadCount}
        />
        {persistence === 'session-only' && (
          <output className="storage-warning">
            Browser storage is unavailable. Changes are session-only and may be
            lost on refresh.
          </output>
        )}
        {persistence === 'read-only' && (
          <output className="storage-warning">
            The workspace is unavailable or access is restricted. Reload to
            reconnect before editing.
          </output>
        )}
        {recoveryNotice && (
          <output className="storage-warning">
            An unreadable saved workspace was detected. Its original contents
            were retained where browser storage allowed; sample records are
            shown.
          </output>
        )}
        <main id="workspace-content" aria-label={title}>
          <RouteTransition route={pathname}>{children}</RouteTransition>
        </main>
      </div>
      {pathname !== '/' && pathname !== '/assistant' && (
        <button
          className="floating-assistant"
          onClick={() => setAssistantOpen(true)}
        >
          <Sparkles size={17} />
          Ask Amiro
        </button>
      )}
      <Sheet open={assistantOpen} onOpenChange={setAssistantOpen}>
        <SheetContent className="!w-full sm:!max-w-[460px] !p-0 !gap-0">
          <SheetTitle className="sr-only">Amiro assistant</SheetTitle>
          <SheetDescription className="sr-only">
            Ask about the sample workspace
          </SheetDescription>
          <AssistantPanel drawer />
        </SheetContent>
      </Sheet>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent
          className="sm:!max-w-[550px] !p-2"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search workspace</DialogTitle>
          <DialogDescription className="sr-only">
            Find pages and customer orders
          </DialogDescription>
          <Command>
            <CommandInput
              placeholder="Search pages, orders, customers, products…"
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList className="!max-h-[420px]">
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Pages">
                {navigation.map((item) => (
                  <CommandItem
                    key={item.href}
                    onSelect={() => go(item.href)}
                    className="!py-3"
                  >
                    <item.icon size={16} />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Orders">
                {cases.map((order) => (
                  <CommandItem
                    key={order.id}
                    value={
                      order.id + ' ' + order.customer + ' ' + order.supplier
                    }
                    onSelect={() => go('/orders/' + order.id)}
                    className="!py-3"
                  >
                    #{order.id}
                    <span className="ml-2">{order.customer}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {order.supplier}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Invoices">
                {invoices.map((invoice) => (
                  <CommandItem
                    key={invoice.id}
                    value={
                      invoice.id +
                      ' invoice ' +
                      customers.find(
                        (customer) => customer.id === invoice.customerId,
                      )?.name
                    }
                    onSelect={() => go('/invoices/' + invoice.id)}
                  >
                    {invoice.id}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {
                        customers.find(
                          (customer) => customer.id === invoice.customerId,
                        )?.name
                      }
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {searchResults.length > 0 && (
                <CommandGroup heading="Shared CRM records">
                  {searchResults.map((item) => (
                    <CommandItem
                      key={item.type + item.id}
                      value={item.type + ' ' + item.label + ' ' + item.detail}
                      onSelect={() => go(item.href)}
                      className="!py-3"
                    >
                      <span className="text-xs text-muted-foreground">
                        {item.type}
                      </span>
                      <strong className="ml-2">{item.label}</strong>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup heading="Customers">
                {customers.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    value={
                      customer.id + ' ' + customer.name + ' ' + customer.email
                    }
                    onSelect={() => go('/customers?customer=' + customer.id)}
                  >
                    {customer.name}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {customer.id}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="sm:!max-w-[490px] !p-0 overflow-hidden">
          <div className="section-heading">
            <div>
              <DialogTitle>
                Due reminders{' '}
                <span className="count-tag">{notifications.length}</span>
              </DialogTitle>
              <DialogDescription className="mt-2">
                Items requiring your attention in the sample workspace.
              </DialogDescription>
            </div>
          </div>
          {!notifications.length && (
            <div className="ops-empty">
              <Bell />
              <h3>No reminders due</h3>
              <p>Your pending follow-ups will appear within 24 hours.</p>
            </div>
          )}
          {notifications.map((item) => (
            <Link
              key={item.order}
              href={item.href}
              className="attention-row"
              onClick={() => setNotificationsOpen(false)}
            >
              <span className="attention-icon">
                <Bell />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
              <ChevronRight />
            </Link>
          ))}
        </DialogContent>
      </Dialog>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:!max-w-[480px]">
          <DialogTitle className="detail-title">
            Explore your workspace
          </DialogTitle>
          <DialogDescription className="leading-7">
            This frontend uses sample business data. Search orders, filter
            tables, review purchases, and prepare assistant drafts. Use Ctrl/⌘ K
            for search. Process prepares drafts; Go ahead records local approval
            only. Orders, invoices and customer records are saved on this
            browser, not backed up to a server. Assistant chat remains
            session-only. Store channels, Gmail, Dropbox and live AI will
            connect during the backend phase.
          </DialogDescription>
          <Button
            className="btn btn-primary"
            onClick={() => {
              setHelpOpen(false);
              router.push('/assistant');
            }}
          >
            Try the assistant
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
