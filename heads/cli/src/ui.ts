/**
 * Terminal UI rendering for the Thiny CLI.
 * All UI output goes to stdout. All logs go to stderr (via pinoLogger({ stderr: true })).
 */
import figlet from "figlet";
import chalk from "chalk";

// ── Theme ──────────────────────────────────────────────────────────────────────

const BRAND = chalk.cyan;
const DIM = chalk.dim;
const BOLD = chalk.bold;
const USER_LABEL = chalk.bold.white;
const AGENT_LABEL = BRAND.bold;
const TOOL_COLOR = chalk.yellow;
const SKILL_CAT = chalk.cyan.bold;
const SKILL_NAME = chalk.white;
const ERROR_COLOR = chalk.red;
const SUCCESS_COLOR = chalk.green;
const SEPARATOR = DIM("─".repeat(getWidth()));

// ── Helpers ────────────────────────────────────────────────────────────────────

export function getWidth(): number {
  return process.stdout.columns || 80;
}

// Strip ANSI escape sequences to compute visible (rendered) string length.
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B\[[0-9;]*m/g;
const visibleLen = (s: string) => s.replace(ANSI_REGEX, "").length;

function padRight(str: string, len: number): string {
  return str + " ".repeat(Math.max(0, len - visibleLen(str)));
}

function center(str: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - visibleLen(str)) / 2));
  return " ".repeat(pad) + str;
}

// ── ASCII art header ───────────────────────────────────────────────────────────

export function renderHeader(opts: {
  model: string;
  session: string;
  persona?: string;
  version?: string;
}): void {
  const w = getWidth();

  // ASCII art title
  let title: string;
  try {
    title = figlet.textSync(opts.persona ?? "Thiny", { font: "Standard" });
  } catch {
    title = opts.persona ?? "Thiny";
  }

  process.stdout.write("\n");

  // Print title lines centered and colored
  for (const line of title.split("\n")) {
    if (line.trim()) process.stdout.write(center(BRAND.bold(line), w) + "\n");
  }

  process.stdout.write("\n");

  // Info bar
  const version = opts.version ?? "v0.1.0";
  const info = [
    BRAND(`Thiny Agent ${version}`),
    DIM("·"),
    chalk.white(`Model: ${opts.model}`),
    DIM("·"),
    chalk.white(`Session: ${opts.session}`),
  ].join("  ");
  process.stdout.write(center(info, w) + "\n");
  process.stdout.write("\n");
}

// ── Tools + Skills panel ───────────────────────────────────────────────────────

export interface PanelEntry {
  label: string;
  value: string;
}

export function renderToolsAndSkills(tools: string[], skills: Map<string, string[]>): void {
  const w = getWidth();
  const halfW = Math.floor(w / 2) - 2;

  // Box top
  process.stdout.write(
    BRAND("┌") +
      BRAND("─".repeat(halfW)) +
      BRAND("┬") +
      BRAND("─".repeat(w - halfW - 3)) +
      BRAND("┐") +
      "\n",
  );

  // Headers
  process.stdout.write(
    BRAND("│") +
      padRight(BOLD(" Tools"), halfW) +
      BRAND("│") +
      padRight(BOLD(" Skills"), w - halfW - 3) +
      BRAND("│") +
      "\n",
  );

  // Divider
  process.stdout.write(
    BRAND("├") +
      BRAND("─".repeat(halfW)) +
      BRAND("┼") +
      BRAND("─".repeat(w - halfW - 3)) +
      BRAND("┤") +
      "\n",
  );

  // Build rows: left = tools, right = skill entries
  const toolLines = tools.map((t) => ` ${TOOL_COLOR("•")} ${chalk.white(t)}`);
  if (toolLines.length === 0) toolLines.push(DIM(" (none)"));

  const skillLines: string[] = [];
  for (const [cat, names] of skills) {
    const overflow = names.length - 4;
    const display = names.slice(0, 4).join(", ") + (overflow > 0 ? `, +${String(overflow)}` : "");
    skillLines.push(` ${SKILL_CAT(cat.padEnd(12))} ${SKILL_NAME(display)}`);
  }
  if (skillLines.length === 0) skillLines.push(DIM(" (none loaded — use --skills <id>)"));

  const rows = Math.max(toolLines.length, skillLines.length);
  for (let i = 0; i < rows; i++) {
    const left = toolLines[i] ?? "";
    const right = skillLines[i] ?? "";
    process.stdout.write(
      BRAND("│") +
        padRight(left, halfW) +
        BRAND("│") +
        padRight(right, w - halfW - 3) +
        BRAND("│") +
        "\n",
    );
  }

  // Box bottom
  process.stdout.write(
    BRAND("└") +
      BRAND("─".repeat(halfW)) +
      BRAND("┴") +
      BRAND("─".repeat(w - halfW - 3)) +
      BRAND("┘") +
      "\n",
  );
}

// ── Hints bar ─────────────────────────────────────────────────────────────────

export function renderHints(): void {
  process.stdout.write(
    "\n" +
      DIM("Type a message and press Enter  ·  ") +
      DIM("/new") +
      chalk.dim(" — new session  ·  ") +
      DIM("/tools") +
      chalk.dim(" — list tools  ·  ") +
      DIM("Ctrl+C") +
      chalk.dim(" — quit") +
      "\n\n",
  );
}

// ── Message formatting ─────────────────────────────────────────────────────────

export function renderUserMessage(text: string): void {
  process.stdout.write("\n" + USER_LABEL("You") + "\n");
  process.stdout.write(SEPARATOR + "\n");
  process.stdout.write(chalk.white(text) + "\n");
}

export function renderAgentLabel(name: string): void {
  process.stdout.write("\n" + AGENT_LABEL(name) + "\n");
  process.stdout.write(SEPARATOR + "\n");
}

export function renderAgentDone(): void {
  process.stdout.write("\n");
}

export function renderToolCall(toolName: string, status: "start" | "done" | "error"): void {
  const icons = { start: "⚙", done: "✓", error: "✗" };
  const colors = { start: chalk.yellow, done: chalk.green, error: chalk.red };
  process.stdout.write(DIM(`  ${icons[status]} `) + colors[status](toolName) + "\n");
}

export function renderError(message: string): void {
  process.stdout.write("\n" + ERROR_COLOR("Error: ") + chalk.white(message) + "\n");
}

export function renderInfo(message: string): void {
  process.stdout.write(DIM(message) + "\n");
}

export function renderSuccess(message: string): void {
  process.stdout.write(SUCCESS_COLOR("✓ ") + chalk.white(message) + "\n");
}

export function renderWarning(message: string): void {
  process.stdout.write(chalk.yellow("⚠ ") + chalk.white(message) + "\n");
}

// ── Spinner ────────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private frameIdx = 0;

  start(label: string): void {
    this.stop();
    process.stdout.write("\n");
    this.intervalId = setInterval(() => {
      const frame = SPINNER_FRAMES[this.frameIdx % SPINNER_FRAMES.length] ?? "⠋";
      process.stdout.write(`\r  ${BRAND(frame)} ${DIM(label)}   `);
      this.frameIdx++;
    }, 80);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      process.stdout.write("\r" + " ".repeat(40) + "\r");
    }
  }
}

export function clearScreen(): void {
  process.stdout.write("\x1Bc");
}
