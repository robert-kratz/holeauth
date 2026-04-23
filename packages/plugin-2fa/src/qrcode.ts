import QRCode, { type QRCodeToDataURLOptions, type QRCodeToBufferOptions } from 'qrcode';

/**
 * Render an `otpauth://…` URI (or any string) as a PNG data URL suitable for
 * direct use as an `<img src>` value on the 2FA setup screen.
 *
 * @example
 * ```ts
 * const url = await renderQrDataUrl(setup.otpauthUrl);
 * // <img src={url} alt="Scan with your authenticator" />
 * ```
 */
export function renderQrDataUrl(
  payload: string,
  options?: QRCodeToDataURLOptions,
): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
    ...options,
  });
}

/**
 * Render an `otpauth://…` URI as a raw PNG buffer. Useful when serving the QR
 * code from a route handler (`Content-Type: image/png`) instead of inlining it.
 */
export function renderQrBuffer(
  payload: string,
  options?: QRCodeToBufferOptions,
): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
    ...options,
  });
}
