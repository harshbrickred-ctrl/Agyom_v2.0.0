import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(apiRoot, '../..');

execSync('pnpm exec prisma generate', { stdio: 'inherit', cwd: apiRoot });

// Vercel install: compile workspace packages the API imports, then apply migrations.
// Local installs skip this so `pnpm install` does not need a cloud DATABASE_URL.
if (process.env.VERCEL) {
  execSync('pnpm --filter @sst/shared-types build', {
    stdio: 'inherit',
    cwd: repoRoot,
  });
  execSync('pnpm --filter @sst/shared-utils build', {
    stdio: 'inherit',
    cwd: repoRoot,
  });
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    cwd: apiRoot,
  });
}
