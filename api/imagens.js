// ------------------------------------------------------------
// BUSCA DE IMAGENS PARA O CADASTRO DE PRODUTO (sem chave de API)
// GET /api/imagens?q=oculos+jaguar+kalipso
// Tenta o DuckDuckGo Imagens; se não responder, cai pro Bing Imagens.
// Devolve { resultados: [{ imagem, miniatura, titulo, site }] } (até 30).
// Usado pelo botão "Buscar na web" da tela Produtos (Painel ADM).
// ------------------------------------------------------------

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function buscarDuckDuckGo(q) {
  const pagina = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, {
    headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" }
  });
  const html = await pagina.text();
  const vqd = (html.match(/vqd=["']?([\d-]+)/) || [])[1];
  if (!vqd) throw new Error("ddg sem token");
  const r = await fetch(`https://duckduckgo.com/i.js?l=br-pt&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,,,&p=1`, {
    headers: { "User-Agent": UA, Referer: "https://duckduckgo.com/", Accept: "application/json" }
  });
  if (!r.ok) throw new Error("ddg " + r.status);
  const dados = await r.json();
  return (dados.results || []).map(x => ({ imagem: x.image, miniatura: x.thumbnail, titulo: x.title || "", site: x.url || "" }));
}

async function buscarBing(q) {
  const r = await fetch(`https://www.bing.com/images/async?q=${encodeURIComponent(q)}&first=1&count=35&mmasync=1&setlang=pt-BR`, {
    headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" }
  });
  if (!r.ok) throw new Error("bing " + r.status);
  const html = await r.text();
  const out = [];
  for (const m of html.matchAll(/class="iusc"[^>]*?\sm="([^"]+)"/g)) {
    try {
      const j = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      if (j.murl) out.push({ imagem: j.murl, miniatura: j.turl || j.murl, titulo: j.t || "", site: j.purl || "" });
    } catch (e) { /* ignora item mal formado */ }
  }
  return out;
}

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || "").trim().slice(0, 150);
  if (!q) {
    res.status(400).json({ erro: "Informe o que buscar (parâmetro q)." });
    return;
  }
  let resultados = [];
  let fonte = "";
  try {
    resultados = await buscarDuckDuckGo(q);
    fonte = "duckduckgo";
  } catch (e) { /* tenta o Bing */ }
  if (!resultados.length) {
    try {
      resultados = await buscarBing(q);
      fonte = "bing";
    } catch (e) { /* sem resultado */ }
  }
  const vistos = new Set();
  const lista = resultados
    .filter(x => /^https:\/\//i.test(x.imagem || "") && !vistos.has(x.imagem) && vistos.add(x.imagem))
    .slice(0, 30);
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.status(200).json({ resultados: lista, fonte });
}
