/**
 * Terminal UI rendering for the Thiny CLI.
 * All UI output goes to stdout. All logs go to stderr (via pinoLogger({ stderr: true })).
 */
import figlet from "figlet";
import chalk from "chalk";

// Theme

const BRAND = chalk.cyan;
const DIM = chalk.dim;
const USER_LABEL = chalk.bold.white;
const AGENT_LABEL = BRAND.bold;
const ERROR_COLOR = chalk.red;
const SUCCESS_COLOR = chalk.green;
const SEPARATOR = DIM("─".repeat(getWidth()));

// Helpers

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

// ASCII art header

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

  // Print title lines centered and colored (cyan)
  for (const line of title.split("\n")) {
    if (line.trim()) process.stdout.write(center(BRAND.bold(line), w) + "\n");
  }

  process.stdout.write("\n");

  // Info bar
  const version = opts.version ?? "v0.1.0";
  const infoText = ` ${opts.persona ?? "Thiny"} Agent ${version} `;
  const remaining = Math.max(0, w - visibleLen(infoText));
  const leftDash = "─".repeat(Math.floor(remaining / 2));
  const rightDash = "─".repeat(remaining - leftDash.length);
  process.stdout.write(BRAND(leftDash) + BRAND.bold(infoText) + BRAND(rightDash) + "\n\n");
}

// Tools + Skills panel

export interface PanelEntry {
  label: string;
  value: string;
}

export function renderToolsAndSkills(
  tools: string[],
  skills: Map<string, string[]>,
  opts: { model: string; session: string; persona?: string },
): void {
  const w = getWidth();
  
  // Left column width: 25 columns
  const leftColW = 25;
  const leftLines: string[] = [
    "",
    center(BRAND.bold(opts.persona ?? "Thiny"), leftColW),
    center(DIM(opts.model.slice(0, leftColW - 2)), leftColW),
    center(DIM(`Session: ${opts.session.slice(-8)}`), leftColW),
  ];

  // Right column lines
  const toolGroups = new Map<string, string[]>();
  for (const tool of tools) {
    const idx = tool.indexOf("_");
    const prefix = idx !== -1 ? tool.slice(0, idx) : "core";
    const list = toolGroups.get(prefix) ?? [];
    list.push(tool);
    toolGroups.set(prefix, list);
  }

  const rightLines: string[] = [];
  rightLines.push(BRAND.bold("Available Tools"));
  for (const [prefix, names] of toolGroups) {
    rightLines.push(`  ${BRAND(prefix)}: ${names.join(", ")}`);
  }
  rightLines.push("");
  rightLines.push(BRAND.bold("Available Skills"));
  
  if (skills.size === 0) {
    rightLines.push(`  ${DIM("(none loaded — use --skills <id>)")}`);
  } else {
    for (const [cat, names] of skills) {
      rightLines.push(`  ${BRAND(cat)}: ${names.join(", ")}`);
    }
  }

  // Draw side-by-side
  const maxLines = Math.max(leftLines.length, rightLines.length);
  
  // Draw border top
  process.stdout.write(BRAND("┌" + "─".repeat(w - 2) + "┐") + "\n");

  for (let i = 0; i < maxLines; i++) {
    const leftRaw = leftLines[i] ?? "";
    const rightRaw = rightLines[i] ?? "";

    // pad left column to leftColW
    const leftPad = padRight(leftRaw, leftColW);
    
    // spacing between left and right column
    const spacer = BRAND(" │ ");
    
    // pad right column to fill remaining space
    const rightColW = w - leftColW - 7; // 2 borders (┌/┐) + 3 spacer ( │ ) = 5 plus margin
    const rightPad = padRight(rightRaw, rightColW);

    process.stdout.write(BRAND("│ ") + leftPad + spacer + rightPad + BRAND(" │") + "\n");
  }

  // Draw border bottom
  process.stdout.write(BRAND("└" + "─".repeat(w - 2) + "┘") + "\n");
}

// Hints bar

export function renderHints(logFile?: string): void {
  const logHint = logFile ? `  ·  ${DIM("logs →")} ${chalk.dim(logFile)}` : "";
  process.stdout.write(
    "\n" +
      DIM("Type a message  ·  ") +
      DIM("/new") +
      chalk.dim(" new session  ·  ") +
      DIM("/skills") +
      chalk.dim(" list skills  ·  ") +
      DIM("/tools") +
      chalk.dim(" list tools  ·  ") +
      DIM("Ctrl+C") +
      chalk.dim(" quit") +
      logHint +
      "\n\n",
  );
}

// Message formatting

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

// Spinner

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
