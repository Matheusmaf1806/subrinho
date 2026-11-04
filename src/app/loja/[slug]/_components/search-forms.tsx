/** Formulários de busca (GET) — barra segmentada usada na home e no topo de cada categoria. */
import { CalendarDays, MapPin, Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { DestinationField } from "./destination-field";
import { GuestsField } from "./guests-field";

export type SearchDefaults = {
  destino?: string;
  /** Chave do destino escolhido nas sugestões (hotéis). */
  dest?: string;
  /** Idades das crianças (hotéis). */
  idades?: number[];
  data?: string;
  checkin?: string;
  checkout?: string;
  ida?: string;
  volta?: string;
  adultos?: number;
  criancas?: number;
  quartos?: number;
  seniores?: number;
  qtd?: number;
};

const field = "mt-0.5 block w-full min-w-0 border-0 bg-transparent p-0 text-[15px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-muted/70 focus:ring-0";

/** "bar": barra segmentada (topo das categorias); "card": campos em caixas, para o cartão de busca da home. */
export type SearchLayout = "bar" | "card";
type Icon = typeof Search;

/** Caixa de campo do layout "card" (também usada pelos campos de destino com sugestões e de hóspedes). */
export const cardCell = "relative block rounded-2xl border border-line bg-white transition hover:border-ink/30 focus-within:border-ink focus-within:shadow-[0_0_0_1px_var(--color-ink)]";

/** Célula da barra; no celular ganha fundo cinza claro para parecer campo. */
const barCell = "relative block rounded-[1.25rem] px-5 py-3 transition hover:bg-surface focus-within:bg-surface max-sm:bg-surface/70 max-sm:px-4 max-sm:py-2.5";

function Bar({ action, children, className, cols, layout = "bar", submit = "Buscar" }: { action: string; children: ReactNode; className?: string; cols: string; layout?: SearchLayout; submit?: string }) {
  if (layout === "card")
    return (
      <form action={action} className={cn("grid grid-cols-2 gap-3 sm:grid-cols-6", className)}>
        {children}
        <button type="submit" className="col-span-2 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent px-7 text-[16px] font-semibold text-accent-fg transition hover:opacity-90 sm:col-span-6">
          <Search className="h-5 w-5" aria-hidden /> {submit}
        </button>
      </form>
    );
  return (
    <form
      action={action}
      className={cn(
        "grid grid-cols-2 gap-1.5 rounded-[1.75rem] bg-white p-2 ring-1 ring-inset ring-black/[0.06] shadow-[0_30px_80px_-40px_rgba(10,10,11,0.45)] sm:gap-1 sm:items-center",
        cols,
        className,
      )}
    >
      {children}
      <button type="submit" className="col-span-2 inline-flex h-14 items-center justify-center gap-2 rounded-[1.25rem] bg-ink px-7 text-[15px] font-semibold text-white transition hover:bg-ink-2 sm:col-span-1 sm:rounded-full">
        <Search className="h-4 w-4" /> Buscar
      </button>
    </form>
  );
}

/** No celular a barra vira grade de 2 colunas: `half` ocupa meia linha (datas, quantidades). */
function Cell({ label, children, divider = true, layout = "bar", icon: I, span = "", half }: { label: string; children: ReactNode; divider?: boolean; layout?: SearchLayout; icon?: Icon; span?: string; half?: boolean }) {
  if (layout === "card")
    return (
      <label className={cn(cardCell, "py-2.5 pr-4", I ? "pl-11" : "pl-4", span)}>
        {I && <I className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden />}
        <span className="block text-[12px] font-medium text-muted">{label}</span>
        {children}
      </label>
    );
  return (
    <label className={cn(barCell, !half && "col-span-2 sm:col-span-1", divider && "sm:after:absolute sm:after:inset-y-3 sm:after:right-0 sm:after:w-px sm:after:bg-line")}>
      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Destination({ options, value, placeholder, layout, span = "col-span-2 sm:col-span-6" }: { options: string[]; value?: string; placeholder: string; layout?: SearchLayout; span?: string }) {
  return (
    <Cell label="Destino" layout={layout} icon={MapPin} span={span}>
      <input name="destino" list="destinos" defaultValue={value} placeholder={placeholder} className={field} autoComplete="off" />
      <datalist id="destinos">
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </Cell>
  );
}

function NumberCell({ name, label, value, min = 0, max = 20, divider, layout, span, half = true }: { name: string; label: string; value?: number; min?: number; max?: number; divider?: boolean; layout?: SearchLayout; span?: string; half?: boolean }) {
  return (
    <Cell label={label} divider={divider} layout={layout} span={span} half={half}>
      <input type="number" name={name} min={min} max={max} defaultValue={value} inputMode="numeric" className={field} />
    </Cell>
  );
}

function DateCell({ name, label, value, min, layout, span = "sm:col-span-2", full }: { name: string; label: string; value?: string; min?: string; layout?: SearchLayout; span?: string; full?: boolean }) {
  return (
    <Cell label={label} layout={layout} icon={CalendarDays} span={span} half={!full}>
      <input type="date" name={name} defaultValue={value} min={min} required className={field} />
    </Cell>
  );
}

type FormProps = { action: string; d: SearchDefaults; className?: string; layout?: SearchLayout };

export function TicketsSearch({ action, d, destinations, minDate, className, layout }: FormProps & { destinations: string[]; minDate: string }) {
  return (
    <Bar action={action} className={className} layout={layout} submit="Buscar ingressos" cols="sm:grid-cols-[1.8fr_1.1fr_0.7fr_0.7fr_auto]">
      <Destination options={destinations} value={d.destino} placeholder="Roma, Orlando, Paris…" layout={layout} />
      <DateCell name="data" label="Data da visita" value={d.data} min={minDate} layout={layout} span="col-span-2 sm:col-span-4" full />
      <NumberCell name="adultos" label="Adultos" value={d.adultos ?? 2} layout={layout} />
      <NumberCell name="criancas" label="Crianças" value={d.criancas ?? 0} divider={false} layout={layout} />
    </Bar>
  );
}

export function LodgingSearch({ action, d, destinations, minDate, className, houses, layout }: FormProps & { destinations: string[]; minDate: string; houses?: boolean }) {
  if (houses)
    return (
      <Bar action={action} className={className} layout={layout} submit="Buscar casas" cols="sm:grid-cols-[1.6fr_1fr_1fr_0.65fr_0.65fr_auto]">
        <Destination options={destinations} value={d.destino} placeholder="Orlando" layout={layout} />
        <DateCell name="checkin" label="Check-in" value={d.checkin} min={minDate} layout={layout} />
        <DateCell name="checkout" label="Check-out" value={d.checkout} min={minDate} layout={layout} />
        <NumberCell name="adultos" label="Adultos" value={d.adultos ?? 2} min={1} layout={layout} />
        <NumberCell name="criancas" label="Crianças" value={d.criancas ?? 0} divider={false} layout={layout} />
      </Bar>
    );
  // Hotéis: destino com sugestões (todos os destinos dos fornecedores) e hóspedes com idade das crianças.
  return (
    <Bar action={action} className={className} layout={layout} submit="Buscar hotéis" cols="sm:grid-cols-[1.6fr_1fr_1fr_1.25fr_auto]">
      <DestinationField value={d.destino} destKey={d.dest} placeholder="Para onde você vai?" card={layout === "card"} className={layout === "card" ? "col-span-2 sm:col-span-6" : "col-span-2 max-sm:bg-surface/70 max-sm:px-4 max-sm:py-2.5 sm:col-span-1"} />
      <DateCell name="checkin" label="Check-in" value={d.checkin} min={minDate} layout={layout} />
      <DateCell name="checkout" label="Check-out" value={d.checkout} min={minDate} layout={layout} />
      <GuestsField
        key={`${d.quartos}-${d.adultos}-${(d.idades ?? []).join(",")}`}
        rooms={d.quartos ?? 1}
        adults={d.adultos ?? 2}
        ages={(d.idades ?? []).slice(0, d.criancas ?? 0)}
        card={layout === "card"}
        className={layout === "card" ? "col-span-2 sm:col-span-2" : "col-span-2 max-sm:bg-surface/70 sm:col-span-1"}
      />
    </Bar>
  );
}

export function InsuranceSearch({ action, d, regions, minDate, className, layout }: FormProps & { regions: string[]; minDate: string }) {
  return (
    <Bar action={action} className={className} layout={layout} submit="Cotar seguro" cols="sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr_auto]">
      <Cell label="Destino" layout={layout} icon={MapPin} span="col-span-2 sm:col-span-6">
        <select name="destino" defaultValue={d.destino || "Europa"} className={cn(field, "appearance-none")}>
          {regions.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Cell>
      <DateCell name="ida" label="Ida" value={d.ida} min={minDate} layout={layout} />
      <DateCell name="volta" label="Volta" value={d.volta} min={minDate} layout={layout} />
      <NumberCell name="adultos" label="Até 64 anos" value={d.adultos ?? 1} layout={layout} />
      <NumberCell name="seniores" label="65 a 85 anos" value={d.seniores ?? 0} divider={false} layout={layout} />
    </Bar>
  );
}

export function ChipSearch({ action, d, destinations, className, layout }: FormProps & { destinations: string[] }) {
  return (
    <Bar action={action} className={className} layout={layout} submit="Buscar chips" cols="sm:grid-cols-[2fr_0.8fr_auto]">
      <Destination options={destinations} value={d.destino} placeholder="Europa, Estados Unidos, Itália…" layout={layout} span="col-span-2 sm:col-span-5" />
      <NumberCell name="qtd" label="Chips" value={d.qtd ?? 1} min={1} divider={false} layout={layout} span="col-span-2 sm:col-span-1" half={false} />
    </Bar>
  );
}
