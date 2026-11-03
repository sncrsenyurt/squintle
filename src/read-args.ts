const COMMANDS = ["capture-baseline", "compare", "approve"] as const;

export type CommandName = (typeof COMMANDS)[number];

export type Parsed =
  | { kind: "empty" }
  | { kind: "help" }
  | { kind: "bad"; reason: string }
  | { kind: "url"; href: string }
  | { kind: "command"; name: CommandName; target?: string };

function isCommand(value: string): value is CommandName {
  return (COMMANDS as readonly string[]).includes(value);
}

export function parseArgv(argv: string[]): Parsed {
  if (argv.length === 0) return { kind: "empty" };

  const [head, ...rest] = argv;

  if (head === "help" || head === "--help" || head === "-h") {
    if (rest.length) return { kind: "bad", reason: "help takes no arguments" };
    return { kind: "help" };
  }

  if (head.startsWith("https://") || head.startsWith("http://")) {
    if (rest.length) return { kind: "bad", reason: "pass a url on its own" };
    return { kind: "url", href: head };
  }

  if (!isCommand(head)) return { kind: "bad", reason: `unknown command: ${head}` };
  if (rest.length > 1) return { kind: "bad", reason: `${head} takes at most one path` };

  return { kind: "command", name: head, target: rest[0] };
}

export function usageText(): string {
  return [
    "usage: squintle <url>",
    "       squintle capture-baseline [sheet]",
    "       squintle compare [sheet]",
    "       squintle approve [ledger]",
    "       squintle help",
    "",
    "sheet: sights, apertures, veils, driftLimit, ledge",
  ].join("\n");
}
