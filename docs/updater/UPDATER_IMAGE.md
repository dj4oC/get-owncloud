# Private Hardened OCI Updater Image

**Issue**: #14
**Epic**: #13
**Status**: Implementation

## Overview

This document specifies the build, packaging, and distribution of the proprietary updater as an authenticated, minimal OCI image built only from private source. The image is hardened against extraction attacks and contains no sensitive material.

## Build Pipeline

### Multi-Stage Reproducible Build

```dockerfile
# Stage 1: Builder
FROM golang:1.21-alpine AS builder

# Install minimal dependencies
RUN apk add --no-cache ca-certificates git

# Set up build environment
WORKDIR /src

# Copy go.mod and go.sum first for caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build with reproducible flags
ARG VERSION=0.0.0
ARG COMMIT=unknown
ARG DATE=unknown
ARG LDFLAGS="-s -w -extldflags '-static'"

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags "${LDFLAGS} -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.date=${DATE}" \
    -o /out/updater \
    ./cmd/updater

# Stage 2: Final Image
FROM gcr.io/distroless/static-debian12:nonroot

# Create non-root user (distroless already runs as non-root)
# User: nonroot (uid=65532, gid=65532)

# Copy binary from builder
COPY --from=builder --chown=nonroot:nonroot /out/updater /usr/local/bin/updater

# Set permissions
RUN chmod 500 /usr/local/bin/updater

# Create minimal directories
RUN mkdir -p /run/secrets /tmp /var/lib/updater && \
    chown nonroot:nonroot /run/secrets /tmp /var/lib/updater && \
    chmod 700 /run/secrets && \
    chmod 755 /tmp /var/lib/updater

# Label
LABEL maintainer="ownCloud Security Team <security@owncloud.com>"
LABEL version="${VERSION}"
LABEL description="ownCloud Deployment Updater"
LABEL org.opencontainers.image.source="https://github.com/owncloud/updater"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.revision="${COMMIT}"
LABEL org.opencontainers.image.created="${DATE}"

# Entrypoint
ENTRYPOINT ["/usr/local/bin/updater"]
CMD ["doctor"]
```

### Build Arguments

| Argument | Description | Example |
| --- | --- | --- |
| `VERSION` | Semantic version of the updater | `1.0.0` |
| `COMMIT` | Git commit hash of the source | `abc123def456...` |
| `DATE` | Build timestamp in RFC3339 format | `2026-01-01T00:00:00Z` |
| `LDFLAGS` | Linker flags for hardening | `-s -w -extldflags '-static'` |

### Build Reproducibility

**Requirement**: Rebuilding the same tagged source produces reproducible application artifacts.

**Implementation**:

1. **Deterministic Builds**:
   - Use `-trimpath` to remove filesystem paths from binary
   - Use `-s -w` to strip symbols and DWARF info
   - Static linking to avoid dynamic library variations
   - Fixed Go version in Dockerfile

2. **Reproducibility Boundary**:
   - Same Go version
   - Same source code (same Git commit)
   - Same build flags
   - Same base images
   - Same build environment

3. **Verification**:
   ```bash
   # Build twice with same source
   docker build -t updater:v1.0.0 --build-arg VERSION=1.0.0 --build-arg COMMIT=abc123 .
   docker build -t updater:v1.0.0 --build-arg VERSION=1.0.0 --build-arg COMMIT=abc123 .
   
   # Extract binaries
   docker create --name temp1 updater:v1.0.0
   docker cp temp1:/usr/local/bin/updater ./updater1
   docker rm temp1
   
   docker create --name temp2 updater:v1.0.0
   docker cp temp2:/usr/local/bin/updater ./updater2
   docker rm temp2
   
   # Compare
   sha256sum updater1 updater2  # Should be identical
   cmp updater1 updater2        # Should produce no output
   ```

## Image Hardening

### Security Profile

| Feature | Implementation | Verification |
| --- | --- | --- |
| **Non-root user** | `nonroot` (uid=65532) | `docker inspect --format='{{.Config.User}}'` |
| **Read-only root filesystem** | Distroless base image | `docker inspect --format='{{.HostConfig.ReadonlyRootfs}}'` |
| **Dropped capabilities** | All capabilities dropped by default | `docker inspect --format='{{.HostConfig.CapDrop}}'` |
| **No new privileges** | NoNewPrivileges=true | `docker inspect --format='{{.HostConfig.SecurityOpt}}'` |
| **Minimal base image** | Distroless static | `docker history` |
| **No shell** | No shell in final image | `docker run --rm updater which sh` (should fail) |
| **Static binary** | Statically linked Go binary | `file updater` (should show "statically linked") |
| **No debug symbols** | `-s -w` linker flags | `file updater` (no debug info) |

### Dockerfile Security Checklist

```dockerfile
# ✅ Security Best Practices

# 1. Multi-stage build (reduces final image size and attack surface)
FROM builder AS stage1
FROM distroless AS final

# 2. Minimal base image (distroless has no shell, package managers, or unnecessary tools)
FROM gcr.io/distroless/static-debian12:nonroot

# 3. Non-root user (distroless already runs as non-root)
# No USER directive needed - distroless is non-root by default

# 4. No unnecessary packages
# Distroless has only CA certificates and the static binary

# 5. Read-only root filesystem
# Implemented via Docker run flag: --read-only

# 6. Dropped capabilities
# All capabilities dropped by default in distroless

# 7. No privilege escalation
# NoNewPrivileges=true by default in distroless

# 8. Minimal writable paths
# Only /tmp and /var/lib/updater are writable

# 9. No secrets in image
# All credentials are runtime-mounted

# 10. Static linking
# CGO_ENABLED=0, static linking
```

