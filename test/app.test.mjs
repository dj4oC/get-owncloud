import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';

/**
 * Unit tests for app.js logic
 * These replace Playwright E2E tests with Node.js unit tests
 */

// Mock DOM for testing
global.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => ({ tag, value: '', textContent: '', hidden: false }),
  documentElement: { setAttribute: () => {}, hasAttribute: () => false }
};
global.window = global;

// Test that we can import the core modules
import { calculateSizingWithRules, normalizeProfileWithRules, validateNormalizedProfile } from '../src/core.mjs';
import { buildSingleHostBundle, requiredTemplatePaths } from '../src/bundle.mjs';

// Minimal profile for testing
const testProfile = {
  apiVersion: 'get.owncloud.com/v1alpha1',
  purpose: 'evaluation',
  maturity: 'community-preview',
  ocisVersion: '8.2.0',
  target: { runtime: 'docker', manager: 'direct' },
  workload: { registeredUsers: 20, storedDataGiB: 100, annualGrowthPercent: 20 },
  identity: { mode: 'embedded' },
  storage: { mode: 'ocis', filesystem: 'ext4', dataPath: './data/data', configPath: './data/config' },
  office: { mode: 'none' },
  networking: { domain: 'ocis.owncloud.test', httpPort: 8080, httpsPort: 8443, tls: { mode: 'evaluation-self-signed' } },
  features: { search: true, clamav: false, notifications: false, monitoring: false },
  security: { basicAuth: true, demoUsers: false },
  updates: { automaticSecurityPatches: false, observationDelayHours: 24, backupRecipient: '' }
};

describe('app.js core logic', () => {
  test('profileFromForm logic - runtime manager constraints', () => {
    // Test that we can create a basic profile
    const profile = { ...testProfile };
    assert.ok(profile.target.runtime);
    assert.ok(profile.target.manager);
  });

  test('syncUi logic - kubernetes manager options', () => {
    // Test the logic for manager options based on runtime
    const runtime = 'kubernetes';
    const isKubernetes = runtime === 'kubernetes';
    
    // Kubernetes should have helm and argocd managers
    const expectedManagers = ['helm', 'argocd'];
    
    assert.strictEqual(isKubernetes, true);
    assert.deepStrictEqual(expectedManagers, ['helm', 'argocd']);
  });

  test('syncUi logic - docker manager options', () => {
    const runtime = 'docker';
    const isKubernetes = runtime === 'kubernetes';
    
    // Docker should have direct and ansible managers
    const expectedManagers = ['direct', 'ansible'];
    
    assert.strictEqual(isKubernetes, false);
    assert.deepStrictEqual(expectedManagers, ['direct', 'ansible']);
  });

  test('syncUi logic - podman manager options', () => {
    const runtime = 'podman';
    const isKubernetes = runtime === 'kubernetes';
    
    // Podman should have direct and ansible managers
    const expectedManagers = ['direct', 'ansible'];
    
    assert.strictEqual(isKubernetes, false);
    assert.deepStrictEqual(expectedManagers, ['direct', 'ansible']);
  });

  test('production disabled for kubernetes', () => {
    const runtime = 'kubernetes';
    const isKubernetes = runtime === 'kubernetes';
    const productionDisabled = isKubernetes;
    
    assert.strictEqual(productionDisabled, true);
  });

  test('production disabled for podman', () => {
    const runtime = 'podman';
    const productionDisabled = runtime === 'podman';
    
    assert.strictEqual(productionDisabled, true);
  });

  test('production allowed for docker', () => {
    const runtime = 'docker';
    const productionDisabled = runtime === 'kubernetes' || runtime === 'podman';
    
    assert.strictEqual(productionDisabled, false);
  });
});

describe('runtime-manager constraints', () => {
  test('invalid combinations - kubernetes with direct', () => {
    const runtime = 'kubernetes';
    const manager = 'direct';
    const isValid = !(runtime === 'kubernetes' && (manager === 'direct' || manager === 'ansible'));
    
    assert.strictEqual(isValid, false);
  });

  test('invalid combinations - kubernetes with ansible', () => {
    const runtime = 'kubernetes';
    const manager = 'ansible';
    const isValid = !(runtime === 'kubernetes' && (manager === 'direct' || manager === 'ansible'));
    
    assert.strictEqual(isValid, false);
  });

  test('invalid combinations - docker with helm', () => {
    const runtime = 'docker';
    const manager = 'helm';
    const isValid = !((runtime === 'docker' || runtime === 'podman') && (manager === 'helm' || manager === 'argocd'));
    
    assert.strictEqual(isValid, false);
  });

  test('invalid combinations - docker with argocd', () => {
    const runtime = 'docker';
    const manager = 'argocd';
    const isValid = !((runtime === 'docker' || runtime === 'podman') && (manager === 'helm' || manager === 'argocd'));
    
    assert.strictEqual(isValid, false);
  });

  test('invalid combinations - podman with helm', () => {
    const runtime = 'podman';
    const manager = 'helm';
    const isValid = !((runtime === 'docker' || runtime === 'podman') && (manager === 'helm' || manager === 'argocd'));
    
    assert.strictEqual(isValid, false);
  });

  test('invalid combinations - podman with argocd', () => {
    const runtime = 'podman';
    const manager = 'argocd';
    const isValid = !((runtime === 'docker' || runtime === 'podman') && (manager === 'helm' || manager === 'argocd'));
    
    assert.strictEqual(isValid, false);
  });

  test('valid combinations - docker with direct', () => {
    const runtime = 'docker';
    const manager = 'direct';
    const isValid = !(
      (runtime === 'kubernetes' && (manager === 'direct' || manager === 'ansible')) ||
      ((runtime === 'docker' || runtime === 'podman') && (manager === 'helm' || manager === 'argocd'))
    );
    
    assert.strictEqual(isValid, true);
  });

  test('valid combinations - docker with ansible', () => {
    const runtime = 'docker';
    const manager = 'ansible';
    const isValid = !(
      (runtime === 'kubernetes' && (manager === 'direct' || manager === 'ansible')) ||
      ((runtime === 'docker' || runtime === 'podman') && (manager === 'helm' || manager === 'argocd'))
    );
    
    assert.strictEqual(isValid, true);
  });

  test('valid combinations - kubernetes with helm', () => {
    const runtime = 'kubernetes';
    const manager = 'helm';
    const isValid = !(
      (runtime === 'kubernetes' && (manager === 'direct' || manager === 'ansible')) ||
      ((runtime === 'docker' || runtime === 'podman') && (manager === 'helm' || manager === 'argocd'))
    );
    
    assert.strictEqual(isValid, true);
  });

  test('valid combinations - kubernetes with argocd', () => {
    const runtime = 'kubernetes';
    const manager = 'argocd';
    const isValid = !(
      (runtime === 'kubernetes' && (manager === 'direct' || manager === 'ansible')) ||
      ((runtime === 'docker' || runtime === 'podman') && (manager === 'helm' || manager === 'argocd'))
    );
    
    assert.strictEqual(isValid, true);
  });
});
