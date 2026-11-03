"use client";

/**
 * Campos controlados que sobrevivem ao reset automático do React 19.
 *
 * Após cada Server Action enviada por <form action={...}>, o React chama `form.reset()`.
 * Inputs de texto controlados são preservados (o React sincroniza `defaultValue`), mas
 * checkbox/radio e <select> voltam ao estado do primeiro render (`defaultChecked`/`defaultSelected`),
 * ficando diferentes do estado do componente — e o reenvio mandaria valores errados.
 * Estes componentes mantêm os valores "padrão" do DOM iguais ao estado atual.
 */
import { useEffect, useRef, type ComponentProps } from "react";
import { Select } from "@/components/ui";

export function SyncedCheckable({ checked, ...props }: Omit<ComponentProps<"input">, "checked" | "ref"> & { checked: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.defaultChecked = checked;
  }, [checked]);
  return <input ref={ref} checked={checked} {...props} />;
}

export function SyncedSelect({ value, children, ...props }: Omit<ComponentProps<"select">, "value" | "ref"> & { value: string }) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    for (const o of Array.from(ref.current?.options ?? [])) o.defaultSelected = o.value === value;
  }, [value]);
  return (
    <Select ref={ref} value={value} {...props}>
      {children}
    </Select>
  );
}
