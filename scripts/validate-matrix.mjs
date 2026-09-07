#!/usr/bin/env node

/**
 * Matrix validation script for Issue #62
 * Validates that every MVP capability has proper representation across all deployment outputs
 * Fails CI when capabilities are missing without proper documentation
 */

import { readFile } from 'node:fs/promises';
import { exit } from 'node:process';

const MATRIX_FILE = new URL('../catalog/ocis-full-mvp-matrix.json', import.meta.url);

/**
 * Deployment outputs that must be represented for each capability
 */
const REQUIRED_OUTPUTS = ['docker_compose', 'podman_compose', 'kubernetes_helm', 'kubernetes_argocd'];

/**
 * Maturity levels that are acceptable
 */
const ACCEPTABLE_MATURITIES = ['production', 'community-preview', 'evaluation-only', 'deliberately-excluded'];

/**
 * Status levels that are acceptable for outputs
 */
const ACCEPTABLE_STATUSES = ['implemented', 'partial', 'available', 'disabled', 'missing', 'excluded', 'deliberately-excluded', 'planned', 'evaluation-only', 'community-preview'];

/**
 * Validates outputs for a single capability
 */
function validateCapabilityOutputs(capabilityId, outputs, errors, warnings, implementedOutputs) {
  for (const output of REQUIRED_OUTPUTS) {
    const outputConfig = outputs[output];
    
    if (!outputConfig) {
      errors.push(`Capability "${capabilityId}" missing deployment output "${output}"`);
      return false;
    }
    
    const status = outputConfig.status;
    const rationale = outputConfig.rationale || outputConfig.notes;
    
    if (status === 'implemented') {
      implementedOutputs.push(output);
    } else if (status === 'partial') {
      implementedOutputs.push(output);
    } else if (status === 'available') {
      implementedOutputs.push(output);
    } else if (status === 'unavailable') {
      // Unavailable is acceptable only with documented rationale
      if (!rationale) {
        errors.push(`Capability "${capabilityId}" output "${output}" is unavailable but missing rationale`);
      }
    } else if (status === 'excluded' || status === 'deliberately-excluded') {
      // Excluded is acceptable with rationale
      if (!rationale) {
        errors.push(`Capability "${capabilityId}" output "${output}" is excluded but missing rationale`);
      }
    } else if (!ACCEPTABLE_STATUSES.includes(status)) {
      warnings.push(`Capability "${capabilityId}" output "${output}" has unknown status "${status}"`);
    }
  }
  
  return true;
}

/**
 * Validates the matrix file structure and content
 */
