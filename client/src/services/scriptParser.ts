import type { ScriptSegment } from '../types';

export const SCRIPT_PARSER_VERSION = 2;

type ParsedRawBlock = {
  rawText: string;
  cleanText: string;
  heading: string | null;
  subHeading: string | null;
  imagePrompt: string | null;
  warnings: string[];
  sourceBlockIndex: number;
};

function extractTag(text: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function stripTags(text: string): string {
  return text
    .replace(/<Heading>[\s\S]*?<\/Heading>/gi, '')
    .replace(/<SubHeading>[\s\S]*?<\/SubHeading>/gi, '')
    .replace(/<image>[\s\S]*?<\/image>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function detectWarnings(raw: string, clean: string): string[] {
  const warnings: string[] = [];
  if (!clean && !extractTag(raw, 'Heading') && !extractTag(raw, 'SubHeading')) {
    warnings.push('Segment has no visible text');
  }
  const supportedTags = ['Heading', 'SubHeading', 'image'];
  supportedTags.forEach((tag) => {
    const openCount = (raw.match(new RegExp(`<${tag}>`, 'gi')) ?? []).length;
    const closeCount = (raw.match(new RegExp(`</${tag}>`, 'gi')) ?? []).length;
    if (openCount !== closeCount) {
      warnings.push(`Mismatched <${tag}> tag count`);
    }
  });
  if (raw.includes('<') && raw.includes('>') && !clean && warnings.length === 0) {
    warnings.push('Segment contains markup but no spoken text');
  }
  return warnings;
}

export function computeScriptFingerprint(content: string): string {
  const bytes = new TextEncoder().encode(content);
  let hash = 0x811c9dc5;
  bytes.forEach((byte) => {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  });
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseRawBlocks(content: string): ParsedRawBlock[] {
  const rawSegments = content
    .split(/^---$/m)
    .map(segment => segment.trim())
    .filter(Boolean);

  return rawSegments.map((rawText, sourceBlockIndex) => ({
    rawText,
    cleanText: stripTags(rawText),
    heading: extractTag(rawText, 'Heading'),
    subHeading: extractTag(rawText, 'SubHeading'),
    imagePrompt: extractTag(rawText, 'image'),
    warnings: detectWarnings(rawText, stripTags(rawText)),
    sourceBlockIndex,
  }));
}

export function parseScript(content: string, projectId: string): ScriptSegment[] {
  const parsedBlocks = parseRawBlocks(content);
  const segments: ScriptSegment[] = [];
  let pendingHeading: string | null = null;
  let pendingSubHeading: string | null = null;
  let pendingImagePrompt: string | null = null;
  let pendingImagePromptSourceBlockIndex: number | null = null;
  let pendingWarnings: string[] = [];

  parsedBlocks.forEach((block) => {
    if (!block.cleanText) {
      if (block.heading) {
        if (pendingHeading) {
          pendingWarnings.push('Multiple standalone headings found before narration; using the last one');
        }
        pendingHeading = block.heading;
      }
      if (block.subHeading) {
        if (pendingSubHeading) {
          pendingWarnings.push('Multiple standalone subheadings found before narration; using the last one');
        }
        pendingSubHeading = block.subHeading;
      }
      if (block.imagePrompt) {
        if (pendingImagePrompt) {
          pendingWarnings.push('Multiple standalone image prompts found before narration; using the last one');
        }
        pendingImagePrompt = block.imagePrompt;
        pendingImagePromptSourceBlockIndex = block.sourceBlockIndex;
      }
      pendingWarnings = [
        ...pendingWarnings,
        ...block.warnings.filter(warning => warning !== 'Segment has no visible text'),
      ];
      return;
    }

    const usesPendingImagePrompt = !block.imagePrompt && !!pendingImagePrompt;
    const warnings = [...pendingWarnings, ...block.warnings];
    if (block.imagePrompt && pendingImagePrompt) {
      warnings.push('Inline image prompt overrides the previous standalone image prompt');
    }

    segments.push({
      id: `${projectId}_seg_${segments.length}`,
      projectId,
      index: segments.length,
      rawText: block.rawText,
      cleanText: block.cleanText,
      heading: block.heading ?? pendingHeading,
      subHeading: block.subHeading ?? pendingSubHeading,
      imagePrompt: block.imagePrompt ?? pendingImagePrompt,
      sourceBlockIndex: block.sourceBlockIndex,
      imagePromptSourceBlockIndex: block.imagePrompt
        ? block.sourceBlockIndex
        : usesPendingImagePrompt
          ? pendingImagePromptSourceBlockIndex
          : null,
      hasNarration: true,
      warnings,
      isEmpty: false,
    });

    pendingHeading = null;
    pendingSubHeading = null;
    pendingImagePrompt = null;
    pendingImagePromptSourceBlockIndex = null;
    pendingWarnings = [];
  });

  if ((pendingHeading || pendingSubHeading || pendingImagePrompt) && segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    lastSegment.warnings = [
      ...lastSegment.warnings,
      'Trailing standalone script block was ignored because no narration followed it',
    ];
  }

  return segments;
}

export function isRTL(text: string): boolean {
  const rtlRe = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return rtlRe.test(text);
}
