type SavePickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: SavePickerAcceptType[];
};

type SaveFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;
};

const MIME_TYPES: Record<string, string> = {
  wav: 'audio/wav',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  mp4: 'video/mp4',
};

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function saveWithAnchor(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export async function exportAsset(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to export ${filename}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || guessMimeType(filename);
  const windowWithSavePicker = window as WindowWithSavePicker;

  if (windowWithSavePicker.showSaveFilePicker) {
    try {
      const handle = await windowWithSavePicker.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Exported asset',
            accept: {
              [mimeType]: [`.${filename.split('.').pop() ?? 'bin'}`],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
    }
  }

  saveWithAnchor(blob, filename);
}

export function filenameFromAssetUrl(assetUrl: string | null | undefined, fallback: string): string {
  if (!assetUrl) {
    return fallback;
  }
  try {
    const parsed = new URL(assetUrl, window.location.origin);
    const filename = parsed.pathname.split('/').pop();
    return filename || fallback;
  } catch {
    return fallback;
  }
}
