import { describe, it, expect } from 'vitest';
import { renderQrDataUrl, renderQrBuffer } from '../src/qrcode.js';

describe('renderQrDataUrl', () => {
  it('returns a data: URL with base64 PNG payload', async () => {
    const url = await renderQrDataUrl('otpauth://totp/Holeauth:a?secret=JBSWY3DPEHPK3PXP&issuer=Holeauth');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(url.length).toBeGreaterThan(100);
  });

  it('forwards options (width) to the underlying encoder', async () => {
    const small = await renderQrDataUrl('payload', { width: 64 });
    const large = await renderQrDataUrl('payload', { width: 512 });
    expect(large.length).toBeGreaterThan(small.length);
  });
});

describe('renderQrBuffer', () => {
  it('returns a PNG Buffer', async () => {
    const buf = await renderQrBuffer('hello');
    expect(Buffer.isBuffer(buf)).toBe(true);
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });
});
