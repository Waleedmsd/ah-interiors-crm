'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutGroup, motion } from 'motion/react';
import {
  Bell,
  ChevronRight,
  CircleHelp,
  FileText,
  Menu,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import { navigation } from '@/app/dashboard-data';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useAuth } from '@/components/auth-context';
import { useWorkspace } from '@/components/workspace-provider';
import { useUIPreferences } from '@/components/ui-preferences-provider';
import { moduleForPath } from '@/lib/ui-preferences';
import {
  businessModules,
  canUseModule,
  type BusinessModule,
} from '@/lib/business-modules';
import { hasPermission } from '@/server/permissions';
const groups = [
  {
    label: 'Workspace',
    paths: [
      '/',
      '/orders',
      '/customers',
      '/products',
      '/suppliers',
      '/integrations/shopify',
    ],
  },
  {
    label: 'Operations',
    paths: [
      '/reviews',
      '/purchasing',
      '/inventory',
      '/deliveries',
      '/assembly-jobs',
      '/flooring',
      '/service-cases',
      '/tasks',
      '/approvals',
      '/assembly',
      '/communications',
      '/documents',
    ],
  },
  { label: 'Finance', paths: ['/invoices', '/expenses'] },
  { label: 'Insights', paths: ['/reports'] },
];
export function activeRoute(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/reviews')
    return pathname === '/reviews' || pathname.endsWith('/review');
  if (href === '/invoices')
    return pathname.startsWith('/invoices') || pathname === '/accounts';
  return pathname.startsWith(href) && !pathname.endsWith('/review');
}
export function StudioHeader({
  pathname,
  title,
  onSearch,
  onMenu,
  onHelp,
  onNotifications,
  notifications,
}: {
  pathname: string;
  title?: string;
  onSearch: () => void;
  onMenu: () => void;
  onHelp: () => void;
  onNotifications: () => void;
  notifications: number;
}) {
  const { user: staff } = useAuth();
  const current =
    title ||
    navigation.find((item) => activeRoute(pathname, item.href))?.label ||
    'Workspace';
  return (
    <header className="liquid-header">
      <button
        className="icon-btn liquid-mobile-menu"
        aria-label="Open all navigation"
        onClick={onMenu}
      >
        <Menu size={20} />
      </button>
      <nav className="liquid-breadcrumb" aria-label="Workspace breadcrumb">
        <Link href="/">Workspace</Link>
        <ChevronRight size={14} />
        <span>{current}</span>
      </nav>
      <div className="liquid-header-actions">
        <button
          className="liquid-search-trigger"
          onClick={onSearch}
          aria-label="Search workspace (Control K)"
        >
          <Search size={17} />
          <span>Search anything</span>
          <kbd>⌘ K</kbd>
        </button>
        <button
          className="icon-btn liquid-help"
          aria-label="Workspace help"
          onClick={onHelp}
        >
          <CircleHelp size={19} />
        </button>
        <button
          className="icon-btn notification-button"
          aria-label={'View ' + notifications + ' due reminders'}
          onClick={onNotifications}
        >
          <Bell size={19} />
          {notifications > 0 && <span className="notification-dot" />}
        </button>
        <Link
          href="/settings"
          className="liquid-account"
          aria-label="Staff account settings"
        >
          <span>
            {(staff?.name ?? 'AH')
              .split(' ')
              .map((v) => v[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div>
            <strong>{staff?.name ?? 'Amir'}</strong>
            <small>{staff?.role ?? 'Workspace admin'}</small>
          </div>
        </Link>
      </div>
    </header>
  );
}
export function StudioSidebar({
  pathname,
  mobile = false,
  onNavigate,
}: {
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const { cases, setAssistantOpen } = useWorkspace();
  const { user: staff } = useAuth();
  const { preferences, update, ready } = useUIPreferences();
  const reduced = !ready || preferences.motion === 'reduced';
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)');
    const change = () => setNarrow(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const collapsed =
    !mobile &&
    (preferences.navigation ? preferences.navigation === 'collapsed' : narrow);
  const reviewCount = cases.filter(
    (order) => order.pack?.state === 'Draft',
  ).length;
  const items = [
    ...navigation.filter(
      (item) =>
        (item.href !== '/integrations/shopify' ||
          (!!staff && ['Management', 'Team Lead'].includes(staff.role))) &&
        item.href !== '/accounts' &&
        item.href !== '/invoices' &&
        !!staff &&
        (hasPermission(staff, 'commerce.read') ||
          (item.href === '/reports' && hasPermission(staff, 'reports.read'))) &&
        (!(item.href.slice(1) in businessModules) ||
          (!!staff &&
            canUseModule(staff.role, item.href.slice(1) as BusinessModule))) &&
        (item.href !== '/reports' ||
          (!!staff && hasPermission(staff, 'reports.read'))),
    ),
    { href: '/invoices', label: 'Invoices', icon: FileText, index: 'F' },
  ];
  return (
    <aside
      className="liquid-sidebar"
      data-mobile={mobile}
      data-collapsed={collapsed}
    >
      <Link href="/" className="liquid-brand" onClick={onNavigate}>
        <span className="liquid-brand-mark">
          <Orbit size={24} />
        </span>
        <span className="nav-copy">
          amiro<span className="brand-dot">.</span>
          <small>AH INTERIORS</small>
        </span>
      </Link>
      <div className="liquid-workspace-label">
        <span className="workspace-emblem">AH</span>
        <div className="nav-copy">
          <strong>AH Interiors</strong>
          <small>Operations workspace</small>
        </div>
        <span
          className="workspace-online nav-copy"
          title="Shared team workspace"
        />
      </div>
      <TooltipProvider delay={180}>
        <LayoutGroup id={mobile ? 'mobile-navigation' : 'workspace-navigation'}>
          <nav
            className="liquid-nav"
            aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}
          >
            {groups.map((group) => (
              <div className="liquid-nav-group" key={group.label}>
                <h2 className="nav-copy">{group.label}</h2>
                {group.paths.map((path) => {
                  const item = items.find((value) => value.href === path);
                  if (!item) return null;
                  const selected = activeRoute(pathname, path);
                  const label =
                    path === '/assembly' ? 'Fulfilment' : item.label;
                  return (
                    <Tooltip key={path}>
                      <TooltipTrigger
                        render={
                          <Link
                            href={path}
                            className="liquid-nav-link"
                            aria-label={label}
                            aria-current={selected ? 'page' : undefined}
                            data-module={moduleForPath(path)}
                            onClick={onNavigate}
                          />
                        }
                      >
                        {selected &&
                          (reduced ? (
                            <span className="liquid-nav-selection" />
                          ) : (
                            <motion.span
                              layoutId="nav-selection"
                              className="liquid-nav-selection"
                              transition={{
                                type: 'spring',
                                stiffness: 420,
                                damping: 38,
                              }}
                            />
                          ))}
                        <item.icon size={19} />
                        <span className="nav-copy">{label}</span>
                        {path === '/reviews' && reviewCount > 0 && (
                          <span className="nav-count nav-copy">
                            {reviewCount}
                          </span>
                        )}
                      </TooltipTrigger>
                      <TooltipContent side="right">{label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </nav>
        </LayoutGroup>
      </TooltipProvider>
      <div className="liquid-sidebar-bottom">
        <Link
          href="/orders/new"
          className="liquid-new-order"
          aria-label="Create order"
          onClick={onNavigate}
        >
          <Plus size={19} />
          <span className="nav-copy">New order</span>
        </Link>
        <button
          className="liquid-assistant-link"
          aria-label="Open Amiro assistant"
          onClick={() => {
            setAssistantOpen(true);
            onNavigate?.();
          }}
        >
          <span className="liquid-ai-symbol">
            <Sparkles size={18} />
          </span>
          <span className="nav-copy">
            <strong>Ask Amiro</strong>
            <small>A little less busywork.</small>
          </span>
          <ChevronRight className="nav-copy" size={15} />
        </button>
        <div className="liquid-sidebar-utilities">
          <Link
            href="/settings"
            className="liquid-nav-link"
            aria-label="Settings"
            aria-current={pathname === '/settings' ? 'page' : undefined}
            onClick={onNavigate}
          >
            <Settings size={18} />
            <span className="nav-copy">Settings</span>
          </Link>
          {!mobile && (
            <button
              className="icon-btn sidebar-collapse"
              aria-label={
                collapsed ? 'Expand navigation' : 'Collapse navigation'
              }
              onClick={() =>
                update({ navigation: collapsed ? 'expanded' : 'collapsed' })
              }
            >
              {collapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )}
            </button>
          )}
        </div>
        <div className="liquid-local-label nav-copy">
          <span /> AH Interiors · Staff workspace
        </div>
      </div>
    </aside>
  );
}
