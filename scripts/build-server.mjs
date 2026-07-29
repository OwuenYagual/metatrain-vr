import { build } from 'esbuild';
import { resolve } from 'node:path';

const projectRoot = process.cwd();

await build({
    absWorkingDir: projectRoot,
    entryPoints: [resolve(projectRoot, 'server/index.ts')],
    outfile: resolve(projectRoot, 'dist/server/index.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    sourcemap: true,
});
