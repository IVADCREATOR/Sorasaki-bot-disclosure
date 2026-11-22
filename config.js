const CONFIG = {
  bot: {
    name: process.env.BOT_NAME || "AUTODISPARO",
    version: "1.1.0",
    prefix: "#",
    language: "pt-BR",
    number: process.env.BOT_PAIRING_NUMBER || ""
  },
  owner: {
    name: process.env.BOT_OWNER_NAME || "SEU NOME",
    number: process.env.BOT_OWNER_NUMBER || "",
    numberFormatted: "",
    lid: ""
  },
  system: {
    autoRead: true,
    logErrors: true
  },
  dashboard: {
    uniqueUserSalt: process.env.METRICS_SALT || "troque-este-valor"
  },
  paths: {
    storage: "./storage"
  }
};

export default CONFIG;