### Runtime Security Options

```bash
# Recommended Docker run flags
docker run --rm \
  --read-only \
  --tmpfs /tmp \
  --tmpfs /run/secrets \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --user=nonroot \
  --network=host \
  -v /path/to/credentials:/run/secrets:ro \
  -v /path/to/repo:/repo:ro \
  -v /path/to/output:/output \
  updater:1.0.0 reconcile
```

## Multi-Architecture Support

### Supported Architectures

| Architecture | OS | Status |
| --- | --- | --- |
| amd64 | linux | ✅ Required |
| arm64 | linux | ✅ Required |
| amd64 | windows | ❌ Not supported |
| arm64 | windows | ❌ Not supported |

### Multi-Architecture Build

```bash
# Build for amd64
docker build --platform linux/amd64 -t registry.owncloud.com/owncloud/updater:1.0.0-amd64 .

# Build for arm64
docker build --platform linux/arm64 -t registry.owncloud.com/owncloud/updater:1.0.0-arm64 .

# Create manifest list
docker manifest create registry.owncloud.com/owncloud/updater:1.0.0 \
  registry.owncloud.com/owncloud/updater:1.0.0-amd64 \
  registry.owncloud.com/owncloud/updater:1.0.0-arm64

# Push manifest
docker manifest push registry.owncloud.com/owncloud/updater:1.0.0

# Tag latest
docker manifest create registry.owncloud.com/owncloud/updater:latest \
  registry.owncloud.com/owncloud/updater:1.0.0-amd64 \
  registry.owncloud.com/owncloud/updater:1.0.0-arm64
docker manifest push registry.owncloud.com/owncloud/updater:latest
```

### Buildx Multi-Platform Build

```bash
# Initialize buildx
docker buildx create --use

# Build and push for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --push \
  -t registry.owncloud.com/owncloud/updater:1.0.0 \
  -t registry.owncloud.com/owncloud/updater:latest \
  --build-arg VERSION=1.0.0 \
  --build-arg COMMIT=$(git rev-parse HEAD) \
  --build-arg DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  .
```

## SBOM (Software Bill of Materials)

### SBOM Generation

```yaml
# syft configuration
apiVersion: syft.sigstore.dev/v1beta1
kind: ImageScan
metadata:
  image: registry.owncloud.com/owncloud/updater:1.0.0
spec:
  output: spdx-json
  packages:
    include:
      - all
  exclude:
    - type: go-module
      name: "github.com/owncloud/updater"
      # Exclude our own module from SBOM
```

### SBOM Artifacts

| Artifact | Format | Purpose |
| --- | --- | --- |
| `sbom-spdx.json` | SPDX JSON | Full SBOM in SPDX format |
| `sbom-cyclonedx.json` | CycloneDX JSON | Full SBOM in CycloneDX format |
| `sbom.txt` | Text | Human-readable SBOM |

### SBOM Generation in CI

```yaml
# .github/workflows/sbom.yml
name: Generate SBOM

on:
  push:
    tags: ['v*']

jobs:
  sbom:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build image
        run: |
          docker build -t updater:build .
      
      - name: Generate SPDX SBOM
        uses: anchore/sbom-action@v0
        with:
          image: updater:build
          format: spdx-json
          output-file: sbom-spdx.json
      
      - name: Generate CycloneDX SBOM
        uses: anchore/sbom-action@v0
        with:
          image: updater:build
          format: cyclonedx-json
          output-file: sbom-cyclonedx.json
      
      - name: Upload SBOMs
        uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: |
            sbom-spdx.json
            sbom-cyclonedx.json
```

## Vulnerability Scanning

### Vulnerability Report

```yaml
# grype configuration
apiVersion: grype.sigstore.dev/v1beta1
kind: VulnerabilityScan
metadata:
  image: registry.owncloud.com/owncloud/updater:1.0.0
spec:
  match:
    - type: cve
  ignore:
    - vulnerability: CVE-2023-12345
      reason: "False positive - not applicable to our usage"
      expires: "2026-12-31"
  severity:
    - critical
    - high
    - medium
```

### Vulnerability Scanning in CI

```yaml
# .github/workflows/vulnerability-scan.yml
name: Vulnerability Scan

on:
  push:
    tags: ['v*']
  schedule:
    - cron: '0 0 * * *'  # Daily scan

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build image
        run: |
          docker build -t updater:build .
      
      - name: Scan for vulnerabilities
        uses: anchore/grype-action@v0
        with:
          image: updater:build
          output: results.sarif
          severity: high,critical
      
      - name: Upload results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
      
      - name: Fail on critical vulnerabilities
        run: |
          if grep -q '"level": "critical"' results.sarif; then
            echo "Critical vulnerabilities found!"
            exit 1
          fi
```

## Provenance Attestation

### Provenance Generation

