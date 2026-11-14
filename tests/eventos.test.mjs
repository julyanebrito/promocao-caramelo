import test from "node:test";
import assert from "node:assert/strict";
import { criarHandler, chaveEvento, diaSP } from "../netlify/functions/eventos.mjs";

const storeFalso = () => {
  const dados = new Map();
  return {
    dados,
    set: async (k, v) => { dados.set(k, v); },
    list: async ({ prefix }) => ({ blobs: [...dados.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
};
const post = (corpo) => new Request("https://x/api/eventos", { method: "POST", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) });

test("conta visitas e cliques do dia separados por botão e origem", async () => {
  const store = storeFalso();
  const h = criarHandler(() => store);
  await h(post({ tipo: "visita", utm_source: "instagram" }));
  await h(post({ tipo: "visita", utm_source: "instagram" }));
  await h(post({ tipo: "visita" }));
  await h(post({ tipo: "clique", cta: "topo", utm_source: "instagram" }));
  await h(post({ tipo: "clique", cta: "fixo-mobile" }));
  const r = await (await h(new Request(`https://x/api/eventos?dia=${diaSP()}`))).json();
  assert.equal(r.visitas, 3);
  assert.equal(r.cliques, 2);
  assert.deepEqual(r.cliquesPorBotao, { topo: 1, "fixo-mobile": 1 });
  assert.deepEqual(r.visitasPorOrigem, { instagram: 2, direto: 1 });
  assert.deepEqual(r.cliquesPorOrigem, { instagram: 1, direto: 1 });
});

test("não mistura dias", async () => {
  const store = storeFalso();
  store.dados.set("2026-11-13/clique/topo/direto/1-a", "");
  const h = criarHandler(() => store);
  await h(post({ tipo: "clique", cta: "topo" }));
  const ontem = await (await h(new Request("https://x/api/eventos?dia=2026-11-13"))).json();
  assert.equal(ontem.cliques, 1);
  const hoje = await (await h(new Request("https://x/api/eventos"))).json();
  assert.equal(hoje.dia, diaSP());
  assert.equal(hoje.cliques, 1);
});

test("corpo inválido ou campos estranhos não quebram nem injetam na chave", async () => {
  const store = storeFalso();
  const h = criarHandler(() => store);
  assert.equal((await h(post("isso não é json"))).status, 204);
  await h(post({ tipo: "clique", cta: "../../x/y", utm_source: "<script>alert(1)</script>" }));
  const chaves = [...store.dados.keys()];
  assert.equal(chaves.length, 2);
  for (const k of chaves) assert.equal(k.split("/").length, 5);
  assert.match(chaves[1], /\/clique\/xy\/scriptalert1script\//);
});

test("dia usa o horário de Brasília (23h30 em SP ainda é o mesmo dia)", () => {
  const k = chaveEvento({ tipo: "visita" }, new Date("2026-11-15T02:30:00Z"));
  assert.ok(k.startsWith("2026-11-14/visita/"));
});

test("método não suportado responde 405", async () => {
  const h = criarHandler(() => storeFalso());
  assert.equal((await h(new Request("https://x/api/eventos", { method: "DELETE" }))).status, 405);
});
