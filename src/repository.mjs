/**
 * Repository Export/Import Module
 * Issue #16: Add deployment repository export, import and reconfiguration UX
 * Epic #13: Private deployment repositories and proprietary updater
 */

import { mkdir, readFile, writeFile, readdir, stat, rm } from "node:fs/promises";
import { join, dirname, basename, relative } from "node:path";
import { createHash } from "node:crypto";
import { loadCatalog, validateProfile, normalizeProfileWithRules, calculateSizing } from "./core.mjs";
import { buildSingleHostBundle, requiredTemplatePaths } from "./bundle.mjs";
import { buildKubernetesBundle, requiredKubernetesTemplatePaths } from "./kubernetes.mjs";

const ROOT = new URL("../", import.meta.url);
const REPOSITORY_FORMAT_VERSION = "1.0.0";
const REPOSITORY_SPEC_VERSION = "1.0";

/**
 * Secret detection patterns
 * These patterns identify potential secrets that should not be committed
 */
const SECRET_PATTERNS = [
  // Password patterns
  { pattern: /(password|passwd|secret|token|api[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"]?[^\s'""]{8,}['"]?/gi, weight: 10 },
  // Private keys
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/, weight: 10 },
  // Certificate patterns (might be allowed in some contexts, but flag for review)
  { pattern: /-----BEGIN CERTIFICATE-----/, weight: 5 },
  // Database connection strings
  { pattern: /(mysql|postgres|postgresql|mongodb|redis|amqp|sqlserver):\/\/[^\s]+:[^\s]+@[^\s]+/gi, weight: 10 },
  // AWS credentials
  { pattern: /(AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/gi, weight: 10 },
  // Generic high-entropy base64 strings
  { pattern: /['"`][A-Za-z0-9+/=]{40,}['"`]/g, weight: 3 },
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/gi, weight: 10 },
  // Docker registry credentials
  { pattern: /docker[_-]?password\s*[:=]/gi, weight: 10 },
  // Generic secret assignment
  { pattern: /(SECRET|CREDENTIAL|PRIVATE)[_-]?(KEY|TOKEN|PASSWORD)\s*[:=]/gi, weight: 8 }
];

/**
 * Forbidden file extensions and patterns
 */
const FORBIDDEN_FILE_PATTERNS = [
  // Database files
  /\.(sql|db|sqlite|mdb|accdb)$/i,
  // Backup files
  /\.(bak|backup|bkp|old|~)$/i,
  // Archive files
  /\.(tar|gz|tgz|bz2|xz|zip|rar|7z)$/i,
  // Private keys and certificates
  /\.(pem|key|p12|pfx|jks|kdb|keystore)$/i,
  // Environment files with potential secrets
  /\.env(\..*)?$/i,
  // IDE and editor files
  /\.(swp|swo|sublime-workspace|sublime-project|vscode|idea|iml|suo)$/i,
  // OS files
  /\.(dll|exe|so|dylib|app|bat|cmd|sh|ps1)$/i,
  // Temporary files
  /(^|\/)temp\d*$/i,
  /(^|\/)tmp\d*$/i,
  /\.tmp$/i
];

/**
 * Allowed secret reference patterns
 * These are safe ways to reference secrets without committing plaintext
 */
const ALLOWED_SECRET_REFERENCE_PATTERNS = [
  /\$\{[A-Z_][A-Z0-9_]*\}/,                    // Environment variable references: ${VAR_NAME}
  /secretKeyRef:\s*name:\s*\w+/,              // Kubernetes secret references
  /!vault\s+/,                                 // Ansible vault references
  /\/run\/secrets\//,                        // Docker/Kubernetes secret mounts
  /\/var\/run\/secrets\//,                   // Kubernetes secret mounts
  /\/etc\/secrets\//,                        // Common secrets directory
  /ref:\s*[a-zA-Z0-9-_]+/,                     // Generic reference pattern
];

/**
 * Repository metadata structure
 */
function createRepositoryMetadata(profile, options = {}) {
  return {
    repositoryFormatVersion: REPOSITORY_FORMAT_VERSION,
    repositorySpecVersion: REPOSITORY_SPEC_VERSION,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    configuratorVersion: options.configuratorVersion || "unknown",
    catalogueVersion: options.catalogueVersion || "unknown",
    deploymentId: options.deploymentId || generateDeploymentId(),
    customerId: options.customerId || "unknown",
    profileHash: options.profileHash || "",
    migrations: options.migrations || [],
    schemaVersion: options.schemaVersion || "get.owncloud.com/v1alpha1",
    rendererVersion: options.rendererVersion || "1.0.0"
  };
}

/**
 * Generate a unique deployment ID
 */
function generateDeploymentId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `deploy-${timestamp}-${random}`;
}

/**
 * Calculate SHA-256 hash of a string
 */
async function sha256Hash(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Calculate SHA-256 hash of a file
 */
async function hashFile(filePath) {
  const content = await readFile(filePath, "utf8");
  return sha256Hash(content);
}

/**
 * Scan content for secrets
 */
function scanForSecrets(content, filePath) {
  const findings = [];
  
  for (const { pattern, weight } of SECRET_PATTERNS) {
    const matches = [...content.matchAll(pattern)];
    for (const match of matches) {
      const matchedText = match[0];
      // Check if this match is actually a secret reference (allowed)
      const isSecretReference = ALLOWED_SECRET_REFERENCE_PATTERNS.some(
        refPattern => refPattern.test(matchedText)
      );
      
      if (!isSecretReference) {
        findings.push({
          file: filePath,
          line: content.substring(0, match.index).split("\n").length,
          match: matchedText,
          pattern: pattern.toString(),
          weight,
          severity: weight >= 8 ? "blocking" : weight >= 5 ? "warning" : "info"
        });
      }
    }
  }
  
  return findings;
}

/**
 * Check if a file path matches forbidden patterns
 */
function isForbiddenFile(filePath) {
  return FORBIDDEN_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Check if a file is a secret reference file (allowed)
 */
function isSecretReferenceFile(filePath) {
  const secretRefPatterns = [
    /\.secret\.ref$/i,
    /-secret\.ref\./i,
    /secret-ref\./i,
    /\.sops\.yaml$/i,
    /\.sops\.yml$/i
  ];
  return secretRefPatterns.some(pattern => pattern.test(filePath));
}

/**
 * Validate that a file does not contain secrets
 */
async function validateNoSecrets(filePath) {
  const content = await readFile(filePath, "utf8");
  const findings = scanForSecrets(content, filePath);
  
  // Filter out findings that are in secret reference files
  const filteredFindings = findings.filter(f => !isSecretReferenceFile(f.file));
  
  return {
    valid: filteredFindings.length === 0,
    findings: filteredFindings
  };
}

/**
 * Export profile to a Git repository structure
 */
export async function exportToRepository(profile, outputDirectory, options = {}) {
  const checked = await validateProfile(profile);
  if (!checked.valid) {
    throw new Error(`Invalid profile: ${checked.errors.join(", ")}`);
  }
  
  const sizing = await calculateSizing(checked.profile);
  const catalog = await loadCatalog("sources.lock");
  const legal = await loadCatalog("legal");
  
  // Create output directory
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  
  // Calculate profile hash
  const profileHash = await sha256Hash(JSON.stringify(checked.profile, null, 2));
  
  // Create metadata
  const metadata = createRepositoryMetadata(checked.profile, {
    configuratorVersion: "v1.0.0",
    catalogueVersion: catalog.version,
    deploymentId: options.deploymentId,
    customerId: options.customerId,
    profileHash,
    migrations: options.migrations || [
      {
        id: "initial-export",
        appliedAt: new Date().toISOString(),
        fromVersion: null,
        toVersion: REPOSITORY_FORMAT_VERSION,
        description: "Initial repository export from configurator"
      }
    ]
  });
  
  // Create .get-owncloud directory
  const metaDir = join(outputDirectory, ".get-owncloud");
  await mkdir(metaDir, { recursive: true, mode: 0o700 });
  await mkdir(join(metaDir, "migrations"), { recursive: true, mode: 0o700 });
  
  // Write metadata
  await writeFile(
    join(metaDir, "metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    { mode: 0o644 }
  );
  
  // Write migration record
  await writeFile(
    join(metaDir, "migrations", "initial-export.json"),
    JSON.stringify(metadata.migrations[0], null, 2) + "\n",
    { mode: 0o644 }
  );
  
  // Write owncloud.yaml (user-owned intent)
  const yamlContent = profileToYaml(checked.profile);
  await writeFile(
    join(outputDirectory, "owncloud.yaml"),
    yamlContent,
    { mode: 0o644 }
  );
  
  // Load templates
  const templatePaths = checked.profile.target.runtime === "kubernetes"
    ? requiredKubernetesTemplatePaths()
    : requiredTemplatePaths(checked.profile);
  
  const templates = {};
  for (const path of templatePaths) {
    templates[path] = await readFile(new URL(path, ROOT), "utf8");
  }
  
  // Generate lock file
  const lock = await generateLockFile(checked.profile, sizing, catalog, legal, {
    profileHash,
    configuratorVersion: "v1.0.0",
    rendererVersion: "1.0.0"
  });
  
  await writeFile(
    join(outputDirectory, "owncloud.lock.json"),
    JSON.stringify(lock, null, 2) + "\n",
    { mode: 0o644 }
  );
  
  // Generate output files
  const inputs = {
    profile: checked.profile,
    sizing,
    templates,
    legal,
    sources: catalog,
    acceptance: options.acceptance || {
      acceptedAt: new Date().toISOString(),
      acceptedBy: "export-user"
    },
    secrets: options.secrets || {}
  };
  
  const files = checked.profile.target.runtime === "kubernetes"
    ? await buildKubernetesBundle(inputs)
    : await buildSingleHostBundle(inputs);
  
  // Create generated directory
  const generatedDir = join(outputDirectory, "generated");
  await mkdir(generatedDir, { recursive: true, mode: 0o700 });
  
  // Write generated files with hash headers
  for (const [filePath, content] of Object.entries(files)) {
    const destination = join(generatedDir, filePath);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    
    // Add hash header comment for drift detection
    const fileHash = await sha256Hash(content);
    const fileWithHash = addHashHeader(content, filePath, fileHash);
    
    await writeFile(destination, fileWithHash, { mode: 0o644 });
  }
  
  // Create overlays directory (empty for now)
  const overlaysDir = join(outputDirectory, "overlays");
  await mkdir(overlaysDir, { recursive: true, mode: 0o700 });
  
  // Create .gitignore
  const gitignoreContent = generateGitIgnore();
  await writeFile(
    join(outputDirectory, ".gitignore"),
    gitignoreContent,
    { mode: 0o644 }
  );
  
  // Create README.md
  const readmeContent = generateRepositoryReadme(checked.profile);
  await writeFile(
    join(outputDirectory, "README.md"),
    readmeContent,
    { mode: 0o644 }
  );
  
  // Scan for secrets in the entire repository
  const secretScanResults = await scanRepositoryForSecrets(outputDirectory);
  
  if (secretScanResults.findings.length > 0) {
    // This should not happen if we're doing things correctly
    // But we check anyway for safety
    throw new Error(
      `Secret scan failed: ${secretScanResults.findings.length} potential secrets detected. ` +
      `First finding: ${secretScanResults.findings[0].match} in ${secretScanResults.findings[0].file}`
    );
  }
  
  return {
    repositoryPath: outputDirectory,
    metadata,
    files: {
      intent: "owncloud.yaml",
      lock: "owncloud.lock.json",
      generated: Object.keys(files).map(f => join("generated", f)),
      metadata: ".get-owncloud/metadata.json"
    },
    secretScan: secretScanResults
  };
}

/**
 * Generate lock file content
 */
async function generateLockFile(profile, sizing, catalog, legal, options = {}) {
  const profileHash = options.profileHash || await sha256Hash(JSON.stringify(profile, null, 2));
  
  return {
    version: REPOSITORY_SPEC_VERSION,
    generatedAt: new Date().toISOString(),
    configuratorVersion: options.configuratorVersion || "v1.0.0",
    catalogueVersion: catalog.version,
    profileHash,
    renderer: {
      type: profile.target.runtime === "kubernetes" ? "helm" : "docker-compose",
      version: "1.0.0"
    },
    components: {
      ocis: {
        version: profile.ocisVersion || (profile.target.runtime === "kubernetes" ? "7.1.4" : "8.2.0"),
        gitCommit: catalog.sources.ocisCompose.commit,
        image: catalog.sources.ocisCompose.image || catalog.ocis.image
      },
      collabora: profile.office.mode === "collabora" ? {
        version: "latest",
        image: "docker.io/collabora/code:latest"
      } : undefined,
      clamav: profile.features.clamav ? {
        version: "latest",
        image: "docker.io/clamav/clamav:latest"
      } : undefined,
      tika: profile.features.search ? {
        version: "latest",
        image: "docker.io/apache/tika:latest"
      } : undefined
    },
    policy: {
      eulaSha256: legal.eula.sha256,
      maturity: profile.maturity || (profile.purpose === "production" ? "production" : "community-preview")
    },
    sizing: {
      minimum: sizing.minimum,
      recommended: sizing.recommended,
      headroomPercent: sizing.headroomPercent || 30
    },
    generatedFiles: {}
  };
}

/**
 * Convert profile to YAML format
 */
function profileToYaml(profile) {
  return convertToYaml(profile);
}

/**
 * Simple YAML stringifier for basic structures
 * Note: For production, consider using js-yaml or similar library
 */
function convertToYaml(obj, indent = 0) {
  const spaces = "  ".repeat(indent);
  const lines = [];
  
  if (obj === null || obj === undefined) {
    return "null";
  }
  
  if (typeof obj === "boolean") {
    return obj ? "true" : "false";
  }
  
  if (typeof obj === "number") {
    return String(obj);
  }
  
  if (typeof obj === "string") {
    // Check if string needs quoting
    if (obj === "" || obj.includes(" ") || obj.includes("\n") || 
        obj.includes("#") || obj.includes(":") || obj.includes("\"") ||
        obj.startsWith("true") || obj.startsWith("false") || obj.startsWith("null")) {
      // Escape quotes and special characters
      const escaped = obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
      return `"${escaped}"`;
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      lines.push(spaces + "[]");
    } else {
      for (const item of obj) {
        lines.push(spaces + "- " + convertToYaml(item, indent + 1).trim());
      }
    }
    return lines.join("\n");
  }
  
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    if (keys.length === 0) {
      lines.push(spaces + "{}");
    } else {
      for (const key of keys) {
        const value = obj[key];
        const formattedKey = /^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) ? key : `"${key}"`;
        const formattedValue = convertToYaml(value, indent + 1);
        
        if (formattedValue.startsWith("{") || formattedValue.startsWith("[") || 
            formattedValue.split("\n").length > 1) {
          lines.push(spaces + `${formattedKey}:`);
          lines.push(formattedValue.split("\n").map(line => 
            line ? spaces + "  " + line : line
          ).join("\n"));
        } else {
          lines.push(spaces + `${formattedKey}: ${formattedValue}`);
        }
      }
    }
    return lines.join("\n");
  }
  
  return String(obj);
}

/**
 * Add hash header to generated file for drift detection
 */
function addHashHeader(content, filePath, hash) {
  const header = `# @generated by get-owncloud
# file: ${filePath}
# hash: sha256:${hash}
# Do not edit manually - changes will be overwritten on regeneration
# To modify, update owncloud.yaml and regenerate

`;
  
  // If the content already has a hash header, replace it
  const existingHeaderMatch = content.match(/^# @generated by get-owncloud[\s\S]*?\n\n/);
  if (existingHeaderMatch) {
    return header + content.substring(existingHeaderMatch[0].length);
  }
  
  return header + content;
}

/**
 * Generate .gitignore content
 */
function generateGitIgnore() {
  return `# get-owncloud repository gitignore
# Generated by exportToRepository()

# Secret files - NEVER commit these
*.env
*.env.local
*.env.*.local
.env
.env.local
secrets/*.yaml
secrets/*.yml
secrets/*.json
*.pem
*.key
*.crt
*.p12
*.pfx
*.jks

# Database files
*.sql
*.db
*.sqlite

# Backup files
*.bak
*.backup
*.bkp
*~

# IDE files
.idea/
.vscode/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Log files
*.log
logs/

# Temporary files
*.tmp
temp/
tmp/

# Build artifacts
node_modules/
package-lock.json

# Local overrides (keep these in overlays/ instead)
local.yaml
local.yml
custom.yaml
custom.yml
`;
}

/**
 * Generate repository README.md
 */
function generateRepositoryReadme(profile) {
  const runtime = profile.target.runtime;
  const manager = profile.target.manager;
  const purpose = profile.purpose;
  
  return `# ownCloud Deployment Repository

This is a **private** ownCloud deployment repository generated by [get.ownCloud](https://get.owncloud.com/).

## ⚠️ IMPORTANT SECURITY NOTICE

**This repository contains deployment configuration, NOT secrets.**

✅ **SAFE to commit:**
- Configuration files (owncloud.yaml, owncloud.lock.json)
- Generated deployment artifacts (generated/)
- Custom overlays (overlays/)
- Documentation (README.md, docs/)

❌ **NEVER commit:**
- Plaintext passwords or API keys
- Private keys or certificates
- Registry credentials
- Database dumps or backups
- Runtime data

**Use secret references instead:**
- Environment variables: \${VARIABLE_NAME}
- Kubernetes secrets: secretKeyRef
- Ansible vault: !vault

## Repository Structure

\`\`\`
${basename(process.cwd())}/
├── owncloud.yaml              # Your deployment intent (edit this)
├── overlays/                 # Your customizations (add files here)
├── owncloud.lock.json         # Dependency lock (auto-generated)
├── generated/                # Deployment artifacts (auto-generated)
│   ${Object.keys(generatedFileExamples(profile)).map(f => `├── ${f}`).join("\n│   ")}
├── .get-owncloud/            # Repository metadata
│   ├── metadata.json
│   └── migrations/
├── .gitignore
└── README.md
\`\`\`

## Deployment Profile

- **Purpose:** ${purpose}
- **Runtime:** ${runtime}
- **Manager:** ${manager}
- **oCIS Version:** ${profile.ocisVersion || (runtime === "kubernetes" ? "7.1.4" : "8.2.0")}
- **Registered Users:** ${profile.workload?.registeredUsers || 0}
- **Storage Mode:** ${profile.storage?.mode || "ocis"}
- **Office Integration:** ${profile.office?.mode || "none"}

## How to Use This Repository

### 1. Add a Remote and Push

\`\`\`bash
# Initialize Git (if not already done)
git init

# Add your private remote (examples for different providers)

# GitHub
git remote add origin git@github.com:your-org/your-repo.git

# GitLab
git remote add origin git@gitlab.com:your-org/your-repo.git

# Forgejo
git remote add origin git@forgejo.example.com:your-org/your-repo.git

# Gitea
git remote add origin git@gitea.example.com:your-org/your-repo.git

# Any Git server
git remote add origin git@your-git-server.com:path/to/repo.git

# Add all files and commit
git add .
git commit -m "Initial ownCloud deployment configuration"

# Push to main branch
git push -u origin main
\`\`\`

### 2. Update Your Deployment

1. Edit \`owncloud.yaml\` to change your configuration
2. Add customizations to \`overlays/\`
3. Regenerate the deployment artifacts:
   \`\`\`bash
   # Using the configurator
   get-owncloud render owncloud.yaml . --regenerate
   \`\`\`
4. Commit and push changes:
   \`\`\`bash
   git add .
   git commit -m "Update deployment configuration"
   git push
   \`\`\`

### 3. Deploy

Follow the deployment instructions for your chosen runtime:

#### Docker Compose
\`\`\`bash
cd generated
sh install.sh --accept-eula
\`\`\`

#### Podman Compose
\`\`\`bash
cd generated
sh install.sh --accept-eula --engine podman
\`\`\`

#### Kubernetes (Helm)
\`\`\`bash
cd generated/helm
helm install owncloud . --values values.yaml --namespace owncloud --create-namespace
\`\`\`

## Updating with the Proprietary Updater

If you have access to the ownCloud proprietary updater:

1. The updater will detect new versions
2. It will create a pull request with update proposals
3. Review the changes and migration notes
4. Test in staging
5. Merge to deploy

## Troubleshooting

### Drift Detected

If you see a "drift detected" error, it means generated files have been manually modified.

**Solution:**
\`\`\`bash
# Regenerate all files
get-owncloud render owncloud.yaml . --regenerate --force

# Or restore from profile
get-owncloud render owncloud.yaml . --force
\`\`\`

### Secrets in Repository

If the secret scanner detects potential secrets:

1. Remove the file containing secrets
2. Replace plaintext values with secret references
3. Use your preferred secret management system

### Importing into Configurator

To import this repository back into the configurator:

1. Zip the repository: \`\`\`bash
   zip -r deployment.zip . -x "*.git*" "node_modules/*"
\`\`\`
2. Upload to get.ownCloud.com
3. Or use CLI: \`\`\`bash
   get-owncloud import deployment.zip
\`\`\`

## Support

For support, refer to:
- [ownCloud Documentation](https://doc.owncloud.com/)
- [get.ownCloud Documentation](https://get.owncloud.com/docs)
- [Issue Tracker](https://github.com/amamus/get-owncloud/issues)

## License

This repository configuration is provided under the terms of the ownCloud Infinite Scale EULA.
You must have accepted the EULA to generate this repository.
`;
}

/**
 * Generate example file paths for README
 */
function generatedFileExamples(profile) {
  if (profile.target.runtime === "kubernetes") {
    return {
      "helm/values.yaml": "",
      "helm/Chart.yaml": "",
      "kubernetes/namespace.yaml": "",
      "README.md": ""
    };
  }
  return {
    "docker-compose.yml": "",
    "ocis.yml": "",
    ".env": "",
    "install.sh": "",
    "README.md": ""
  };
}

/**
 * Import from a repository directory
 */
export async function importFromRepository(repositoryPath, options = {}) {
  const results = {
    valid: true,
    profile: null,
    lock: null,
    metadata: null,
    warnings: [],
    errors: [],
    secretsFound: []
  };
  
  // Check required files exist
  const requiredFiles = ["owncloud.yaml"];
  for (const file of requiredFiles) {
    const filePath = join(repositoryPath, file);
    try {
      await stat(filePath);
    } catch {
      results.valid = false;
      results.errors.push({
        file,
        message: `Required file not found: ${file}`,
        severity: "blocking"
      });
      return results;
    }
  }
  
  // Load and validate owncloud.yaml
  try {
    const yamlContent = await readFile(join(repositoryPath, "owncloud.yaml"), "utf8");
    results.profile = yamlToProfile(yamlContent);
    
    const validated = await validateProfile(results.profile);
    if (!validated.valid) {
      results.valid = false;
      results.errors.push(...validated.errors.map(e => ({
        file: "owncloud.yaml",
        message: e,
        severity: "blocking"
      })));
    }
  } catch (error) {
    results.valid = false;
    results.errors.push({
      file: "owncloud.yaml",
      message: `Failed to parse: ${error.message}`,
      severity: "blocking"
    });
  }
  
  // Load lock file if exists
  try {
    const lockPath = join(repositoryPath, "owncloud.lock.json");
    await stat(lockPath);
    const lockContent = await readFile(lockPath, "utf8");
    results.lock = JSON.parse(lockContent);
  } catch {
    results.warnings.push({
      file: "owncloud.lock.json",
      message: "Lock file not found - will be regenerated",
      severity: "warning"
    });
  }
  
  // Load metadata
  try {
    const metadataPath = join(repositoryPath, ".get-owncloud", "metadata.json");
    await stat(metadataPath);
    const metadataContent = await readFile(metadataPath, "utf8");
    results.metadata = JSON.parse(metadataContent);
    
    // Validate repository format version
    if (results.metadata.repositoryFormatVersion !== REPOSITORY_FORMAT_VERSION) {
      results.warnings.push({
        file: ".get-owncloud/metadata.json",
        message: `Repository format version ${results.metadata.repositoryFormatVersion} is not current (${REPOSITORY_FORMAT_VERSION})`,
        severity: "warning"
      });
    }
  } catch {
    results.warnings.push({
      file: ".get-owncloud/metadata.json",
      message: "Metadata file not found",
      severity: "warning"
    });
  }
  
  // Scan for secrets
  const secretScan = await scanRepositoryForSecrets(repositoryPath);
  results.secretsFound = secretScan.findings;
  
  if (secretScan.findings.length > 0) {
    results.valid = false;
    results.errors.push(...secretScan.findings.map(f => ({
      file: f.file,
      message: `Potential secret detected: ${f.match.substring(0, 20)}...`,
      line: f.line,
      severity: f.severity
    })));
  }
  
  // Check for forbidden files
  const allFiles = await listAllFiles(repositoryPath);
  for (const file of allFiles) {
    if (isForbiddenFile(file) && !isSecretReferenceFile(file)) {
      results.warnings.push({
        file,
        message: "Forbidden file type detected",
        severity: "warning"
      });
    }
  }
  
  // Check drift if we have both profile and lock
  if (results.profile && results.lock) {
    const drift = await checkDrift(repositoryPath, results.profile, results.lock);
    if (drift.length > 0) {
      results.warnings.push(...drift.map(d => ({
        file: d.file,
        message: `Drift detected: ${d.message}`,
        severity: "warning"
      })));
    }
  }
  
  return results;
}

/**
 * Scan entire repository for secrets
 */
async function scanRepositoryForSecrets(repositoryPath) {
  const allFiles = await listAllFiles(repositoryPath);
  const findings = [];
  
  for (const filePath of allFiles) {
    // Skip binary files and forbidden files
    if (isForbiddenFile(filePath)) continue;
    if (isSecretReferenceFile(filePath)) continue;
    
    try {
      const content = await readFile(filePath, "utf8");
      const fileFindings = scanForSecrets(content, filePath);
      findings.push(...fileFindings);
    } catch {
      // Skip files that can't be read as text
    }
  }
  
  return {
    scannedFiles: allFiles.length,
    findings: findings.sort((a, b) => b.severity.localeCompare(a.severity))
  };
}

/**
 * List all files in a directory recursively
 */
async function listAllFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      // Skip .git directory
      if (entry.name === ".git") continue;
      files.push(...await listAllFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(relative(directory, fullPath));
    }
  }
  
  return files;
}

/**
 * Check for drift between profile/lock and generated files
 */
async function checkDrift(repositoryPath, profile, lock) {
  const drifts = [];
  const generatedDir = join(repositoryPath, "generated");
  
  try {
    const generatedFiles = await listAllFiles(generatedDir);
    
    for (const filePath of generatedFiles) {
      const fullPath = join(generatedDir, filePath);
      const content = await readFile(fullPath, "utf8");
      
      // Extract hash from header if present
      const hashMatch = content.match(/^# @generated by get-owncloud[\s\S]*?# hash: sha256:([a-f0-9]{64})/);
      
      if (hashMatch) {
        const expectedHash = hashMatch[1];
        const actualHash = await sha256Hash(content);
        
        // Remove the header for hash comparison
        const contentWithoutHeader = content.replace(/^# @generated by get-owncloud[\s\S]*?\n\n/, '');
        const actualContentHash = await sha256Hash(contentWithoutHeader);
        
        if (actualContentHash !== expectedHash) {
          drifts.push({
            file: join("generated", filePath),
            message: "Content hash mismatch - file has been modified",
            expectedHash,
            actualHash: actualContentHash,
            severity: "warning"
          });
        }
      }
    }
  } catch {
    // generated directory doesn't exist or is empty
  }
  
  return drifts;
}

/**
 * Convert YAML to JavaScript object (simplified parser)
 * Note: For production, use js-yaml or similar library
 */
function yamlToProfile(yamlContent) {
  // Remove comments
  const withoutComments = yamlContent.replace(/#.*$/gm, '');
  
  // Simple YAML parser for our specific structure
  return parseYaml(withoutComments);
}

/**
 * Simple YAML parser for deployment profiles
 */
function parseYaml(content) {
  const lines = content.split("\n");
  const result = {};
  const stack = [{ obj: result, indent: 0 }];
  let currentKey = null;
  let currentValue = null;
  let inString = false;
  let stringBuffer = "";
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line || line.startsWith("#")) continue;
    
    const indent = lines[i].search(/\S/);
    const trimmed = lines[i].trim();
    
    // Check if we're in a multi-line string
    if (inString) {
      if (trimmed.startsWith("|") || trimmed.startsWith(">")) {
        // Literal or folded block scalar
        stringBuffer += trimmed.substring(1).trim() + "\n";
        continue;
      } else if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
        // Continuation of quoted string
        stringBuffer += trimmed + "\n";
        if (trimmed.endsWith('"') || trimmed.endsWith("'")) {
          inString = false;
          if (currentKey) {
            stack[stack.length - 1].obj[currentKey] = stringBuffer.trim();
            currentKey = null;
            stringBuffer = "";
          }
        }
        continue;
      } else if (indent <= stack[stack.length - 1].indent) {
        inString = false;
        if (currentKey) {
          stack[stack.length - 1].obj[currentKey] = stringBuffer.trim();
          currentKey = null;
          stringBuffer = "";
        }
      } else {
        stringBuffer += trimmed + "\n";
        continue;
      }
    }
    
    // Pop stack if we've dedented
    while (stack.length > 1 && indent < stack[stack.length - 1].indent) {
      stack.pop();
    }
    
    if (trimmed.startsWith("-")) {
      // List item
      const value = parseYamlValue(trimmed.substring(1).trim());
      const parent = stack[stack.length - 1].obj;
      if (Array.isArray(parent)) {
        parent.push(value);
      }
    } else if (trimmed.includes(":")) {
      const [key, ...valueParts] = trimmed.split(":");
      const keyName = key.trim();
      const valueStr = valueParts.join(":").trim();
      
      if (valueStr === "" || valueStr.startsWith("#")) {
        // Key with no value or comment
        stack[stack.length - 1].obj[keyName] = null;
        currentKey = keyName;
      } else if (valueStr.startsWith("|") || valueStr.startsWith(">")) {
        // Multi-line string
        inString = true;
        currentKey = keyName;
        stringBuffer = valueStr.substring(1).trim() + "\n";
      } else if (valueStr.startsWith('"') || valueStr.startsWith("'")) {
        // Quoted string
        if (valueStr.endsWith('"') || valueStr.endsWith("'")) {
          stack[stack.length - 1].obj[keyName] = parseYamlValue(valueStr);
        } else {
          inString = true;
          currentKey = keyName;
          stringBuffer = valueStr + "\n";
        }
      } else {
        const value = parseYamlValue(valueStr);
        if (value === null && valueStr.includes("\n")) {
          // Multi-line value
          inString = true;
          currentKey = keyName;
          stringBuffer = valueStr + "\n";
        } else {
          stack[stack.length - 1].obj[keyName] = value;
        }
      }
    } else if (trimmed === "{}") {
      stack[stack.length - 1].obj[currentKey] = {};
      currentKey = null;
    } else if (trimmed === "[]") {
      stack[stack.length - 1].obj[currentKey] = [];
      currentKey = null;
    }
  }
  
  return result;
}

/**
 * Parse a YAML value
 */
function parseYamlValue(value) {
  if (value === "null" || value === "~" || value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  
  // Remove quotes if present
  const unquoted = value.replace(/^['"](.*)['"]$/, "$1");
  
  return unquoted;
}

/**
 * Import from a legacy ZIP bundle
 */
export async function importFromLegacyBundle(zipPath, outputDirectory, options = {}) {
  const tempDir = await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  
  // For now, we'll simulate the import by extracting and converting
  // In a real implementation, this would use a ZIP extraction library
  
  throw new Error("Legacy bundle import not yet implemented - use exportToRepository for new deployments");
}

/**
 * Export to ZIP format (backward compatible)
 */
export async function exportToZip(profile, outputPath, options = {}) {
  // Create a temporary repository
  const tempDir = await mkdir(
    await fs.promises.mkdtemp(join(await os.tmpdir(), "get-owncloud-")),
    { recursive: true, mode: 0o700 }
  );
  
  try {
    // Export to repository format
    const result = await exportToRepository(profile, tempDir, options);
    
    // Create ZIP (simplified - in real implementation use archiver or similar)
    // For now, just copy the files
    const zipDir = dirname(outputPath);
    await mkdir(zipDir, { recursive: true, mode: 0o700 });
    
    // Copy all files to a ZIP-compatible structure
    const files = await listAllFiles(tempDir);
    for (const file of files) {
      const src = join(tempDir, file);
      const dest = join(zipDir, file);
      const content = await readFile(src, "utf8");
      await mkdir(dirname(dest), { recursive: true, mode: 0o700 });
      await writeFile(dest, content, { mode: 0o644 });
    }
    
    return result;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export {
  REPOSITORY_FORMAT_VERSION,
  REPOSITORY_SPEC_VERSION,
  scanForSecrets,
  validateNoSecrets,
  isForbiddenFile,
  isSecretReferenceFile,
  createRepositoryMetadata,
  generateLockFile,
  profileToYaml,
  convertToYaml,
  generateGitIgnore,
  generateRepositoryReadme
};
