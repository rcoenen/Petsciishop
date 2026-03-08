
import { CrtFilter, FramebufWithFont, RgbPalette } from '../redux/types';
import { framebufToPixels, computeOutputImageDims } from './exporters/util';

const BEZEL_W = 1280;
const BEZEL_H = 720;
const SCREEN_X = 325;
const SCREEN_Y = 95;
const SCREEN_W = 623;
const SCREEN_H = 441;

function applyBezelCrt(
  ctx: CanvasRenderingContext2D,
  filter: CrtFilter,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (filter === 'none') return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  if (filter === 'scanlines' || filter === 'colorTv' || filter === 'bwTv') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let lineY = y + 1; lineY < y + height; lineY += 2) {
      ctx.fillRect(x, lineY, width, 1);
    }
  }

  if (filter === 'colorTv' || filter === 'bwTv') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radius = Math.max(width, height) / 2;
    const vignette = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 1.2);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vignette;
    ctx.fillRect(x, y, width, height);

    const noiseAlpha = filter === 'colorTv' ? 0.12 : 0.08;
    const noisePixels = Math.floor((width * height) / 18);
    for (let i = 0; i < noisePixels; i++) {
      const px = x + Math.floor(Math.random() * width);
      const py = y + Math.floor(Math.random() * height);
      if (filter === 'colorTv') {
        const r = Math.floor(Math.random() * 255);
        const g = Math.floor(Math.random() * 255);
        const b = Math.floor(Math.random() * 255);
        ctx.fillStyle = `rgba(${r},${g},${b},${noiseAlpha})`;
      } else {
        const v = Math.floor(Math.random() * 255);
        ctx.fillStyle = `rgba(${v},${v},${v},${noiseAlpha})`;
      }
      ctx.fillRect(px, py, 1, 1);
    }
  }

  ctx.restore();
}

export async function openBezelPreview(fb: FramebufWithFont, palette: RgbPalette, crtFilter: CrtFilter = 'none'): Promise<void> {
  // The bezel preview should show the full C64 output frame, including the border.
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
  ctx.imageSmoothingEnabled = false;
  ctx.filter = crtFilter === 'colorTv'
    ? 'brightness(1.2) contrast(1.2)'
    : crtFilter === 'bwTv'
      ? 'brightness(1.4) contrast(1.2) grayscale(1)'
      : 'none';
  ctx.drawImage(petsciiCanvas, SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H);
  ctx.filter = 'none';
  applyBezelCrt(ctx, crtFilter, SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, BEZEL_W, BEZEL_H); resolve(); };
    img.onerror = reject;
    img.src = import.meta.env.BASE_URL + 'assets/commodore_1702_bezel.webp';
  });

  const dataUrl = canvas.toDataURL('image/png');

  // Build an overlay div in the current document so requestFullscreen works
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer';

  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.cssText = 'height:100%;width:auto;display:block';
  overlay.appendChild(img);

  const close = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    overlay.remove();
  };
  overlay.addEventListener('click', close);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) overlay.remove();
  }, { once: true });

  document.body.appendChild(overlay);
  overlay.requestFullscreen().catch(() => {});
}
