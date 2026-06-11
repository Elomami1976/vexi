/**
 * Multi-language support for the terminal UI.
 *
 * Supported: English (en), Spanish (es), Portuguese (pt), French (fr), Arabic (ar).
 *
 * RTL strategy: terminals render Arabic broken (disconnected letters, wrong
 * direction), so when the language is Arabic the interactive UI stays in
 * English and a note is shown. Arabic is used in generated outputs
 * (.md / .html explanations and replay exports — Phase 3) where it renders
 * perfectly with dir="rtl".
 */

export type Lang = 'en' | 'ar' | 'es' | 'pt' | 'fr';

export const SUPPORTED_LANGS: Lang[] = ['en', 'ar', 'es', 'pt', 'fr'];

export interface Strings {
  welcome: string;
  firstRunIntro: string;
  enterApiKey: string;
  detectedProvider: string; // {provider}
  detectFailed: string;
  selectProvider: string;
  configSaved: string; // {path}
  chatHint: string;
  thinking: string;
  goodbye: string;
  invalidKey: string;
  reenterKey: string;
  apiError: string; // {message}
  emptyKey: string;
  historyCleared: string;
  helpText: string;
  modelSwitched: string; // {model}
  configReset: string;
  configResetNone: string;
  scanning: string;
  scanned: string; // {files}
  memoryLoaded: string; // {decisions}
  memoryEmpty: string;
  skillsLoaded: string; // {names}
  skillAdded: string; // {name}
  skillRemoved: string; // {name}
  skillNotFound: string; // {name}
  skillListEmpty: string;
}

const en: Strings = {
  welcome: 'Welcome to Vexi — your AI coding agent in the terminal.',
  firstRunIntro: 'First run: Vexi needs an API key (Anthropic, OpenAI, OpenRouter, Groq or Gemini).\nIt is stored locally in ~/.vexi/config.json — no login, no server, no telemetry.',
  enterApiKey: 'Paste your API key',
  detectedProvider: 'Provider detected: {provider}',
  detectFailed: 'Could not auto-detect the provider for this key.',
  selectProvider: 'Select your provider',
  configSaved: 'Saved to {path} (readable only by your OS user).',
  chatHint: 'Type your message. Commands: /help /model /clear /exit',
  thinking: 'Thinking…',
  goodbye: 'Goodbye! 👋',
  invalidKey: 'The API key was rejected by the provider (unauthorized).',
  reenterKey: 'Re-enter your API key?',
  apiError: 'API error: {message}',
  emptyKey: 'No key entered.',
  historyCleared: 'Conversation history cleared.',
  helpText:
    '/help    show this help\n/model   switch model (e.g. /model gpt-4o)\n/memory  show compressed project memory\n/clear   clear conversation history\n/exit    quit Vexi',
  modelSwitched: 'Model switched to {model}',
  configReset: 'Configuration deleted. Run `vexi` to set up again.',
  configResetNone: 'No configuration found.',
  scanning: 'Scanning project…',
  scanned: 'Project scanned: {files} files mapped.',
  memoryLoaded: 'Project memory loaded ({decisions} decisions remembered).',
  memoryEmpty: 'No project memory yet — it builds up as you chat.',
  skillsLoaded: 'Active skills: {names}',
  skillAdded: 'Skill "{name}" added.',
  skillRemoved: 'Skill "{name}" removed.',
  skillNotFound: 'Skill "{name}" not found.',
  skillListEmpty: 'No skills yet. Add one with: vexi skill add <file-or-url>',
};

