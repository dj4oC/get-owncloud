# Repository Validation Specification

**Parent Issue**: #15
**Epic**: #13

## Overview

This document defines the validation rules and mechanisms for customer deployment repositories. Validation ensures that repositories maintain integrity, security, and compliance with the deployment contract.

## Validation Layers

### Layer 1: Schema Validation

**Purpose**: Ensure all control files conform to their defined schemas.

**Implementation**: JSON Schema validation using AJV or equivalent.

**Schemas**:
- `owncloud.yaml` -> `schema/deployment.schema.json`
- `owncloud.lock.json` -> `schema/lock.schema.json`
- `.get-owncloud/metadata.json` -> `schema/metadata.schema.json`

**Validation Rules**:
```javascript
// Example validation function
async function validateSchema(filePath, schema) {
  const content = await readFile(filePath, 'utf8');
  const data = parseYamlOrJson(content);
  const ajv = new Ajv({ strict: true, allErrors: true });
  const validate = ajv.compile(schema);
  const valid = validate(data);
  
  if (!valid) {
    throw new ValidationError({
      file: filePath,
      errors: validate.errors,
      severity: 'blocking'
    });
  }
  
  return { valid: true, file: filePath };
}
```

### Layer 2: Policy Validation

**Purpose**: Enforce deployment policies that cannot be expressed in schemas.

**Policy Categories**:

#### Storage Policy
```yaml
# Valid storage configurations
storage:
  mode: ocis  # or s3ng
  filesystem: ext4  # or xfs, btrfs, zfs, nfs
  nfsVersion: 4.2  # required if filesystem is nfs
  
# Invalid storage configurations (rejected)
storage:
  mode: posixfs  # NOT ALLOWED
  filesystem: nfs
  nfsVersion: 4.0  # NOT ALLOWED (must be 4.2)
```

#### Identity Policy
```yaml
# Valid identity configurations
identity:
  mode: embedded  # allowed for <= 20 users
  
identity:
  mode: external-oidc  # allowed for any user count
  issuer: https://id.example.com
  ldapUri: ldaps://directory.example.com:636

# Invalid identity configurations (rejected)
identity:
  mode: embedded
  # Missing user count validation - rejected if > 20 users
```

#### Office Integration Policy
```yaml
# Valid office configurations
 office:
   mode: collabora  # ONLY allowed integration
   deployment: bundled  # or external

# Invalid office configurations (rejected)
office:
  mode: onlyoffice  # NOT ALLOWED
```

#### TLS Policy
```yaml
# Valid TLS configurations
networking:
  tls:
    mode: acme  # production
    email: admin@example.com

networking:
  tls:
    mode: evaluation-self-signed  # evaluation only

# Invalid TLS configurations (rejected)
networking:
  tls:
    mode: none  # NOT ALLOWED for production
```

### Layer 3: Secret Validation

**Purpose**: Prevent accidental commitment of secrets and credentials.

**Detection Methods**:

#### Pattern Matching
```javascript
const SECRET_PATTERNS = [
  // Password patterns
  /password\s*:\s*['"]?[^\s'""]+['"]?/i,
  /passwd\s*:\s*['"]?[^\s'""]+['"]?/i,
  /secret\s*:\s*['"]?[^\s'""]+['"]?/i,
  
  // API keys and tokens
  /api[_-]?key\s*:\s*['"]?[A-Za-z0-9-_]{20,}['"]?/i,
  /token\s*:\s*['"]?[A-Za-z0-9-_]{20,}['"]?/i,
  /auth[_-]?token\s*:\s*['"]?[A-Za-z0-9-_]{20,}['"]?/i,
  
  // Private keys
  /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  /-----BEGIN CERTIFICATE-----/, // Certificates might be allowed in some contexts
  
  // Database connection strings
  /(mysql|postgres|postgresql|mongodb|redis|amqp):\/\/[^\s]+:[^\s]+@[^\s]+/i,
  
  // Registry credentials
  /docker[_-]?password\s*:/i,
  /registry[_-]?password\s*:/i,
  
  // Generic high-entropy strings
  /['"][A-Za-z0-9+/=]{40,}['"]/,
];
```

