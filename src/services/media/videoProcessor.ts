import { PlaylistItem } from '../../types/cinema';
import { saveVideoToIndexedDb } from '../storage/indexedDbService';

const SUPPORTED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/x-matroska',
  'video/matroska',
  'video/quicktime',
];
const SUPPORTED_EXTENSIONS = ['.mp4', '.m4v', '.webm', '.mkv', '.mov'];

function inferVideoMimeType(file: File): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

const activeObjectUrls = new Set<string>();

export function trackObjectUrl(url: string): string {
  activeObjectUrls.add(url);
  return url;
}

export function revokeTrackedObjectUrl(url: string | null | undefined): void {
  if (!url) return;
  if (activeObjectUrls.has(url)) {
    activeObjectUrls.delete(url);
  }
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Ignore already revoked URLs
  }
}

export function revokeAllTrackedObjectUrls(): void {
  activeObjectUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore
    }
  });
  activeObjectUrls.clear();
}

export function validateVideoFile(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  const hasValidExt = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasValidMime =
    SUPPORTED_MIME_TYPES.includes(file.type) ||
    file.type.startsWith('video/') ||
    ((file.type === '' || file.type === 'application/octet-stream') && hasValidExt);

  if (!hasValidMime && !hasValidExt) {
    return `Unsupported format "${file.name}". Please upload an MP4, MOV, WebM, or MKV video file.`;
  }

  if (file.size === 0) {
    return `File "${file.name}" is empty (0 bytes) and cannot be played.`;
  }

  return null;
}

export interface ExtractedVideoMetadata {
  duration: number;
  width: number;
  height: number;
  thumbnailUrl: string | null;
}

export function extractVideoMetadata(objectUrl: string): Promise<ExtractedVideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    let seekFallbackTimer: number | null = null;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('Timed out while reading video metadata. The file may be corrupted.'));
      }
    }, 20000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (seekFallbackTimer !== null) {
        window.clearTimeout(seekFallbackTimer);
      }
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };

    video.onerror = () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(
          new Error(
            'Unable to decode this video file in your browser. Please verify the codec (H.264/MP4, MOV, VP8/VP9/WebM, or browser-compatible MKV).',
          ),
        );
      }
    };

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;

      // If container reports indeterminate duration yet has valid video dimensions, allow direct streaming
      if (duration <= 0) {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          if (!settled) {
            settled = true;
            cleanup();
            resolve({ duration: 0, width, height, thumbnailUrl: null });
          }
          return;
        }
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error('Video has zero or unreadable metadata.'));
        }
        return;
      }

      // If thumbnail seek takes too long (common on mobile or large MKV files), continue without thumbnail
      seekFallbackTimer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ duration, width, height, thumbnailUrl: null });
        }
      }, 1800);

      // Seek slightly into the file to capture an actual frame thumbnail
      const seekTime = Math.min(Math.max(duration * 0.08, 0.25), Math.max(duration - 0.1, 0));
      try {
        video.currentTime = seekTime;
      } catch {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ duration, width, height, thumbnailUrl: null });
        }
      }
    };

    video.onseeked = () => {
      if (settled) return;
      settled = true;
      let thumbnailUrl: string | null = null;
      try {
        const canvas = document.createElement('canvas');
        const targetW = 320;
        const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
        canvas.width = targetW;
        canvas.height = Math.round(targetW / aspect);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnailUrl = canvas.toDataURL('image/jpeg', 0.78);
        }
      } catch {
        thumbnailUrl = null;
      }
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      cleanup();
      resolve({ duration, width, height, thumbnailUrl });
    };

    video.src = objectUrl;
  });
}

export async function processUploadedVideoFile(
  file: File,
  orderIndex: number,
  onProgress?: (stage: string) => void,
): Promise<PlaylistItem> {
  const validationError = validateVideoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  onProgress?.(`Reading metadata for ${file.name}`);
  const objectUrl = trackObjectUrl(URL.createObjectURL(file));

  try {
    const meta = await extractVideoMetadata(objectUrl);
    const id = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resolvedMime = inferVideoMimeType(file);

    const shouldPersistInIdb = file.size <= 150 * 1024 * 1024;
    let saved = false;
    if (shouldPersistInIdb) {
      onProgress?.(`Caching ${file.name} locally`);
      saved = await saveVideoToIndexedDb({
        id,
        file,
        fileName: file.name,
        fileSize: file.size,
        mimeType: resolvedMime,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        thumbnailUrl: meta.thumbnailUrl,
        orderIndex,
      });
    }

    return {
      id,
      fileName: file.name,
      fileSize: file.size,
      mimeType: resolvedMime,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      thumbnailUrl: meta.thumbnailUrl,
      objectUrl,
      hasIndexedDbBackup: saved,
      orderIndex,
    };
  } catch (err) {
    revokeTrackedObjectUrl(objectUrl);
    throw err;
  }
}