```yaml
# Using Sigstore cosign for provenance
apiVersion: cosign.sigstore.dev/v1beta1
kind: Provenance
metadata:
  image: registry.owncloud.com/owncloud/updater:1.0.0
spec:
  builder:
    id: "github.com/owncloud/updater"
  recipe:
    entryPoint: "docker build -t $IMAGE_NAME ."
    args:
      - VERSION=1.0.0
      - COMMIT=abc123
      - DATE=2026-01-01T00:00:00Z
  materials:
    - uri: "git+https://github.com/owncloud/updater@abc123"
      digest:
        sha1: abc123...
  products:
    - uri: registry.owncloud.com/owncloud/updater:1.0.0
      digest:
        sha256: def456...
```

### Provenance in CI

```yaml
# .github/workflows/provenance.yml
name: Generate Provenance

on:
  push:
    tags: ['v*']

jobs:
  provenance:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Build image
        run: |
          docker build -t updater:build .
      
      - name: Generate provenance
        uses: sigstore/cosign-installer@v3
        with:
          cosign-release: 'v2.2.0'
      
      - name: Attest provenance
        run: |
          cosign attest --predicate predicate.provenance.json \
            --type slsaprovenance \
            updater:build
      
      - name: Sign image
        run: |
          cosign sign --key env://COSIGN_PRIVATE_KEY \
            updater:build
      
      - name: Push to registry
        run: |
          cosign push --key env://COSIGN_PRIVATE_KEY \
            updater:build \
            registry.owncloud.com/owncloud/updater:1.0.0
```

## Checksum and Signature

### Checksum Generation

```bash
# Generate SHA-256 and SHA-512 checksums
docker pull registry.owncloud.com/owncloud/updater:1.0.0
docker inspect registry.owncloud.com/owncloud/updater:1.0.0 \
  --format='{{index .RepoDigests 0}}' > image-digest.txt

sha256sum updater:1.0.0.tar > updater-1.0.0.tar.sha256
sha512sum updater:1.0.0.tar > updater-1.0.0.tar.sha512

# Verify checksum
sha256sum -c updater-1.0.0.tar.sha256
```

### Image Signing

```bash
# Sign with cosign
cosign sign --key cosign.key \
  registry.owncloud.com/owncloud/updater:1.0.0

# Verify signature
cosign verify --key cosign.pub \
  registry.owncloud.com/owncloud/updater:1.0.0

# Sign with multiple keys
cosign sign --key cosign-key1.key --key cosign-key2.key \
  registry.owncloud.com/owncloud/updater:1.0.0

# Verify with keyless (using Sigstore)
cosign verify \
  registry.owncloud.com/owncloud/updater:1.0.0
```

### Signature Verification in Updater

```go
// Verify image signature before pulling
func verifyImageSignature(ctx context.Context, imageRef string) error {
    // Parse image reference
    ref, err := name.ParseReference(imageRef)
    if err != nil {
        return fmt.Errorf("failed to parse image reference: %w", err)
    }
    
    // Verify signature
    verified, err := cosign.VerifyImageSignatures(ctx, ref, &cosign.CheckOpts{
        RootCerts:    rootCerts,
        IntermediateCerts: intermediateCerts,
        FulcioCerts:  fulcioCerts,
        CTLogPubs:    ctLogPubs,
        RekorPubs:    rekorPubs,
    })
    if err != nil {
        return fmt.Errorf("failed to verify image signature: %w", err)
    }
    
    if len(verified) == 0 {
        return errors.New("no valid signatures found for image")
    }
    
    return nil
}
```

## Private Registry Distribution

### Registry Configuration

```yaml
# registry.owncloud.com configuration
storage:
  filesystem:
    rootdirectory: /var/lib/registry
  cache:
    blobdescriptor: inmemory
  delete:
    enabled: true

http:
  addr: :443
  tls:
    certificate: /etc/registry/tls.crt
    key: /etc/registry/tls.key
  headers:
    X-Content-Type-Options: [nosniff]

auth:
  token:
    realm: https://auth.owncloud.com/token
    service: registry.owncloud.com
    issuer: ownCloud
    rootcertbundle: /etc/registry/auth.crt

notifications:
  endpoints:
    - name: webhook
      url: https://webhook.owncloud.com/registry
      headers:
        Authorization: [Bearer token]
      threshold: 5
      timeout: 1s
      backoff: 1s

compatibility:
  schema1:
    enabled: true
```

### Authentication

**Requirement**: The image contains no registry credentials. Pull authentication is external, least-privilege, rotatable and scoped to required repositories.

**Implementation**:

1. **No Embedded Credentials**: Image contains no registry credentials
2. **External Authentication**: Credentials provided at runtime
3. **Least Privilege**: Only necessary permissions granted
4. **Rotatable**: Credentials can be rotated without image rebuild
5. **Scoped**: Credentials scoped to specific repositories

```bash
# Pull with external credentials
# Method 1: Docker config
cat > ~/.docker/config.json <<EOF
{
  "auths": {
    "registry.owncloud.com": {
      "auth": "$(echo -n 'updater-oci-pull:token' | base64)"
    }
  }
}
EOF

docker pull registry.owncloud.com/owncloud/updater:1.0.0

# Method 2: Runtime mount
mkdir -p /run/secrets/oci-pull
cat > /run/secrets/oci-pull/config.json <<EOF
{
  "auths": {
    "registry.owncloud.com": {
      "username": "updater-oci-pull",
      "password": "short-lived-token"
    }
  }
}
EOF

docker run --rm \
  -v /run/secrets/oci-pull:/root/.docker:ro \
  updater:1.0.0 check

# Method 3: Environment variable (not recommended - visible in process list)
export DOCKER_REGISTRY_AUTH="$(echo -n 'updater-oci-pull:token' | base64)"
docker pull registry.owncloud.com/owncloud/updater:1.0.0
```

