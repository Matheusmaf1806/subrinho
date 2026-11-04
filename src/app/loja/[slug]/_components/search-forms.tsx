/** Formulários de busca (GET) — barra segmentada usada na home e no topo de cada categoria. */
import { Search } from "lucide-react";
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

function Bar({ action, children, className, cols }: { action: string; children: ReactNode; className?: string; cols: string }) {
  return (
    <form
      action={action}
      className={cn(
        "grid gap-1 rounded-[1.75rem] bg-white p-2 ring-1 ring-inset ring-black/[0.06] shadow-[0_30px_80px_-40px_rgba(10,10,11,0.45)] sm:items-center",
        cols,
        className,
      )}
    >
      {children}
      <button type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-[1.25rem] bg-ink px-7 text-[15px] font-semibold text-white transition hover:bg-ink-2 sm:rounded-full">
        <Search className="h-4 w-4" /> Buscar
      </button>
    </form>
  );
}

function Cell({ label, children, divider = true }: { label: string; children: ReactNode; divider?: boolean }) {
  return (
    <label className={cn("relative block rounded-[1.25rem] px-5 py-3 transition hover:bg-surface focus-within:bg-surface", divider && "sm:after:absolute sm:after:inset-y-3 sm:after:right-0 sm:after:w-px sm:after:bg-line")}>
      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Destination({ options, value, placeholder }: { options: string[]; value?: string; placeholder: string }) {
  return (
    <Cell label="Destino">
      <input name="destino" list="destinos" defaultValue={value} placeholder={placeholder} className={field} autoComplete="off" />
      <datalist id="destinos">
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </Cell>
  );
}

function NumberCell({ name, label, value, min = 0, max = 20, divider }: { name: string; label: string; value?: number; min?: number; max?: number; divider?: boolean }) {
  return (
    <Cell label={label} divider={divider}>
      <input type="number" name={name} min={min} max={max} defaultValue={value} inputMode="numeric" className={field} />
    </Cell>
  );
}

function DateCell({ name, label, value, min }: { name: string; label: string; value?: string; min?: string }) {
  return (
    <Cell label={label}>
      <input type="date" name={name} defaultValue={value} min={min} required className={field} />
    </Cell>
  );
}

export function TicketsSearch({ action, d, destinations, minDate, className }: { action: string; d: SearchDefaults; destinations: string[]; minDate: string; className?: string }) {
  return (
    <Bar action={action} className={className} cols="sm:grid-cols-[1.8fr_1.1fr_0.7fr_0.7fr_auto]">
      <Destination options={destinations} value={d.destino} placeholder="Roma, Orlando, Paris…" />
      <DateCell name="data" label="Data da visita" value={d.data} min={minDate} />
      <NumberCell name="adultos" label="Adultos" value={d.adultos ?? 2} />
      <NumberCell name="criancas" label="Crianças" value={d.criancas ?? 0} divider={false} />
    </Bar>
  );
}

export function LodgingSearch({ action, d, destinations, minDate, className, houses }: { action: string; d: SearchDefaults; destinations: string[]; minDate: string; className?: string; houses?: boolean }) {
  if (houses)
    return (
      <Bar action={action} className={className} cols="sm:grid-cols-[1.6fr_1fr_1fr_0.65fr_0.65fr_auto]">
        <Destination options={destinations} value={d.destino} placeholder="Orlando" />
        <DateCell name="checkin" label="Check-in" value={d.checkin} min={minDate} />
        <DateCell name="checkout" label="Check-out" value={d.checkout} min={minDate} />
        <NumberCell name="adultos" label="Adultos" value={d.adultos ?? 2} min={1} />
        <NumberCell name="criancas" label="Crianças" value={d.criancas ?? 0} divider={false} />
      </Bar>
    );
  // Hotéis: destino com sugestões (todos os destinos dos fornecedores) e hóspedes com idade das crianças.
  return (
    <Bar action={action} className={className} cols="sm:grid-cols-[1.6fr_1fr_1fr_1.25fr_auto]">
      <DestinationField value={d.destino} destKey={d.dest} placeholder="Para onde você vai?" />
      <DateCell name="checkin" label="Check-in" value={d.checkin} min={minDate} />
      <DateCell name="checkout" label="Check-out" value={d.checkout} min={minDate} />
      <GuestsField key={`${d.quartos}-${d.adultos}-${(d.idades ?? []).join(",")}`} rooms={d.quartos ?? 1} adults={d.adultos ?? 2} ages={(d.idades ?? []).slice(0, d.criancas ?? 0)} />
    </Bar>
  );
}

export function InsuranceSearch({ action, d, regions, minDate, className }: { action: string; d: SearchDefaults; regions: string[]; minDate: string; className?: string }) {
  return (
    <Bar action={action} className={className} cols="sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr_auto]">
      <Cell label="Destino">
        <select name="destino" defaultValue={d.destino || "Europa"} className={cn(field, "appearance-none")}>
          {regions.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Cell>
      <DateCell name="ida" label="Ida" value={d.ida} min={minDate} />
      <DateCell name="volta" label="Volta" value={d.volta} min={minDate} />
      <NumberCell name="adultos" label="Até 64 anos" value={d.adultos ?? 1} />
      <NumberCell name="seniores" label="65 a 85 anos" value={d.seniores ?? 0} divider={false} />
    </Bar>
  );
}

export function ChipSearch({ action, d, destinations, className }: { action: string; d: SearchDefaults; destinations: string[]; className?: string }) {
  return (
    <Bar action={action} className={className} cols="sm:grid-cols-[2fr_0.8fr_auto]">
      <Destination options={destinations} value={d.destino} placeholder="Europa, Estados Unidos, Itália…" />
      <NumberCell name="qtd" label="Chips" value={d.qtd ?? 1} min={1} divider={false} />
    </Bar>
  );
}