const es: Strings = {
  welcome: 'Bienvenido a Vexi — tu agente de programación con IA en la terminal.',
  firstRunIntro: 'Primer uso: Vexi necesita una clave API (Anthropic, OpenAI, OpenRouter, Groq o Gemini).\nSe guarda localmente en ~/.vexi/config.json — sin registro, sin servidor, sin telemetría.',
  enterApiKey: 'Pega tu clave API',
  detectedProvider: 'Proveedor detectado: {provider}',
  detectFailed: 'No se pudo detectar automáticamente el proveedor de esta clave.',
  selectProvider: 'Selecciona tu proveedor',
  configSaved: 'Guardado en {path} (solo legible por tu usuario del sistema).',
  chatHint: 'Escribe tu mensaje. Comandos: /help /model /clear /exit',
  thinking: 'Pensando…',
  goodbye: '¡Hasta luego! 👋',
  invalidKey: 'El proveedor rechazó la clave API (no autorizada).',
  reenterKey: '¿Volver a introducir tu clave API?',
  apiError: 'Error de API: {message}',
  emptyKey: 'No se introdujo ninguna clave.',
  historyCleared: 'Historial de conversación borrado.',
  helpText:
    '/help    mostrar esta ayuda\n/model   cambiar modelo (p. ej. /model gpt-4o)\n/memory  ver la memoria comprimida del proyecto\n/clear   borrar historial de conversación\n/exit    salir de Vexi',
  modelSwitched: 'Modelo cambiado a {model}',
  configReset: 'Configuración eliminada. Ejecuta `vexi` para configurar de nuevo.',
  configResetNone: 'No se encontró configuración.',
  scanning: 'Escaneando el proyecto…',
  scanned: 'Proyecto escaneado: {files} archivos mapeados.',
  memoryLoaded: 'Memoria del proyecto cargada ({decisions} decisiones recordadas).',
  memoryEmpty: 'Aún no hay memoria del proyecto — se construye mientras conversas.',
  skillsLoaded: 'Skills activas: {names}',
  skillAdded: 'Skill "{name}" añadida.',
  skillRemoved: 'Skill "{name}" eliminada.',
  skillNotFound: 'Skill "{name}" no encontrada.',
  skillListEmpty: 'Aún no hay skills. Añade una con: vexi skill add <archivo-o-url>',
};

const pt: Strings = {
  welcome: 'Bem-vindo ao Vexi — seu agente de programação com IA no terminal.',
  firstRunIntro: 'Primeira execução: o Vexi precisa de uma chave de API (Anthropic, OpenAI, OpenRouter, Groq ou Gemini).\nEla é guardada localmente em ~/.vexi/config.json — sem login, sem servidor, sem telemetria.',
  enterApiKey: 'Cole sua chave de API',
  detectedProvider: 'Provedor detectado: {provider}',
  detectFailed: 'Não foi possível detectar automaticamente o provedor desta chave.',
  selectProvider: 'Selecione seu provedor',
  configSaved: 'Salvo em {path} (legível apenas pelo seu usuário do sistema).',
  chatHint: 'Digite sua mensagem. Comandos: /help /model /clear /exit',
  thinking: 'Pensando…',
  goodbye: 'Até logo! 👋',
  invalidKey: 'O provedor rejeitou a chave de API (não autorizada).',
  reenterKey: 'Inserir sua chave de API novamente?',
  apiError: 'Erro de API: {message}',
  emptyKey: 'Nenhuma chave inserida.',
  historyCleared: 'Histórico de conversa apagado.',
  helpText:
    '/help    mostrar esta ajuda\n/model   trocar modelo (ex.: /model gpt-4o)\n/memory  ver a memória comprimida do projeto\n/clear   apagar histórico de conversa\n/exit    sair do Vexi',
  modelSwitched: 'Modelo alterado para {model}',
  configReset: 'Configuração excluída. Execute `vexi` para configurar novamente.',
  configResetNone: 'Nenhuma configuração encontrada.',
  scanning: 'Escaneando o projeto…',
  scanned: 'Projeto escaneado: {files} arquivos mapeados.',
  memoryLoaded: 'Memória do projeto carregada ({decisions} decisões lembradas).',
  memoryEmpty: 'Ainda não há memória do projeto — ela se constrói enquanto você conversa.',
  skillsLoaded: 'Skills ativas: {names}',
  skillAdded: 'Skill "{name}" adicionada.',
  skillRemoved: 'Skill "{name}" removida.',
  skillNotFound: 'Skill "{name}" não encontrada.',
  skillListEmpty: 'Ainda não há skills. Adicione uma com: vexi skill add <arquivo-ou-url>',
};

