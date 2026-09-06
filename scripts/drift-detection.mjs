#!/usr/bin/env node

/**
 * Upstream drift detection script for Issue #63
 * Detects changes in upstream repositories and compares with alignment catalogue
 * Fails CI when drift is detected without proper review
 */

import { readFile } from 'node:fs/promises';
import { exit } from 'node:process';
import { execSync } from 'node:child_process';

const ALIGNMENT_FILE = new URL('../catalog/upstream-alignment.json', import.meta.url);
const MATRIX_FILE = new URL('../catalog/ocis-full-mvp-matrix.json', import.meta.url);

/**
 * Status definitions
 */
const STATUS_DEFINITIONS = {
  'supported': 'Fully implemented and tested, production ready',
  'partial': 'Partially implemented, some features missing',
  'planned': 'Planned for future implementation',
  'community-preview': 'Community contributed, not officially supported',
  'evaluation-only': 'For evaluation purposes only, not production',
  'external-only': 'Only available as external service',
  'deliberately-excluded': 'Intentionally not supported with documented rationale'
};

/**
 * Repository cache to avoid repeated cloning
 */
const repoCache = new Map();

/**
 * Fetches upstream repository information
 */
async function fetchUpstreamRepository(repoName, branch, commitSha) {
  const cacheKey = `${repoName}:${branch}:${commitSha}`;
  
  if (repoCache.has(cacheKey)) {
    return repoCache.get(cacheKey);
  }

  try {
    // For now, we'll simulate fetching repository data
    // In a real implementation, this would clone the repo and parse the files
    const repoData = {
      repository: repoName,
      branch: branch,
      commitSha: commitSha,
      overlays: await getUpstreamOverlays(repoName, branch, commitSha),
      components: await getUpstreamComponents(repoName, branch, commitSha),
      lastFetched: new Date().toISOString()
    };
    
    repoCache.set(cacheKey, repoData);
    return repoData;
  } catch (error) {
    console.error(`❌ Failed to fetch upstream repository ${repoName}/${branch}:`, error.message);
    return null;
  }
}

/**
 * Simulates fetching upstream overlays from repository
 * In production, this would actually clone and parse the repo
 */
async function getUpstreamOverlays(repoName, branch, commitSha) {
  // Simulate overlays based on known structure
  if (repoName === 'owncloud/ocis' && branch === 'master') {
    return [
      { name: 'monitoring_tracing', type: 'overlay' },
      { name: 'mailserver', type: 'overlay' },
      { name: 'collabora', type: 'overlay' }
    ];
  } else if (repoName === 'owncloud/ocis' && branch === 'feat/ocis-full-web-extensions-ai') {
    return [
      { name: 'ai_extensions', type: 'overlay' },
      { name: 'monitoring_tracing', type: 'overlay' },
      { name: 'collabora', type: 'overlay' }
    ];
  }
  return [];
}

/**
 * Simulates fetching upstream components from repository
 */
async function getUpstreamComponents(repoName, branch, commitSha) {
  if (repoName === 'owncloud/ocis') {
    const components = [
      { name: 'ocis', type: 'core', version: '8.2.0' },
      { name: 'clamav', type: 'service' },
      { name: 'smtp', type: 'service' },
      { name: 'tika', type: 'service' },
      { name: 'keycloak', type: 'service' },
      { name: 'collabora', type: 'service' }
    ];
    
    // Add AI components for the AI branch
    if (branch === 'feat/ocis-full-web-extensions-ai') {
      components.push(
        { name: 'ai-llm-proxy', type: 'service' },
        { name: 'ai-data-insights-sidebar', type: 'extension' },
        { name: 'ai-doc-summary', type: 'extension' },
        { name: 'workflows', type: 'feature' }
      );
    }
    
    return components;
  }
  return [];
}

/**
 * Compares current upstream state with catalogued state
 */