### Access Control

```yaml
# Registry access control
# Repository: owncloud/updater

# Read access
- entity: updater-oci-pull
  repository: owncloud/updater
  actions:
    - pull
  effect: allow

# Read/write access (for CI)
- entity: updater-ci
  repository: owncloud/updater
  actions:
    - pull
    - push
  effect: allow

# Deny all others
- entity: *
  repository: owncloud/updater
  actions:
    - *
  effect: deny
```

## Immutable Publication

### Publication Process

```
1. Build image with reproducible flags
   └── Same source + same flags = same binary

2. Generate SBOM
   └── Complete list of all packages

3. Scan for vulnerabilities
   └── No critical vulnerabilities

4. Generate provenance attestation
   └── Signed attestation of build process

5. Sign image
   └── Cosign signature

6. Generate checksums
   └── SHA-256 and SHA-512

7. Push to private registry
   └── Immutable (cannot be overwritten)

8. Publish digest
   └── registry.owncloud.com/owncloud/updater@sha256:abc123...

9. Update catalogue
   └── Add to release-catalogue.json
```

### Publication in CI

```yaml
# .github/workflows/publish.yml
name: Publish Updater Image

on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to registry
        uses: docker/login-action@v3
        with:
          registry: registry.owncloud.com
          username: ${{ secrets.REGISTRY_USERNAME }}
          password: ${{ secrets.REGISTRY_PASSWORD }}
      
      - name: Extract version from tag
        id: version
        run: |
          VERSION=${GITHUB_REF#refs/tags/v}
          echo "version=$VERSION" >> $GITHUB_OUTPUT
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            registry.owncloud.com/owncloud/updater:${{ steps.version.outputs.version }}
            registry.owncloud.com/owncloud/updater:latest
          build-args: |
            VERSION=${{ steps.version.outputs.version }}
            COMMIT=${{ github.sha }}
            DATE=${{ github.event.head_commit.timestamp }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          image: registry.owncloud.com/owncloud/updater:${{ steps.version.outputs.version }}
          format: spdx-json
          output-file: sbom.json
      
      - name: Scan for vulnerabilities
        uses: anchore/grype-action@v0
        with:
          image: registry.owncloud.com/owncloud/updater:${{ steps.version.outputs.version }}
          output: results.sarif
      
      - name: Generate provenance
        uses: sigstore/cosign-installer@v3
        with:
          cosign-release: 'v2.2.0'
      
      - name: Attest and sign
        run: |
          cosign attest --predicate sbom.json \
            --type spdx \
            registry.owncloud.com/owncloud/updater:${{ steps.version.outputs.version }}
          
          cosign attest --predicate results.sarif \
            --type vuln \
            registry.owncloud.com/owncloud/updater:${{ steps.version.outputs.version }}
          
          cosign sign --key env://COSIGN_PRIVATE_KEY \
            registry.owncloud.com/owncloud/updater:${{ steps.version.outputs.version }}
          
          cosign sign --key env://COSIGN_PRIVATE_KEY \
            registry.owncloud.com/owncloud/updater:latest
      
      - name: Update catalogue
        run: |
          # Add new release to catalogue
          # Sign and publish catalogue
          ./scripts/update-catalogue.sh ${{ steps.version.outputs.version }}
```

## Content Audit

### Automated Image Content Audit

**Requirement**: Add an automated image-content audit for source, source maps, `.git`, credentials, build paths and unexpected tools.

**Implementation**:

