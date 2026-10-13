// ------------------------------------------------------------
// ASSISTENTE PONTE (IA) — Fase 5
// Recebe a pergunta do usuário + um resumo dos dados que ele pode ver
// (já filtrado por vendedor no front-end quando é sessão de vendedor — ver
// montarContextoAssistente em pontehub.jsx) e devolve uma resposta em
// português, baseada só nesses dados reais do Hub.
//
// Usa a mesma chave ANTHROPIC_API_KEY já cadastrada na Vercel (ver guia de
// configuração) — a mesma que api/atualizar-negocio.js usa.
//
// Recriado em 2026-10-13: este arquivo nunca chegou a ser publicado no
// GitHub (Passo 1 do guia ficou pendente), então já nasce com a sintaxe
// certa — "export default", não "module.exports" — já que o projeto da
// Vercel trata todo .js em api/ como módulo ES (ver api/login.js e
// api/atualizar-negocio.js, que precisaram dessa mesma correção).
// ------------------------------------------------------------

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5-5"; // precisa interpretar dados e responder com texto corrido — Sonnet dá uma resposta melhor que Haiku pra esse tipo de pergunta

function montarPrompt(pergunta, contexto) {
  const ctx = contexto && typeof contexto === "object" ? contexto : {};
  return `Você é o Assistente Ponte, um assistente que responde perguntas sobre os dados comerciais do Ponte Hub (sistema de gestão da Ponte Representações, empresa de representação comercial em Roraima).

${ctx.visao || ""}

Dados disponíveis (em JSON — responda só com base neles, nunca invente números ou nomes que não estejam aqui):
\`\`\`json
${JSON.stringify({
  clientes: ctx.clientes || [],
  pedidos: ctx.pedidos || [],
  comissoes: ctx.comissoes || [],
  negociosFunil: ctx.negociosFunil || []
})}
\`\`\`

Pergunta do usuário: "${pergunta}"

Responda em português, direto e objetivo (poucas frases, sem floreio), como se fosse uma conversa de WhatsApp com um colega. Se os dados não forem suficientes pra responder com confiança, diga isso claramente em vez de chutar. Não mencione que os dados vieram em JSON nem descreva o formato — só use as informações pra responder a pergunta.`;
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

  const { pergunta, contexto } = req.body || {};
  if (!pergunta || typeof pergunta !== "string" || !pergunta.trim()) {
    res.status(400).json({ error: "Pergunta vazia." });
    return;
  }

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
        max_tokens: 700,
        messages: [{ role: "user", content: montarPrompt(pergunta.trim(), contexto) }]
      })
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      const msg = (data && data.error && data.error.message) || `Erro ${resp.status} ao chamar a IA.`;
      res.status(502).json({ error: msg });
      return;
    }

    const bloco = data && Array.isArray(data.content) && data.content.find(b => b.type === "text");
    const resposta = bloco && typeof bloco.text === "string" ? bloco.text.trim() : "";
    if (!resposta) {
      res.status(502).json({ error: "A IA não devolveu uma resposta. Tente perguntar de novo." });
      return;
    }

    res.status(200).json({ resposta });
  } catch (e) {
    res.status(500).json({ error: "Não consegui me conectar à IA agora. Tente de novo em instantes." });
  }
};