#### Entropy Detection
```javascript
function calculateEntropy(str) {
  const charCounts = {};
  for (const char of str) {
    charCounts[char] = (charCounts[char] || 0) + 1;
  }
  
  let entropy = 0;
  const length = str.length;
  
  for (const char in charCounts) {
    const probability = charCounts[char] / length;
    entropy -= probability * Math.log2(probability);
  }
  
  return entropy;
}

function isHighEntropy(str) {
  if (str.length < 16) return false;
  return calculateEntropy(str) > 3.5; // Threshold for potential secrets
}
```

#### File Type Validation
```javascript
const FORBIDDEN_FILE_TYPES = [
  '.pem',    // Certificates and keys
  '.key',    // Keys
  '.p12',    // PKCS#12 files
  '.pfx',    // PKCS#12 files
  '.jks',    // Java keystores
  '.kdb',    // Key databases
  '.sql',    // Database dumps
  '.dump',   // Database dumps
  '.bak',    // Backups
  '.backup', // Backups
  '.tar',    // Archives
  '.gz',     // Compressed files
  '.zip',    // Compressed files
  '.db',     // Database files
  '.sqlite', // SQLite databases
];

const ALLOWED_SECRET_REFERENCE_PATTERNS = [
  /\$\{[A-Z_]+\}/,                    // Environment variable references
  /secretKeyRef:/,                     // Kubernetes secret references
  /!vault/,                            // Ansible vault references
  /\/run\/secrets\//,                // Docker/Kubernetes secret mounts
  /\/var\/run\/secrets\//,           // Kubernetes secret mounts
];
```

### Layer 4: Drift Validation

**Purpose**: Detect manual modifications to system-owned files.

**Implementation**:

```javascript
class DriftDetector {
  constructor(repositoryPath) {
    this.repositoryPath = repositoryPath;
    this.expectedHashes = new Map();
  }
  
  async loadExpectedHashes() {
    // Load hashes from owncloud.lock.json
    const lock = await this.loadLockFile();
    this.expectedHashes = new Map(Object.entries(lock.generatedFiles || {}));
  }
  
  async detectDrift() {
    const drifts = [];
    
    for (const [filePath, expectedHash] of this.expectedHashes) {
      const fullPath = path.join(this.repositoryPath, filePath);
      const actualHash = await this.calculateFileHash(fullPath);
      
      if (actualHash !== expectedHash) {
        drifts.push({
          file: filePath,
          expectedHash,
          actualHash,
          severity: 'blocking',
          message: `File has been modified manually. Expected hash ${expectedHash}, got ${actualHash}`
        });
      }
    }
    
    return drifts;
  }
  
  async calculateFileHash(filePath) {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
```

### Layer 5: Dependency Validation

**Purpose**: Ensure all dependencies are resolvable and compatible.

**Validation Rules**:

#### Component Version Validation
```javascript
async function validateComponentVersions(lock) {
  const errors = [];
  
  for (const [component, spec] of Object.entries(lock.components || {})) {
    const catalog = await loadCatalog();
    
    if (!catalog.components[component]) {
      errors.push({
        component,
        message: `Unknown component: ${component}`,
        severity: 'blocking'
      });
      continue;
    }
    
    const catalogVersion = catalog.components[component];
    
    if (!catalogVersion.versions.includes(spec.version)) {
      errors.push({
        component,
        message: `Unsupported version ${spec.version} for ${component}. Supported: ${catalogVersion.versions.join(', ')}`,
        severity: 'blocking'
      });
    }
    
    // Check image digest
    if (spec.image && catalogVersion.images[spec.version] !== spec.image) {
      errors.push({
        component,
        message: `Image digest mismatch for ${component}@${spec.version}`,
        severity: 'warning'
      });
    }
  }
  
  return errors;
}
```

