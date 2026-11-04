/**
 * Textos que o fornecedor manda (observações da tarifa, descrições) às vezes citam o nome dele
 * ("Booked and payable by …"). Para o cliente e a agência, a frase inteira com o nome sai.
 */
import { noEmDash } from "./text";

const NAMES =
  /\b(hotel ?beds|go ?global|gogloballtd|best ?buy|ggt|mapro|master ?vacation ?homes?|rate ?hawk|tu ?experien[cz]a|nadio|intermac|hero ?seguros?|esimx|travelapi)\b/i;

export function mentionsSupplier(text: string | null | undefined): boolean {
  return !!text && NAMES.test(text);
}

export function stripSupplierMentions(text: string | null | undefined): string {
  if (!text) return "";
  return noEmDash(text)
    .split(/\n/)
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !NAMES.test(sentence))
        .join(" "),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripSupplierMentionsList(list: string[] | null | undefined): string[] {
  return (list ?? []).map(stripSupplierMentions).filter(Boolean);
}
