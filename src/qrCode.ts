import QRCode from 'qrcode';

export interface QrSymbol { size: number; path: string }
export interface QrState {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  content: string;
  error: string;
  symbol: QrSymbol | null;
}
export const EMPTY_QR: QrState = { phase: 'idle', content: '', error: '', symbol: null };
export const QR_TIMEOUT_MS = 15000;
let sequence = 0;

// Use the received string verbatim. No trim, CPID substitution or URL construction.
export function encodeQr(content: string): QrSymbol {
  const { modules } = QRCode.create(content, { errorCorrectionLevel: 'M' });
  const margin = 4;
  const cells: string[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) cells.push(`M${col + margin} ${row + margin}h1v1h-1z`);
    }
  }
  return { size: modules.size + margin * 2, path: cells.join('') };
}

// One owner per connection/station. Re-fetching cancels the previous request.
export class QrCodeRequest {
  private pendingId: string | null = null;
  private timeout?: ReturnType<typeof setTimeout>;
  constructor(private publish: (state: QrState) => void) {}

  private cancel() { clearTimeout(this.timeout); this.pendingId = null; }
  reset() { this.cancel(); this.publish({ ...EMPTY_QR }); }
  fail(message: string) {
    this.cancel();
    this.publish({ phase: 'error', content: '', symbol: null, error: `取得失敗：${message}` });
  }
  request(send: (message: unknown[]) => void) {
    this.cancel();
    const uid = `qr-${Date.now()}-${++sequence}`;
    this.pendingId = uid;
    this.publish({ phase: 'loading', content: '', symbol: null, error: '' });
    this.timeout = setTimeout(() => this.fail('後台回覆逾時（15 秒）'), QR_TIMEOUT_MS);
    try { send([2, uid, 'DataTransfer', { vendorId: 'efaner', messageId: 'GetQrCode' }]); }
    catch (error) { this.fail(error instanceof Error ? error.message : '無法送出請求'); }
  }
  receive(raw: string): boolean {
    let data: any;
    try { data = JSON.parse(raw); } catch { return false; }
    if (!Array.isArray(data) || this.pendingId === null || data[1] !== this.pendingId) return false;
    if (data[0] !== 3 && data[0] !== 4) return false;
    this.cancel();
    if (data[0] === 4) { this.fail(`DataTransfer 錯誤：${String(data[2])}`); return true; }
    const result = data[2];
    if (data.length !== 3 || result?.status !== 'Accepted') {
      this.fail(`後台未接受請求（${String(result?.status ?? '無效回覆')}）`);
      return true;
    }
    if (typeof result.data !== 'string' || result.data.length === 0) {
      this.fail('data 必須是非空字串');
      return true;
    }
    try {
      const symbol = encodeQr(result.data);
      this.publish({ phase: 'ready', content: result.data, symbol, error: '' });
    } catch {
      this.fail('後台內容無法編碼成 QR Code（可能超過容量）');
    }
    return true;
  }
}