#### Compatibility Matrix Validation
```javascript
async function validateCompatibility(profile, lock) {
  const errors = [];
  const catalog = await loadCatalog();
  
  // Check runtime compatibility
  const runtime = profile.target.runtime;
  const runtimeCompat = catalog.compatibility[runtime];
  
  if (!runtimeCompat) {
    errors.push({
      message: `Unsupported runtime: ${runtime}`,
      severity: 'blocking'
    });
    return errors;
  }
  
  // Check oCIS version compatibility
  const ocisVersion = profile.ocisVersion || lock.ocisVersion;
  if (!runtimeCompat.ocisVersions.includes(ocisVersion)) {
    errors.push({
      message: `oCIS version ${ocisVersion} not supported on ${runtime}`,
      severity: 'blocking'
    });
  }
  
  // Check manager compatibility
  const manager = profile.target.manager;
  if (runtimeCompat.managers && !runtimeCompat.managers.includes(manager)) {
    errors.push({
      message: `Manager ${manager} not supported on ${runtime}`,
      severity: 'blocking'
    });
  }
  
  return errors;
}
```

## Validation Execution

### Validation Pipeline

```javascript
class RepositoryValidator {
  async validate(repositoryPath) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      checks: []
    };
    
    // Layer 1: Schema Validation
    results.checks.push(...await this.validateSchemas(repositoryPath));
    
    // Layer 2: Policy Validation
    results.checks.push(...await this.validatePolicies(repositoryPath));
    
    // Layer 3: Secret Validation
    results.checks.push(...await this.validateSecrets(repositoryPath));
    
    // Layer 4: Drift Validation
    results.checks.push(...await this.validateDrift(repositoryPath));
    
    // Layer 5: Dependency Validation
    results.checks.push(...await this.validateDependencies(repositoryPath));
    
    // Categorize results
    for (const check of results.checks) {
      if (check.severity === 'blocking') {
        results.valid = false;
        results.errors.push(check);
      } else if (check.severity === 'warning') {
        results.warnings.push(check);
      }
    }
    
    return results;
  }
  
  async validateSchemas(repositoryPath) {
    const checks = [];
    const schemaValidator = new SchemaValidator();
    
    // Validate owncloud.yaml
    const intentPath = path.join(repositoryPath, 'owncloud.yaml');
    if (await fs.promises.access(intentPath).catch(() => false)) {
      checks.push(await schemaValidator.validate(intentPath, 'deployment'));
    }
    
    // Validate owncloud.lock.json
    const lockPath = path.join(repositoryPath, 'owncloud.lock.json');
    if (await fs.promises.access(lockPath).catch(() => false)) {
      checks.push(await schemaValidator.validate(lockPath, 'lock'));
    }
    
    // Validate metadata
    const metadataPath = path.join(repositoryPath, '.get-owncloud', 'metadata.json');
    if (await fs.promises.access(metadataPath).catch(() => false)) {
      checks.push(await schemaValidator.validate(metadataPath, 'metadata'));
    }
    
    return checks;
  }
}
```

### Validation in CI

```yaml
# .github/workflows/validate-repository.yml
name: Repository Validation

on:
  push:
    branches: [main, release/*]
    paths:
      - 'owncloud.yaml'
      - 'owncloud.lock.json'
      - 'generated/**'
      - '.get-owncloud/**'
  pull_request:
    branches: [main]
    paths:
      - 'owncloud.yaml'
      - 'owncloud.lock.json'
      - 'generated/**'
      - '.get-owncloud/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for drift detection
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci --ignore-scripts
      
      - name: Run repository validation
        run: node src/validation.mjs ./deployments/customer-repo
        env:
          VALIDATION_MODE: strict
      
      - name: Upload validation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: validation-report
          path: validation-report.json
```

## Validation Report Format

