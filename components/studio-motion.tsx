'use client';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { useUIPreferences } from '@/components/ui-preferences-provider';
export function StudioMotion({ children }: { children: ReactNode }) {
  // Every spatial target and layout consumer follows live preferences below.
  // This avoids mount-time reduced-motion caching in the installed Motion runtime.
  return (
    <MotionConfig
      reducedMotion="never"
      transition={{ type: 'spring', stiffness: 360, damping: 32 }}
    >
      {children}
    </MotionConfig>
  );
}
export function RouteTransition({
  route,
  children,
}: {
  route: string;
  children: ReactNode;
}) {
  const { preferences, ready } = useUIPreferences();
  const reduced = !ready || preferences.motion === 'reduced';
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        className="studio-route"
        key={route}
        initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{
          opacity: 0,
          y: 0,
          transition: { type: 'tween', duration: 0.1 },
        }}
        transition={{
          type: 'tween',
          duration: reduced ? 0.1 : 0.22,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
export function StudioReveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { preferences, ready } = useUIPreferences();
  const reduced = !ready || preferences.motion === 'reduced';
  return (
    <motion.div
      className={className}
      data-motion-surface="react"
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'tween',
        duration: reduced ? 0.1 : 0.3,
        delay: reduced ? 0 : Math.min(delay, 0.16),
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