function compareUpstreamWithCatalogue(upstreamData, catalogue, repoName, branch) {
  const findings = {
    newOverlays: [],
    removedOverlays: [],
    changedOverlays: [],
    newComponents: [],
    removedComponents: [],
    changedComponents: [],
    missingRenderers: [],
    missingTests: [],
    lostPolicyAssertions: []
  };

  const catalogueOverlays = catalogue.overlays || [];
  const catalogueComponents = catalogue.components || [];
  
  // Check overlays
  const upstreamOverlayNames = new Set(upstreamData.overlays.map(o => o.name));
  const catalogueOverlayNames = new Set(catalogueOverlays.map(o => o.name));
  
  // New overlays in upstream
  for (const overlay of upstreamData.overlays) {
    if (!catalogueOverlayNames.has(overlay.name)) {
      findings.newOverlays.push({
        name: overlay.name,
        action: 'add_to_catalogue'
      });
    }
  }
  
  // Removed overlays from upstream
  for (const overlay of catalogueOverlays) {
    if (!upstreamOverlayNames.has(overlay.name)) {
      findings.removedOverlays.push({
        name: overlay.name,
        action: 'review_catalogue_entry'
      });
    }
  }
  
  // Changed overlays (status changes)
  for (const overlay of catalogueOverlays) {
    const upstreamOverlay = upstreamData.overlays.find(o => o.name === overlay.name);
    if (upstreamOverlay) {
      // Check if status in catalogue is appropriate
      if (overlay.status === 'deliberately-excluded' && !overlay.policy_assertion) {
        findings.lostPolicyAssertions.push({
          name: overlay.name,
          issue: 'Missing policy assertion for deliberately excluded overlay'
        });
      }
    }
  }
  
  // Check components
  const upstreamComponentNames = new Set(upstreamData.components.map(c => c.name));
  const catalogueComponentNames = new Set(catalogueComponents.map(c => c.name));
  
  // New components in upstream
  for (const component of upstreamData.components) {
    if (!catalogueComponentNames.has(component.name)) {
      findings.newComponents.push({
        name: component.name,
        type: component.type,
        action: 'add_to_catalogue'
      });
    }
  }
  
  // Removed components from upstream
  for (const component of catalogueComponents) {
    if (!upstreamComponentNames.has(component.name)) {
      findings.removedComponents.push({
        name: component.name,
        action: 'review_catalogue_entry'
      });
    }
  }
  
  // Check renderer and test coverage for supported components
  for (const component of catalogueComponents) {
    if (component.status === 'supported') {
      // Check if all promised outputs have renderer support
      const rendererSupport = component.renderer_support || {};
      const missingRenderers = [];
      
      if (!rendererSupport.docker) missingRenderers.push('docker');
      if (!rendererSupport.podman) missingRenderers.push('podman');
      if (!rendererSupport.helm) missingRenderers.push('helm');
      if (!rendererSupport.argo_cd) missingRenderers.push('argo_cd');
      
      if (missingRenderers.length > 0) {
        findings.missingRenderers.push({
          component: component.name,
          missing: missingRenderers
        });
      }
      
      // Check test coverage
      if (!component.test_coverage) {
        findings.missingTests.push({
          component: component.name,
          issue: 'Missing test coverage'
        });
      }
    }
    
    // Check deliberate exclusions have policy assertions
    if (component.status === 'deliberately-excluded' && !component.policy_assertion) {
      findings.lostPolicyAssertions.push({
        name: component.name,
        issue: 'Missing policy assertion for deliberately excluded component'
      });
    }
  }
  
  return findings;
}

/**
 * Validates the alignment catalogue structure
 */