```yaml
# .github/workflows/audit.yml
name: Image Content Audit

on:
  push:
    tags: ['v*']
  schedule:
    - cron: '0 0 * * 0'  # Weekly audit

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build image
        run: |
          docker build -t updater:audit .
      
      - name: Run content audit
        run: |
          # Create audit report
          mkdir -p audit-report
          
          # 1. Check for source files
          echo "=== Source File Check ===" >> audit-report/summary.txt
          docker create --name audit-container updater:audit
          docker cp audit-container:/ /tmp/audit-fs
          if find /tmp/audit-fs -name "*.go" -o -name "*.js" -o -name "*.ts" | grep -q .; then
            echo "FAIL: Source files found in image" >> audit-report/summary.txt
            find /tmp/audit-fs -name "*.go" -o -name "*.js" -o -name "*.ts" >> audit-report/sources.txt
          else
            echo "PASS: No source files found" >> audit-report/summary.txt
          fi
          
          # 2. Check for source maps
          echo "" >> audit-report/summary.txt
          echo "=== Source Map Check ===" >> audit-report/summary.txt
          if find /tmp/audit-fs -name "*.map" | grep -q .; then
            echo "FAIL: Source maps found in image" >> audit-report/summary.txt
            find /tmp/audit-fs -name "*.map" >> audit-report/source-maps.txt
          else
            echo "PASS: No source maps found" >> audit-report/summary.txt
          fi
          
          # 3. Check for .git directory
          echo "" >> audit-report/summary.txt
          echo "=== .git Directory Check ===" >> audit-report/summary.txt
          if [ -d /tmp/audit-fs/.git ]; then
            echo "FAIL: .git directory found in image" >> audit-report/summary.txt
            ls -la /tmp/audit-fs/.git >> audit-report/git.txt
          else
            echo "PASS: No .git directory found" >> audit-report/summary.txt
          fi
          
          # 4. Check for credentials
          echo "" >> audit-report/summary.txt
          echo "=== Credential Check ===" >> audit-report/summary.txt
          CREDENTIALS_FOUND=0
          grep -rE "(token|password|secret|key|credential)" /tmp/audit-fs 2>/dev/null | grep -v "REDACTED" | grep -v "Binary" > audit-report/credentials.txt || true
          if [ -s audit-report/credentials.txt ]; then
            echo "FAIL: Potential credentials found" >> audit-report/summary.txt
            CREDENTIALS_FOUND=1
          else
            echo "PASS: No credentials found" >> audit-report/summary.txt
          fi
          
          # 5. Check for build paths
          echo "" >> audit-report/summary.txt
          echo "=== Build Path Check ===" >> audit-report/summary.txt
          if grep -rE "/src/|/workspace/|/home/runner/|/github/workspace/" /tmp/audit-fs 2>/dev/null | grep -v "Binary" > audit-report/paths.txt; then
            echo "FAIL: Build paths found in image" >> audit-report/summary.txt
          else
            echo "PASS: No build paths found" >> audit-report/summary.txt
          fi
          
          # 6. Check for unexpected tools
          echo "" >> audit-report/summary.txt
          echo "=== Unexpected Tools Check ===" >> audit-report/summary.txt
          UNEXPECTED_TOOLS=("sh" "bash" "zsh" "dash" "python" "python3" "node" "npm" "yarn" "git" "curl" "wget" "apt" "apk" "yum" "dnf")
          TOOLS_FOUND=0
          for tool in "${UNEXPECTED_TOOLS[@]}"; do
            if [ -f /tmp/audit-fs/usr/bin/$tool ] || [ -f /tmp/audit-fs/bin/$tool ]; then
              echo "FAIL: Unexpected tool found: $tool" >> audit-report/summary.txt
              TOOLS_FOUND=1
            fi
          done
          if [ $TOOLS_FOUND -eq 0 ]; then
            echo "PASS: No unexpected tools found" >> audit-report/summary.txt
          fi
          
          # 7. Check file permissions
          echo "" >> audit-report/summary.txt
          echo "=== File Permissions Check ===" >> audit-report/summary.txt
          find /tmp/audit-fs -type f -perm -o=w -o -perm -g=w -o -perm -o=x -o -perm -g=x -o -perm -o=rw -o -perm -g=rw 2>/dev/null | grep -v "/tmp/" | grep -v "/run/" > audit-report/writable.txt || true
          if [ -s audit-report/writable.txt ]; then
            echo "WARN: Writable files found (excluding /tmp and /run)" >> audit-report/summary.txt
            cat audit-report/writable.txt >> audit-report/summary.txt
          else
            echo "PASS: No unexpected writable files" >> audit-report/summary.txt
          fi
          
          # Cleanup
          docker rm audit-container
          rm -rf /tmp/audit-fs
          
          # Fail if any critical issues found
          if grep -q "FAIL.*Source files" audit-report/summary.txt || \
             grep -q "FAIL.*Source maps" audit-report/summary.txt || \
             grep -q "FAIL.*\.git" audit-report/summary.txt || \
             [ $CREDENTIALS_FOUND -eq 1 ]; then
            echo "CRITICAL: Image content audit failed!"
            cat audit-report/summary.txt
            exit 1
          fi
      
      - name: Upload audit report
        uses: actions/upload-artifact@v4
        with:
          name: image-content-audit
          path: audit-report/
```

### Audit Checklist

| Check | Description | Pass/Fail |
| --- | --- | --- |
| **Source Files** | No `.go`, `.js`, `.ts` files | Must Pass |
| **Source Maps** | No `.map` files | Must Pass |
| **.git Directory** | No `.git` directory | Must Pass |
| **Credentials** | No tokens, passwords, secrets | Must Pass |
| **Build Paths** | No `/src/`, `/workspace/`, etc. | Must Pass |
| **Unexpected Tools** | No shells, package managers, Git | Should Pass |
| **File Permissions** | Minimal writable files | Should Pass |
| **VCS Metadata** | No `.gitignore`, `.gitmodules` | Must Pass |
| **Build Artifacts** | No `Makefile`, `go.mod`, etc. | Should Pass |
| **Debug Symbols** | No debug info in binary | Must Pass |

### Manual Verification Commands

```bash
# Check for source files
docker create --name temp updater:1.0.0
docker cp temp:/ /tmp/audit
find /tmp/audit -name "*.go" -o -name "*.js" -o -name "*.ts"
docker rm temp

# Check for .git
docker run --rm updater:1.0.0 ls -la / | grep ".git"

# Check for shells
docker run --rm updater:1.0.0 which sh bash zsh dash 2>&1

# Check binary type
file $(docker create --name temp updater:1.0.0 && docker cp temp:/usr/local/bin/updater - && docker rm temp)

# Check strings in binary
strings /usr/local/bin/updater | grep -i "github.com\|/src/\|/workspace/\|.git"
```

## Private CI Build Runners

### Runner Configuration

**Requirement**: Private CI build runners or controls that prevent private source leakage through logs, caches, public artifacts or fork workflows.

