"use client";

/**
 * Editor de identidade (white-label) com prévia ao vivo da loja.
 * Usado no Painel do Afiliado (Minha loja) e no Painel Subrinho (detalhe do afiliado).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AtSign, ImagePlus, Palette, Type, X } from "lucide-react";
import { contrast, HEX_RE, WHITE } from "@/lib/color";
import { DEFAULT_HERO_TITLE, DEFAULT_TAGLINE, FONT_OPTIONS, MIN_DARK_CONTRAST, monogram, resolveTheme, themeStyle } from "@/lib/theme";
import { ActionForm, SubmitButton, type ActionState } from "./ui-client";
import { cn, inputClass } from "./ui";

export type BrandingInitial = {
  name: string;
  brandColor: string;
  darkColor: string;
  fontFamily: string;
  logoUrl: string | null;
  logoOnDarkUrl: string | null;
  faviconUrl: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  heroImage2Url: string | null;
  tagline: string | null;
  instagram: string | null;
  showPoweredBy: boolean;
};

export type Preset = { key: string; id: string; thumb: string; full: string };

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const SWATCHES = ["#E4113F", "#FF5A1F", "#FFC531", "#16A34A", "#0F766E", "#0EA5E9", "#2335E8", "#7C3AED", "#DB2777", "#111111"];
const DARKS = ["#0A0A0B", "#10214A", "#0B2B26", "#2A0A1F", "#1F1A17", "#111827"];

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-6 ring-1 ring-inset ring-black/[0.06]">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-ink [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em]">{title}</h3>
          {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

const lab = "mb-2 block text-[13px] font-medium text-muted";

function ColorField({ name, label, value, onChange, swatches, warn, disabled }: { name: string; label: string; value: string; onChange: (v: string) => void; swatches: string[]; warn?: string | null; disabled?: boolean }) {
  return (
    <div>
      <span className={lab}>{label}</span>
      <div className="flex items-center gap-2">
        <label className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-2xl ring-1 ring-inset ring-black/10" style={{ background: HEX_RE.test(value) ? value : "#fff" }}>
          <input type="color" value={HEX_RE.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} disabled={disabled} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label} />
        </label>
        <input name={name} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} disabled={disabled} maxLength={7} className={cn(inputClass, "font-mono uppercase")} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {swatches.map((c) => (
          <button key={c} type="button" disabled={disabled} onClick={() => onChange(c)} className={cn("h-7 w-7 rounded-full ring-2 ring-offset-2 transition", value === c ? "ring-ink" : "ring-transparent hover:ring-line")} style={{ background: c }} aria-label={`Usar ${c}`} />
        ))}
      </div>
      {warn && <p className="mt-2 text-xs font-semibold text-red-600">{warn}</p>}
    </div>
  );
}

function ImageField({
  field,
  label,
  hint,
  current,
  disabled,
  presets,
  preset,
  onPreview,
  dark,
}: {
  field: string;
  label: string;
  hint?: string;
  current: string | null;
  disabled?: boolean;
  presets?: Preset[];
  preset?: string | null;
  onPreview: (url: string | null) => void;
  dark?: boolean;
}) {
  const [url, setUrl] = useState(current && !preset ? current : "");
  const [chosen, setChosen] = useState<string | null>(preset ?? null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const shown = remove ? null : fileUrl ?? (chosen ? presets?.find((p) => p.key === chosen)?.full ?? null : url || null);
  useEffect(() => onPreview(shown), [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div className={cn("grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-2xl ring-1 ring-inset ring-black/10", dark ? "bg-ink" : "bg-surface")}>
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className={cn("h-full w-full", presets ? "object-cover" : "object-contain p-2")} />
          ) : (
            <ImagePlus className={cn("h-5 w-5", dark ? "text-white/40" : "text-muted")} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{label}</p>
          {hint && <p className="text-xs text-muted">{hint}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className={cn("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-semibold text-white", disabled && "pointer-events-none opacity-40")}>
              Enviar arquivo
              <input
                type="file"
                name={`${field}File`}
                accept="image/png,image/jpeg,image/webp"
                disabled={disabled}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setFileUrl(f ? URL.createObjectURL(f) : null);
                  setRemove(false);
                }}
              />
            </label>
            {(current || fileUrl || chosen) && (
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-surface px-3 text-[13px] font-semibold text-muted">
                <input type="checkbox" name={`${field}Remove`} checked={remove} onChange={(e) => setRemove(e.target.checked)} disabled={disabled} className="h-4 w-4 accent-ink" />
                <X className="h-3.5 w-3.5" /> Remover
              </label>
            )}
          </div>
        </div>
      </div>
      {presets && (
        <div>
          <span className={lab}>Ou escolha uma foto pronta</span>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setChosen(p.key);
                  setUrl("");
                  setFileUrl(null);
                  setRemove(false);
                }}
                className={cn("h-16 w-14 shrink-0 overflow-hidden rounded-xl ring-2 ring-offset-1 transition", chosen === p.key ? "ring-ink" : "ring-transparent hover:ring-line")}
                aria-label={`Usar foto ${p.key}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-[13px] font-semibold text-muted">Usar um link (https://)</summary>
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setChosen(null);
          }}
          disabled={disabled}
          placeholder="https://…"
          className={cn(inputClass, "mt-2")}
        />
      </details>
      <input type="hidden" name={field} value={chosen ? `preset:${chosen}` : url} />
    </div>
  );
}

export function BrandingEditor({
  action,
  initial,
  presets,
  readOnly,
  allowPoweredBy,
  hidden,
}: {
  action: Action;
  initial: BrandingInitial;
  presets: Preset[];
  readOnly?: boolean;
  allowPoweredBy?: boolean;
  hidden?: Record<string, string>;
}) {
  const [brand, setBrand] = useState(initial.brandColor);
  const [dark, setDark] = useState(initial.darkColor);
  const [font, setFont] = useState(initial.fontFamily);
  const [heroTitle, setHeroTitle] = useState(initial.heroTitle ?? "");
  const [heroSubtitle, setHeroSubtitle] = useState(initial.heroSubtitle ?? "");
  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [instagram, setInstagram] = useState(initial.instagram ?? "");
  const [powered, setPowered] = useState(initial.showPoweredBy);
  const [logo, setLogo] = useState<string | null>(initial.logoUrl);
  const [logoDark, setLogoDark] = useState<string | null>(initial.logoOnDarkUrl);
  const [hero1, setHero1] = useState<string | null>(initial.heroImageUrl);
  const [hero2, setHero2] = useState<string | null>(initial.heroImage2Url);
  // Após salvar, remonta os campos de imagem (limpa arquivos escolhidos e lê as URLs novas).
  const [fileKey, setFileKey] = useState(0);

  const presetOf = (url: string | null) => (url ? presets.find((p) => url.includes(p.id))?.key ?? null : null);
  const darkOk = HEX_RE.test(dark) && contrast(dark, WHITE) >= MIN_DARK_CONTRAST;
  const t = useMemo(() => resolveTheme({ brandColor: HEX_RE.test(brand) ? brand : undefined, darkColor: darkOk ? dark : undefined, fontFamily: font }), [brand, dark, font, darkOk]);
  const style = themeStyle({ brandColor: t.brand, darkColor: t.ink, fontFamily: font });
  const lines = (heroTitle.trim() || DEFAULT_HERO_TITLE).split(/\r?\n/).filter(Boolean);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
      <ActionForm action={action} className="space-y-4" onSuccess={() => setFileKey((k) => k + 1)}>
        {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <fieldset disabled={readOnly} className="space-y-4">
          <Section icon={<ImagePlus />} title="Logo e ícone" hint="PNG, JPG ou WEBP. Sem logo, a loja usa as iniciais da agência na cor principal. Fotos grandes: envie uma de cada vez.">
            <div className="grid gap-6 lg:grid-cols-2">
              <ImageField key={`logo-${fileKey}`} field="logoUrl" label="Logo (fundo claro)" hint="Topo da loja — até 1 MB" current={initial.logoUrl} onPreview={setLogo} disabled={readOnly} />
              <ImageField key={`logoDark-${fileKey}`} field="logoOnDarkUrl" label="Logo (fundo escuro)" hint="Rodapé e painel — até 1 MB" current={initial.logoOnDarkUrl} onPreview={setLogoDark} disabled={readOnly} dark />
              <ImageField key={`fav-${fileKey}`} field="faviconUrl" label="Ícone da aba (favicon)" hint="Quadrado, até 500 KB" current={initial.faviconUrl} onPreview={() => {}} disabled={readOnly} />
            </div>
          </Section>

          <Section icon={<Palette />} title="Cores" hint="O texto sobre a cor principal fica branco ou preto automaticamente, para sempre ter leitura.">
            <div className="grid gap-6 sm:grid-cols-2">
              <ColorField name="brandColor" label="Cor principal" value={brand} onChange={setBrand} swatches={SWATCHES} disabled={readOnly} warn={HEX_RE.test(brand) ? null : "Use o formato #RRGGBB"} />
              <ColorField
                name="darkColor"
                label="Cor escura (blocos, botões e textos)"
                value={dark}
                onChange={setDark}
                swatches={DARKS}
                disabled={readOnly}
                warn={darkOk ? null : "Escolha uma cor mais escura (contraste mínimo 7:1 com o branco)"}
              />
            </div>
          </Section>

          <Section icon={<Type />} title="Fonte">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {FONT_OPTIONS.map((f) => (
                <label key={f.id} className={cn("cursor-pointer rounded-2xl p-4 transition", font === f.id ? "bg-ink text-white" : "bg-surface hover:bg-surface-2")}>
                  <input type="radio" name="fontFamily" value={f.id} checked={font === f.id} onChange={() => setFont(f.id)} className="sr-only" />
                  <span className="block text-[2rem] font-semibold leading-none" style={{ fontFamily: f.family, letterSpacing: f.tracking }}>
                    Aa
                  </span>
                  <span className="mt-3 block text-sm font-semibold">{f.label}</span>
                  <span className={cn("block text-xs", font === f.id ? "text-white/60" : "text-muted")}>{f.sample}</span>
                </label>
              ))}
            </div>
          </Section>

          <Section icon={<ImagePlus />} title="Página inicial" hint="Título grande, subtítulo e fotos do topo da loja.">
            <div className="grid gap-4">
              <label className="block">
                <span className={lab}>Título (até 3 linhas)</span>
                <textarea name="heroTitle" rows={3} value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} placeholder={DEFAULT_HERO_TITLE} maxLength={80} className={cn(inputClass, "h-auto py-3 text-lg font-semibold")} />
              </label>
              <label className="block">
                <span className={lab}>Subtítulo (opcional)</span>
                <textarea name="heroSubtitle" rows={2} value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} maxLength={220} placeholder="Opcional — aparece abaixo do título, no computador" className={cn(inputClass, "h-auto py-3")} />
              </label>
              <div className="grid gap-6 lg:grid-cols-2">
                <ImageField key={`h1-${fileKey}`} field="heroImageUrl" label="Foto principal" hint="Vertical (aparece em arco) — até 3 MB" current={initial.heroImageUrl} presets={presets} preset={presetOf(initial.heroImageUrl)} onPreview={setHero1} disabled={readOnly} />
                <ImageField key={`h2-${fileKey}`} field="heroImage2Url" label="Foto secundária" hint="Quadrada (aparece em círculo) — até 3 MB" current={initial.heroImage2Url} presets={presets} preset={presetOf(initial.heroImage2Url)} onPreview={setHero2} disabled={readOnly} />
              </div>
            </div>
          </Section>

          <Section icon={<AtSign />} title="Rodapé e redes">
            <div className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
              <label className="block">
                <span className={lab}>Frase do rodapé</span>
                <input name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120} placeholder={DEFAULT_TAGLINE} className={inputClass} />
              </label>
              <label className="block">
                <span className={lab}>Instagram</span>
                <input name="instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} maxLength={31} placeholder="@suaagencia" className={inputClass} />
              </label>
            </div>
            {allowPoweredBy ? (
              <label className="mt-4 flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-[15px] font-semibold">
                <input type="checkbox" name="showPoweredBy" checked={powered} onChange={(e) => setPowered(e.target.checked)} className="h-5 w-5 accent-ink" />
                Mostrar “tecnologia Subrinho” na loja
              </label>
            ) : (
              <p className="mt-4 text-xs text-muted">“Tecnologia Subrinho” na loja: {initial.showPoweredBy ? "exibido" : "oculto"} (definido pela Subrinho).</p>
            )}
          </Section>
        </fieldset>
        {!readOnly && (
          <div className="sticky bottom-4 z-10 flex justify-end">
            <SubmitButton size="lg" variant="dark" pendingText="Salvando…" disabled={!darkOk || !HEX_RE.test(brand)} className="shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)]">
              Salvar identidade da loja
            </SubmitButton>
          </div>
        )}
      </ActionForm>

      {/* ───────── Prévia ao vivo ───────── */}
      <aside className="xl:sticky xl:top-6 xl:self-start">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Prévia da loja</p>
        <div style={style} className="overflow-hidden rounded-[1.75rem] bg-white font-sans text-ink shadow-[0_40px_100px_-50px_rgba(0,0,0,0.5)] ring-1 ring-black/[0.06]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-7 w-auto max-w-[120px] object-contain" />
              ) : (
                <>
                  <span className="grid h-7 w-7 place-items-center rounded-[30%] bg-brand text-[11px] font-semibold text-brand-fg">{monogram(initial.name)}</span>
                  <span className="truncate text-sm font-semibold tracking-[-0.03em]">{initial.name}</span>
                </>
              )}
            </div>
            <span className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-white">Carrinho</span>
          </div>
          <div className="relative overflow-hidden px-4 pb-4 pt-3">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-50" />
            <div className="pointer-events-none absolute -right-6 top-14 h-36 w-36 rounded-full bg-brand-100" />
            <div className="relative grid grid-cols-[1.45fr_1fr] items-center gap-3">
              <div>
                <p className="text-[1.05rem] font-semibold leading-[1.05] tracking-[-0.04em]">
                  {lines.map((l, i) => (
                    <span key={i} className={cn(lines.length > 1 && i === lines.length - 1 && "text-brand-ink")}>
                      {i > 0 && " "}
                      {l}
                    </span>
                  ))}
                </p>
                <div className="mt-2 rounded-xl bg-white p-2 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.06]">
                  <div className="flex gap-2 border-b border-line pb-1 text-[8px] font-semibold">
                    <span className="border-b-2 border-brand pb-0.5">Ingressos</span>
                    <span className="text-muted">Hotéis</span>
                    <span className="text-muted">Casas</span>
                  </div>
                  <div className="mt-1.5 rounded-md border border-line px-1.5 py-1 text-[8px] text-muted">Destino</div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <div className="rounded-md border border-line px-1.5 py-1 text-[8px] text-muted">Data</div>
                    <div className="rounded-md border border-line px-1.5 py-1 text-[8px] text-muted">Pessoas</div>
                  </div>
                  <div className="mt-1 rounded-md bg-brand py-1 text-center text-[8px] font-semibold text-brand-fg">Buscar</div>
                </div>
              </div>
              <div className="relative h-36">
                <div className="absolute right-0 top-0 h-32 w-[78%] overflow-hidden rounded-b-xl rounded-t-[3rem] bg-black/10 ring-2 ring-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {hero1 && <img src={hero1} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="absolute bottom-0 left-0 h-14 w-14 overflow-hidden rounded-full bg-black/10 ring-2 ring-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {hero2 && <img src={hero2} alt="" className="h-full w-full object-cover" />}
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-2">
            <div className="rounded-[1.25rem] bg-ink p-4 text-white">
              <p className="text-[2.4rem] font-semibold leading-none tracking-[-0.06em]">
                10x<span className="text-brand-ink">.</span>
              </p>
              <p className="mt-1 text-[11px] text-white/60">sem juros</p>
            </div>
            <div className="rounded-[1.25rem] bg-surface p-4">
              <p className="text-[11px] text-muted">a partir de</p>
              <p className="text-lg font-semibold tracking-[-0.03em]">
                R$ 151,86 <span className="text-[11px] text-brand-ink">Pix</span>
              </p>
              <span className="mt-2 inline-flex rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-brand-fg">Adicionar</span>
            </div>
          </div>
          <div className="m-2 rounded-[1.25rem] bg-ink p-4 text-white">
            {logoDark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoDark} alt="" className="mb-3 h-6 w-auto max-w-[120px] object-contain" />
            ) : null}
            <p className="text-sm font-semibold leading-tight tracking-[-0.02em]">{tagline.trim() || DEFAULT_TAGLINE}</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-[1.6rem] font-semibold leading-none tracking-[-0.05em]">{initial.name}</p>
              {(allowPoweredBy ? powered : initial.showPoweredBy) && <p className="text-[9px] text-white/40">tecnologia Subrinho</p>}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: t.brand }} /> texto sobre a cor: {t.brandFg === "#FFFFFF" ? "branco" : "preto"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">fonte: {FONT_OPTIONS.find((f) => f.id === font)?.label}</span>
        </div>
      </aside>
    </div>
  );
}
