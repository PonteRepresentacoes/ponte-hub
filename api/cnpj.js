// ------------------------------------------------------------
// CONSULTA DE CNPJ — Receita Federal (2026-10-13)
// O Hub busca automaticamente razão social, endereço etc. a partir do CNPJ
// em 5 lugares (Cadastro Público, Ficha Rápida, Clientes, Representadas,
// Transportadoras), chamando a BrasilAPI direto do navegador. Carlos
// relatou falha — a BrasilAPI respondeu "503" (fora do ar), e como todo
// lugar chamava ela direto, a busca parou de funcionar em todo canto ao
// mesmo tempo.
//
// Esse endpoint busca aqui no servidor (sem o problema de CORS de tentar
// isso direto do navegador) e, se a BrasilAPI estiver fora do ar, tenta uma
// segunda fonte pública e gratuita (Minha Receita) antes de desistir — as
// duas publicam os mesmos "Dados Abertos do CNPJ" da Receita Federal, com
// os mesmos nomes de campo, então não precisa de nenhuma tradução aqui.
//
// Front-end chama GET /api/cnpj?cnpj=00000000000000 (ver buscarDadosReceitaCNPJ
// em pontehub.jsx) — se esse arquivo ainda não tiver sido publicado, o
// front-end já cai sozinho de volta pra chamar a BrasilAPI direto do
// navegador (comportamento de sempre), então nada quebra até isso ser
// publicado.
// ------------------------------------------------------------

async function tentarFonte(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    // Algumas fontes devolvem um corpo de erro com status 200 em vez de um status de erro de verdade.
    if (!data || data.message || data.error) return null;
    return data;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const digits = String((req.query && req.query.cnpj) || "").replace(/\D/g, "");
  if (digits.length !== 14) {
    res.status(400).json({ error: "CNPJ inválido — envie 14 números." });
    return;
  }

  const data =
    (await tentarFonte(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)) ||
    (await tentarFonte(`https://minhareceita.org/${digits}`));

  if (!data) {
    res.status(502).json({ error: "Não consegui consultar a Receita Federal agora — as duas fontes testadas (BrasilAPI e Minha Receita) estão indisponíveis no momento." });
    return;
  }

  res.status(200).json(data);
}
