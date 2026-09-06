import test from "node:test";
import assert from "node:assert/strict";
import { validateProfile } from "../../src/core.mjs";

/**
 * Security tests for path traversal vulnerabilities
 * Addresses issues #30 and #31
 * CWE-22: Improper Limitation of a Pathname to a Restricted Directory
 */

test.describe("Path Traversal Vulnerability - Storage Path Validation (Issue #30)", () => {
  const baseProfile = {
    apiVersion: "get.owncloud.com/v1alpha1",
    purpose: "evaluation",
    target: { runtime: "docker", manager: "direct" },
    workload: { registeredUsers: 5, storedDataGiB: 10 },
    identity: { mode: "embedded" },
    office: { mode: "none" },
    networking: { domain: "test.example.com", tls: { mode: "evaluation-self-signed" } },
    features: {}
  };

  test("rejects absolute path /etc/passwd for dataPath", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "/etc/passwd",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject absolute path /etc/passwd");
    assert.ok(result.errors.some(e => e.includes("safe persistent dataPath")), 
      "Should have storage path validation error");
  });

  test("rejects absolute path /var/lib/sensitive for dataPath", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "/var/lib/sensitive",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject absolute path /var/lib/sensitive");
    assert.ok(result.errors.some(e => e.includes("safe persistent dataPath")), 
      "Should have storage path validation error");
  });

  test("rejects absolute path /etc/passwd for configPath", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "./data/data",
        configPath: "/etc/passwd" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject absolute path /etc/passwd for configPath");
    assert.ok(result.errors.some(e => e.includes("safe persistent configPath")), 
      "Should have storage path validation error");
  });

  test("rejects path traversal ../etc for dataPath", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "../etc",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject path traversal ../etc");
    assert.ok(result.errors.some(e => e.includes("safe persistent dataPath")), 
      "Should have storage path validation error");
  });

  test("rejects path traversal foo/../etc for dataPath", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "foo/../etc",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject path traversal foo/../etc");
    assert.ok(result.errors.some(e => e.includes("safe persistent dataPath")), 
      "Should have storage path validation error");
  });

  test("rejects nested path traversal foo/bar/../../etc for dataPath", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "foo/bar/../../etc",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject nested path traversal");
    assert.ok(result.errors.some(e => e.includes("safe persistent dataPath")), 
      "Should have storage path validation error");
  });

  test("accepts relative path ./data/data", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "./data/data",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, true, "Should accept relative path ./data/data");
  });

  test("accepts relative path data/config", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "./data/data",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, true, "Should accept relative path data/config");
  });

  test("accepts relative path my-volumes/data", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "my-volumes/data",
        configPath: "my-volumes/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, true, "Should accept relative path my-volumes/data");
  });

  test("rejects empty dataPath", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject empty dataPath");
    assert.ok(result.errors.some(e => e.includes("safe persistent dataPath")), 
      "Should have storage path validation error");
  });

  test("rejects root path / for dataPath", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "/",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject root path /");
    assert.ok(result.errors.some(e => e.includes("safe persistent dataPath")), 
      "Should have storage path validation error");
  });

  test("rejects dot path . for dataPath", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: ".",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject dot path .");
    assert.ok(result.errors.some(e => e.includes("safe persistent dataPath")), 
      "Should have storage path validation error");
  });

  test("rejects double dot path .. for dataPath", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "..",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject double dot path ..");
    assert.ok(result.errors.some(e => e.includes("safe persistent dataPath")), 
      "Should have storage path validation error");
  });

  test("rejects nested paths that are identical", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "./data",
        configPath: "./data" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject identical dataPath and configPath");
    assert.ok(result.errors.some(e => e.includes("must be distinct")), 
      "Should have distinct path validation error");
  });

  test("rejects nested paths where one is inside the other", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "./data",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, false, "Should reject nested paths");
    assert.ok(result.errors.some(e => e.includes("must not be nested")), 
      "Should have nested path validation error");
  });
});

