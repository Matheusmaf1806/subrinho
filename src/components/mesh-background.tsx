/**
 * Fundo dos painéis e logins: foto de viagem com desfoque extremo (vira só cor e luz), véu claro para
 * o vidro e o texto continuarem legíveis, manchas suaves da cor da marca e grão. A foto é pequena de
 * propósito: desfocada, a resolução não aparece e a página continua leve.
 */
export function MeshBackground({ image }: { image?: string | null }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#eef0f5]">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" decoding="async" className="absolute inset-0 h-full w-full scale-[1.35] object-cover blur-[70px] saturate-[1.4]" />
      )}
      <div className={image ? "absolute inset-0 bg-white/40" : "hidden"} />
      <div className={`blob absolute -left-[12%] -top-[22%] h-[70vh] w-[60vw] rounded-full bg-brand blur-[110px] ${image ? "opacity-[0.14]" : "opacity-[0.26]"}`} />
      <div className={`blob absolute -right-[14%] top-[8%] h-[60vh] w-[48vw] rounded-full bg-[#7c83ff] blur-[120px] [animation-delay:-9s] ${image ? "opacity-[0.1]" : "opacity-[0.22]"}`} />
      <div className={`blob absolute -bottom-[25%] left-[28%] h-[65vh] w-[52vw] rounded-full bg-[#38bdf8] blur-[120px] [animation-delay:-18s] ${image ? "opacity-[0.1]" : "opacity-[0.2]"}`} />
      <div className="blob absolute -bottom-[10%] -left-[10%] h-[45vh] w-[35vw] rounded-full bg-brand-200 opacity-[0.3] blur-[100px] [animation-delay:-5s]" />
      <div className="grain absolute inset-0 opacity-[0.12] mix-blend-multiply" />
    </div>
  );
}
