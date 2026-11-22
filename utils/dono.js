import path from "path";
import CONFIG from "../config.js";
import { lerJson } from "./arquivo.js";

export function jidDoDono() {
  const numero = String(CONFIG.owner?.number || "").replace(/\D/g, "");
  if (numero.length >= 10) return `${numero}@s.whatsapp.net`;
  const lid = String(CONFIG.owner?.lid || "").trim();
  if (/^\d{6,20}@lid$/.test(lid)) return lid;
  const aprendidos = lerJson(path.resolve("./storage/donos.json"), []);
  const id = Array.isArray(aprendidos) ? String(aprendidos[aprendidos.length - 1] || "") : "";
  if (/^\d{10,13}$/.test(id)) return `${id}@s.whatsapp.net`;
  if (/^\d{14,20}$/.test(id)) return `${id}@lid`;
  return null;
}