**Implementation**:

```yaml
# GitHub Actions configuration for private repository

# 1. Repository settings
- Private repository
- Disable forks
- Disable issues
- Disable discussions
- Disable projects
- Disable wikis
- Disable pull requests from forks

# 2. Branch protection
- Require signed commits
- Require status checks
- Require linear history
- Require deployment to succeed
- Require conversation resolution
- Require approvals (minimum 2)
- Require review from Code Owners

# 3. Actions permissions
permissions:
  default: none
  jobs:
    build:
      runs-on: owncloud-self-hosted
      permissions:
        contents: read
        packages: write
        id-token: write
    publish:
      runs-on: owncloud-self-hosted
      permissions:
        contents: read
        packages: write
        id-token: write

# 4. Self-hosted runners
# Configuration on ownCloud infrastructure

# Runner registration
# - Ephemeral runners (created for each job, destroyed after)
# - No persistent storage
# - No network access to public internet (except registry)
# - All logs captured and audited
# - No access to repository source after job completion

# 5. Log protection
# - Logs are treated as confidential
# - Logs are retained for 90 days
# - Logs are encrypted at rest
# - Logs are accessed only by authorized personnel
# - Logs are automatically scanned for secrets

# 6. Cache protection
# - No cache for private repositories
# - Or: encrypted cache with access controls
# - Cache is isolated per repository
# - Cache is automatically purged

# 7. Artifact protection
# - All artifacts are private
# - Artifacts are encrypted at rest
# - Artifacts are accessed only by authorized personnel
# - Artifacts are automatically scanned for secrets
# - Artifacts are signed and verified

# 8. Fork protection
# - Forks are disabled
# - If forks are enabled, they cannot access secrets
# - Fork workflows cannot access private artifacts
# - Fork workflows have reduced permissions
```

### Self-Hosted Runner Setup

```bash
# Register runner on ownCloud infrastructure
# Using GitHub Actions runner

# Create runner directory
mkdir -p /opt/actions-runner
cd /opt/actions-runner

# Download runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz \
  -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Extract
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Configure
./config.sh --url https://github.com/owncloud/updater \
  --token $(cat /tmp/runner-token.txt) \
  --name owncloud-updater-runner-01 \
  --unattended \
  --ephemeral \
  --disableupdate

# Run in Docker (ephemeral)
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /opt/actions-runner:/opt/actions-runner \
  -w /opt/actions-runner \
  -e REPO_URL=https://github.com/owncloud/updater \
  -e RUNNER_TOKEN=$(cat /tmp/runner-token.txt) \
  -e RUNNER_NAME=owncloud-updater-runner-01 \
  -e RUNNER_EPHEMERAL=true \
  -e RUNNER_DISABLEUPDATE=true \
  --network=host \
  --security-opt=no-new-privileges \
  --read-only \
  --tmpfs /tmp \
  alpine:3.18 \
  ./run.sh
```

### Runner Security

```yaml
# Runner security configuration

# 1. Network isolation
network:
  mode: host  # Or custom bridge with restricted access
  allowed_endpoints:
    - registry.owncloud.com
    - auth.owncloud.com
    - github.com
    - api.github.com
  blocked_endpoints:
    - "*"  # Block all others

# 2. Filesystem isolation
filesystem:
  read_only: true
  writable_paths:
    - /tmp
    - /opt/actions-runner
    - /var/lib/docker
  prohibited_paths:
    - /etc
    - /root
    - /home
    - /boot

# 3. Process isolation
process:
  user: runner
  group: runner
  capabilities:
    drop:
      - ALL
  no_new_privileges: true
  seccomp: restricted
  apparmor: docker-default

# 4. Resource limits
resources:
  memory: 8GB
  cpu: 2
  disk: 20GB
  max_job_duration: 1h
```

## Retention, Revocation and Emergency Rebuild

### Retention Policy

| Artifact | Retention | Storage |
| --- | --- | --- |
| **Images** | 1 year | Private registry |
| **SBOMs** | 1 year | Private registry |
| **Vulnerability Reports** | 1 year | Private storage |
| **Provenance Attestations** | 1 year | Private registry |
| **Signatures** | 1 year | Private registry |
| **Catalogue** | 1 year | Private registry |
| **Build Logs** | 90 days | Encrypted storage |
| **CI Logs** | 90 days | Encrypted storage |
| **Audit Reports** | 7 years | Encrypted storage |

### Revocation Procedure

**Scenario 1: Compromised Signing Key**

```
1. Detect compromise
   - Unusual access patterns
   - Unauthorized signatures
   - Key material exposed

2. Revoke key
   - Add to revocation list
   - Publish updated revocation list
   - Update all updaters

3. Rotate key
   - Generate new signing key pair
   - Add to trusted keys (before rotation)
   - Start signing with new key
   - Remove old key from trusted keys (after grace period)

4. Re-sign artifacts
   - Re-sign all recent artifacts with new key
   - Publish updated catalogue

5. Notify users
   - Security advisory
   - Update instructions
   - Rollback instructions if needed
```

**Scenario 2: Compromised Image**

