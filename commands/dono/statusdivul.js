import CONFIG from "../../config.js";
import { lerDivulgacao } from "../../utils/arquivo.js";
import * as store from "../../metrics/store.js";
import { lerRodizio, lerHorarios } from "../../utils/sucessos.js";

const hora = (ms) => new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
function tempo(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}

export default {
  name: "statusdivul",
  nome: "statusdivul",
  categoria: "dono",
  description: "Mostra como está a divulgação automática.",

  execute: async ({ sock, from, msg, isDono }) => {
    if (!isDono) return;
    const c = lerDivulgacao();
    const agora = Date.now();
    const proximo = store.getState?.()?.autodisparo?.proximoDisparoEm;
    const ultimo = Number(c.ultimoDisparadoEm) || null;
    const rodizio = lerRodizio(c);
    const horarios = lerHorarios(c);
    const temTexto = Boolean((c.mensagens || [])[0] || c.mensagem || (rodizio.ativo && rodizio.textos.length));
    const linhas = [
      "*Divulgação automática*",
      "",
      `Situação: ${c.status ? "ligada ✅" : "desligada"}`,
      horarios.length ? `Horários fixos: ${horarios.join(", ")} (Trem-bala)` : `Intervalo: a cada ${c.intervaloMinutos || 60} min`,
      `Para onde: ${c.modoEnvio === "selecionados" ? `${(c.gruposSelecionados || []).length} grupo(s) escolhido(s)` : "todos os grupos"}`,
      `Texto: ${temTexto ? "definido" : `falta definir (${CONFIG.bot.prefix}addtexto)`} · Imagem: ${c.imagemDivulgacao ? "sim" : "não"}`,
      `Sucessos: ${[rodizio.ativo && rodizio.textos.length ? `rodízio (${rodizio.textos.length} textos)` : "", c.aquarela ? "aquarela" : "", c.sinaisDeFogo ? "modo fogo" : ""].filter(Boolean).join(" · ") || "nenhum ligado"}`,
      "",
      `Envios feitos: ${c.totalDisparosGrupos || 0} em ${c.totalCiclosAnuncios || 0} rodada(s)`
    ];
    if (ultimo) linhas.push(`Último envio: ${hora(ultimo)} (há ${tempo(agora - ultimo)})`);
    if (c.status && proximo && proximo > agora) linhas.push(`Próximo envio: ${hora(proximo)} (em ${tempo(proximo - agora)})`);
    await sock.sendMessage(from, { text: linhas.join("\n") }, { quoted: msg });
  }
};