```json
{
  "repository": "customer-deployment-repo",
  "validatedAt": "2026-01-01T00:00:00Z",
  "validatorVersion": "v1.0.0",
  "overallStatus": "valid" | "invalid" | "warning",
  "summary": {
    "totalChecks": 42,
    "passed": 40,
    "failed": 2,
    "warnings": 5,
    "errors": 2
  },
  "checks": [
    {
      "id": "schema-owncloud-yaml",
      "name": "Schema Validation: owncloud.yaml",
      "status": "passed" | "failed" | "warning",
      "severity": "blocking" | "warning" | "info",
      "file": "owncloud.yaml",
      "message": "File conforms to deployment schema",
      "details": {}
    },
    {
      "id": "policy-storage-nfs-version",
      "name": "Policy: NFS Version",
      "status": "failed",
      "severity": "blocking",
      "file": "owncloud.yaml",
      "message": "NFS version must be 4.2",
      "details": {
        "expected": "4.2",
        "actual": "4.0",
        "path": "storage.nfsVersion"
      }
    },
    {
      "id": "secret-plaintext-password",
      "name": "Secret Detection: Plaintext Password",
      "status": "failed",
      "severity": "blocking",
      "file": "overlays/custom.env",
      "message": "Plaintext password detected",
      "details": {
        "line": 5,
        "pattern": "ADMIN_PASSWORD=secret123",
        "suggestion": "Use environment variable reference: ADMIN_PASSWORD=${ADMIN_PASSWORD}"
      }
    },
    {
      "id": "drift-generated-docker-compose",
      "name": "Drift Detection: docker-compose.yml",
      "status": "failed",
      "severity": "blocking",
      "file": "generated/docker-compose.yml",
      "message": "File has been modified manually",
      "details": {
        "expectedHash": "abc123...",
        "actualHash": "def456...",
        "remediation": "Run: get-owncloud render profile.yaml output/ --regenerate"
      }
    }
  ],
  "recommendations": [
    {
      "action": "Update NFS version to 4.2 in owncloud.yaml",
      "priority": "high",
      "impact": "blocking"
    },
    {
      "action": "Replace plaintext password with secret reference in overlays/custom.env",
      "priority": "high",
      "impact": "blocking"
    },
    {
      "action": "Regenerate generated files",
      "priority": "high",
      "impact": "blocking"
    }
  ]
}
```

## Remediation

### Automatic Remediation

Some validation failures can be automatically remediated:

```javascript
class AutoRemediator {
  async remediate(repositoryPath, validationResults) {
    const remediated = [];
    
    for (const check of validationResults.checks) {
      if (check.status !== 'failed') continue;
      
      switch (check.id) {
        case 'drift-generated-*':
          // Regenerate the file
          const filePath = check.file.replace('generated/', '');
          await this.regenerateFile(repositoryPath, filePath);
          remediated.push(check.id);
          break;
          
        case 'lock-outdated':
          // Update lock file
          await this.updateLockFile(repositoryPath);
          remediated.push(check.id);
          break;
          
        case 'schema-missing-field':
          // Add missing field with default value
          await this.addMissingField(repositoryPath, check.file, check.details.path, check.details.default);
          remediated.push(check.id);
          break;
      }
    }
    
    return remediated;
  }
  
  async regenerateFile(repositoryPath, relativePath) {
    const profile = await this.loadProfile(repositoryPath);
    const generator = new Generator(profile);
    const content = await generator.generate(relativePath);
    const outputPath = path.join(repositoryPath, 'generated', relativePath);
    await fs.promises.writeFile(outputPath, content);
    return outputPath;
  }
}
```

### Manual Remediation

For validation failures that require manual intervention:

1. **Schema Violations**
   - Fix the YAML/JSON syntax
   - Add missing required fields
   - Remove unknown fields
   - Correct type mismatches

2. **Policy Violations**
   - Update configuration to comply with policy
   - Change storage mode to ocis or s3ng
   - Update NFS version to 4.2
   - Switch to Collabora for office integration
   - Enable TLS for production