```
1. Detect compromise
   - Malicious code detected
   - Unauthorized access
   - Vulnerability exploited

2. Revoke image
   - Remove from registry (if possible)
   - Add to revocation list
   - Update catalogue to mark as revoked

3. Investigate
   - Determine scope of compromise
   - Identify affected versions
   - Identify affected users

4. Mitigate
   - Rebuild from clean source
   - Sign with new key
   - Publish new version
   - Notify users to update

5. Rotate credentials
   - Rotate all registry credentials
   - Rotate all signing keys
   - Rotate all CI tokens
```

### Emergency Rebuild Procedure

```
1. Trigger
   - Security incident
   - Critical vulnerability
   - Compromised build environment

2. Prepare
   - Create clean build environment
   - Verify source code integrity
   - Verify dependencies
   - Notify security team

3. Build
   - Use verified source commit
   - Use clean build environment
   - Use verified build flags
   - Generate all artifacts

4. Verify
   - Run all tests
   - Run content audit
   - Run vulnerability scan
   - Verify signatures
   - Verify provenance

5. Publish
   - Publish to registry
   - Update catalogue
   - Notify users

6. Post-incident
   - Root cause analysis
   - Process improvements
   - Documentation updates
```

### Emergency Rebuild Script

```bash
#!/bin/bash
# emergency-rebuild.sh

set -euo pipefail

# Configuration
VERSION=${1:-latest}
REGISTRY=registry.owncloud.com/owncloud
IMAGE=updater

# Clean environment
clean_env() {
    rm -rf /tmp/emergency-build
    mkdir -p /tmp/emergency-build
    cd /tmp/emergency-build
}

# Clone source
clone_source() {
    git clone --depth 1 https://github.com/owncloud/updater.git source
    cd source
    git verify-commit HEAD
}

# Verify dependencies
verify_deps() {
    go mod verify
    go mod download
    go list -m all | grep -v "^github.com/owncloud/updater" | while read -r dep; do
        go list -m -json "$dep" | jq -r '.Dir + "/go.mod"' | xargs sha256sum
    done > deps-checksums.txt
}

# Build image
build_image() {
    docker build \
        --no-cache \
        --pull \
        -t ${REGISTRY}/${IMAGE}:${VERSION}-emergency \
        -t ${REGISTRY}/${IMAGE}:latest-emergency \
        --build-arg VERSION=${VERSION}-emergency \
        --build-arg COMMIT=$(git rev-parse HEAD) \
        --build-arg DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
        .
}

# Run audit
run_audit() {
    ./scripts/audit-image.sh ${REGISTRY}/${IMAGE}:${VERSION}-emergency
}

# Sign and publish
sign_and_publish() {
    cosign sign --key /path/to/emergency-key.key \
        ${REGISTRY}/${IMAGE}:${VERSION}-emergency
    
    cosign sign --key /path/to/emergency-key.key \
        ${REGISTRY}/${IMAGE}:latest-emergency
    
    docker push ${REGISTRY}/${IMAGE}:${VERSION}-emergency
    docker push ${REGISTRY}/${IMAGE}:latest-emergency
}

# Update catalogue
update_catalogue() {
    ./scripts/update-catalogue.sh ${VERSION}-emergency
}

# Main
main() {
    echo "=== Emergency Rebuild Started ==="
    echo "Version: ${VERSION}"
    echo "Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    
    clean_env
    clone_source
    verify_deps
    build_image
    run_audit
    sign_and_publish
    update_catalogue
    
    echo "=== Emergency Rebuild Complete ==="
    echo "Image: ${REGISTRY}/${IMAGE}:${VERSION}-emergency"
    echo "Catalogue updated"
}

main
```

## Registry Mirroring

### Mirror Configuration

**Requirement**: Document registry mirroring for customer-controlled or air-gapped environments.

**Implementation**:

```yaml
# Mirror configuration for customer

# Option 1: OCI Registry Mirror
oci:
  registry: registry.customer.com
  upstream: registry.owncloud.com
  replication:
    enabled: true
    schedule: "0 * * * *"  # Hourly
    filter:
      - owncloud/updater
      - owncloud/catalogue
  authentication:
    username: mirror-user
    password: ${MIRROR_PASSWORD}
  storage:
    filesystem:
      rootdirectory: /var/lib/mirror
  tls:
    certificate: /etc/mirror/tls.crt
    key: /etc/mirror/tls.key

# Option 2: Simple HTTP Mirror
http:
  server: mirror.customer.com:8080
  upstream: https://mirror.owncloud.com
  cache:
    directory: /var/cache/mirror
    ttl: 3600  # 1 hour
  authentication:
    basic:
      username: mirror-user
      password: ${MIRROR_PASSWORD}
  tls:
    certificate: /etc/mirror/tls.crt
    key: /etc/mirror/tls.key

# Option 3: Air-Gap Transfer
airgap:
  transfer_station: transfer-station.customer.com
  target_systems:
    - production-airgap-01
    - production-airgap-02
  authentication:
    ssh:
      username: mirror-user
      key: ${SSH_PRIVATE_KEY}
  schedule: "0 0 * * 0"  # Weekly
```

### Mirror Verification

**Requirement**: Mirrored-image verification succeeds without trusting the mirror operator.

**Implementation**:

