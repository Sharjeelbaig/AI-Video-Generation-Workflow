import type { ScriptSegment } from '../types';

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
    .trim();
}

function detectWarnings(raw: string, clean: string): string[] {
  const warnings: string[] = [];
  if (!clean && !extractTag(raw, 'Heading') && !extractTag(raw, 'SubHeading')) {
    warnings.push('Segment has no visible text');
  }
  const unclosed = raw.match(/<[A-Za-z]+(?![^>]*\/>)[^>]*>(?![\s\S]*<\/)/g);
  if (unclosed?.length) {
    warnings.push(`Possible unclosed tag: ${unclosed[0]}`);
  }
  return warnings;
}

export function parseScript(content: string, projectId: string): ScriptSegment[] {
  const rawSegments = content.split(/^---$/m).map(s => s.trim()).filter(Boolean);
  return rawSegments.map((raw, index): ScriptSegment => {
    const heading = extractTag(raw, 'Heading');
    const subHeading = extractTag(raw, 'SubHeading');
    const imagePrompt = extractTag(raw, 'image');
    const cleanText = stripTags(raw);
    const warnings = detectWarnings(raw, cleanText);

    return {
      id: `${projectId}_seg_${index}`,
      projectId,
      index,
      rawText: raw,
      cleanText,
      heading,
      subHeading,
      imagePrompt,
      warnings,
      isEmpty: !cleanText && !heading && !subHeading,
    };
  });
}

export function isRTL(text: string): boolean {
  const rtlRe = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return rtlRe.test(text);
}