const fr: Strings = {
  welcome: 'Bienvenue dans Vexi — votre agent de codage IA dans le terminal.',
  firstRunIntro: 'Première utilisation : Vexi a besoin d\'une clé API (Anthropic, OpenAI, OpenRouter, Groq ou Gemini).\nElle est stockée localement dans ~/.vexi/config.json — sans compte, sans serveur, sans télémétrie.',
  enterApiKey: 'Collez votre clé API',
  detectedProvider: 'Fournisseur détecté : {provider}',
  detectFailed: 'Impossible de détecter automatiquement le fournisseur de cette clé.',
  selectProvider: 'Sélectionnez votre fournisseur',
  configSaved: 'Enregistré dans {path} (lisible uniquement par votre utilisateur système).',
  chatHint: 'Tapez votre message. Commandes : /help /model /clear /exit',
  thinking: 'Réflexion…',
  goodbye: 'À bientôt ! 👋',
  invalidKey: 'La clé API a été rejetée par le fournisseur (non autorisée).',
  reenterKey: 'Saisir à nouveau votre clé API ?',
  apiError: 'Erreur API : {message}',
  emptyKey: 'Aucune clé saisie.',
  historyCleared: 'Historique de conversation effacé.',
  helpText:
    '/help    afficher cette aide\n/model   changer de modèle (ex. /model gpt-4o)\n/memory  voir la mémoire compressée du projet\n/clear   effacer l\'historique de conversation\n/exit    quitter Vexi',
  modelSwitched: 'Modèle changé pour {model}',
  configReset: 'Configuration supprimée. Lancez `vexi` pour reconfigurer.',
  configResetNone: 'Aucune configuration trouvée.',
  scanning: 'Analyse du projet…',
  scanned: 'Projet analysé : {files} fichiers cartographiés.',
  memoryLoaded: 'Mémoire du projet chargée ({decisions} décisions mémorisées).',
  memoryEmpty: 'Pas encore de mémoire de projet — elle se construit au fil de la conversation.',
  skillsLoaded: 'Skills actives : {names}',
  skillAdded: 'Skill « {name} » ajoutée.',
  skillRemoved: 'Skill « {name} » supprimée.',
  skillNotFound: 'Skill « {name} » introuvable.',
  skillListEmpty: 'Aucune skill pour l\'instant. Ajoutez-en une avec : vexi skill add <fichier-ou-url>',
};

const STRINGS: Record<Lang, Strings> = {
  en,
  es,
  pt,
  fr,
  // Arabic uses the English UI in the terminal (see RTL strategy above).
  ar: en,
};

/**
 * Note shown when the language is Arabic: terminals can't render RTL text
 * properly, so the interactive UI stays in English. Arabic will be used in
 * generated .md/.html outputs (Phase 3) where it renders perfectly.
 */
export const ARABIC_RTL_NOTE =
  'Note: terminals render Arabic incorrectly (RTL), so the interactive UI stays in English.\n' +
  'Arabic will be used in generated explanations and HTML exports, where it renders perfectly.\n' +
  'ملاحظة: واجهة الطرفية بالإنجليزية بسبب قيود عرض النص العربي، وستكون الشروحات والملفات المُصدَّرة بالعربية.';

/** Normalize a locale/lang value ("ar-EG", "es_ES", "fr") to a supported Lang. */
export function normalizeLang(value: string | undefined): Lang | null {
  if (!value) return null;
  const base = value.toLowerCase().replace(/[_-].*$/, '');
  return (SUPPORTED_LANGS as string[]).includes(base) ? (base as Lang) : null;
}

/** Detect the system language from the environment / Intl. */
export function detectSystemLang(): Lang {
  const fromEnv =
    normalizeLang(process.env.LC_ALL) ||
    normalizeLang(process.env.LC_MESSAGES) ||
    normalizeLang(process.env.LANG);
  if (fromEnv) return fromEnv;

  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const fromIntl = normalizeLang(locale);
    if (fromIntl) return fromIntl;
  } catch {
    // fall through
  }
  return 'en';
}

/** Get the UI strings for a language, with {placeholder} interpolation. */
export function getStrings(lang: Lang): Strings {
  return STRINGS[lang];
}

export function t(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`);
}
