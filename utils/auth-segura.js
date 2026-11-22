import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { BufferJSON, initAuthCreds, proto } from "baileys";

const nomeSeguro = (f) => f.replace(/\//g, "__").replace(/:/g, "-");
const filas = new Map();
function emFila(arq, fn) {
  const anterior = filas.get(arq) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(fn);
  filas.set(arq, atual);
  atual.finally(() => { if (filas.get(arq) === atual) filas.delete(arq); }).catch(() => {});
  return atual;
}

async function gravarAtomico(arq, texto) {
  const tmp = `${arq}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, texto);
  await fsp.rename(tmp, arq);
}
async function lerJsonOuNulo(arq) {
  try { return JSON.parse(await fsp.readFile(arq, "utf-8"), BufferJSON.reviver); } catch { return null; }
}

export async function usarEstadoSeguro(pasta) {
  await fsp.mkdir(pasta, { recursive: true });
  for (const f of await fsp.readdir(pasta).catch(() => [])) if (f.endsWith(".tmp")) await fsp.unlink(path.join(pasta, f)).catch(() => {});

  const caminho = (f) => path.join(pasta, nomeSeguro(f));
  const ler = (f) => emFila(caminho(f), () => lerJsonOuNulo(caminho(f)));
  const gravar = (dados, f) => emFila(caminho(f), () => gravarAtomico(caminho(f), JSON.stringify(dados, BufferJSON.replacer)));
  const apagar = (f) => emFila(caminho(f), () => fsp.unlink(caminho(f)).catch(() => {}));

  let creds = await ler("creds.json");
  if (!creds) {
    const bak = await lerJsonOuNulo(caminho("creds.json") + ".bak");
    if (bak) { creds = bak; console.log("  🩹 [SESSÃO] creds.json estava estragado; restaurei a cópia de segurança."); }
  }
  creds ||= initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (tipo, ids) => {
          const out = {};
          await Promise.all(ids.map(async (id) => {
            let v = await ler(`${tipo}-${id}.json`);
            if (tipo === "app-state-sync-key" && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            out[id] = v;
          }));
          return out;
        },
        set: async (dados) => {
          const tarefas = [];
          for (const tipo in dados) for (const id in dados[tipo]) {
            const v = dados[tipo][id];
            const f = `${tipo}-${id}.json`;
            tarefas.push(v ? gravar(v, f) : apagar(f));
          }
          await Promise.all(tarefas);
        }
      }
    },
    saveCreds: async () => {
      await gravar(creds, "creds.json");
      try { await fsp.copyFile(caminho("creds.json"), caminho("creds.json") + ".bak"); } catch {}
    }
  };
}

export const __teste = { nomeSeguro, existe: (p) => fs.existsSync(p) };
