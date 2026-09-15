import { IS_DEMO } from '../config';
import { createDemoBackend } from './demo';
import { createSupabaseBackend } from './supabase';
import type { Backend } from './types';

let instance: Backend | null = null;

/** 앱 전체에서 쓰는 단일 backend (demo 또는 supabase) */
export function backend(): Backend {
  instance ??= IS_DEMO ? createDemoBackend() : createSupabaseBackend();
  return instance;
}

export type { Backend };