3. **Secret Violations**
   - Replace plaintext secrets with references
   - Remove committed secret files
   - Use approved secret management patterns

4. **Drift Violations**
   - Revert manual changes to generated files
   - Regenerate all files from profile
   - Update profile if intentional changes were made

## Golden Fixtures

### Fixture Structure

```
fixtures/
├── repository/
│   ├── docker-evaluation/
│   │   ├── owncloud.yaml
│   │   ├── owncloud.lock.json
│   │   └── generated/
│   │       └── docker-compose.yml
│   ├── docker-production/
│   │   ├── owncloud.yaml
│   │   ├── owncloud.lock.json
│   │   └── generated/
│   │       ├── docker-compose.yml
│   │       └── ...
│   ├── kubernetes-preview/
│   │   ├── owncloud.yaml
│   │   ├── owncloud.lock.json
│   │   └── generated/
│   │       └── helm/
│   │           └── values.yaml
│   └── podman-evaluation/
│       ├── owncloud.yaml
│       ├── owncloud.lock.json
│       └── generated/
│           └── docker-compose.yml
└── validation/
    ├── valid-repositories.json
    └── invalid-repositories.json
```

### Fixture Validation

```javascript
class FixtureValidator {
  async validateAllFixtures() {
    const fixturePath = path.join(__dirname, 'fixtures', 'repository');
    const directories = await fs.promises.readdir(fixturePath);
    
    for (const dir of directories) {
      const repoPath = path.join(fixturePath, dir);
      const stat = await fs.promises.stat(repoPath);
      
      if (!stat.isDirectory()) continue;
      
      // Each fixture directory should be a valid repository
      const result = await this.validateRepository(repoPath);
      
      if (!result.valid) {
        throw new Error(`Fixture ${dir} is invalid: ${JSON.stringify(result.errors)}`);
      }
      
      // Verify determinism: regenerate and compare
      await this.verifyDeterminism(repoPath);
    }
  }
  
  async verifyDeterminism(repositoryPath) {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'get-owncloud-'));
    
    try {
      // Load profile from repository
      const profile = await this.loadProfile(repositoryPath);
      
      // Regenerate to temp directory
      const generator = new Generator(profile);
      await generator.generateAll(path.join(tempDir, 'generated'));
      
      // Compare with original
      const originalGenerated = path.join(repositoryPath, 'generated');
      const differences = await this.compareDirectories(originalGenerated, path.join(tempDir, 'generated'));
      
      if (differences.length > 0) {
        throw new Error(`Determinism check failed for ${repositoryPath}: ${differences.join(', ')}`);
      }
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}
```

## Round-Trip Validation

### Import-Export Round-Trip

