import fs from "fs";
import path from "path";
import util from "util";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m"
};

const LOG_FILE = path.resolve("./storage/logs.txt");
const LOG_MAX = 1024 * 1024;
let gravacoes = 0;

const GRAVAR_ARQUIVO = process.env.SORASAKI_PAINEL !== "on";

function writeLog(type, message) {
  if (!GRAVAR_ARQUIVO) return;
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (++gravacoes % 200 === 1) {
      try { if (fs.statSync(LOG_FILE).size > LOG_MAX) fs.renameSync(LOG_FILE, LOG_FILE.replace(/\.txt$/, ".old.txt")); } catch {}
    }
    const parsedMessage = typeof message === "object"
      ? util.inspect(message, { depth: null, colors: false })
      : message;
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [${type.toUpperCase()}]: ${parsedMessage}\n`, "utf8");
  } catch (err) {
    console.error("\x1b[31m[CRITICAL LOG ERROR]\x1b[0m Falha ao gravar no disco:", err.message);
  }
}

export function limparTela() {
  if (process.stdout.isTTY && process.env.SORASAKI_PAINEL !== "on") console.clear();
}

function versao() {
  try { return JSON.parse(fs.readFileSync(path.resolve("./package.json"), "utf8")).sorasakiVersion || ""; } catch { return ""; }
}

function getTimestamp() {
  const now = new Date();
  return `${c.dim}[${now.toLocaleTimeString("pt-BR")}]${c.reset}`;
}

function formatMessage(msg) {
  if (msg instanceof Error) return msg.stack || msg.message;
  if (typeof msg === "object") return util.inspect(msg, { colors: true, depth: 3 });
  return msg;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function banner() {
  if (!process.stdout.isTTY || process.env.SORASAKI_PAINEL === "on") {
    console.log(`  SORASAKI ${versao() ? `v${versao()} ` : ""}● online`);
    return;
  }
  console.clear();

  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const passos = [
    "inicializando núcleo...",
    "sincronizando sessão...",
    "estabilizando link..."
  ];

  for (const passo of passos) {
    for (let i = 0; i < 6; i++) {
      process.stdout.write(`\r  ${c.cyan}${frames[i % frames.length]}${c.reset} ${c.dim}${passo}${c.reset}`);
      await sleep(40);
    }
  }
  process.stdout.write("\r" + " ".repeat(60) + "\r");

  const gradiente = [c.magenta, c.blue, c.cyan, c.blue, c.magenta];
  const logo = "SORASAKI";
  let nomeColorido = "";
  for (let i = 0; i < logo.length; i++) {
    nomeColorido += gradiente[i % gradiente.length] + c.bold + logo[i];
  }

  console.log("");
  console.log(`  ${nomeColorido}${c.reset}  ${c.dim}⚡ v${versao() || "?"}${c.reset}`);
  console.log(`  ${c.bgGreen}${c.white}${c.bold} ● ONLINE ${c.reset}  ${c.dim}by nojx ivad ${c.reset}${c.yellow}📞 55 11 99359-6388${c.reset}`);
  console.log("");
}

export default {
  banner,

  info(msg) {
    const formatted = formatMessage(msg);
    console.log(`${getTimestamp()} ${c.bold}${c.blue}ℹ [INFO]${c.reset} ${formatted}`);
    writeLog("info", formatted);
  },

  success(msg) {
    const formatted = formatMessage(msg);
    console.log(`${getTimestamp()} ${c.bold}${c.green}✔ [SUCCESS]${c.reset} ${c.green}${formatted}${c.reset}`);
    writeLog("success", formatted);
  },

  warn(msg) {
    const formatted = formatMessage(msg);
    console.log(`${getTimestamp()} ${c.bold}${c.yellow}⚠ [WARN]${c.reset} ${formatted}`);
    writeLog("warn", formatted);
  },

  error(msg) {
    const formatted = formatMessage(msg);
    console.log(`${getTimestamp()} ${c.bold}${c.bgRed}${c.white} ✘ [ERROR] ${c.reset} ${c.red}${formatted}${c.reset}`);
    writeLog("error", formatted);
  }
};