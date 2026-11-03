import type { Category } from "@/server/db/schema";
import { cn } from "@/components/ui";
import { categoryIcon } from "./category";

const GRADIENTS = [
  "from-[#E4113F] to-[#9D0A2A]",
  "from-[#F0506E] to-[#C40D35]",
  "from-[#4D0A33] to-[#E4113F]",
  "from-[#C40D35] to-[#360221]",
  "from-[#FF7A90] to-[#E4113F]",
];

function pick(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

/** Capa gráfica (sem foto) — cada produto ganha um gradiente da marca. */
export function Cover({ title, location, category, className, big }: { title: string; location?: string | null; category: Category; className?: string; big?: boolean }) {
  const Icon = categoryIcon(category);
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br text-white", pick(title), className)}>
      <svg viewBox="0 0 400 200" className="absolute inset-0 h-full w-full opacity-25" preserveAspectRatio="none" aria-hidden>
        <path d="M-10 170 C 90 160, 200 130, 290 60" stroke="white" strokeWidth="2" strokeDasharray="6 8" fill="none" />
        <circle cx="330" cy="40" r="70" fill="white" opacity="0.15" />
      </svg>
      <Icon className={cn("absolute text-white/90", big ? "right-6 bottom-6 h-16 w-16" : "right-4 bottom-4 h-10 w-10")} strokeWidth={1.6} />
      {location && (
        <span className={cn("absolute left-4 top-4 rounded-full bg-white/20 px-2.5 py-1 font-bold backdrop-blur", big ? "text-sm" : "text-xs")}>{location}</span>
      )}
    </div>
  );
}
