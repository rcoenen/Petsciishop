
import { FramebufWithFont, RgbPalette } from '../redux/types';
import { framebufToPixels, computeOutputImageDims } from './exporters/util';

const BEZEL_W = 1280;
const BEZEL_H = 720;
const SCREEN_X = 325;
const SCREEN_Y = 95;
const SCREEN_W = 623;
const SCREEN_H = 441;

/**
 * Apply CRT effects to the screen region of the bezel canvas.
 *
 * Compositing order (informed by VICE / CRT-Royale / int10h research):
 *  1. Slight horizontal blur — analog signal bandwidth
 *  2. Phosphor bloom — blurred bright areas composited with 'screen'
 *  3. Brightness-dependent scanlines — darker gap on dark rows, lighter on bright
 *  4. Vignette — subtle radial corner darkening
 *  5. Brightness compensation — offset darkening from scanlines/vignette
 */
function applyBezelCrt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  // --- 1. Analog horizontal softness ---
  // Draw the current screen content with a tiny horizontal blur back on top.
  const softCanvas = document.createElement('canvas');
  softCanvas.width = w;
  softCanvas.height = h;
  const softCtx = softCanvas.getContext('2d')!;
  // Grab what's already on the main canvas in the screen rect
  softCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);

  // Apply a subtle horizontal-ish blur (canvas blur is isotropic, keep it tiny)
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = w;
  blurCanvas.height = h;
  const blurCtx = blurCanvas.getContext('2d')!;
  blurCtx.filter = 'blur(0.6px)';
  blurCtx.drawImage(softCanvas, 0, 0);
  blurCtx.filter = 'none';

  // Replace the screen region with the softened version
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(blurCanvas, x, y);

  // --- 2. Phosphor bloom / halation ---
  // A wider blur composited additively simulates phosphor glow on bright areas
  const bloomCanvas = document.createElement('canvas');
  bloomCanvas.width = w;
  bloomCanvas.height = h;
  const bloomCtx = bloomCanvas.getContext('2d')!;
  bloomCtx.filter = 'blur(4px)';
  bloomCtx.drawImage(softCanvas, 0, 0);
  bloomCtx.filter = 'none';

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.10;
  ctx.drawImage(bloomCanvas, x, y);
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';

  // --- 3. Brightness-dependent scanlines ---
  // Read back the screen pixels to compute per-row brightness
  const screenData = ctx.getImageData(x, y, w, h);
  const pixels = screenData.data;
  const scanlinePitch = 3; // every 3rd output row gets a dark line
  const baseAlpha = 0.28;  // max darkness for fully black rows
  const bloomFactor = 0.55; // how much bright rows reduce the scanline

  // Compute average brightness per row (0..1)
  const rowBrightness = new Float32Array(h);
  for (let row = 0; row < h; row++) {
    let sum = 0;
    const rowStart = row * w * 4;
    for (let col = 0; col < w; col++) {
      const idx = rowStart + col * 4;
      // Fast luminance approximation
      sum += pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
    }
    rowBrightness[row] = sum / (w * 255);
  }

  // Draw scanline bars with per-row alpha
  for (let row = 2; row < h; row += scanlinePitch) {
    const brightness = rowBrightness[row];
    const alpha = baseAlpha * (1.0 - brightness * bloomFactor);
    if (alpha > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
      ctx.fillRect(x, y + row, w, 1);
    }
  }

  // --- 4. Vignette ---
  // Elliptical radial gradient, corners darken to ~35%
  const cx = x + w / 2;
  const cy = y + h / 2;
  const diag = Math.sqrt(w * w + h * h) / 2;
  const vignette = ctx.createRadialGradient(cx, cy, diag * 0.35, cx, cy, diag);
  vignette.addColorStop(0.0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.6, 'rgba(0,0,0,0.02)');
  vignette.addColorStop(0.85, 'rgba(0,0,0,0.18)');
  vignette.addColorStop(1.0, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vignette;
  ctx.fillRect(x, y, w, h);

  // --- 5. Brightness compensation ---
  // Scanlines + vignette darken the image; boost slightly to compensate
  const compCanvas = document.createElement('canvas');
  compCanvas.width = w;
  compCanvas.height = h;
  const compCtx = compCanvas.getContext('2d')!;
  compCtx.filter = 'brightness(1.12)';
  compCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);
  compCtx.filter = 'none';
  ctx.drawImage(compCanvas, x, y);

  ctx.restore();
}

export async function openBezelPreview(fb: FramebufWithFont, palette: RgbPalette): Promise<void> {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer';

  const img = document.createElement('img');
  img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
  overlay.appendChild(img);

  let closed = false;
  let cursorTimer: number | null = null;
  const showCursor = () => {
    overlay.style.cursor = 'pointer';
  };
  const hideCursor = () => {
    overlay.style.cursor = 'none';
  };
  const resetCursorTimer = () => {
    showCursor();
    if (cursorTimer !== null) window.clearTimeout(cursorTimer);
    cursorTimer = window.setTimeout(() => {
      if (!closed) hideCursor();
    }, 2000);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    if (cursorTimer !== null) window.clearTimeout(cursorTimer);
    overlay.replaceWith();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  overlay.addEventListener('click', close);
  overlay.addEventListener('mousemove', resetCursorTimer);
  overlay.addEventListener('mouseenter', resetCursorTimer);
  const handleFullscreenChange = () => {
    if (!document.fullscreenElement) {
      close();
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }
  };
  document.addEventListener('fullscreenchange', handleFullscreenChange);

  document.body.appendChild(overlay);
  resetCursorTimer();
  // Request fullscreen immediately while the click gesture is still active.
  overlay.requestFullscreen().catch(() => {});

  const { imgWidth, imgHeight } = computeOutputImageDims(fb, true);
  const pixBuf = framebufToPixels(fb, palette, true);

  const petsciiCanvas = document.createElement('canvas');
  petsciiCanvas.width = imgWidth;
  petsciiCanvas.height = imgHeight;
  petsciiCanvas.getContext('2d')!.putImageData(
    new ImageData(new Uint8ClampedArray(pixBuf), imgWidth, imgHeight), 0, 0
  );

  const canvas = document.createElement('canvas');
  canvas.width = BEZEL_W;
  canvas.height = BEZEL_H;
  const ctx = canvas.getContext('2d')!;

  // Draw the PETSCII image with a mild CRT-like color boost
  ctx.imageSmoothingEnabled = false;
  ctx.filter = 'brightness(1.1) contrast(1.15) saturate(1.1)';
  ctx.drawImage(petsciiCanvas, SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H);
  ctx.filter = 'none';

  // Apply layered CRT effects to the screen area
  applyBezelCrt(ctx, SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H);

  // Draw the bezel frame on top (transparent screen hole)
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, BEZEL_W, BEZEL_H); resolve(); };
    img.onerror = reject;
    img.src = import.meta.env.BASE_URL + 'assets/commodore_1702_bezel.webp';
  });

  const dataUrl = canvas.toDataURL('image/png');
  img.src = dataUrl;
}
