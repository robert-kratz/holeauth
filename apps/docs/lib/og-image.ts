import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Font — read once at module init, cache as base64 for SVG @font-face embed.
// ---------------------------------------------------------------------------
let _fontB64: string | null = null;
function getFontB64(): string {
  if (_fontB64) return _fontB64;
  const buf = readFileSync(join(process.cwd(), 'assets', 'fonts', 'Inter-SemiBold.ttf'));
  _fontB64 = buf.toString('base64');
  return _fontB64;
}

// ---------------------------------------------------------------------------
// Logo path — resolved relative to the monorepo root.
// ---------------------------------------------------------------------------
function getLogoPath(): string {
  return join(process.cwd(), '..', '..', 'branding', 'logo-512.png');
}

// ---------------------------------------------------------------------------
// XML-escape — prevent SVG injection from page titles / descriptions.
// ---------------------------------------------------------------------------
function xmlEsc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Word-wrap — split a title into at most 2 tspan lines.
// ---------------------------------------------------------------------------
function wrapTitle(title: string, maxChars = 26): [string, string] {
  if (title.length <= maxChars) return [title, ''];
  const breakAt = title.lastIndexOf(' ', maxChars);
  if (breakAt === -1) return [title.slice(0, maxChars), title.slice(maxChars).trimStart()];
  return [title.slice(0, breakAt), title.slice(breakAt + 1)];
}

// ---------------------------------------------------------------------------
// Font-size — adaptive based on title length.
// ---------------------------------------------------------------------------
function titleFontSize(title: string): number {
  if (title.length <= 22) return 64;
  if (title.length <= 38) return 52;
  return 40;
}

// ---------------------------------------------------------------------------
// Grid lines — explicit SVG lines (libvips does not support <pattern>).
// ---------------------------------------------------------------------------
function buildGrid(): string {
  const lines: string[] = [];
  const col = 'rgba(255,255,255,0.04)';
  for (let x = 0; x <= 1200; x += 60) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="630" stroke="${col}" stroke-width="1"/>`);
  }
  for (let y = 0; y <= 630; y += 60) {
    lines.push(`<line x1="0" y1="${y}" x2="1200" y2="${y}" stroke="${col}" stroke-width="1"/>`);
  }
  return lines.join('\n  ');
}

// ---------------------------------------------------------------------------
// Layout constants — must match values used in renderOgImage().
// ---------------------------------------------------------------------------
const LOGO_SIZE = 28;
const LOGO_X    = 40;
const LOGO_Y    = 38;

// ---------------------------------------------------------------------------
// SVG builder — no embedded images; logo is composited separately by sharp.
// ---------------------------------------------------------------------------
export function buildOgSvg(title: string, description?: string): string {
  const fontB64 = getFontB64();
  const safeDesc = description ? xmlEsc(description.slice(0, 90)) : null;

  const [line1, line2] = wrapTitle(title, 28);
  const safeLine1 = xmlEsc(line1);
  const safeLine2 = xmlEsc(line2);

  const fontSize = titleFontSize(title);
  const titleY = safeDesc ? 310 : 330;
  const lineHeight = fontSize * 1.2;

  // Wordmark baseline: vertically centred on the logo
  const wordmarkY = LOGO_Y + Math.round(LOGO_SIZE / 2) + 7;
  const wordmarkX = LOGO_X + LOGO_SIZE + 10;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <style>
      @font-face {
        font-family: 'Inter';
        font-weight: 600;
        src: url('data:font/truetype;base64,${fontB64}') format('truetype');
      }
    </style>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="#0a0a0b"/>
  ${buildGrid()}

  <!-- Top-left wordmark (logo composited on top via sharp) -->
  <text
    x="${wordmarkX}" y="${wordmarkY}"
    font-family="Inter, ui-sans-serif, system-ui, sans-serif"
    font-weight="600"
    font-size="18"
    fill="#ededed"
    letter-spacing="-0.2"
  >holeauth.dev</text>

  <!-- Title -->
  <text
    x="72"
    font-family="Inter, ui-sans-serif, system-ui, sans-serif"
    font-weight="600"
    font-size="${fontSize}"
    fill="#ededed"
    letter-spacing="-1"
  >${line2
    ? `<tspan x="72" y="${titleY}">${safeLine1}</tspan><tspan x="72" dy="${lineHeight}">${safeLine2}</tspan>`
    : `<tspan x="72" y="${titleY}">${safeLine1}</tspan>`
  }</text>

  ${safeDesc ? `
  <!-- Description -->
  <text
    x="72"
    y="${titleY + (line2 ? lineHeight * 2 : lineHeight) + 12}"
    font-family="Inter, ui-sans-serif, system-ui, sans-serif"
    font-weight="600"
    font-size="22"
    fill="#b8b8c0"
    letter-spacing="-0.2"
  >${safeDesc}</text>` : ''}

  <!-- Subtle separator above footer -->
  <line x1="0" y1="570" x2="1200" y2="570" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>

  <!-- Bottom: docs.holeauth.dev (muted) -->
  <text
    x="72" y="594"
    font-family="Inter, ui-sans-serif, system-ui, sans-serif"
    font-weight="600"
    font-size="16"
    fill="#ededed"
    opacity="0.35"
    letter-spacing="-0.1"
  >docs.holeauth.dev</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Render — SVG to PNG via sharp, then composite the branding logo on top.
// ---------------------------------------------------------------------------
export async function renderOgImage(title: string, description?: string): Promise<Buffer> {
  const svg = buildOgSvg(title, description);

  const logoBuf = await sharp(getLogoPath())
    .resize(LOGO_SIZE, LOGO_SIZE)
    .png()
    .toBuffer();

  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 6 })
    .composite([{ input: logoBuf, left: LOGO_X, top: LOGO_Y }])
    .toBuffer();
}
