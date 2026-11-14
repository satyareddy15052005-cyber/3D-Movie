import { GraphicsQuality } from '../types/cinema';

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function detectWebGLSupport(): { supported: boolean; isSoftwareGl: boolean; rendererName: string } {
  if (typeof document === 'undefined') {
    return { supported: false, isSoftwareGl: true, rendererName: 'Unavailable' };
  }
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) {
      return { supported: false, isSoftwareGl: true, rendererName: 'No WebGL Context' };
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const rendererName = String(gl.getParameter(param) || 'WebGL');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererName);
    return { supported: true, isSoftwareGl, rendererName };
  } catch {
    return { supported: false, isSoftwareGl: true, rendererName: 'WebGL Error' };
  }
}

export function detectDefaultGraphicsQuality(): GraphicsQuality {
  if (typeof window === 'undefined') return 'medium';
  const webgl = detectWebGLSupport();
  if (webgl.isSoftwareGl) return 'low';

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  if (isMobile) return 'low';

  const cores = navigator.hardwareConcurrency || 4;
  if (cores >= 8) return 'high';
  return 'medium';
}
