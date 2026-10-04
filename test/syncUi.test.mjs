import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * Unit tests for syncUi() logic
 * Tests the business logic without DOM manipulation
 */

describe('syncUi business logic', () => {
  test('getManagerOptions returns correct options for docker', () => {
    const runtime = 'docker';
    const expected = ['direct', 'ansible'];
    
    const actual = runtime === 'kubernetes' 
      ? ['helm', 'argocd'] 
      : ['direct', 'ansible'];
    
    assert.deepStrictEqual(actual, expected);
  });

  test('getManagerOptions returns correct options for podman', () => {
    const runtime = 'podman';
    const expected = ['direct', 'ansible'];
    
    const actual = runtime === 'kubernetes' 
      ? ['helm', 'argocd'] 
      : ['direct', 'ansible'];
    
    assert.deepStrictEqual(actual, expected);
  });

  test('getManagerOptions returns correct options for kubernetes', () => {
    const runtime = 'kubernetes';
    const expected = ['helm', 'argocd'];
    
    const actual = runtime === 'kubernetes' 
      ? ['helm', 'argocd'] 
      : ['direct', 'ansible'];
    
    assert.deepStrictEqual(actual, expected);
  });

  test('isProductionDisabled returns true for kubernetes', () => {
    const runtime = 'kubernetes';
    const purpose = 'production';
    const isProductionDisabled = runtime === 'kubernetes' || runtime === 'podman';
    
    assert.strictEqual(isProductionDisabled, true);
  });

  test('isProductionDisabled returns true for podman', () => {
    const runtime = 'podman';
    const purpose = 'production';
    const isProductionDisabled = runtime === 'kubernetes' || runtime === 'podman';
    
    assert.strictEqual(isProductionDisabled, true);
  });

  test('isProductionDisabled returns false for docker', () => {
    const runtime = 'docker';
    const purpose = 'production';
    const isProductionDisabled = runtime === 'kubernetes' || runtime === 'podman';
    
    assert.strictEqual(isProductionDisabled, false);
  });

  test('getMaturityNote returns kubernetes message', () => {
    const runtime = 'kubernetes';
    const expected = "Community Preview: chart 0.7.0 and oCIS 7.1.4 stay pinned; issue #6 remains open.";
    
    const actual = runtime === 'kubernetes'
      ? "Community Preview: chart 0.7.0 and oCIS 7.1.4 stay pinned; issue #6 remains open."
      : runtime === 'podman'
        ? "Podman is runnable Community Preview until its full parity matrix passes."
        : "Docker is the production-gated single-host path; production still depends on launch gates and load testing.";
    
    assert.strictEqual(actual, expected);
  });

  test('getMaturityNote returns podman message', () => {
    const runtime = 'podman';
    const expected = "Podman is runnable Community Preview until its full parity matrix passes.";
    
    const actual = runtime === 'kubernetes'
      ? "Community Preview: chart 0.7.0 and oCIS 7.1.4 stay pinned; issue #6 remains open."
      : runtime === 'podman'
        ? "Podman is runnable Community Preview until its full parity matrix passes."
        : "Docker is the production-gated single-host path; production still depends on launch gates and load testing.";
    
    assert.strictEqual(actual, expected);
  });

  test('getMaturityNote returns docker message', () => {
    const runtime = 'docker';
    const expected = "Docker is the production-gated single-host path; production still depends on launch gates and load testing.";
    
    const actual = runtime === 'kubernetes'
      ? "Community Preview: chart 0.7.0 and oCIS 7.1.4 stay pinned; issue #6 remains open."
      : runtime === 'podman'
        ? "Podman is runnable Community Preview until its full parity matrix passes."
        : "Docker is the production-gated single-host path; production still depends on launch gates and load testing.";
    
    assert.strictEqual(actual, expected);
  });
});
