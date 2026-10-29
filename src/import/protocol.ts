import type { WakhanResult } from "../model";

export type ImportRequest = { file: File };
export type ImportResponse =
  { ok: true; result: WakhanResult } | { ok: false; error: string };
