/**
 * Interactive onboarding flow for `vexi setup`.
 *
 * The IO interface is injected so tests can drive the prompts without
 * touching stdin/stdout. The optional discoverFn and saveFn are also
 * injected for testability.
 */

import type { VexiConfig } from './config.js';
import { saveConfig } from './config.js';
import { identifyFromUrl, discoverModels } from './endpoint.js';
import type { UrlIdentity } from './endpoint.js';

export { loadConfig, saveConfig } from './config.js';

export interface OnboardingIO {
  prompt(question: string): Promise<string>;
  write(line: string): void;
}

type DiscoverFn = (identity: UrlIdentity, apiKey: string) => Promise<string[]>;
type SaveFn = (config: VexiConfig) => Promise<void>;

/**
 * Run the interactive setup wizard.
 *
 * Steps:
 * 1. Ask for the API endpoint URL
 * 2. Identify the provider from the URL
 * 3. Ask for the API key
 * 4. Discover available models (or ask for a manual entry on failure)
 * 5. Let the user choose a model (or enter one manually)
 * 6. Save config and return it
 */
export async function runOnboarding(
  io: OnboardingIO,
  discoverFn: DiscoverFn = discoverModels,
  saveFn: SaveFn = saveConfig,
): Promise<VexiConfig> {
  io.write('');
  io.write('Welcome to Vexi setup. Let\'s configure your AI provider.');
  io.write('');

  // Step 1: URL
  const rawUrl = await io.prompt('Paste your API endpoint URL (e.g. https://openrouter.ai/api/v1): ');
  if (!rawUrl.trim()) {
    throw new Error('No URL provided. Run `vexi setup` again to configure.');
  }

  // Step 2: Identify
  let identity: UrlIdentity;
  try {
    identity = identifyFromUrl(rawUrl.trim());
  } catch {
    throw new Error(`Could not parse URL "${rawUrl}". Please check the URL and try again.`);
  }

  io.write(`  Detected provider: ${identity.displayName}`);
  io.write(`  Base URL:          ${identity.baseUrl}`);
  io.write('');

  // Step 3: API key
  const apiKey = await io.prompt(`Enter your ${identity.displayName} API key: `);
  if (!apiKey.trim()) {
    throw new Error('No API key provided. Run `vexi setup` again to configure.');
  }

  // Step 4: Discover models
  let models: string[] = [];
  try {
    models = await discoverFn(identity, apiKey.trim());
    if (models.length === 0) {
      io.write('  No models returned by /models endpoint.');
    } else {
      io.write(`  Found ${models.length} model(s).`);
    }
  } catch (err) {
    io.write(`  Warning: could not fetch models — ${(err as Error).message}`);
  }
  io.write('');

  // Step 5: Choose or enter model
  let model: string;

  if (models.length > 0) {
    io.write('Available models:');
    models.slice(0, 20).forEach((m, i) => io.write(`  ${String(i + 1).padStart(2)}. ${m}`));
    if (models.length > 20) {
      io.write(`  ... and ${models.length - 20} more`);
    }
    io.write('');
    const choice = await io.prompt(
      `Enter a number (1-${Math.min(20, models.length)}) or type a model ID directly: `,
    );
    const num = parseInt(choice.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= models.length) {
      model = models[num - 1];
    } else if (choice.trim()) {
      model = choice.trim();
    } else {
      model = models[0];
    }
  } else {
    const manualModel = await io.prompt('Enter the model ID to use (e.g. gpt-4o): ');
    if (!manualModel.trim()) {
      throw new Error('No model specified. Run `vexi setup` again to configure.');
    }
    model = manualModel.trim();
  }

  io.write('');
  io.write(`  Using model: ${model}`);
  io.write('');

  // Step 6: Save
  const config: VexiConfig = {
    provider: identity.provider,
    displayName: identity.displayName,
    baseUrl: identity.baseUrl,
    apiKey: apiKey.trim(),
    model,
  };

  await saveFn(config);

  io.write(`Configuration saved. You can now run: vexi`);
  io.write('');

  return config;
}
