import { codeToHtml, type BundledLanguage } from 'shiki';

/**
 * Server-side syntax highlighting for feature pages.
 *
 * Strips Shiki's inline `<pre style="background:#...">` so we can apply our
 * own liquid-glass surface around the rendered HTML.
 */
export async function highlight(
  code: string,
  language: 'bash' | 'typescript' | 'yaml',
): Promise<string> {
  const lang = language as BundledLanguage;
  return codeToHtml(code, {
    lang,
    theme: 'github-dark',
    transformers: [
      {
        pre(node) {
          if (node.properties) node.properties.style = '';
        },
      },
    ],
  });
}

export type PkgManager = 'npm' | 'pnpm' | 'bun';

const INSTALL_VERB: Record<PkgManager, string> = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  bun: 'bun add',
};

/**
 * Build the three install variants (npm / pnpm / bun) from a package list.
 * Wraps long lines so the rendered output stays readable inside the glass card.
 */
export function buildInstallCommands(packages: string[]): Record<PkgManager, string> {
  const joined = packages.join(' ');
  return {
    npm: `${INSTALL_VERB.npm} ${joined}`,
    pnpm: `${INSTALL_VERB.pnpm} ${joined}`,
    bun: `${INSTALL_VERB.bun} ${joined}`,
  };
}

/**
 * Highlight all three variants in parallel.
 */
export async function highlightInstallCommands(
  packages: string[],
): Promise<Record<PkgManager, string>> {
  const cmds = buildInstallCommands(packages);
  const [npm, pnpm, bun] = await Promise.all([
    highlight(cmds.npm, 'bash'),
    highlight(cmds.pnpm, 'bash'),
    highlight(cmds.bun, 'bash'),
  ]);
  return { npm, pnpm, bun };
}
