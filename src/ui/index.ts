/**
 * Terminal UI helpers: Vexi branding, colors and status output.
 * Palette: deep black background + electric blue (#2979FF) accent.
 */

import chalk from 'chalk';

/** Vexi electric blue accent. */
export const accent = chalk.hex('#2979FF');
export const accentBold = chalk.hex('#2979FF').bold;
export const dim = chalk.gray;
export const ok = chalk.green;
export const warn = chalk.yellow;
export const err = chalk.red;

const LOGO = `
██╗   ██╗███████╗██╗  ██╗██╗
██║   ██║██╔════╝╚██╗██╔╝██║
██║   ██║█████╗   ╚███╔╝ ██║
╚██╗ ██╔╝██╔══╝   ██╔██╗ ██║
 ╚████╔╝ ███████╗██╔╝ ██╗██║
  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝
`;

/** Print the Vexi ASCII banner. */
export function printBanner(version: string): void {
  console.log(accentBold(LOGO));
  console.log(dim(`  open-source AI coding agent · v${version}\n`));
}

/** Print the session status line: project, provider, model, language. */
export function printStatusLine(info: {
  project: string;
  provider: string;
  model: string;
  lang: string;
}): void {
  const sep = dim(' · ');
  console.log(
    [
      `${dim('project')} ${accent(info.project)}`,
      `${dim('provider')} ${accent(info.provider)}`,
      `${dim('model')} ${accent(info.model)}`,
      `${dim('lang')} ${accent(info.lang)}`,
    ].join(sep) + '\n',
  );
}

/** Prompt label for user input. */
export const userPrompt = accentBold('you ›');

/** Label printed before the assistant's streamed reply. */
export const vexiLabel = accentBold('vexi ›');
