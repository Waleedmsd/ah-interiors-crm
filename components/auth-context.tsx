'use client';
import { createContext, useContext } from 'react';
import type { Staff } from '@/server/permissions';
export const AuthContext = createContext<{
  user: Staff | null;
  logout: () => Promise<void>;
}>({ user: null, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);