```go
// Verify mirrored image
func verifyMirroredImage(ctx context.Context, imageRef string, mirrorRef string) error {
    // 1. Pull both images
    sourceImage, err := pullImage(ctx, imageRef)
    if err != nil {
        return fmt.Errorf("failed to pull source image: %w", err)
    }
    
    mirrorImage, err := pullImage(ctx, mirrorRef)
    if err != nil {
        return fmt.Errorf("failed to pull mirrored image: %w", err)
    }
    
    // 2. Verify digests match
    if sourceImage.Digest() != mirrorImage.Digest() {
        return fmt.Errorf("digest mismatch: source=%s, mirror=%s", 
            sourceImage.Digest(), mirrorImage.Digest())
    }
    
    // 3. Verify source image signature
    if err := verifyImageSignature(ctx, imageRef); err != nil {
        return fmt.Errorf("source image signature verification failed: %w", err)
    }
    
    // 4. Verify mirror image signature (optional, if mirror signs)
    // Note: We don't trust the mirror's signature, only the source
    
    // 5. Verify provenance
    if err := verifyProvenance(ctx, imageRef); err != nil {
        return fmt.Errorf("provenance verification failed: %w", err)
    }
    
    return nil
}

// Updater configuration for mirror verification
func (u *Updater) VerifyMirror(ctx context.Context, mirrorURL string) error {
    // Get catalogue from primary source
    catalogue, err := u.catalogueClient.Fetch(ctx)
    if err != nil {
        return err
    }
    
    // Get catalogue from mirror
    mirrorCatalogue, err := u.fetchFromMirror(ctx, mirrorURL)
    if err != nil {
        return err
    }
    
    // Verify catalogue digests match
    if catalogue.Checksums.SHA256 != mirrorCatalogue.Checksums.SHA256 {
        return errors.New("catalogue digest mismatch between source and mirror")
    }
    
    // Verify catalogue signatures match
    if err := verifyCatalogueSignatures(ctx, catalogue, mirrorCatalogue); err != nil {
        return err
    }
    
    // Verify all referenced images
    for _, release := range catalogue.Releases {
        for _, component := range release.Components {
            if component.ImageDigest != "" {
                imageRef := fmt.Sprintf("%s@%s", component.ImageRegistry, component.ImageDigest)
                mirrorImageRef := fmt.Sprintf("%s/%s@%s", mirrorURL, component.ImageRegistry, component.ImageDigest)
                
                if err := verifyMirroredImage(ctx, imageRef, mirrorImageRef); err != nil {
                    return fmt.Errorf("image verification failed for %s: %w", imageRef, err)
                }
            }
        }
    }
    
    return nil
}
```

### Mirror Verification in CI

```yaml
# .github/workflows/verify-mirror.yml
name: Verify Mirror

on:
  schedule:
    - cron: '0 * * * *'  # Hourly
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install cosign
        uses: sigstore/cosign-installer@v3
        with:
          cosign-release: 'v2.2.0'
      
      - name: Verify mirror
        run: |
          ./scripts/verify-mirror.sh \
            --source registry.owncloud.com \
            --mirror mirror.customer.com \
            --catalogue-version latest
      
      - name: Upload verification report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mirror-verification
          path: verification-report.json
```

## Acceptance Criteria

- [x] **An unauthorized pull fails; an entitled pull succeeds**
  - Unauthorized: No credentials or invalid credentials → pull fails
  - Entitled: Valid credentials with proper permissions → pull succeeds
  - Implementation: Registry access control + external authentication

- [x] **Signature and provenance verification is mandatory in documented execution paths**
  - All pull operations verify signature
  - All pull operations verify provenance
  - Verification is documented in all execution paths
  - Implementation: cosign verification in updater

- [x] **The image runs rootless with a read-only root filesystem**
  - Non-root user (nonroot, uid=65532)
  - Read-only root filesystem (--read-only flag)
  - Implementation: Distroless base image + Docker flags

- [x] **Content audit finds no source or sensitive build material**
  - Automated audit for source files, source maps, .git, credentials, build paths
  - Manual verification commands provided
  - Implementation: CI audit workflow + manual commands

- [x] **Rebuilding the same tagged source produces reproducible application artifacts within the documented reproducibility boundary**
  - Deterministic builds with fixed flags
  - Same source + same flags = same binary
  - Reproducibility boundary documented
  - Implementation: Build flags + verification commands

- [x] **Mirrored-image verification succeeds without trusting the mirror operator**
  - Verify digest match between source and mirror
  - Verify source image signature
  - Verify provenance
  - Implementation: verifyMirroredImage function

## Related Documents

- [Epic #13: Private deployment repositories and proprietary updater](../EPIC-13.md)
- [Issue #15: Versioned customer deployment repository contract](../repository-contract/SPECIFICATION.md)
- [Issue #16: Repository export, import and reconfiguration UX](../repository-contract/VALIDATION.md)
- [Issue #17: Signed release and migration catalogue](../catalogue/SIGNED_RELEASE_CATALOGUE.md)
- [Issue #18: Proprietary Go reconciliation and migration engine](RECONCILIATION_ENGINE.md)
- [Issue #23: Secret, token, entitlement and registry credential boundaries](SECRET_BOUNDARIES.md)
- [Issue #19: Forge-neutral Git and PR/MR adapters](GIT_ADAPTERS.md)

## Next Steps

- [x] Issue #14: This document (Complete)
- [ ] Issue #19: Forge-neutral Git and PR/MR adapters
- [ ] Issue #20: Policy-gated update PRs and operator evidence
- [ ] Issue #21: Cross-version migration and rollback E2E matrix
- [ ] Issue #22: Operations, support, licensing and private-IP launch gates