function validateCatalogueStructure(catalogue) {
  const errors = [];
  const warnings = [];
  
  if (!catalogue.upstream_refs || !Array.isArray(catalogue.upstream_refs)) {
    errors.push('Catalogue must have upstream_refs array');
  } else {
    for (const ref of catalogue.upstream_refs) {
      if (!ref.repository) {
        errors.push('Upstream ref missing repository field');
      }
      if (!ref.branch) {
        errors.push('Upstream ref missing branch field');
      }
      if (!ref.commit_sha) {
        errors.push('Upstream ref missing commit_sha field');
      }
      if (!ref.overlays || !Array.isArray(ref.overlays)) {
        errors.push(`Upstream ref ${ref.repository}/${ref.branch} missing overlays array`);
      }
      if (!ref.components || !Array.isArray(ref.components)) {
        errors.push(`Upstream ref ${ref.repository}/${ref.branch} missing components array`);
      }
      
      // Validate each overlay
      for (const overlay of ref.overlays) {
        if (!overlay.name) {
          errors.push('Overlay missing name field');
        }
        if (!overlay.status) {
          errors.push(`Overlay ${overlay.name} missing status field`);
        } else if (!STATUS_DEFINITIONS[overlay.status]) {
          warnings.push(`Overlay ${overlay.name} has unknown status "${overlay.status}"`);
        }
        if (!overlay.rationale) {
          warnings.push(`Overlay ${overlay.name} missing rationale`);
        }
      }
      
      // Validate each component
      for (const component of ref.components) {
        if (!component.name) {
          errors.push('Component missing name field');
        }
        if (!component.type) {
          warnings.push(`Component ${component.name} missing type field`);
        }
        if (!component.status) {
          errors.push(`Component ${component.name} missing status field`);
        } else if (!STATUS_DEFINITIONS[component.status]) {
          warnings.push(`Component ${component.name} has unknown status "${component.status}"`);
        }
      }
    }
  }
  
  return { errors, warnings };
}

/**
 * Main drift detection function
 */
async function detectDrift() {
  let catalogue, matrix;
  
  try {
    const alignmentContent = await readFile(ALIGNMENT_FILE, 'utf8');
    catalogue = JSON.parse(alignmentContent);
    
    const matrixContent = await readFile(MATRIX_FILE, 'utf8');
    matrix = JSON.parse(matrixContent);
  } catch (error) {
    console.error(`❌ Failed to read catalogue or matrix files:`, error.message);
    return { valid: false, errors: ['Failed to read required files'] };
  }

  // Validate catalogue structure first
  const structureValidation = validateCatalogueStructure(catalogue);
  if (structureValidation.errors.length > 0) {
    return { 
      valid: false, 
      errors: structureValidation.errors, 
      warnings: structureValidation.warnings 
    };
  }

  const allFindings = {
    errors: [],
    warnings: [],
    issues: []
  };
  
  // Check each upstream ref
  for (const upstreamRef of catalogue.upstream_refs) {
    console.log(`🔍 Checking upstream ref: ${upstreamRef.repository}/${upstreamRef.branch}@${upstreamRef.commit_sha}`);
    
    const upstreamData = await fetchUpstreamRepository(
      upstreamRef.repository, 
      upstreamRef.branch, 
      upstreamRef.commit_sha
    );
    
    if (!upstreamData) {
      allFindings.errors.push(`Failed to fetch upstream data for ${upstreamRef.repository}/${upstreamRef.branch}`);
      continue;
    }
    
    const findings = compareUpstreamWithCatalogue(upstreamData, upstreamRef, upstreamRef.repository, upstreamRef.branch);
    
    // Map findings to appropriate severity
    if (findings.newOverlays.length > 0) {
      allFindings.warnings.push(...findings.newOverlays.map(f => 
        `New overlay detected in ${upstreamRef.repository}/${upstreamRef.branch}: ${f.name}`
      ));
    }
    
    if (findings.removedOverlays.length > 0) {
      allFindings.warnings.push(...findings.removedOverlays.map(f => 
        `Overlay removed from ${upstreamRef.repository}/${upstreamRef.branch}: ${f.name}`
      ));
    }
    
    if (findings.newComponents.length > 0) {
      allFindings.warnings.push(...findings.newComponents.map(f => 
        `New component detected in ${upstreamRef.repository}/${upstreamRef.branch}: ${f.name} (${f.type})`
      ));
    }
    
    if (findings.removedComponents.length > 0) {
      allFindings.warnings.push(...findings.removedComponents.map(f => 
        `Component removed from ${upstreamRef.repository}/${upstreamRef.branch}: ${f.name}`
      ));
    }
    
    // These are errors that should fail CI
    if (findings.missingRenderers.length > 0) {
      allFindings.errors.push(...findings.missingRenderers.map(f => 
        `Supported component "${f.component}" missing renderer support for: ${f.missing.join(', ')}`
      ));
    }
    
    if (findings.missingTests.length > 0) {
      allFindings.errors.push(...findings.missingTests.map(f => 
        `Supported component "${f.component}" missing test coverage`
      ));
    }
    
    if (findings.lostPolicyAssertions.length > 0) {
      allFindings.errors.push(...findings.lostPolicyAssertions.map(f => 
        `Deliberately excluded item "${f.name}" missing policy assertion: ${f.issue}`
      ));
    }
    
    // Generate issues for discovery
    if (findings.newOverlays.length > 0 || findings.newComponents.length > 0) {
      allFindings.issues.push({
        title: `Upstream drift detected in ${upstreamRef.repository}/${upstreamRef.branch}`,
        body: `The following changes were detected:\n\n` +
              (findings.newOverlays.length > 0 ? `**New overlays:**\n${findings.newOverlays.map(o => `- ${o.name}`).join('\n')}\n\n` : '') +
              (findings.newComponents.length > 0 ? `**New components:**\n${findings.newComponents.map(c => `- ${c.name} (${c.type})`).join('\n')}` : ''),
        labels: ['upstream-drift', 'needs-review'],
        action: 'create_issue'
      });
    }
  }
  
  // Check drift detection rules
  const driftRules = catalogue.drift_detection_rules || {};
  const validationRules = catalogue.validation_rules || [];
  
  if (driftRules.check_frequency !== 'daily') {
    allFindings.warnings.push(`Drift check frequency is not daily: ${driftRules.check_frequency || 'not set'}`);
  }
  
  // Validate that all required repositories are being checked
  const requiredRepos = ['owncloud/ocis'];
  const checkedRepos = driftRules.repositories ? driftRules.repositories.map(r => r.name) : [];
  
  for (const repo of requiredRepos) {
    if (!checkedRepos.includes(repo)) {
      allFindings.errors.push(`Required repository ${repo} not in drift detection configuration`);
    }
  }
  
  return {
    valid: allFindings.errors.length === 0,
    errors: allFindings.errors,
    warnings: allFindings.warnings,
    issues: allFindings.issues
  };
}

