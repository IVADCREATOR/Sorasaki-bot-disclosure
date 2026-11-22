import fs from "fs";
import path from "path";
import CONFIG from "../config.js";
import logger from "../utils/logger.js";
import * as metrics from "../metrics/collector.js";
import { enviarComCanal } from "../utils/canal.js";
import { lerJson, salvarJson, salvarDivulgacao } from "../utils/arquivo.js";
import { jidDoDono } from "../utils/dono.js";
import { calor, pintar, textoDaVez, lerRodizio, lerHorarios, proximoHorario, registrarEntrega } from "../utils/sucessos.js";

const autoResponderPath = path.resolve("./storage/autoresponder.json");
const linksPath = path.resolve("./storage/tentativaslinks.json");
const FILE_BLACKLIST = path.resolve("./storage/blacklist_grupos.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let timerTransmissao = null;
let timerAutoEntrada = null;
let agendaConhecida = null;
const agendaDe = (c) => JSON.stringify([Math.max(1, Number(c.intervaloMinutos) || 60), lerHorarios(c)]);
let primeiroCicloAposBoot = true;
let sockAtual = null;
let sistemaIniciado = false;
let emTransmissao = false;

const historicoPath = path.resolve("./storage/historico-disparos.json");
let progressoEnvio = null;
let emAquecimento = false;
function registrarHistorico(item) {
  try {
    const lista = lerJson(historicoPath, []);
    const nova = [...(Array.isArray(lista) ? lista : []), item].slice(-20);
    salvarJson(historicoPath, nova, { compacto: true });
  } catch (e) { logger.warn(`⚠️ Não consegui salvar o histórico de disparos: ${e.message}`); }
}
export function lerHistoricoDisparos() {
  const l = lerJson(historicoPath, []);
  return Array.isArray(l) ? l : [];
}
export function estadoDivulgacao() {
  return { emAndamento: emTransmissao, progresso: progressoEnvio, aquecimento: emAquecimento, ultimo: ultimoResultado };
}

const sockAtivo = () => sockAtual || global.sock || null;
const conectado = () => metrics.getStatus() === "online";

const estadosDivulgacao = new Map();
const TTL_ESTADO_DIVULGACAO_MS = 5 * 60 * 1000;

function estadoExpirado(estado) {
  return !estado || Date.now() > estado.expiraEm;
}

let ultimoResultado = null;
const resultado = (ok, texto) => { ultimoResultado = { ok, texto }; return ultimoResultado; };

async function realizarTransmissao({ manual = false, somente = null, textoFixo = null } = {}) {
  if (emTransmissao) {
    logger.warn("⚠️ [AUTO-DISPARO] Já existe um disparo em andamento; ignorando o pedido duplicado.");
    return resultado(false, "já existe um disparo em andamento");
  }
  const sock = sockAtivo();
  if (!sock || !conectado()) {
    if (manual) { programarProximoCiclo(); return resultado(false, "o WhatsApp está desconectado agora"); }
    logger.warn("⚠️ [AUTO-DISPARO] WhatsApp desconectado; tento de novo em 1 minuto.");
    if (timerTransmissao) clearTimeout(timerTransmissao);
    timerTransmissao = setTimeout(realizarTransmissao, 60000);
    return resultado(false, "o WhatsApp está desconectado agora");
  }
  emTransmissao = true;
  try {
    if (!fs.existsSync(autoResponderPath)) { resultado(false, "a divulgação ainda não tem mensagem configurada"); return programarProximoCiclo(); }

    const configAtualizada = JSON.parse(fs.readFileSync(autoResponderPath, "utf-8"));
    if (configAtualizada.status !== true && !manual) { resultado(false, "o disparo automático está desligado"); return programarProximoCiclo(); }

    const daVez = textoFixo ? { texto: textoFixo, posicao: null, total: null } : textoDaVez(configAtualizada, { avancar: !somente });
    const msgSalva = daVez.texto;

    if (!msgSalva) { resultado(false, "não há mensagem de divulgação configurada"); return programarProximoCiclo(); }

    const aquarela = configAtualizada.aquarela === true;

    const imagemPath = configAtualizada.imagemDivulgacao;
    const temImagem = imagemPath && fs.existsSync(imagemPath);
    let bufferImagem = null;

    if (temImagem) {
      try {
        bufferImagem = fs.readFileSync(imagemPath);
      } catch (imgErr) {
        logger.error(`❌ [AUTO-DISPARO] Falha ao ler imagem vinculada: ${imgErr.message}`);
        bufferImagem = null;
      }
    }

    const chats = await sock.groupFetchAllParticipating();
    let gruposId = Object.keys(chats);

    if (gruposId.length === 0) {
      logger.warn("⚠️ Nenhum grupo participante encontrado para transmissão.");
      resultado(false, "o bot não está em nenhum grupo");
      return programarProximoCiclo();
    }

    if (fs.existsSync(FILE_BLACKLIST)) {
      try {
        const blacklist = JSON.parse(fs.readFileSync(FILE_BLACKLIST, "utf-8"));
        if (Array.isArray(blacklist)) {
          const blacklistLimpa = blacklist.map(id => String(id).trim().toLowerCase());
          gruposId = gruposId.filter(id => !blacklistLimpa.includes(id.trim().toLowerCase()));
        }
      } catch (errBlacklist) {
        logger.error(`Não foi possível carregar a lista negra: ${errBlacklist.message}`);
      }
    }

    if (Array.isArray(somente)) {
      const alvo = new Set(somente);
      gruposId = gruposId.filter(id => alvo.has(id));
      if (gruposId.length === 0) {
        resultado(false, "nenhum dos grupos que faltaram continua disponível");
        return programarProximoCiclo();
      }
    } else if (configAtualizada.modoEnvio === "selecionados") {
      const selecionados = Array.isArray(configAtualizada.gruposSelecionados) ? configAtualizada.gruposSelecionados : [];
      gruposId = gruposId.filter(id => selecionados.includes(id));

      if (gruposId.length === 0) {
        logger.warn("⚠️ Modo 'grupos selecionados' está ativo, mas nenhum grupo válido está marcado. Nenhum envio será feito neste ciclo.");
        resultado(false, "o modo \"grupos selecionados\" está ativo, mas nenhum grupo está marcado");
        return programarProximoCiclo();
      }
    }

    if (configAtualizada.sinaisDeFogo === true) gruposId.sort((a, b) => calor(b) - calor(a));

    logger.info(`🚀 [AUTO-DISPARO] Iniciando envio rápido para ${gruposId.length} grupos${bufferImagem ? " (com imagem)" : ""}...`);

    let enviadosComSucesso = 0;
    let errosDeEnvio = 0;
    const inicioInstante = Date.now();
    progressoEnvio = { feitos: 0, total: gruposId.length, inicio: inicioInstante, manual };
    const infoGrupo = (id) => ({ id, nome: chats[id]?.subject || "Grupo sem nome", membros: Array.isArray(chats[id]?.participants) ? chats[id].participants.length : 0 });
    const entregues = [];
    const falhas = [];

    for (const [indice, id] of gruposId.entries()) {
      if (!conectado()) {
        logger.warn("⚠️ [AUTO-DISPARO] Conexão caiu no meio do envio; interrompendo este ciclo.");
        errosDeEnvio += gruposId.length - enviadosComSucesso - errosDeEnvio;
        for (const resto of gruposId.slice(indice)) falhas.push({ ...infoGrupo(resto), erro: "a conexão caiu" });
        break;
      }
      const info = infoGrupo(id);
      const msgFinal = aquarela ? pintar(msgSalva, info) : msgSalva;
      try {
        await enviarComCanal(sock, id, { texto: msgFinal, imagem: bufferImagem || null });
        entregues.push(info);
        enviadosComSucesso++;
        progressoEnvio.feitos = enviadosComSucesso + errosDeEnvio;
        await sleep(1000 + Math.floor(Math.random() * 1200));
      } catch (sendErr) {
        errosDeEnvio++;
        falhas.push({ ...info, erro: String(sendErr.message || sendErr).slice(0, 80) });
        progressoEnvio.feitos = enviadosComSucesso + errosDeEnvio;
        logger.error(`Erro ao enviar para o grupo ${id}: ${sendErr.message}`);
      }
    }

    const tempoTotalSegundos = Math.round((Date.now() - inicioInstante) / 1000);
    resultado(enviadosComSucesso > 0, `${enviadosComSucesso} de ${gruposId.length} grupo(s) receberam${errosDeEnvio ? `, ${errosDeEnvio} falha(s)` : ""} em ${tempoTotalSegundos}s`);
    logger.success(`✅ [AUTO-DISPARO] Envio concluído em ${tempoTotalSegundos}s.`);
    registrarHistorico({ at: Date.now(), manual, ok: enviadosComSucesso > 0, sent: enviadosComSucesso, total: gruposId.length, failed: errosDeEnvio, seconds: tempoTotalSegundos, image: Boolean(bufferImagem) });
    registrarEntrega({ at: inicioInstante, fim: Date.now(), manual, reenvio: Array.isArray(somente), texto: msgSalva, imagem: Boolean(bufferImagem), aquarela,
      rodizio: daVez.posicao ? { posicao: daVez.posicao, total: daVez.total } : null, entregues, falhas, segundos: tempoTotalSegundos });

    try {
      const configMétricas = JSON.parse(fs.readFileSync(autoResponderPath, "utf-8"));

      configMétricas.totalDisparosGrupos = (configMétricas.totalDisparosGrupos || 0) + enviadosComSucesso;
      configMétricas.totalCiclosAnuncios = (configMétricas.totalCiclosAnuncios || 0) + 1;
      configMétricas.ultimoDisparadoEm = Date.now();
      configMétricas.timestampInicio = Date.now();

      salvarJson(autoResponderPath, configMétricas);

      metrics.incrementarAutodisparo({
        transmissoesTotais: enviadosComSucesso,
        ciclosConcluidos: 1,
        falhasTotais: errosDeEnvio
      });
      metrics.atualizarAutodisparo({ ultimoDisparoEm: Date.now() });
    } catch (metricErr) {
      logger.error(`Não foi possível salvar as métricas: ${metricErr.message}`);
      metrics.registrarErro({ modulo: "autodisparo", erro: metricErr });
    }

    try {
      if (fs.existsSync(linksPath)) {
        const dbLinks = JSON.parse(fs.readFileSync(linksPath, "utf-8"));
        let houveAlteracao = false;

        for (const item of dbLinks) {
          if (msgSalva.includes(item.link.trim())) {
            item.totalEnvios = (item.totalEnvios || 0) + enviadosComSucesso;
            item.ciclosConcluidos = (item.ciclosConcluidos || 0) + 1;
            houveAlteracao = true;
          }
        }

        if (houveAlteracao) salvarJson(linksPath, dbLinks);
      }
    } catch (linkErr) {
      logger.error(`❌ Erro nos links: ${linkErr.message}`);
    }

    try {
      const donoJid = jidDoDono();
      const duracaoTxt = tempoTotalSegundos >= 90 ? `${Math.round(tempoTotalSegundos / 60)} min` : `${tempoTotalSegundos} s`;
      const p = CONFIG.bot.prefix;
      const membros = entregues.reduce((s, g) => s + g.membros, 0);
      const relatorio = [
        `📣 *${Array.isArray(somente) ? "Reenvio (Mais uma vez) concluído" : `Divulgação ${manual ? "enviada agora" : "enviada"}`}*`,
        "",
        `${enviadosComSucesso} de ${gruposId.length} grupo(s) receberam${errosDeEnvio ? ` · ${errosDeEnvio} não receberam` : " ✅"}`,
        membros ? `Alcance: ${membros.toLocaleString("pt-BR")} pessoas nos grupos que receberam` : null,
        `${bufferImagem ? "Com imagem" : "Só texto"} · levou ${duracaoTxt}`,
        daVez.posicao ? `Texto ${daVez.posicao} de ${daVez.total} do rodízio (Eternamente)` : null,
        errosDeEnvio ? `\nPara tentar de novo só nos que faltaram: ${p}maisumavez\nComprovante completo: ${p}evidencias` : `\nComprovante: ${p}evidencias`,
        "",
        "_NOJX IVAD ⁷⁷⁷_"
      ].filter((l) => l !== null).filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");

      if (donoJid) await sock.sendMessage(donoJid, { text: relatorio });
    } catch (pvErr) {
      logger.error(`❌ Erro relatório PV: ${pvErr.message}`);
    }

    programarProximoCiclo();

  } catch (err) {
    resultado(false, `erro: ${err.message}`);
    logger.error(`Falha na transmissão global: ${err.message}`);
    metrics.registrarErro({ modulo: "autodisparo", erro: err });
    programarProximoCiclo();
  } finally {
    emTransmissao = false;
    progressoEnvio = null;
  }
}

function programarProximoCiclo() {
  if (timerTransmissao) clearTimeout(timerTransmissao);

  try {
    if (!fs.existsSync(autoResponderPath)) return;
    const config = JSON.parse(fs.readFileSync(autoResponderPath, "utf-8"));

    if (config.status !== true) {
      metrics.atualizarAutodisparo({ status: false, proximoDisparoEm: null });
      timerTransmissao = setTimeout(() => programarProximoCiclo(), 60000);
      return;
    }

    agendaConhecida = agendaDe(config);
    const minutosTotal = Math.max(1, Number(config.intervaloMinutos) || 60);
    const horarios = lerHorarios(config);
    const ultimo = Math.max(Number(config.ultimoDisparadoEm) || 0, Number(config.agendaDesde) || 0);
    let espera;

    if (horarios.length) {
      const piso = primeiroCicloAposBoot ? Date.now() + (ultimo ? 3 : 20) * 60 * 1000 : Date.now();
      emAquecimento = primeiroCicloAposBoot && !ultimo;
      primeiroCicloAposBoot = false;
      espera = proximoHorario(horarios, piso) - Date.now();
      logger.info(`⏰ [TREM-BALA] Próximo disparo às ${new Date(Date.now() + espera).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })} (horários fixos: ${horarios.join(", ")}).`);
    } else if (primeiroCicloAposBoot) {
      primeiroCicloAposBoot = false;
      espera = ultimo ? Math.max(3 * 60 * 1000, ultimo + minutosTotal * 60 * 1000 - Date.now()) : 20 * 60 * 1000;
      emAquecimento = !ultimo;
      logger.info(ultimo
        ? `⏰ [CRON] Retomando a agenda: próximo disparo em ${Math.round(espera / 60000)} minuto(s).`
        : `⏰ [CRON] Delay inicial ativo. Primeiro disparo em 20 minuto(s). Depois disso passo a respeitar o tempo definido em ${CONFIG.bot.prefix}tempo.`);
    } else {
      emAquecimento = false;
      espera = minutosTotal * 60 * 1000;
      logger.info(`⏰ [CRON] Próximo ciclo em ${minutosTotal} minuto(s) (intervalo definido em ${CONFIG.bot.prefix}tempo).`);
    }

    metrics.atualizarAutodisparo({
      status: true,
      intervaloMinutos: minutosTotal,
      proximoDisparoEm: Date.now() + espera
    });

    timerTransmissao = setTimeout(realizarTransmissao, espera);

  } catch (e) {
    logger.error(`Erro ao agendar próximo ciclo: ${e.message}`);
    timerTransmissao = setTimeout(() => programarProximoCiclo(), 60000);
  }
}

function iniciarVigilanciaTempoReal() {
  setInterval(() => {
    try {
      if (fs.existsSync(autoResponderPath)) {
        const config = JSON.parse(fs.readFileSync(autoResponderPath, "utf-8"));
        if (config.status === true && agendaConhecida !== null && agendaDe(config) !== agendaConhecida) {
          logger.info("🔄 [TEMPO-REAL] A agenda da divulgação mudou. Reiniciando o cronômetro.");
          programarProximoCiclo();
        }
      }
    } catch (err) {
      logger.error(`Erro na vigilância de tempo real: ${err.message}`);
    }
  }, 15000);
}

async function rotinaAutoEntradaGrupos() {
  if (timerAutoEntrada) clearTimeout(timerAutoEntrada);
  const sock = sockAtivo();

  try {
    if (sock && conectado() && fs.existsSync(linksPath)) {
      let dbLinks = JSON.parse(fs.readFileSync(linksPath, "utf-8"));

      if (Array.isArray(dbLinks) && dbLinks.length > 0) {
        const chatsParticipando = await sock.groupFetchAllParticipating();
        const listaGruposBot = Object.values(chatsParticipando);

        const candidatos = dbLinks.filter(item => item.processadoOfc !== true);

        if (candidatos.length > 0) {
          logger.info(`📥 [AUTO-ENTRADA] Encontrados ${candidatos.length} links pendentes. Processando em lote rápido...`);

          for (const itemLink of candidatos) {
            const linkTexto = itemLink.link || "";
            const matchCodigo = linkTexto.match(/chat\.whatsapp\.com\/(?:invite\/)?([a-zA-Z0-9]{20,26})/i);

            if (!matchCodigo) continue;

            const codigoConvite = matchCodigo[1];
            const nomeDoGrupo = itemLink.nomeGrupo || "Desconhecido";

            const indiceReal = dbLinks.findIndex(dbItem => dbItem.link === itemLink.link);

            const infoConvite = await sock.groupGetInviteInfo(codigoConvite).catch(() => null);
            const jaEstaNoGrupo = infoConvite?.id
              ? Boolean(chatsParticipando[infoConvite.id])
              : listaGruposBot.some(g => String(g.subject || "").trim().toLowerCase() === nomeDoGrupo.trim().toLowerCase());

            if (jaEstaNoGrupo) {
              if (indiceReal !== -1) {
                dbLinks[indiceReal].processadoOfc = true;
                salvarJson(linksPath, dbLinks);
              }
              continue;
            }

            logger.info(`🚪 [AUTO-ENTRADA] Entrando no grupo: ${nomeDoGrupo}`);

            try {
              const jidResultado = await sock.groupAcceptInvite(codigoConvite);

              if (jidResultado) {
                logger.success(`🎉 [AUTO-ENTRADA] Bot entrou com sucesso no grupo ${jidResultado}!`);
                await sleep(3000);

                const metadata = await sock.groupMetadata(jidResultado).catch(() => null);

                if (metadata && metadata.announce) {
                  logger.warn(`🔒 [AUTO-ENTRADA] Grupo ${metadata.subject} está fechado. Saindo...`);

                  if (indiceReal !== -1) {
                    dbLinks[indiceReal].processadoOfc = true;
                    salvarJson(linksPath, dbLinks);
                  }

                  await sock.sendMessage(jidResultado, { text: "Este grupo só deixa admins mandarem mensagens, então vou sair. Até mais! 👋" }).catch(() => {});
                  await sleep(1500);
                  await sock.groupLeave(jidResultado);
                } else {
                  if (indiceReal !== -1) {
                    dbLinks[indiceReal].processadoOfc = true;
                    salvarJson(linksPath, dbLinks);
                  }

                  await sock.sendMessage(jidResultado, {
                    text: "Olá, pessoal! Obrigado por me receber no grupo. 👋"
                  }).catch(() => {});
                }
              } else {
                logger.warn(`⚠️ [AUTO-ENTRADA] Falha ao entrar em ${nomeDoGrupo}: resposta indefinida do servidor.`);
              }
            } catch (errInvite) {
              logger.error(`❌ [AUTO-ENTRADA] Falha ao aceitar convite de ${nomeDoGrupo}: ${errInvite.message}`);

              if (indiceReal !== -1) {
                dbLinks[indiceReal].processadoOfc = true;
                const [linkErrado] = dbLinks.splice(indiceReal, 1);
                dbLinks.push(linkErrado);
                salvarJson(linksPath, dbLinks);
              }
            }

            await sleep(4000);
          }
        } else {
          logger.info("ℹ️ [AUTO-ENTRADA] Nenhum grupo novo detectado na fila.");
        }
      }
    }
  } catch (errAuto) {
    logger.error(`💥 [AUTO-ENTRADA] Erro no processador de entrada automática: ${errAuto.message}`);
  }

  timerAutoEntrada = setTimeout(rotinaAutoEntradaGrupos, 60000);
}

function lerConfigDivulgacaoBruta() {
  if (!fs.existsSync(autoResponderPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(autoResponderPath, "utf-8"));
  } catch (e) {
    logger.error(`Erro ao ler autoresponder.json: ${e.message}`);
    return {};
  }
}

export function obterConfiguracaoDivulgacao() {
  const config = lerConfigDivulgacaoBruta();
  const mensagens = Array.isArray(config.mensagens) && config.mensagens.length
    ? config.mensagens
    : (config.mensagem ? [config.mensagem] : []);
  return {
    status: config.status === true,
    intervaloMinutos: config.intervaloMinutos || 60,
    mensagens,
    modoEnvio: config.modoEnvio === "selecionados" ? "selecionados" : "todos",
    gruposSelecionados: Array.isArray(config.gruposSelecionados) ? config.gruposSelecionados : []
  };
}

function salvarPatchDivulgacao(patch) {
  return salvarDivulgacao(patch);
}

function montarTextoPainelDivulgacao(cfg) {
  const destino = cfg.modoEnvio === "selecionados" ? `${cfg.gruposSelecionados.length} grupo(s) escolhido(s)` : "todos os grupos";
  const msgAtual = cfg.mensagens[0] ? `"${cfg.mensagens[0].slice(0, 160)}${cfg.mensagens[0].length > 160 ? "…" : ""}"` : "ainda não definido";
  const rodizio = lerRodizio();
  const horarios = lerHorarios();

  return `*Divulgação automática*

Situação: ${cfg.status ? "ligada ✅" : "desligada"}
${horarios.length ? `Horários fixos: ${horarios.join(", ")} (Trem-bala)` : `Intervalo: a cada ${cfg.intervaloMinutos} min`}
Para onde: ${destino}
${rodizio.ativo && rodizio.textos.length ? `Texto: rodízio com ${rodizio.textos.length} textos (Eternamente)` : `Texto: _${msgAtual}_`}

Responda com um número:
*1* · ${cfg.status ? "Desligar" : "Ligar"} a divulgação
*2* · Escolher os grupos
*3* · Enviar para todos os grupos
*4* · Mudar o intervalo
*5* · Mudar o texto
*0* · Fechar`;
}

export async function enviarPainelDivulgacao(sock, jid) {
  try {
    const cfg = obterConfiguracaoDivulgacao();
    await sock.sendMessage(jid, { text: montarTextoPainelDivulgacao(cfg) });
    estadosDivulgacao.set(jid, { etapa: "menu", expiraEm: Date.now() + TTL_ESTADO_DIVULGACAO_MS });
  } catch (e) {
    logger.error(`Erro ao enviar painel de divulgação: ${e.message}`);
  }
}

const ARQ_AVISO_CONEXAO = path.resolve("./storage/aviso-conexao.json");
export async function enviarResumoDivulgacao(sock) {
  try {
    const donoJid = jidDoDono();
    if (!donoJid) return;
    const ultimo = Number(lerJson(ARQ_AVISO_CONEXAO, {})?.em) || 0;
    if (Date.now() - ultimo < 12 * 60 * 60 * 1000) return;
    salvarJson(ARQ_AVISO_CONEXAO, { em: Date.now() });

    const cfg = obterConfiguracaoDivulgacao();
    await sock.sendMessage(donoJid, {
      text: `Oi! O bot está online ✅\n\n${montarTextoPainelDivulgacao(cfg)}\n\n_Todos os comandos: ${CONFIG.bot.prefix}menu_`
    });
    estadosDivulgacao.set(donoJid, { etapa: "menu", expiraEm: Date.now() + TTL_ESTADO_DIVULGACAO_MS });
  } catch (e) {
    logger.error(`Erro ao enviar resumo de divulgação na conexão: ${e.message}`);
  }
}

async function iniciarSelecaoDeGrupos(sock, from) {
  try {
    const chats = await sock.groupFetchAllParticipating();
    const grupos = Object.values(chats);

    if (!grupos.length) {
      await sock.sendMessage(from, { text: "O bot ainda não está em nenhum grupo." });
      estadosDivulgacao.delete(from);
      return true;
    }

    const cfg = obterConfiguracaoDivulgacao();
    const listaGrupos = grupos.map(g => ({ id: g.id, nome: g.subject || "Grupo sem nome" }));
    const texto = listaGrupos
      .map((g, i) => `${i + 1}. ${cfg.gruposSelecionados.includes(g.id) ? "✅" : "◻️"} ${g.nome}`)
      .join("\n");

    await sock.sendMessage(from, {
      text: `*Escolher grupos*\n\n${texto}\n\nResponda com os números para marcar ou desmarcar (ex.: 1,3,5).\nQuando terminar, envie *concluir*.`
    });

    estadosDivulgacao.set(from, {
      etapa: "selecionando_grupos",
      expiraEm: Date.now() + TTL_ESTADO_DIVULGACAO_MS,
      grupos: listaGrupos
    });
    return true;
  } catch (e) {
    logger.error(`Erro ao iniciar seleção de grupos: ${e.message}`);
    await sock.sendMessage(from, { text: "Não consegui listar os grupos agora. Tente de novo em instantes." });
    estadosDivulgacao.delete(from);
    return true;
  }
}

async function processarSelecaoDeGrupos(sock, from, entrada, estado) {
  if (/^concluir$/i.test(entrada.trim())) {
    salvarPatchDivulgacao({ modoEnvio: "selecionados" });
    const cfg = obterConfiguracaoDivulgacao();
    await sock.sendMessage(from, {
      text: `Pronto ✅ A divulgação vai só para ${cfg.gruposSelecionados.length} grupo(s) escolhido(s).`
    });
    estadosDivulgacao.delete(from);
    return true;
  }

  const indices = entrada.split(",").map(v => parseInt(v.trim(), 10)).filter(n => Number.isInteger(n) && n > 0);
  if (!indices.length) {
    await sock.sendMessage(from, { text: "Não entendi. Envie os números separados por vírgula (ex.: 1,3) ou *concluir*." });
    return true;
  }

  const cfg = obterConfiguracaoDivulgacao();
  const selecionados = new Set(cfg.gruposSelecionados);

  for (const i of indices) {
    const grupo = estado.grupos[i - 1];
    if (!grupo) continue;
    if (selecionados.has(grupo.id)) selecionados.delete(grupo.id);
    else selecionados.add(grupo.id);
  }

  salvarPatchDivulgacao({ gruposSelecionados: Array.from(selecionados) });

  const listaAtualizada = estado.grupos
    .map((g, i) => `${i + 1}. ${selecionados.has(g.id) ? "✅" : "◻️"} ${g.nome}`)
    .join("\n");

  await sock.sendMessage(from, { text: `${listaAtualizada}\n\nContinue marcando ou envie *concluir* para salvar.` });
  estadosDivulgacao.set(from, { ...estado, expiraEm: Date.now() + TTL_ESTADO_DIVULGACAO_MS });
  return true;
}

export async function interceptarDivulgacao({ sock, from, textoLimpo, isDono, commandName }) {
  if (!isDono) return false;
  if (from.endsWith("@g.us")) return false;

  const nomeMenu = String(commandName || "").replace(/^[!#./]/, "");
  if (nomeMenu === "divulgacao" || nomeMenu === "divulgação") {
    await enviarPainelDivulgacao(sock, from);
    return true;
  }

  const estado = estadosDivulgacao.get(from);
  if (estadoExpirado(estado)) {
    if (estado) estadosDivulgacao.delete(from);
    return false;
  }

  const entrada = textoLimpo.trim();

  if (entrada.startsWith(CONFIG.bot.prefix)) {
    estadosDivulgacao.delete(from);
    return false;
  }

  if (estado.etapa === "menu") {
    if (!/^\d{1,2}$/.test(entrada)) {
      estadosDivulgacao.delete(from);
      return false;
    }
    switch (entrada) {
      case "1": {
        const cfg = obterConfiguracaoDivulgacao();
        salvarPatchDivulgacao({ status: !cfg.status });
        reagendarCicloExterno(sock);
        await sock.sendMessage(from, { text: !cfg.status ? `Divulgação ligada ✅ Envio a cada ${cfg.intervaloMinutos} min.` : "Divulgação desligada." });
        estadosDivulgacao.delete(from);
        return true;
      }
      case "2":
        return await iniciarSelecaoDeGrupos(sock, from);
      case "3": {
        salvarPatchDivulgacao({ modoEnvio: "todos" });
        await sock.sendMessage(from, { text: "Pronto ✅ A divulgação vai para todos os grupos." });
        estadosDivulgacao.delete(from);
        return true;
      }
      case "4":
        estadosDivulgacao.set(from, { etapa: "aguardando_tempo", expiraEm: Date.now() + TTL_ESTADO_DIVULGACAO_MS });
        await sock.sendMessage(from, { text: "De quantos em quantos minutos? Responda só com o número (ex.: 60)." });
        return true;
      case "5":
        estadosDivulgacao.set(from, { etapa: "aguardando_mensagem", expiraEm: Date.now() + TTL_ESTADO_DIVULGACAO_MS });
        await sock.sendMessage(from, { text: "Envie agora o novo texto da divulgação (pode ter links e formatação)." });
        return true;
      case "0":
        estadosDivulgacao.delete(from);
        await sock.sendMessage(from, { text: `Menu fechado. Quando quiser, mande ${CONFIG.bot.prefix}divulgacao.` });
        return true;
      default:
        await sock.sendMessage(from, { text: "Essa opção não existe. Responda com um número de 0 a 5." });
        return true;
    }
  }

  if (estado.etapa === "aguardando_tempo") {
    const minutos = parseInt(entrada.replace(/\D/g, ""), 10);
    if (!minutos || minutos < 1 || minutos > 10080) {
      await sock.sendMessage(from, { text: "Responda só com o número de minutos, entre 1 e 10080 (ex.: 60)." });
      return true;
    }
    salvarPatchDivulgacao({ intervaloMinutos: minutos, agendaDesde: Date.now() });
    programarProximoCiclo();
    await sock.sendMessage(from, { text: `Pronto ✅ A divulgação agora sai a cada ${minutos} min.` });
    estadosDivulgacao.delete(from);
    return true;
  }

  if (estado.etapa === "aguardando_mensagem") {
    if (!entrada) {
      await sock.sendMessage(from, { text: "Não recebi texto. Envie o texto da divulgação." });
      return true;
    }
    salvarPatchDivulgacao({ mensagens: [entrada], mensagem: entrada });
    await sock.sendMessage(from, { text: "Texto salvo ✅ Ele vai na próxima divulgação." });
    estadosDivulgacao.delete(from);
    return true;
  }

  if (estado.etapa === "selecionando_grupos") {
    return await processarSelecaoDeGrupos(sock, from, entrada, estado);
  }

  return false;
}

export function disparoEmAndamento() {
  return emTransmissao;
}

export async function forcarDisparoExterno(sock, opcoes = {}) {
  if (sock) sockAtual = sock;
  if (emTransmissao) return { ok: false, texto: "já existe um disparo em andamento" };
  if (timerTransmissao) clearTimeout(timerTransmissao);
  ultimoResultado = null;
  await realizarTransmissao({ ...opcoes, manual: true });
  return ultimoResultado || { ok: false, texto: "o disparo não chegou a começar" };
}

export function reagendarCicloExterno(sock) {
  if (sock) sockAtual = sock;
  programarProximoCiclo();
}

export default {
  name: "autodisparo",

  execute(sock) {
    sockAtual = sock;
    if (sistemaIniciado) return;
    sistemaIniciado = true;
    logger.info("⏱️ [SISTEMA] Inicializando controlador inteligente de anúncios...");

    if (fs.existsSync(autoResponderPath)) {
      try {
        const configAR = JSON.parse(fs.readFileSync(autoResponderPath, "utf-8"));
        if (!configAR.intervaloMinutos) {
          configAR.intervaloMinutos = 60;
        }
        if (configAR.modoEnvio !== "todos" && configAR.modoEnvio !== "selecionados") {
          configAR.modoEnvio = "todos";
        }
        if (!Array.isArray(configAR.gruposSelecionados)) {
          configAR.gruposSelecionados = [];
        }
        salvarJson(autoResponderPath, configAR);
      } catch (e) {
        logger.error(`Erro setup inicial: ${e.message}`);
      }
    }

    programarProximoCiclo();
    iniciarVigilanciaTempoReal();

    timerAutoEntrada = setTimeout(() => {
      logger.info("📥 [SISTEMA] Inicializando gerenciador automático de novos grupos (Ciclo: 1 minuto)...");
      rotinaAutoEntradaGrupos();
    }, 10000);
  }
};
