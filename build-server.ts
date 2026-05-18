import { build } from 'esbuild';

build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/server.mjs',
  external: ['express', 'multer', '@clazic/kordoc', 'vite'],
}).catch(() => process.exit(1));
