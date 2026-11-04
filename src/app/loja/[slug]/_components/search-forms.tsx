/** Formulários de busca (GET) — barra segmentada usada na home e no topo de cada categoria. */
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { DateInput, DateRange } from "@/components/date-picker";
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
  /** Chip: dias de viagem (0 = não informado), para recomendar o plano. */
  dias?: number;
};

const field = "mt-0.5 block w-full min-w-0 border-0 bg-transparent p-0 text-[15px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-muted/70 focus:ring-0";

/** Célula da barra; no celular ganha fundo cinza claro para parecer campo (também usada pelos campos de destino e hóspedes). */
export const barCell = "relative block rounded-[1.25rem] px-5 py-3 transition hover:bg-surface focus-within:bg-surface max-sm:bg-surface/70 max-sm:px-4 max-sm:py-2.5";
const divided = "sm:after:absolute sm:after:inset-y-3 sm:after:right-0 sm:after:w-px sm:after:bg-line";

/** Barra segmentada; no celular vira grade de 2 colunas (destino e botão na linha toda). */
function Bar({ action, children, className, cols }: { action: string; children: ReactNode; className?: string; cols: string }) {
  return (
    <form action={action} className={cn("grid grid-cols-2 gap-1.5 rounded-[1.75rem] bg-white p-2 ring-1 ring-inset ring-black/[0.06] shadow-[0_30px_80px_-40px_rgba(10,10,11,0.45)] sm:items-center sm:gap-1", cols, className)}>
      {children}
      <button type="submit" className="col-span-2 inline-flex h-14 items-center justify-center gap-2 rounded-[1.25rem] bg-ink px-7 text-[15px] font-semibold text-white transition hover:bg-ink-2 sm:col-span-1 sm:rounded-full">
        <Search className="h-4 w-4" /> Buscar
      </button>
    </form>
  );
}

/** `half`: no celular ocupa meia linha (datas, quantidades). */
function Cell({ label, children, divider = true, half }: { label: string; children: ReactNode; divider?: boolean; half?: boolean }) {
  return (
    <label className={cn(barCell, !half && "col-span-2 sm:col-span-1", divider && divided)}>
      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Destination({ options, value, placeholder, general }: { options: string[]; value?: string; placeholder: string; general?: boolean }) {
  return <DestinationField options={options} general={general} value={value} placeholder={placeholder} className={cn(barCell, divided, "col-span-2 sm:col-span-1")} />;
}

function NumberCell({ name, label, value, min = 0, max = 20, divider, half = true, placeholder }: { name: string; label: string; value?: number; min?: number; max?: number; divider?: boolean; half?: boolean; placeholder?: string }) {
  return (
    <Cell label={label} divider={divider} half={half}>
      <input type="number" name={name} min={min} max={max} defaultValue={value || undefined} placeholder={placeholder} inputMode="numeric" className={field} />
    </Cell>
  );
}

/** Data única na barra (calendário próprio, em português). */
function DateCell({ name, label, value, min, full }: { name: string; label: string; value?: string; min?: string; full?: boolean }) {
  return <DateInput name={name} label={label} defaultValue={value} min={min} variant="bar" className={cn(full && "col-span-2 sm:col-span-1", divided)} />;
}

/** Duas datas (check-in/check-out, ida/volta) num calendário só, cada uma na sua célula. */
function DateRangeCells({ names, labels, values, min, unit }: { names: [string, string]; labels: [string, string]; values: [string | undefined, string | undefined]; min?: string; unit?: "noite" | "dia" }) {
  return <DateRange names={names} labels={labels} defaultValues={values} min={min} variant="bar" unit={unit} cellClassName={[divided, divided]} />;
}

type FormProps = { action: string; d: SearchDefaults; className?: string };

export function TicketsSearch({ action, d, destinations, minDate, className }: FormProps & { destinations: string[]; minDate: string }) {
  return (
    <Bar action={action} className={className} cols="sm:grid-cols-[1.8fr_1.1fr_0.7fr_0.7fr_auto]">
      <Destination options={destinations} value={d.destino} placeholder="Roma, Orlando, Paris…" />
      <DateCell name="data" label="Data da visita" value={d.data} min={minDate} full />
      <NumberCell name="adultos" label="Adultos" value={d.adultos ?? 2} />
      <NumberCell name="criancas" label="Crianças" value={d.criancas ?? 0} divider={false} />
    </Bar>
  );
}

export function LodgingSearch({ action, d, destinations, minDate, className, houses }: FormProps & { destinations: string[]; minDate: string; houses?: boolean }) {
  if (houses)
    return (
      <Bar action={action} className={className} cols="sm:grid-cols-[1.6fr_1fr_1fr_0.65fr_0.65fr_auto]">
        <Destination options={destinations} value={d.destino} placeholder="Orlando" />
        <DateRangeCells names={["checkin", "checkout"]} labels={["Check-in", "Check-out"]} values={[d.checkin, d.checkout]} min={minDate} />
        <NumberCell name="adultos" label="Adultos" value={d.adultos ?? 2} min={1} />
        <NumberCell name="criancas" label="Crianças" value={d.criancas ?? 0} divider={false} />
      </Bar>
    );
  // Hotéis: destino com sugestões (todos os destinos dos fornecedores) e hóspedes com idade das crianças.
  return (
    <Bar action={action} className={className} cols="sm:grid-cols-[1.6fr_1fr_1fr_1.25fr_auto]">
      <DestinationField value={d.destino} destKey={d.dest} placeholder="Para onde você vai?" className={cn(barCell, divided, "col-span-2 sm:col-span-1")} />
      <DateRangeCells names={["checkin", "checkout"]} labels={["Check-in", "Check-out"]} values={[d.checkin, d.checkout]} min={minDate} />
      <GuestsField
        key={`${d.quartos}-${d.adultos}-${(d.idades ?? []).join(",")}`}
        rooms={d.quartos ?? 1}
        adults={d.adultos ?? 2}
        ages={(d.idades ?? []).slice(0, d.criancas ?? 0)}
        className="col-span-2 max-sm:bg-surface/70 sm:col-span-1"
      />
    </Bar>
  );
}

export function InsuranceSearch({ action, d, regions, minDate, className }: FormProps & { regions: string[]; minDate: string }) {
  return (
    <Bar action={action} className={className} cols="sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr_auto]">
      <Cell label="Destino">
        <select name="destino" defaultValue={d.destino || "Europa"} className={cn(field, "appearance-none")}>
          {regions.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Cell>
      <DateRangeCells names={["ida", "volta"]} labels={["Ida", "Volta"]} values={[d.ida, d.volta]} min={minDate} unit="dia" />
      <NumberCell name="adultos" label="Até 64 anos" value={d.adultos ?? 1} />
      <NumberCell name="seniores" label="65 a 85 anos" value={d.seniores ?? 0} divider={false} />
    </Bar>
  );
}

export function ChipSearch({ action, d, destinations, className }: FormProps & { destinations: string[] }) {
  return (
    <Bar action={action} className={className} cols="sm:grid-cols-[2fr_0.9fr_0.8fr_auto]">
      <Destination options={destinations} value={d.destino} placeholder="Itália, Europa, Paris, Orlando…" general={false} />
      <NumberCell name="dias" label="Dias de viagem" value={d.dias} min={1} max={180} placeholder="Ex.: 10" />
      <NumberCell name="qtd" label="Chips" value={d.qtd ?? 1} min={1} divider={false} />
    </Bar>
  );
}
