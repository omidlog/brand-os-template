import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { build, type Plugin } from 'esbuild'

/**
 * Builds the Brand OS engine that a data-only brand repository commits at `.brand-os/engine/`:
 *
 *   brand-os.mjs (+ chunks/)  one CLI for every brand command, all npm dependencies inlined, so a brand needs no npm ci
 *   assets/                   schemas, EXAMPLE base tokens, edited guidance pages, Studio print styles and fonts
 *   docs-internal/, agent-skills/, examples/, agents/   the guides and skills agents read, and AGENTS.md / CLAUDE.md
 *   VERSION                   <package version>-<short commit>
 *
 *   npm run engine:build [-- --outdir <dir>]
 *
 * `@resvg/resvg-js` is native and stays external: the few commands that rasterize SVG ask for it when it is missing.
 */
const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const outIndex = args.indexOf('--outdir')
const outdir = path.resolve(outIndex >= 0 ? (args[outIndex + 1] ?? '') : path.join(root, 'dist', 'engine'))

function shortSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return 'local'
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string }
const version = `${pkg.version}-${shortSha()}`

/**
 * Some dependencies (css-tree, through svgo) load JSON at run time with `createRequire(import.meta.url)('x.json')`,
 * which a bundle cannot resolve. Rewrite those calls into static JSON imports so the data is inlined.
 */
const inlineJsonRequires: Plugin = {
  name: 'inline-json-requires',
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /node_modules[\\/].*\.(m?js)$/ }, (loaded) => {
      const contents = fs.readFileSync(loaded.path, 'utf8')
      if (!contents.includes('createRequire') || !/require\(\s*['"][^'"]+\.json['"]\s*\)/.test(contents)) return undefined
      const imports: string[] = []
      const rewritten = contents.replace(/require\(\s*['"]([^'"]+\.json)['"]\s*\)/g, (_all, specifier: string) => {
        const name = `__engineJson${imports.length}`
        imports.push(`import ${name} from ${JSON.stringify(specifier)} with { type: 'json' };`)
        return name
      })
      return { contents: `${imports.join('\n')}\n${rewritten}`, loader: 'js', resolveDir: path.dirname(loaded.path) }
    })
  },
}

fs.rmSync(outdir, { recursive: true, force: true })
const result = await build({
  plugins: [inlineJsonRequires],
  absWorkingDir: root,
  entryPoints: { 'brand-os': 'scripts/engine/entry.ts' },
  outdir,
  outExtension: { '.js': '.mjs' },
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  splitting: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: path.join(root, 'tsconfig.json'),
  external: ['@resvg/resvg-js'],
  banner: { js: "import { createRequire as __engineRequire } from 'node:module'; const require = __engineRequire(import.meta.url);" },
  legalComments: 'none',
  sourcemap: false,
  metafile: true,
  logLevel: 'warning',
})

// The engine must never carry brand content or environment files.
const forbidden = /(^|\/)(brand|examples)\/|\.env/
const offenders = Object.keys(result.metafile.inputs).filter((input) => forbidden.test(input) && !input.startsWith('node_modules/'))
if (offenders.length) {
  console.error(`The engine bundle includes files it must not: ${offenders.join(', ')}`)
  process.exit(1)
}

const copy = (from: string, to: string, filter: (name: string) => boolean = () => true): void => {
  const source = path.join(root, from)
  if (!fs.existsSync(source)) return
  fs.cpSync(source, path.join(outdir, to), { recursive: true, filter: (file) => fs.statSync(file).isDirectory() || filter(path.basename(file)) })
}
copy('schemas', 'assets/schemas', (name) => name.endsWith('.json'))
copy('packages/design-tokens/base', 'assets/tokens', (name) => name.endsWith('.json'))
copy('packages/brand-core/guidance', 'assets/guidance')
copy('apps/studio/static', 'assets/studio-static', (name) => /\.(css|woff2)$/.test(name))
copy('docs-internal', 'docs-internal', (name) => name.endsWith('.md'))
copy('agent-skills', 'agent-skills')
copy('examples', 'examples', (name) => name.endsWith('.md'))
fs.mkdirSync(path.join(outdir, 'agents'), { recursive: true })
for (const name of ['AGENTS.md', 'CLAUDE.md']) fs.copyFileSync(path.join(root, name), path.join(outdir, 'agents', name))
fs.writeFileSync(path.join(outdir, 'VERSION'), `${version}\n`)
fs.writeFileSync(
  path.join(outdir, 'README.md'),
  `# Brand OS engine ${version}\n\nWritten by an engine update; do not edit. Run commands through the npm scripts in package.json (npm run brand:interview, npm run check …) or directly: node .brand-os/engine/brand-os.mjs help.\n`,
)

let bytes = 0
const walk = (dir: string): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else bytes += fs.statSync(full).size
  }
}
walk(outdir)
console.log(`Engine ${version} written to ${path.relative(root, outdir) || outdir} (${(bytes / 1024 / 1024).toFixed(1)} MiB).`)
