import type { Metadata } from 'next';
import { DM_Sans, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import './reskin.css';
import './motion.css';
import './business-ui.css';
import './accessibility.css';
import { AuthBoundary } from '@/components/auth-boundary';
import { OperationsShell } from '@/components/operations-shell';

const manrope = DM_Sans({ variable: '--font-manrope', subsets: ['latin'] });
const sora = Plus_Jakarta_Sans({ variable: '--font-sora', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'AH Interiors Operations',
  description: 'Order, supplier, assembly, document and payment operations for AH Interiors.',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  openGraph: {
    title: 'AH Interiors Operations',
    description: 'Orders, suppliers, assembly and accounts — one calm command centre.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AH Interiors Operations',
    description: 'Orders, suppliers, assembly and accounts — one calm command centre.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-motion="full">
      <body className={`${manrope.variable} ${sora.variable} antialiased`}>
        <AuthBoundary><OperationsShell>{children}</OperationsShell></AuthBoundary>
      </body>
    </html>
  );
}
