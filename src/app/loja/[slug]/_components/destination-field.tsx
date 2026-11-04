"use client";

import { MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/components/ui";

type Suggestion = { key: string; label: string; detail: string };

const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Campo "Destino" com sugestões (destinos populares em português + cidades dos fornecedores).
 * Envia `destino` (texto) e `dest` (chave do destino escolhido). Se o cliente só digitar, o servidor
 * resolve o texto. Com `options` (ingressos, casas, seguro), mostra primeiro as cidades do fornecedor,
 * completa com as sugestões gerais e envia só o texto.
 */
export function DestinationField({ value, destKey, placeholder, className, options, general = true }: { value?: string; destKey?: string; placeholder: string; className?: string; options?: string[]; general?: boolean }) {
  const [text, setText] = useState(value ?? "");
  const [key, setKey] = useState(destKey ?? "");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    // com lista do fornecedor (ingressos, casas, seguro): as cidades dele primeiro, já na hora; depois
    // completa com as sugestões gerais (a lista dele pode vir curta ou vazia)
    const q = fold(text);
    const mine: Suggestion[] = (options ?? [])
      .filter((o) => !q || fold(o).includes(q))
      .sort((a, b) => Number(!fold(a).startsWith(q)) - Number(!fold(b).startsWith(q)))
      .slice(0, 8)
      .map((o) => ({ key: o, label: o, detail: "" }));
    if (options) {
      setItems(mine);
      setActive(-1);
      // regiões/países (chip, seguro) não combinam com as cidades das sugestões gerais
      if (!general) return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/public/destinos?q=${encodeURIComponent(text)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d: { items?: Suggestion[] }) => {
          const general = d.items ?? [];
          if (options) {
            const seen = new Set(mine.map((m) => fold(m.label)));
            setItems([...mine, ...general.filter((g) => !seen.has(fold(g.label)))].slice(0, 8));
          } else setItems(general);
          setActive(-1);
        })
        .catch(() => {});
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text, open, options, general]);

  const choose = (s: Suggestion) => {
    setText(s.label);
    setKey(s.key);
    setOpen(false);
  };

  return (
    // o visual da célula (fundo, espaçamento, divisória) vem da barra de busca em `className`
    <div className={cn("relative", className)}>
      <label htmlFor={`${listId}-input`} className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Destino
      </label>
      <input
        ref={inputRef}
        id={`${listId}-input`}
        name="destino"
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        required={!options}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setKey("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            choose(items[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className="mt-0.5 block w-full min-w-0 border-0 bg-transparent p-0 text-[15px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-muted/70 focus:ring-0"
      />
      {!options && <input type="hidden" name="dest" value={key} />}
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-auto rounded-2xl bg-white p-1.5 shadow-[0_24px_60px_-20px_rgba(10,10,11,0.35)] ring-1 ring-black/[0.06] sm:right-auto sm:min-w-[22rem]">
          {items.map((s, i) => (
            <li
              key={s.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5", i === active ? "bg-surface" : "")}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-ink">
                <MapPin className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-ink">{s.label}</span>
                {s.detail && <span className="block truncate text-[13px] text-muted">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
