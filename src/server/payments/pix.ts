/** Gera o "Pix copia e cola" (BR Code / EMV MPM) estático com valor e txid. */
function tlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function clean(s: string, max: number) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .slice(0, max);
}

export function buildPixBrCode(opts: { key: string; amount: string; merchantName: string; merchantCity: string; txid: string }) {
  const mai = tlv("00", "br.gov.bcb.pix") + tlv("01", opts.key);
  const txid = opts.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const payload =
    tlv("00", "01") +
    tlv("26", mai) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", opts.amount) +
    tlv("58", "BR") +
    tlv("59", clean(opts.merchantName, 25)) +
    tlv("60", clean(opts.merchantCity, 15)) +
    tlv("62", tlv("05", txid)) +
    "6304";
  return payload + crc16(payload);
}
