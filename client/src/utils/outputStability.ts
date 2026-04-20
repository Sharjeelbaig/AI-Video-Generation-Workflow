import type { GeneratedAudio, GeneratedImage, GeneratedVideo } from '../types';
import { SCRIPT_PARSER_VERSION, computeScriptFingerprint } from '../services/scriptParser';

type VersionedOutput = {
  parserVersion?: number | null;
  scriptFingerprint?: string | null;
};

export function formatOptionalSeconds(value: number | null | undefined, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(digits)}s`;
}

export function formatOptionalRoundedSeconds(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)}s`;
}

export function isStaleOutputRecord(
  record: VersionedOutput | null | undefined,
  scriptContent: string,
): boolean {
  if (!record) {
    return false;
  }
  const currentFingerprint = computeScriptFingerprint(scriptContent);
  return record.parserVersion !== SCRIPT_PARSER_VERSION || record.scriptFingerprint !== currentFingerprint;
}

export function partitionFreshOutputs<T extends VersionedOutput>(
  records: T[],
  scriptContent: string,
): { fresh: T[]; stale: T[] } {
  const fresh: T[] = [];
  const stale: T[] = [];

  records.forEach((record) => {
    if (isStaleOutputRecord(record, scriptContent)) {
      stale.push(record);
      return;
    }
    fresh.push(record);
  });

  return { fresh, stale };
}

export function getPreferredOutputForSegment<T extends { segmentIndex: number } & VersionedOutput>(
  records: T[],
  segmentIndex: number,
  scriptContent: string,
): { record: T | undefined; stale: boolean } {
  const fresh = records.find((record) => record.segmentIndex === segmentIndex && !isStaleOutputRecord(record, scriptContent));
  if (fresh) {
    return { record: fresh, stale: false };
  }

  const fallback = records.find((record) => record.segmentIndex === segmentIndex);
  return { record: fallback, stale: !!fallback };
}

export function countStaleOutputs(
  records: Array<GeneratedAudio | GeneratedImage | GeneratedVideo>,
  scriptContent: string,
): number {
  return records.filter((record) => isStaleOutputRecord(record, scriptContent)).length;
}