```javascript
class RoundTripValidator {
  async validateImportExport(legacyBundlePath) {
    // Step 1: Import legacy bundle
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'get-owncloud-'));
    const importer = new LegacyImporter();
    
    await importer.import(legacyBundlePath, tempDir);
    
    // Step 2: Load and re-export
    const profile = await this.loadProfile(tempDir);
    const exporter = new RepositoryExporter();
    const exportPath = path.join(tempDir, 're-exported');
    await exporter.export(profile, exportPath);
    
    // Step 3: Compare
    const originalFiles = await this.listFiles(legacyBundlePath);
    const reExportedFiles = await this.listFiles(exportPath);
    
    const differences = await this.compareDeployments(legacyBundlePath, exportPath);
    
    // User-owned fields must be preserved
    const userFields = ['purpose', 'workload', 'identity', 'storage', 'office', 'networking'];
    for (const field of userFields) {
      const original = this.getField(legacyBundlePath, field);
      const reExported = this.getField(exportPath, field);
      
      if (JSON.stringify(original) !== JSON.stringify(reExported)) {
        throw new Error(`User field ${field} not preserved: original=${original}, re-exported=${reExported}`);
      }
    }
    
    // Runtime behavior must be identical
    await this.verifyRuntimeEquivalence(legacyBundlePath, exportPath);
    
    return { valid: true, differences };
  }
  
  async verifyRuntimeEquivalence(bundle1, bundle2) {
    // Extract runtime configuration from both
    const config1 = await this.extractRuntimeConfig(bundle1);
    const config2 = await this.extractRuntimeConfig(bundle2);
    
    // Compare container configurations
    const containers1 = config1.containers || [];
    const containers2 = config2.containers || [];
    
    if (containers1.length !== containers2.length) {
      throw new Error(`Container count mismatch: ${containers1.length} vs ${containers2.length}`);
    }
    
    // Compare each container
    for (let i = 0; i < containers1.length; i++) {
      const c1 = containers1[i];
      const c2 = containers2[i];
      
      // Compare image, environment, volumes, ports
      if (c1.image !== c2.image) {
        throw new Error(`Container ${c1.name} image mismatch: ${c1.image} vs ${c2.image}`);
      }
      
      // Environment variables (excluding generated secrets)
      const env1 = this.filterSecretRefs(c1.environment);
      const env2 = this.filterSecretRefs(c2.environment);
      
      if (JSON.stringify(env1) !== JSON.stringify(env2)) {
        throw new Error(`Container ${c1.name} environment mismatch`);
      }
    }
  }
}
```

## Test Coverage

### Unit Tests

```javascript
// validation.test.mjs
describe('Repository Validation', () => {
  let validator;
  
  beforeEach(() => {
    validator = new RepositoryValidator();
  });
  
  describe('Schema Validation', () => {
    it('should validate a conforming owncloud.yaml', async () => {
      const result = await validator.validateSchema(
        'fixtures/repository/docker-evaluation/owncloud.yaml',
        'deployment'
      );
      expect(result.valid).toBe(true);
    });
    
    it('should reject a non-conforming owncloud.yaml', async () => {
      const result = await validator.validateSchema(
        'fixtures/invalid/missing-apiVersion.yaml',
        'deployment'
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.objectContaining({
        keyword: 'required',
        params: expect.objectContaining({
          missingProperty: 'apiVersion'
        })
      }));
    });
  });
  
  describe('Policy Validation', () => {
    it('should accept NFS v4.2', async () => {
      const profile = { storage: { filesystem: 'nfs', nfsVersion: '4.2' } };
      const result = await validator.validatePolicy(profile);
      expect(result.valid).toBe(true);
    });
    
    it('should reject NFS v4.0', async () => {
      const profile = { storage: { filesystem: 'nfs', nfsVersion: '4.0' } };
      const result = await validator.validatePolicy(profile);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.objectContaining({
        message: expect.stringContaining('NFS version must be 4.2')
      }));
    });
    
    it('should reject posixfs storage mode', async () => {
      const profile = { storage: { mode: 'posixfs' } };
      const result = await validator.validatePolicy(profile);
      expect(result.valid).toBe(false);
    });
    
    it('should reject embedded IDM with >20 users', async () => {
      const profile = {
        identity: { mode: 'embedded' },
        workload: { registeredUsers: 25 }
      };
      const result = await validator.validatePolicy(profile);
      expect(result.valid).toBe(false);
    });
    
    it('should accept embedded IDM with <=20 users', async () => {
      const profile = {
        identity: { mode: 'embedded' },
        workload: { registeredUsers: 20 }
      };
      const result = await validator.validatePolicy(profile);
      expect(result.valid).toBe(true);
    });
  });
  
  describe('Secret Validation', () => {
    it('should detect plaintext passwords', async () => {
      const content = 'ADMIN_PASSWORD=secret123';
      const result = await validator.validateSecretContent(content, 'custom.env');
      expect(result.valid).toBe(false);
      expect(result.severity).toBe('blocking');
    });
    
    it('should accept environment variable references', async () => {
      const content = 'ADMIN_PASSWORD=${ADMIN_PASSWORD}';
      const result = await validator.validateSecretContent(content, 'custom.env');
      expect(result.valid).toBe(true);
    });
    
    it('should detect private keys', async () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
      const result = await validator.validateSecretContent(content, 'key.pem');
      expect(result.valid).toBe(false);
    });
    
    it('should detect high-entropy strings', async () => {
      const content = 'API_KEY=abc123def456ghi789jkl012mno345pqr678';
      const result = await validator.validateSecretContent(content, 'config.env');
      expect(result.valid).toBe(false);
    });
  });
});
```

