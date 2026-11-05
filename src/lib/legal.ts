/**
 * Textos legais de cada loja (Termos de uso, Privacidade/LGPD e Cancelamento e reembolso), montados com
 * os dados da agência e da empresa da plataforma. São um ponto de partida sólido e em linguagem simples:
 * a agência e a Subrinho devem revisar com o jurídico antes de usar em produção (README).
 */
export type LegalStore = {
  name: string;
  legalName?: string | null;
  document?: string | null;
  address?: string | null;
  cadastur?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  policyNotes?: string | null;
  hasTracking?: boolean;
  /** Compra enviada pelo servidor para a Meta (API de conversões). */
  hasServerConversions?: boolean;
};

export type LegalCompany = { legalName: string; document: string; address: string; privacyEmail: string };

export type LegalSection = { title: string; paragraphs: string[]; list?: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

export const LEGAL_UPDATED_AT = "05/11/2026";

const agencyId = (s: LegalStore) =>
  [s.legalName && s.legalName !== s.name ? `${s.name} (${s.legalName})` : s.name, s.document ? `CNPJ ${s.document}` : null, s.cadastur ? `Cadastur ${s.cadastur}` : null]
    .filter(Boolean)
    .join(", ");

const contactLine = (s: LegalStore) =>
  [s.email && `e-mail ${s.email}`, s.whatsapp && `WhatsApp ${s.whatsapp}`, !s.whatsapp && s.phone && `telefone ${s.phone}`].filter(Boolean).join(", ") || "os canais de atendimento informados na loja";

const platform = (c: LegalCompany) => (c.legalName ? `${c.legalName}${c.document ? ` (CNPJ ${c.document})` : ""}` : "a plataforma de tecnologia e pagamentos contratada pela agência");

export function termsOfUse(s: LegalStore, c: LegalCompany): LegalDoc {
  return {
    title: "Termos de uso",
    intro: `Estes termos valem para quem navega e compra nesta loja. Ao finalizar uma compra, você concorda com eles e com a Política de privacidade e a Política de cancelamento e reembolso.`,
    sections: [
      {
        title: "1. Quem vende",
        paragraphs: [
          `Esta loja é da agência de viagens ${agencyId(s)}${s.address ? `, com endereço em ${s.address}` : ""}, responsável pelo atendimento e pela venda dos serviços.`,
          `A tecnologia da loja e o processamento dos pagamentos são feitos por ${platform(c)}, que repassa à agência e aos fornecedores os valores de cada reserva.`,
        ],
      },
      {
        title: "2. Os serviços",
        paragraphs: [
          "Hospedagens, casas de temporada, ingressos, experiências, chips de internet e demais serviços são prestados por fornecedores parceiros (hotéis, administradoras, operadoras e parques). A agência faz a intermediação da compra, como prevê a Lei Geral do Turismo (Lei 11.771/2008).",
          "Fotos, descrições, comodidades e regras de cada serviço vêm dos fornecedores. Sempre que possível, confira os detalhes antes de comprar e fale com a agência em caso de dúvida.",
        ],
      },
      {
        title: "3. Preços e pagamento",
        paragraphs: [
          "Os preços são mostrados em reais (R$). Serviços cobrados pelos fornecedores em moeda estrangeira são convertidos pela cotação do dia, e o valor em reais fica fixo no momento do pagamento.",
          "Preço e disponibilidade só ficam garantidos quando o pagamento é confirmado. Até lá, podem mudar, e o sistema confere tudo de novo antes de cobrar.",
          "O pagamento pode ser feito no Pix ou no cartão (parcelado conforme as condições mostradas no checkout). A loja não guarda os dados completos do cartão: eles são processados pelo meio de pagamento.",
        ],
      },
      {
        title: "4. Reserva e voucher",
        paragraphs: [
          "Depois do pagamento, cada item é confirmado com o fornecedor. O voucher (ou o QR Code do eSIM) fica disponível na página do pedido e é enviado por e-mail assim que fica pronto.",
          "Se, depois do pagamento, um fornecedor não puder confirmar a reserva, a agência oferece uma alternativa equivalente ou devolve o valor pago por aquele item.",
        ],
      },
      {
        title: "5. Responsabilidades do viajante",
        paragraphs: ["Para a viagem dar certo, cabe a quem compra:"],
        list: [
          "informar os nomes dos viajantes exatamente como nos documentos;",
          "manter em dia passaporte, vistos, vacinas e autorizações de viagem de menores, conforme o destino;",
          "respeitar horários de check-in, check-out, embarque e as regras de cada fornecedor;",
          "manter os dados de contato atualizados para receber os vouchers e avisos.",
        ],
      },
      { title: "6. Cancelamento e alterações", paragraphs: ["As regras estão na Política de cancelamento e reembolso, e a regra de cada item aparece antes do pagamento."] },
      {
        title: "7. Conta na loja",
        paragraphs: ["A conta é pessoal. Guarde a sua senha e avise a agência se notar algum acesso que não foi seu. Você pode criar uma nova senha a qualquer momento em “Esqueci minha senha”."],
      },
      { title: "8. Atendimento", paragraphs: [`Fale com a ${s.name} por ${contactLine(s)}. Tenha em mãos o número do pedido.`] },
      { title: "9. Lei aplicável", paragraphs: ["Estes termos seguem a legislação brasileira, incluindo o Código de Defesa do Consumidor (Lei 8.078/1990)."] },
    ],
  };
}

export function privacyPolicy(s: LegalStore, c: LegalCompany): LegalDoc {
  const dpo = c.privacyEmail || s.email;
  return {
    title: "Política de privacidade",
    intro: `Como a ${s.name} trata os seus dados pessoais, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).`,
    sections: [
      {
        title: "1. Quem trata os seus dados",
        paragraphs: [
          `A controladora dos dados é a agência ${agencyId(s)}. ${platform(c).charAt(0).toUpperCase()}${platform(c).slice(1)} atua como operadora: hospeda a loja, processa os pagamentos e envia os e-mails em nome da agência.`,
        ],
      },
      {
        title: "2. Quais dados coletamos",
        paragraphs: ["Somente o necessário para vender e prestar os serviços:"],
        list: [
          "identificação e contato: nome, CPF, data de nascimento, e-mail e telefone;",
          "dados dos viajantes exigidos pelos fornecedores (nome, idade de crianças, documento quando o serviço pede);",
          "dados da compra e do pagamento (o cartão é processado pelo meio de pagamento, sem que a loja guarde o número completo);",
          "dados de navegação: endereço IP, navegador, páginas acessadas e cookies.",
        ],
      },
      {
        title: "3. Para que usamos e com qual base legal",
        paragraphs: [],
        list: [
          "fazer e acompanhar as reservas, enviar vouchers e prestar atendimento (execução de contrato);",
          "emitir notas fiscais e cumprir obrigações legais e regulatórias (obrigação legal);",
          "prevenir fraudes, proteger as contas e lembrar você de um carrinho não finalizado (legítimo interesse);",
          "medir audiência e anúncios com cookies de análise e marketing, só se você aceitar (consentimento).",
        ],
      },
      {
        title: "4. Com quem compartilhamos",
        paragraphs: ["Nunca vendemos os seus dados. Compartilhamos apenas o necessário com:"],
        list: [
          "os fornecedores de cada serviço comprado (hotel, administradora, operadora, parque), para emitir a reserva;",
          "o meio de pagamento (por exemplo, PayPal) e instituições financeiras, para processar a cobrança;",
          "provedores de tecnologia que operam a loja (hospedagem, banco de dados e envio de e-mails);",
          ...(s.hasTracking ? ["Meta (Facebook/Instagram) e Google, para medir anúncios e audiência, apenas com o seu consentimento;"] : []),
          ...(s.hasServerConversions
            ? ["Meta, quando uma compra é confirmada e você aceitou os cookies de marketing: valor da compra e dados de contato protegidos por criptografia irreversível (hash), para medir os anúncios;"]
            : []),
          "autoridades públicas, quando a lei exigir.",
        ],
      },
      {
        title: "5. Transferência internacional",
        paragraphs: ["Quando o serviço é no exterior (por exemplo, um hotel em outro país), os dados necessários para a reserva são enviados ao fornecedor desse país, para cumprir o contrato que você fez (art. 33 da LGPD)."],
      },
      {
        title: "6. Por quanto tempo guardamos",
        paragraphs: [
          "Os dados da conta ficam guardados enquanto ela existir. Os dados dos pedidos ficam guardados por pelo menos 5 anos, por obrigação fiscal e para a defesa em eventuais processos, mesmo que a conta seja excluída.",
        ],
      },
      {
        title: "7. Os seus direitos",
        paragraphs: [
          "Você pode pedir a confirmação e o acesso aos seus dados, a correção, a portabilidade, a exclusão e revogar o consentimento a qualquer momento.",
          `Em “Minha conta” você baixa uma cópia dos seus dados e pode excluir a conta. Para os demais pedidos, escreva para ${dpo ?? "a agência"}.`,
        ],
      },
      {
        title: "8. Cookies",
        paragraphs: [
          "Cookies essenciais mantêm o login e o carrinho funcionando e não podem ser desligados.",
          s.hasTracking
            ? "Cookies de análise e marketing (Meta Pixel e Google Analytics) só são usados se você aceitar no aviso de cookies. Você pode mudar a escolha em “Preferências de cookies”, no rodapé."
            : "Esta loja não usa cookies de análise ou de marketing.",
        ],
      },
      {
        title: "9. Segurança",
        paragraphs: ["A conexão com a loja é cifrada (HTTPS), as senhas são guardadas apenas como código irreversível e o acesso aos dados é restrito a quem precisa para o atendimento."],
      },
      { title: "10. Contato do encarregado", paragraphs: [`Dúvidas sobre privacidade: ${dpo ?? contactLine(s)}.`] },
    ],
  };
}

export function cancellationPolicy(s: LegalStore): LegalDoc {
  return {
    title: "Cancelamento e reembolso",
    intro: "Cada serviço tem as regras do seu fornecedor. A regra de cada item (cancelamento grátis até uma data, ou não reembolsável) aparece antes do pagamento, no carrinho e no checkout, e vale para aquele item.",
    sections: [
      {
        title: "1. Como pedir",
        paragraphs: [`Fale com a ${s.name} por ${contactLine(s)}, com o número do pedido e o item que quer cancelar ou alterar. O pedido vale a partir do momento em que a agência recebe a sua mensagem.`],
      },
      {
        title: "2. Desistência da compra",
        paragraphs: [
          "Compras feitas pela internet têm direito de desistência em até 7 dias da compra (art. 49 do Código de Defesa do Consumidor). A agência atende esses pedidos conforme a legislação aplicável aos serviços turísticos e às regras informadas na compra.",
        ],
      },
      {
        title: "3. Valores devolvidos",
        paragraphs: ["O reembolso segue a política do item:"],
        list: [
          "dentro do prazo de cancelamento grátis: devolução integral do item;",
          "fora do prazo ou tarifa não reembolsável: pode haver retenção parcial ou total, conforme a regra mostrada na compra;",
          "não comparecimento (no-show): não há reembolso.",
        ],
      },
      {
        title: "4. Prazo e forma do reembolso",
        paragraphs: [
          "O reembolso é feito pelo mesmo meio de pagamento: no Pix, por transferência para a conta de quem pagou; no cartão, por estorno, que aparece em até duas faturas, conforme o banco emissor.",
        ],
      },
      {
        title: "5. Alterações",
        paragraphs: ["Mudança de datas, nomes ou quantidades depende das regras de cada fornecedor e pode gerar diferença de tarifa ou multa. A agência informa os valores antes de confirmar."],
      },
      {
        title: "6. Chip internacional (eSIM)",
        paragraphs: ["Depois de instalado ou ativado no celular, o eSIM não pode ser cancelado. Antes da ativação, o cancelamento pode ser possível: fale com a agência."],
      },
      {
        title: "7. Cancelamento pelo fornecedor",
        paragraphs: ["Se o fornecedor cancelar ou não puder prestar o serviço, a agência oferece uma alternativa equivalente ou devolve integralmente o valor do item."],
      },
      ...(s.policyNotes?.trim() ? [{ title: `8. Observações da ${s.name}`, paragraphs: s.policyNotes.trim().split(/\n{2,}/) }] : []),
    ],
  };
}
