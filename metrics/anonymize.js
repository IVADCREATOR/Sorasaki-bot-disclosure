
import crypto from "crypto";
import CONFIG from "../config.js";

const SALT = CONFIG?.dashboard?.uniqueUserSalt || process.env.METRICS_SALT || "sorasaki-metrics-salt";

export function hashIdentificador(valor) {
  if (!valor) return null;
  return crypto.createHash("sha256").update(`${SALT}:${valor}`).digest("hex").slice(0, 16);
}