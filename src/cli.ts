import { z } from "zod";

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  return args[i + 1];
}

export const CLI = (() => {
  const schema = z.object({
    once: z.boolean(),
    watch: z.boolean(),
    intervalSec: z.number().int().positive(),
    json: z.boolean()
  });

  const once = args.includes("--once") || (!args.includes("--watch"));
  const watch = args.includes("--watch");
  const intervalSec = Number(getArg("--interval") ?? "60");
  const json = args.includes("--json");

  return schema.parse({ once, watch, intervalSec, json });
})();