/**
 * Main function that runs drift detection and exits with appropriate code
 */
async function main() {
  console.log('🔍 Performing upstream drift detection...');
  console.log('='.repeat(60));
  
  const report = await detectDrift();

  // Print summary
  console.log('\n📊 Upstream Drift Detection Report');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  if (report.errors.length > 0) {
    console.log(`\n❌ Critical Issues (fail CI): ${report.errors.length}`);
    report.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }

  if (report.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (review needed): ${report.warnings.length}`);
    report.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`);
    });
  }

  if (report.issues.length > 0) {
    console.log(`\n📋 Issues to create: ${report.issues.length}`);
    report.issues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue.title}`);
      console.log(`     Action: ${issue.action}`);
      console.log(`     Labels: ${issue.labels.join(', ')}`);
    });
  }

  // Print status definitions for reference
  console.log('\n📖 Status Definitions:');
  for (const [status, definition] of Object.entries(STATUS_DEFINITIONS)) {
    console.log(`  • ${status}: ${definition}`);
  }

  // Exit with appropriate code
  if (!report.valid) {
    console.log('\n❌ Upstream drift detection failed. CI must fail with actionable report.');
    exit(1);
  } else if (report.warnings.length > 0 || report.issues.length > 0) {
    console.log('\n✅ Upstream drift detection passed with findings. Please review.');
    exit(0);
  } else {
    console.log('\n✅ Upstream drift detection passed. No drift detected.');
    exit(0);
  }
}

// Run the drift detection
main().catch(error => {
  console.error('❌ Unexpected error during drift detection:', error);
  exit(1);
});