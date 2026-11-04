/** Fundo vivo dos painéis e logins: manchas de cor desfocadas (cor da marca + tons frios) e grão. */
export function MeshBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#eef0f5]">
      <div className="blob absolute -left-[12%] -top-[22%] h-[70vh] w-[60vw] rounded-full bg-brand opacity-[0.26] blur-[110px]" />
      <div className="blob absolute -right-[14%] top-[8%] h-[60vh] w-[48vw] rounded-full bg-[#7c83ff] opacity-[0.22] blur-[120px] [animation-delay:-9s]" />
      <div className="blob absolute -bottom-[25%] left-[28%] h-[65vh] w-[52vw] rounded-full bg-[#38bdf8] opacity-[0.2] blur-[120px] [animation-delay:-18s]" />
      <div className="blob absolute -bottom-[10%] -left-[10%] h-[45vh] w-[35vw] rounded-full bg-brand-200 opacity-[0.35] blur-[100px] [animation-delay:-5s]" />
      <div className="grain absolute inset-0 opacity-[0.12] mix-blend-multiply" />
    </div>
  );
}