test.describe("Path Traversal Regression Tests", () => {
  const baseProfile = {
    apiVersion: "get.owncloud.com/v1alpha1",
    purpose: "evaluation",
    target: { runtime: "docker", manager: "direct" },
    workload: { registeredUsers: 5, storedDataGiB: 10 },
    identity: { mode: "embedded" },
    office: { mode: "none" },
    networking: { domain: "test.example.com", tls: { mode: "evaluation-self-signed" } },
    features: {}
  };

  test("valid configuration passes validation", async () => {
    const profile = {
      ...baseProfile,
      storage: { 
        mode: "ocis", 
        filesystem: "ext4", 
        dataPath: "./data/data",
        configPath: "./data/config" 
      }
    };
    
    const result = await validateProfile(profile);
    assert.equal(result.valid, true, "Valid configuration should pass validation");
    assert.deepEqual(result.errors, [], "Should have no validation errors");
  });

  test("multiple storage types work with valid paths", async () => {
    const storageModes = ["ocis", "s3ng"];
    const filesystems = ["ext4", "xfs", "btrfs", "zfs"];
    
    for (const mode of storageModes) {
      for (const fs of filesystems) {
        const profile = {
          ...baseProfile,
          storage: { 
            mode: mode,
            filesystem: fs,
            dataPath: mode === "s3ng" ? "./cache" : "./data/data",
            configPath: mode === "s3ng" ? "./config" : "./data/config"
          }
        };
        
        if (mode === "s3ng") {
          profile.storage.s3 = {
            endpoint: "https://s3.example.com",
            region: "us-east-1",
            bucket: "test-bucket",
            accessKeyReference: "s3-access-key",
            secretKeyReference: "s3-secret-key"
          };
        }
        
        const result = await validateProfile(profile);
        assert.equal(result.valid, true, `Valid ${mode} with ${fs} should pass validation`);
      }
    }
  });
});

test.describe("Direct isSafeStoragePath Unit Tests", () => {
  // Import the internal function for direct testing
  // Note: This requires the function to be exported or we test through the public API
  test("isSafeStoragePath function logic via validateProfile", async () => {
    const baseProfile = {
      apiVersion: "get.owncloud.com/v1alpha1",
      purpose: "evaluation",
      target: { runtime: "docker", manager: "direct" },
      workload: { registeredUsers: 5, storedDataGiB: 10 },
      identity: { mode: "embedded" },
      office: { mode: "none" },
      networking: { domain: "test.example.com", tls: { mode: "evaluation-self-signed" } },
      features: {}
    };

    // Test cases that should be rejected
    const unsafePaths = [
      "/etc/passwd",
      "/var/lib/sensitive",
      "/",
      "..",
      ".",
      "../etc",
      "foo/../etc",
      "foo/bar/../../etc",
      "/etc/passwd/../usr/bin"
    ];

    for (const unsafePath of unsafePaths) {
      const profile = {
        ...baseProfile,
        storage: { 
          mode: "ocis", 
          filesystem: "ext4", 
          dataPath: unsafePath,
          configPath: unsafePath === "./data/config" ? "./data/other" : "./data/config" 
        }
      };
      
      const result = await validateProfile(profile);
      assert.equal(result.valid, false, `Should reject unsafe path: ${unsafePath}`);
    }

    // Test cases that should be accepted
    const safePathTests = [
      { dataPath: "./data/data", configPath: "./data/config" },
      { dataPath: "data/config", configPath: "data/other" },
      { dataPath: "my-volumes/data", configPath: "my-volumes/config" },
      { dataPath: "./relative/path", configPath: "./other/path" },
      { dataPath: "a/b/c/relative/path", configPath: "a/b/c/other/path" }
    ];

    for (const { dataPath, configPath } of safePathTests) {
      const profile = {
        ...baseProfile,
        storage: { 
          mode: "ocis", 
          filesystem: "ext4", 
          dataPath: dataPath,
          configPath: configPath 
        }
      };
      
      const result = await validateProfile(profile);
      assert.equal(result.valid, true, `Should accept safe paths: dataPath=${dataPath}, configPath=${configPath}`);
    }
  });
});