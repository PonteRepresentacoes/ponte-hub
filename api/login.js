// ------------------------------------------------------------
// LOGIN — senha mestre (Segurança, 2026-10-13)
// Antes, a senha mestre do Hub ficava escrita em texto puro dentro do
// index.html — qualquer um que abrisse "ver código-fonte" da página via
// o navegador conseguia ler e entrar como Administrador, sem precisar de
// nenhuma falha no banco de dados. Agora a conferência acontece aqui, no
// servidor, contra uma variável de ambiente que nunca é enviada ao navegador.
//
// Login de vendedor (código de acesso de 6 caracteres) continua sendo
// conferido no app, direto no Firestore — essa parte já ficou mais segura
// com as novas regras do banco (ver guia de configuração).
// ------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const senhaMestre = String(process.env.PONTE_HUB_SENHA_MESTRE || "").trim();
  if (!senhaMestre) {
    res.status(500).json({ error: "Login ainda não configurado — falta cadastrar a variável PONTE_HUB_SENHA_MESTRE na Vercel (ver guia de configuração)." });
    return;
  }

  const { codigo } = req.body || {};
  const codigoLimpo = String(codigo || "").trim();
  const ehMestre = codigoLimpo.length > 0 && codigoLimpo === senhaMestre;

  res.status(200).json({ mestre: ehMestre });
};
