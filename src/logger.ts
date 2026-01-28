import pino from "pino";
import { CONFIG } from "./config.js";

export const log = pino({
  level: CONFIG.logLevel,
  transport: {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:standard" }
  }
});
