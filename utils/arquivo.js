import fs from "fs";
import path from "path";

export function lerJson(arquivo, padrao = null) {
  try {
    const txt = fs.readFileSync(arquivo, "utf8").trim();
    return txt ? JSON.parse(txt) : padrao;
  } catch {
    return padrao;
  }
}

export function salvarJson(arquivo, dados, { compacto = false } = {}) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.${process.pid}.novo`;
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeSync(fd, compacto ? JSON.stringify(dados) : JSON.stringify(dados, null, 2));
    try { fs.fsyncSync(fd); } catch {}
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, arquivo);
}

export function salvarArquivo(arquivo, conteudo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.${process.pid}.novo`;
  fs.writeFileSync(tmp, conteudo);
  fs.renameSync(tmp, arquivo);
}

export const ARQ_DIVULGACAO = path.resolve("./storage/autoresponder.json");
export function lerDivulgacao() {
  const c = lerJson(ARQ_DIVULGACAO, {});
  return c && typeof c === "object" && !Array.isArray(c) ? c : {};
}
export function salvarDivulgacao(patch) {
  const novo = { status: false, intervaloMinutos: 60, mensagens: [], ...lerDivulgacao(), ...patch };
  salvarJson(ARQ_DIVULGACAO, novo);
  return novo;
}
