/**
 * Layout dos e-mails: HTML simples em tabela (funciona no Gmail, Outlook e celular) com a marca da loja,
 * mais a versão em texto puro. Todo conteúdo passa por escape: nada vindo do cliente vira HTML.
 */
export type EmailBrand = {
  name: string;
  color: string;
  logoUrl?: string | null;
  siteUrl?: string | null;
  /** Linhas pequenas do rodapé (razão social, CNPJ, contato). */
  footer?: string[];
};

export type EmailContent = {
  preheader?: string;
  title: string;
  paragraphs?: string[];
  rows?: { label: string; value: string }[];
  items?: { title: string; subtitle?: string | null; value?: string | null }[];
  cta?: { label: string; url: string };
  note?: string;
};

export function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#E4113F");
const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : null);

/** Texto escuro ou claro sobre a cor da marca (contraste). */
function onColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#0A0A0B" : "#FFFFFF";
}

export function renderEmail(brand: EmailBrand, c: EmailContent): { html: string; text: string } {
  const color = safeColor(brand.color);
  const logo = safeUrl(brand.logoUrl);
  const site = safeUrl(brand.siteUrl);
  const cta = c.cta && safeUrl(c.cta.url) ? c.cta : null;
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3f3f46">${esc(t).replace(/\n/g, "<br>")}</p>`;
  const rows = c.rows?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border-collapse:collapse">${c.rows
        .map(
          (r) =>
            `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f2;font-size:13px;color:#71717a">${esc(r.label)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #f0f0f2;font-size:14px;font-weight:600;color:#0a0a0b">${esc(r.value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const items = c.items?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border-collapse:collapse">${c.items
        .map(
          (i) =>
            `<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f2"><div style="font-size:15px;font-weight:600;color:#0a0a0b">${esc(i.title)}</div>${
              i.subtitle ? `<div style="margin-top:2px;font-size:13px;color:#71717a">${esc(i.subtitle)}</div>` : ""
            }</td>${i.value ? `<td align="right" valign="top" style="padding:12px 0 12px 12px;border-bottom:1px solid #f0f0f2;font-size:14px;font-weight:600;color:#0a0a0b;white-space:nowrap">${esc(i.value)}</td>` : ""}</tr>`,
        )
        .join("")}</table>`
    : "";
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td style="border-radius:999px;background:${color}"><a href="${esc(cta.url)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:${onColor(color)};text-decoration:none;border-radius:999px">${esc(cta.label)}</a></td></tr></table>`
    : "";
  const header = logo
    ? `<img src="${esc(logo)}" alt="${esc(brand.name)}" height="36" style="display:block;height:36px;max-width:200px;border:0">`
    : `<span style="font-size:18px;font-weight:700;color:#0a0a0b">${esc(brand.name)}</span>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="height:6px;background:${color}"></td></tr>
<tr><td style="padding:26px 28px 6px">${site ? `<a href="${esc(site)}" style="text-decoration:none">${header}</a>` : header}</td></tr>
<tr><td style="padding:14px 28px 10px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0a0a0b">${esc(c.title)}</h1>
${(c.paragraphs ?? []).map(p).join("")}${items}${rows}${button}${c.note ? `<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#71717a">${esc(c.note).replace(/\n/g, "<br>")}</p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid #f0f0f2;font-size:12px;line-height:1.6;color:#a1a1aa">${[brand.name, ...(brand.footer ?? [])].map(esc).join("<br>")}${site ? `<br><a href="${esc(site)}" style="color:#a1a1aa">${esc(site.replace(/^https?:\/\//, ""))}</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    c.title,
    "",
    ...(c.paragraphs ?? []).flatMap((t) => [t, ""]),
    ...(c.items ?? []).map((i) => `- ${i.title}${i.subtitle ? ` (${i.subtitle})` : ""}${i.value ? `: ${i.value}` : ""}`),
    ...(c.items?.length ? [""] : []),
    ...(c.rows ?? []).map((r) => `${r.label}: ${r.value}`),
    ...(c.rows?.length ? [""] : []),
    ...(cta ? [`${cta.label}: ${cta.url}`, ""] : []),
    ...(c.note ? [c.note, ""] : []),
    "--",
    brand.name,
    ...(brand.footer ?? []),
    ...(site ? [site] : []),
  ].join("\n");
  return { html, text };
}