async function validateMatrix() {
  let matrix;
  try {
    const content = await readFile(MATRIX_FILE, 'utf8');
    matrix = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to read or parse matrix file: ${MATRIX_FILE.pathname}`);
    console.error(error.message);
    return { valid: false, errors: ['Matrix file not found or invalid JSON'] };
  }

  const errors = [];
  const warnings = [];
  let totalCapabilities = 0;
  let fullyImplemented = 0;
  let partiallyImplemented = 0;
  let deliberatelyExcluded = 0;

  // Validate matrix structure
  if (!matrix.matrix || typeof matrix.matrix !== 'object') {
    errors.push('Matrix file must have a "matrix" object at the root level');
    return { valid: false, errors, warnings };
  }

  // Process each top-level capability
  for (const [capabilityId, capability] of Object.entries(matrix.matrix)) {
    totalCapabilities++;

    // Validate capability structure
    if (!capability.id) {
      errors.push(`Capability "${capabilityId}" missing required "id" field`);
    }

    if (!capability.label && !capability.description) {
      errors.push(`Capability "${capabilityId}" missing required "label" or "description" field`);
    }

    if (capability.maturity && !ACCEPTABLE_MATURITIES.includes(capability.maturity)) {
      errors.push(`Capability "${capabilityId}" has invalid maturity "${capability.maturity}"`);
    }

    const implementedOutputs = [];
    
    // Handle both direct outputs and nested extensions
    if (capability.outputs) {
      // Direct outputs structure
      validateCapabilityOutputs(capabilityId, capability.outputs, errors, warnings, implementedOutputs);
    } else if (capability.extensions) {
      // Container with nested extensions - validate each extension
      for (const [extensionId, extension] of Object.entries(capability.extensions)) {
        if (extension.outputs) {
          validateCapabilityOutputs(`${capabilityId}.${extensionId}`, extension.outputs, errors, warnings, implementedOutputs);
        } else {
          // Extension doesn't have outputs - this is an error
          errors.push(`Extension "${capabilityId}.${extensionId}" missing required outputs`);
        }
      }
      
      // If container has no outputs at top level, we consider it validated through extensions
      // But we still need to count it appropriately
    } else {
      // No outputs or extensions - this is an error
      errors.push(`Capability "${capabilityId}" missing both outputs and extensions`);
    }

    // Count implementation status
    const uniqueImplemented = [...new Set(implementedOutputs)];
    if (uniqueImplemented.length === REQUIRED_OUTPUTS.length) {
      fullyImplemented++;
    } else if (uniqueImplemented.length > 0) {
      partiallyImplemented++;
    } else {
      deliberatelyExcluded++;
    }
  }

  // Validate semantic equivalence between Helm and Argo CD
  for (const [capabilityId, capability] of Object.entries(matrix.matrix)) {
    const outputs = capability.outputs || {};
    const helmOutput = outputs.kubernetes_helm || outputs['kubernetes_helm'];
    const argoOutput = outputs.kubernetes_argocd || outputs['kubernetes_argocd'];

    if (helmOutput && argoOutput) {
      const helmStatus = helmOutput.status;
      const argoStatus = argoOutput.status;
      
      if (helmStatus && argoStatus && helmStatus !== argoStatus) {
        errors.push(`Capability "${capabilityId}": Helm (${helmStatus}) and Argo CD (${argoStatus}) status mismatch`);
      }

      // Check feature equivalence
      const helmFeatures = helmOutput.implemented || [];
      const argoFeatures = argoOutput.implemented || [];
      
      const helmMissing = helmFeatures.filter(f => !argoFeatures.includes(f));
      const argoMissing = argoFeatures.filter(f => !helmFeatures.includes(f));

      if ((helmFeatures.length > 0 || argoFeatures.length > 0) && (helmMissing.length > 0 || argoMissing.length > 0)) {
        warnings.push(`Capability "${capabilityId}": Potential semantic difference between Helm and Argo CD features`);
      }
    }
    
    // Also check nested extensions for Helm/Argo CD equivalence
    if (capability.extensions) {
      for (const [extensionId, extension] of Object.entries(capability.extensions)) {
        if (extension.outputs) {
          const extOutputs = extension.outputs;
          const helmExtOutput = extOutputs.kubernetes_helm || extOutputs['kubernetes_helm'];
          const argoExtOutput = extOutputs.kubernetes_argocd || extOutputs['kubernetes_argocd'];
          
          if (helmExtOutput && argoExtOutput) {
            const helmExtStatus = helmExtOutput.status;
            const argoExtStatus = argoExtOutput.status;
            
            if (helmExtStatus && argoExtStatus && helmExtStatus !== argoExtStatus) {
              errors.push(`Extension "${capabilityId}.${extensionId}": Helm (${helmExtStatus}) and Argo CD (${argoExtStatus}) status mismatch`);
            }
          }
        }
      }
    }
  }

  // Generate report
  const report = {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalCapabilities,
      fullyImplemented,
      partiallyImplemented,
      deliberatelyExcluded,
      completenessPercentage: totalCapabilities > 0 ? Math.round((fullyImplemented / totalCapabilities) * 100) : 0,
      timestamp: new Date().toISOString()
    }
  };

  return report;
}

/**
 * Main function that runs validation and exits with appropriate code
 */
async function main() {
  console.log('🔍 Validating MVP parity matrix...');
  
  const report = await validateMatrix();

  // Print summary
  console.log('\n📊 Matrix Validation Report');
  console.log('='.repeat(50));
  console.log(`Total Capabilities: ${report.summary.totalCapabilities}`);
  console.log(`Fully Implemented: ${report.summary.fullyImplemented}`);
  console.log(`Partially Implemented: ${report.summary.partiallyImplemented}`);
  console.log(`Deliberately Excluded: ${report.summary.deliberatelyExcluded}`);
  console.log(`Completeness: ${report.summary.completenessPercentage}%`);
  console.log(`Timestamp: ${report.summary.timestamp}`);

  // Print errors
  if (report.errors.length > 0) {
    console.log('\n❌ Validation Errors:');
    report.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }

  // Print warnings
  if (report.warnings.length > 0) {
    console.log('\n⚠️  Validation Warnings:');
    report.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`);
    });
  }

  // Exit with appropriate code
  if (!report.valid) {
    console.log('\n❌ Matrix validation failed. Please fix the errors above.');
    exit(1);
  } else if (report.warnings.length > 0) {
    console.log('\n✅ Matrix validation passed with warnings.');
    exit(0);
  } else {
    console.log('\n✅ Matrix validation passed.');
    exit(0);
  }
}

// Run the validation
main().catch(error => {
  console.error('❌ Unexpected error during matrix validation:', error);
  exit(1);
});