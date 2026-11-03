/** Formulários de busca (GET) — usados na home e no topo de cada categoria. */
import { Search } from "lucide-react";
import { buttonClass, cn, Input, Select } from "@/components/ui";

export type SearchDefaults = {
  destino?: string;
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

const box = "grid gap-3 rounded-2xl bg-white p-3 sm:p-4";
const lab = "block text-xs font-extrabold uppercase tracking-wide text-muted mb-1";

function SubmitBtn() {
  return (
    <button type="submit" className={buttonClass("accent", "lg", "w-full gap-2 sm:w-auto")}>
      <Search className="h-4 w-4" /> Buscar
    </button>
  );
}

function Destination({ options, value, placeholder }: { options: string[]; value?: string; placeholder: string }) {
  return (
    <label className="block">
      <span className={lab}>Destino</span>
      <Input name="destino" list="destinos" defaultValue={value} placeholder={placeholder} />
      <datalist id="destinos">
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}

function NumberField({ name, label, value, min = 0, max = 20 }: { name: string; label: string; value?: number; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className={lab}>{label}</span>
      <Input type="number" name={name} min={min} max={max} defaultValue={value} inputMode="numeric" />
    </label>
  );
}

function DateField({ name, label, value, min }: { name: string; label: string; value?: string; min?: string }) {
  return (
    <label className="block">
      <span className={lab}>{label}</span>
      <Input type="date" name={name} defaultValue={value} min={min} required />
    </label>
  );
}

export function TicketsSearch({ action, d, destinations, minDate, className }: { action: string; d: SearchDefaults; destinations: string[]; minDate: string; className?: string }) {
  return (
    <form action={action} className={cn(box, "sm:grid-cols-[2fr_1fr_0.7fr_0.7fr_auto] sm:items-end", className)}>
      <Destination options={destinations} value={d.destino} placeholder="Roma, Orlando, Paris…" />
      <DateField name="data" label="Data da visita" value={d.data} min={minDate} />
      <NumberField name="adultos" label="Adultos" value={d.adultos ?? 2} />
      <NumberField name="criancas" label="Crianças" value={d.criancas ?? 0} />
      <SubmitBtn />
    </form>
  );
}

export function LodgingSearch({ action, d, destinations, minDate, className, houses }: { action: string; d: SearchDefaults; destinations: string[]; minDate: string; className?: string; houses?: boolean }) {
  return (
    <form action={action} className={cn(box, houses ? "sm:grid-cols-[2fr_1fr_1fr_0.7fr_0.7fr_auto]" : "sm:grid-cols-[2fr_1fr_1fr_0.6fr_0.6fr_0.6fr_auto]", "sm:items-end", className)}>
      <Destination options={destinations} value={d.destino} placeholder={houses ? "Orlando" : "Cidade ou hotel"} />
      <DateField name="checkin" label="Check-in" value={d.checkin} min={minDate} />
      <DateField name="checkout" label="Check-out" value={d.checkout} min={minDate} />
      {!houses && <NumberField name="quartos" label="Quartos" value={d.quartos ?? 1} min={1} max={5} />}
      <NumberField name="adultos" label="Adultos" value={d.adultos ?? 2} min={1} />
      <NumberField name="criancas" label="Crianças" value={d.criancas ?? 0} />
      <SubmitBtn />
    </form>
  );
}

export function InsuranceSearch({ action, d, regions, minDate, className }: { action: string; d: SearchDefaults; regions: string[]; minDate: string; className?: string }) {
  return (
    <form action={action} className={cn(box, "sm:grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr_auto] sm:items-end", className)}>
      <label className="block">
        <span className={lab}>Destino</span>
        <Select name="destino" defaultValue={d.destino ?? "Europa"}>
          {regions.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </label>
      <DateField name="ida" label="Ida" value={d.ida} min={minDate} />
      <DateField name="volta" label="Volta" value={d.volta} min={minDate} />
      <NumberField name="adultos" label="Até 64 anos" value={d.adultos ?? 1} />
      <NumberField name="seniores" label="65 a 85 anos" value={d.seniores ?? 0} />
      <SubmitBtn />
    </form>
  );
}

export function ChipSearch({ action, d, destinations, className }: { action: string; d: SearchDefaults; destinations: string[]; className?: string }) {
  return (
    <form action={action} className={cn(box, "sm:grid-cols-[2fr_0.8fr_auto] sm:items-end", className)}>
      <Destination options={destinations} value={d.destino} placeholder="Europa, Estados Unidos, Itália…" />
      <NumberField name="qtd" label="Chips" value={d.qtd ?? 1} min={1} />
      <SubmitBtn />
    </form>
  );
}
