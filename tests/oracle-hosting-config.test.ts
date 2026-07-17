import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const manifest = JSON.parse(
  readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
) as { start_url?: string; scope?: string };
const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const kakaoSkill = readFileSync(
  new URL('../supabase/functions/kakao-skill/index.ts', import.meta.url),
  'utf8',
);
const deployWorkflow = readFileSync(
  new URL('../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const edgeDeployWorkflow = readFileSync(
  new URL('../.github/workflows/deploy-functions.yml', import.meta.url),
  'utf8',
);
const oracleCompose = readFileSync(
  new URL('../deploy/oracle/compose.yaml', import.meta.url),
  'utf8',
);
const oracleCaddy = readFileSync(
  new URL('../deploy/oracle/growing.caddy', import.meta.url),
  'utf8',
);

describe('Oracle root-domain hosting configuration', () => {
  it('builds and installs the PWA at the domain root', () => {
    expect(viteConfig).toContain("base: '/'");
    expect(viteConfig).not.toContain("'/growing/'");
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(serviceWorker).toContain("const CACHE_VERSION = 'growing-pwa-v4'");
  });

  it('uses the Oracle-hosted privacy notice in the Kakao skill', () => {
    expect(kakaoSkill).toContain(
      "const KAKAO_PRIVACY_URL = 'https://growing.jamaifamily.duckdns.org/privacy.html'",
    );
    expect(kakaoSkill).not.toContain('jamaica8612.github.io/growing/privacy.html');
  });

  it('deploys the static build to the restricted Oracle directory', () => {
    expect(deployWorkflow).toContain('name: Deploy to Oracle');
    expect(deployWorkflow).toContain('/opt/stacks/growing/current/');
    expect(deployWorkflow).toContain('--delete-delay --delay-updates');
    expect(deployWorkflow).toContain("${ORACLE_HOST#$'\\xEF\\xBB\\xBF'}");
    expect(deployWorkflow).not.toContain('actions/deploy-pages');
    expect(edgeDeployWorkflow.match(/--use-api/g)).toHaveLength(7);
  });

  it('keeps the web container private behind the shared Caddy network', () => {
    expect(oracleCompose).toContain('name: familymap_default');
    expect(oracleCompose).toContain('expose:');
    expect(oracleCompose).not.toContain('ports:');
    expect(oracleCaddy).toContain('reverse_proxy growing:8080');
    expect(oracleCaddy).toContain('Strict-Transport-Security');
  });
});