### Integration Tests

```javascript
// repository.test.mjs
describe('Repository Contract', () => {
  describe('Golden Fixtures', () => {
    it('should validate all golden fixtures', async () => {
      const validator = new FixtureValidator();
      await expect(validator.validateAllFixtures()).resolves.toBeUndefined();
    });
    
    it('should detect fixture drift', async () => {
      // Modify a golden fixture
      const fixturePath = 'fixtures/repository/docker-evaluation/generated/docker-compose.yml';
      const original = await fs.promises.readFile(fixturePath, 'utf8');
      await fs.promises.writeFile(fixturePath, original + '\n# modified', 'utf8');
      
      const validator = new FixtureValidator();
      await expect(validator.validateAllFixtures()).rejects.toThrow();
      
      // Restore
      await fs.promises.writeFile(fixturePath, original, 'utf8');
    });
  });
  
  describe('Round-Trip', () => {
    it('should preserve user intent through import/export cycle', async () => {
      const validator = new RoundTripValidator();
      const result = await validator.validateImportExport(
        'test/fixtures/e2e-bundle.zip'
      );
      expect(result.valid).toBe(true);
    });
    
    it('should produce deterministic output', async () => {
      const validator = new RoundTripValidator();
      await validator.verifyDeterminism(
        'fixtures/repository/docker-evaluation'
      );
    });
  });
  
  describe('Legacy Bundle Import', () => {
    it('should convert legacy bundle to repository', async () => {
      const importer = new LegacyImporter();
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'get-owncloud-'));
      
      try {
        await importer.import('test/fixtures/e2e-bundle.zip', tempDir);
        
        // Verify repository structure
        const files = await this.listFiles(tempDir);
        expect(files).toContain('owncloud.yaml');
        expect(files).toContain('owncloud.lock.json');
        expect(files).toContain(path.join('generated', 'docker-compose.yml'));
        expect(files).toContain(path.join('.get-owncloud', 'metadata.json'));
        
        // Verify metadata
        const metadata = JSON.parse(await fs.promises.readFile(
          path.join(tempDir, '.get-owncloud', 'metadata.json'), 'utf8'
        ));
        expect(metadata.migrations).toHaveLength(1);
        expect(metadata.migrations[0].description).toContain('Legacy bundle import');
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });
    
    it('should stop with diagnostics on invalid bundle', async () => {
      const importer = new LegacyImporter();
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'get-owncloud-'));
      
      try {
        await expect(importer.import(
          'test/fixtures/invalid-bundle.zip',
          tempDir
        )).rejects.toThrow();
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
```

## Acceptance Criteria Checklist

- [x] JSON Schema validation covers every committed control file
- [x] Repository format specification is committed
- [x] Ownership table is committed
- [x] Golden fixtures cover every supported deployment family
- [x] Round-trip serialization is deterministic
- [x] Drift and forbidden-secret scanners run in CI
- [x] Importing a legacy bundle either converts losslessly or stops with actionable diagnostics
- [x] Tests prove user-owned fields survive regeneration unchanged

## Implementation Notes

1. **Validation should be fast**: All validation must complete in under 1 second for typical repositories
2. **Validation should be offline**: No network calls should be required for basic validation
3. **Validation should be portable**: Validation should work on any platform (Linux, macOS, Windows)
4. **Validation should be consistent**: Same input should always produce same validation results
5. **Validation errors should be actionable**: Every error should include clear remediation steps
