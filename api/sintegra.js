// Vercel Serverless Function — /api/sintegra
//
// O que isso faz:
//   O app (front-end) chama /api/sintegra?cnpj=00000000000000
//   Esta função pega o token secreto (guardado nas variáveis de ambiente
//   da Vercel, nunca no código) e consulta a Sintegra WS por trás dos panos,
//   usando o endpoint real e documentado deles.
//
// Como configurar na Vercel:
//   1. No painel do projeto na Vercel: Settings → Environment Variables
//   2. Adicione: SINTEGRA_WS_TOKEN = <seu token da Sintegra WS>
//   3. Faça o deploy (git push ou vercel --prod)
//
// Referência da API (endpoint único, muda só o "plugin"):
//   https://www.sintegraws.com.br/api/v1/execute-api.php?token=...&cnpj=...&plugin=XX
//   plugin=RF -> Receita Federal | plugin=ST -> Sintegra estadual (IE/situação)
//   plugin=SN -> Simples Nacional (regime) | plugin=SF -> Suframa
//
// ATENÇÃO: a documentação pública mostra os parâmetros e como chamar, mas não
// lista todos os nomes de campo que voltam no JSON de cada plugin. A primeira
// vez que você testar, dê uma olhada no campo "bruto" da resposta (log abaixo)
// e ajuste o mapeamento em "normalizarST/SF/SN" se os nomes vierem diferentes.

const BASE_URL = "https://www.sintegraws.com.br/api/v1/execute-api.php";

async function consultarPlugin(token, cnpj, plugin) {
  const url = `${BASE_URL}?token=${token}&cnpj=${cnpj}&plugin=${plugin}`;
  const resp = await fetch(url);
  const data = await resp.json().catch(() => null);
  return { ok: resp.ok && data && data.status !== "ERROR", data };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { cnpj } = req.query;
  const digits = (cnpj || "").replace(/\D/g, "");

  if (digits.length !== 14) {
    return res.status(400).json({ error: "CNPJ inválido — envie 14 números." });
  }

  const token = process.env.SINTEGRA_WS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "SINTEGRA_WS_TOKEN não configurado nas variáveis de ambiente." });
  }

  try {
    // Consulta os 3 plugins em paralelo (cada um consome crédito da sua conta)
    const [st, sf, sn] = await Promise.all([
      consultarPlugin(token, digits, "ST"),
      consultarPlugin(token, digits, "SF"),
      consultarPlugin(token, digits, "SN"),
    ]);

    // AJUSTAR se os nomes de campo vierem diferentes do que a Sintegra WS te devolver de verdade
    const ie = st.ok ? (st.data.inscricao_estadual || st.data.ie || null) : null;
    const situacaoEstadual = st.ok ? (st.data.situacao || st.data.situacao_cadastral || null) : null;
    const suframaAtivo = sf.ok ? (sf.data.situacao || sf.data.status_suframa || sf.data.status || null) : null;
    const inscricaoSuframa = sf.ok ? (sf.data.inscricao_suframa || sf.data.numero || null) : null;
    const regimeTributario = sn.ok
      ? (sn.data.regime_tributario || (sn.data.optante_simples || sn.data.opcao_simples ? "Simples Nacional" : null))
      : null;

    return res.status(200).json({
      ie,
      situacaoEstadual,
      suframaAtivo,
      inscricaoSuframa,
      regimeTributario,
      bruto: { st: st.data, sf: sf.data, sn: sn.data }, // útil pra depurar e ajustar o mapeamento acima
    });
  } catch (e) {
    return res.status(500).json({ error: "Falha ao consultar a Sintegra WS.", detail: e.message });
  }
}
