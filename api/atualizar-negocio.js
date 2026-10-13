// ------------------------------------------------------------
// ATUALIZAR NEGÓCIO POR ÁUDIO — Fase 5 (IA própria)
// Recebe a transcrição de um áudio curto do vendedor (já transcrito no
// navegador, de graça, via Web Speech API — não é enviado nenhum arquivo
// de áudio aqui, só o texto) + um resumo do negócio atual, e devolve uma
// SUGESTÃO estruturada de atualização (valor, vencimento, etapa, resumo
// do follow-up). O Hub nunca aplica essa sugestão sozinho — ela sempre
// aparece num formulário editável pro vendedor confirmar antes de salvar.
//
// Usa a mesma chave ANTHROPIC_API_KEY já cadastrada na Vercel pro
// Assistente Ponte (api/assistente.js) — não precisa cadastrar nada novo.
// ------------------------------------------------------------

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001"; // tarefa simples e barata — não precisa do modelo maior do assistente

const FERRAMENTA = {
  name: "atualizar_negocio",
  description: "Registra a atualização estruturada de um negócio comercial a partir do relato falado de um vendedor.",
  input_schema: {
    type: "object",
    properties: {
      valor: {
        type: ["number", "null"],
        description: "Novo valor do negócio em reais, só números (sem 'R$' nem pontuação de milhar). null se o vendedor não mencionou valor novo."
      },
      vencimento: {
        type: ["string", "null"],
        description: "Nova data prevista de retorno/fechamento, formato AAAA-MM-DD. Se o vendedor falou um prazo relativo (ex: 'semana que vem', 'daqui a 3 dias'), calcule a partir da data de hoje informada. null se não mencionou prazo novo."
      },
      etapa: {
        type: ["string", "null"],
        enum: ["Prospecção", "Qualificação", "Proposta", "Negociação", "Fechamento", null],
        description: "Nova etapa do funil, só se o relato deixar claro que o negócio avançou ou voltou de etapa. null se não deu pra saber."
      },
      resumoFollowUp: {
        type: "string",
        description: "Resumo curto (1-2 frases, em português) do que foi dito — contexto da conversa com o cliente e o próximo passo. Vira uma nota no histórico do negócio."
      }
    },
    required: ["resumoFollowUp"]
  }
};

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Assistente ainda não configurado — falta cadastrar a chave ANTHROPIC_API_KEY na Vercel (ver guia de configuração)." });
    return;
  }

  const { transcricao, negocio } = req.body || {};
  if (!transcricao || typeof transcricao !== "string" || !transcricao.trim()) {
    res.status(400).json({ error: "Transcrição vazia." });
    return;
  }

  const contextoNegocio = negocio && typeof negocio === "object" ? negocio : {};

  const prompt = `Data de hoje: ${hoje()}.

Negócio atual no funil de vendas:
- Título: ${contextoNegocio.titulo || "(sem título)"}
- Cliente: ${contextoNegocio.clienteNome || "(sem cliente)"}
- Representada: ${contextoNegocio.representada || "(não informado)"}
- Valor atual: ${contextoNegocio.valorAtual != null ? contextoNegocio.valorAtual : "(não informado)"}
- Etapa atual: ${contextoNegocio.etapaAtual || "(não informado)"}
- Vencimento atual: ${contextoNegocio.vencimentoAtual || "(não informado)"}

Transcrição do áudio que o vendedor gravou depois de uma ligação ou visita a esse cliente:
"""${transcricao.trim()}"""

Extraia a atualização desse negócio a partir do relato, usando a ferramenta "atualizar_negocio". Só preencha valor, vencimento ou etapa quando o relato realmente der essa informação — nunca invente um número, data ou etapa que o vendedor não disse. O resumoFollowUp é obrigatório: capture o essencial do que foi conversado e o próximo passo, em português natural, como uma nota de CRM.`;

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        tools: [FERRAMENTA],
        tool_choice: { type: "tool", name: "atualizar_negocio" },
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      const msg = (data && data.error && data.error.message) || `Erro ${resp.status} ao chamar a IA.`;
      res.status(502).json({ error: msg });
      return;
    }

    const toolUse = data && Array.isArray(data.content) && data.content.find(b => b.type === "tool_use" && b.name === "atualizar_negocio");
    if (!toolUse || !toolUse.input) {
      res.status(502).json({ error: "A IA não devolveu uma atualização estruturada. Tente gravar de novo com mais detalhes." });
      return;
    }

    const { valor, vencimento, etapa, resumoFollowUp } = toolUse.input;
    res.status(200).json({
      valor: typeof valor === "number" ? valor : null,
      vencimento: typeof vencimento === "string" && vencimento ? vencimento : null,
      etapa: typeof etapa === "string" && etapa ? etapa : null,
      resumoFollowUp: typeof resumoFollowUp === "string" ? resumoFollowUp : ""
    });
  } catch (e) {
    res.status(500).json({ error: "Não consegui me conectar à IA agora. Tente de novo em instantes." });
  }
};
