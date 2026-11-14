// Conta visitas e cliques da landing por dia (horário de Brasília), sem guardar dado pessoal.
// POST /api/eventos { tipo: "visita" | "clique", cta, utm_source }  -> registra
// GET  /api/eventos?dia=AAAA-MM-DD                                  -> resumo do dia (o n8n lê às 22h10)
import { getStore } from "@netlify/blobs";

const limpar = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30) || "direto";
export const diaSP = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// Um blob por evento (só a chave importa): evita perder contagem quando dois cliques chegam juntos
export const chaveEvento = (corpo, agora = new Date()) => {
  const tipo = corpo.tipo === "clique" ? "clique" : "visita";
  const cta = tipo === "clique" ? limpar(corpo.cta) : "-";
  return `${diaSP(agora)}/${tipo}/${cta}/${limpar(corpo.utm_source)}/${agora.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const resumir = (dia, chaves) => {
  const r = { dia, visitas: 0, cliques: 0, cliquesPorBotao: {}, visitasPorOrigem: {}, cliquesPorOrigem: {} };
  const somar = (m, k) => { m[k] = (m[k] || 0) + 1; };
  for (const chave of chaves) {
    const [, tipo, cta, origem] = chave.split("/");
    if (tipo === "clique") {
      r.cliques++;
      somar(r.cliquesPorBotao, cta);
      somar(r.cliquesPorOrigem, origem);
    } else if (tipo === "visita") {
      r.visitas++;
      somar(r.visitasPorOrigem, origem);
    }
  }
  return r;
};

export const criarHandler = (abrirStore) => async (req) => {
  const store = abrirStore("eventos-lp");
  if (req.method === "POST") {
    let corpo = {};
    try { corpo = JSON.parse(await req.text()); } catch {}
    await store.set(chaveEvento(corpo), "");
    return new Response(null, { status: 204 });
  }
  if (req.method === "GET") {
    const pedido = new URL(req.url).searchParams.get("dia");
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(pedido || "") ? pedido : diaSP();
    const { blobs } = await store.list({ prefix: `${dia}/` });
    return Response.json(resumir(dia, blobs.map((b) => b.key)), { headers: { "cache-control": "no-store" } });
  }
  return new Response(null, { status: 405 });
};

export default criarHandler(getStore);
export const config = { path: "/api/eventos" };
