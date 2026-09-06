/**
 * Performance tests for recursive directory traversal optimization
 * Issue #37: Recursive directory traversal in repository export causes O(n) filesystem operations
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { listAllFiles } from "../../src/repository.mjs";

test("listAllFiles performance with 1000 files in nested structure", async () => {
  const tempDir = await mkdtemp("get-owncloud-test-");
  
  try {
    // Create 10 directories with 100 files each (1000 files total)
    for (let i = 0; i < 10; i++) {
      const subDir = join(tempDir, `dir-${i}`);
      await mkdir(subDir, { recursive: true });
      for (let j = 0; j < 100; j++) {
        await writeFile(join(subDir, `file-${j}.txt`), `content-${i}-${j}`);
      }
    }
    
    // Create a .git directory to test exclusion
    const gitDir = join(tempDir, ".git");
    await mkdir(gitDir, { recursive: true });
    await writeFile(join(gitDir, "config"), "[core]\nrepositoryformatversion = 0");
    await writeFile(join(gitDir, "HEAD"), "ref: refs/heads/main");
    
    const start = performance.now();
    const files = await listAllFiles(tempDir);
    const duration = performance.now() - start;
    
    // Should find exactly 1000 files (excluding .git contents)
    assert.equal(files.length, 1000, `Expected 1000 files, found ${files.length}`);
    
    // Should complete in under 100ms (was potentially much slower with sequential approach)
    assert.ok(duration < 100, `listAllFiles took ${duration.toFixed(2)}ms, expected < 100ms`);
    
    // Verify all files are properly relative paths
    for (const file of files) {
      assert.ok(!file.startsWith("/"), `File path should be relative: ${file}`);
      assert.ok(!file.includes(".git"), `File should not include .git directory: ${file}`);
    }
    
    // Verify .git files are excluded
    const hasGitFiles = files.some(file => file.includes(".git"));
    assert.ok(!hasGitFiles, ".git directory files should be excluded");
    
  } finally {
    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("listAllFiles handles deeply nested directories", async () => {
  const tempDir = await mkdtemp("get-owncloud-test-");
  
  try {
    // Create a deeply nested structure: dir1/dir2/dir3/dir4/dir5
    let currentDir = tempDir;
    for (let i = 1; i <= 5; i++) {
      currentDir = join(currentDir, `dir${i}`);
      await mkdir(currentDir, { recursive: true });
      await writeFile(join(currentDir, `file${i}.txt`), `content-${i}`);
    }
    
    const files = await listAllFiles(tempDir);
    
    assert.equal(files.length, 5, `Expected 5 files, found ${files.length}`);
    
    // Verify paths are correct - files are created in each level
    const expectedFiles = [
      "dir1/file1.txt",
      "dir1/dir2/file2.txt",
      "dir1/dir2/dir3/file3.txt",
      "dir1/dir2/dir3/dir4/file4.txt",
      "dir1/dir2/dir3/dir4/dir5/file5.txt"
    ];
    
    // Sort for comparison (order may vary due to recursive readdir)
    const sortedFiles = files.sort();
    const sortedExpected = expectedFiles.sort();
    
    assert.deepEqual(sortedFiles, sortedExpected);
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("listAllFiles excludes .git directory completely", async () => {
  const tempDir = await mkdtemp("get-owncloud-test-");
  
  try {
    // Create some regular files
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src", "index.js"), "console.log('hello')");
    await writeFile(join(tempDir, "README.md"), "# Test");
    
    // Create .git directory with files at various levels
    const gitDir = join(tempDir, ".git");
    await mkdir(gitDir, { recursive: true });
    await writeFile(join(gitDir, "config"), "[core]\nrepositoryformatversion = 0");
    await mkdir(join(gitDir, "hooks"), { recursive: true });
    await writeFile(join(gitDir, "hooks", "pre-commit"), "#!/bin/sh\necho test");
    await mkdir(join(gitDir, "objects", "ab"), { recursive: true });
    await writeFile(join(gitDir, "objects", "ab", "cdef123"), "test content");
    
    const files = await listAllFiles(tempDir);
    
    // Should only find the 2 non-.git files
    assert.equal(files.length, 2, `Expected 2 files, found ${files.length}`);
    
    // Verify .git is not in any path
    for (const file of files) {
      assert.ok(!file.includes(".git"), `File path should not contain .git: ${file}`);
    }
    
    // Verify we got the expected files
    const fileSet = new Set(files);
    assert.ok(fileSet.has("README.md"), "Should include README.md");
    assert.ok(fileSet.has("src/index.js"), "Should include src/index.js");
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("listAllFiles handles empty directories", async () => {
  const tempDir = await mkdtemp("get-owncloud-test-");
  
  try {
    // Create some empty directories
    await mkdir(join(tempDir, "empty1"), { recursive: true });
    await mkdir(join(tempDir, "empty2", "nested"), { recursive: true });
    await mkdir(join(tempDir, "with-file"), { recursive: true });
    await writeFile(join(tempDir, "with-file", "file.txt"), "content");
    
    const files = await listAllFiles(tempDir);
    
    assert.equal(files.length, 1, `Expected 1 file, found ${files.length}`);
    assert.equal(files[0], "with-file/file.txt");
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("listAllFiles with custom baseDir parameter", async () => {
  const tempDir = await mkdtemp("get-owncloud-test-");
  
  try {
    const subDir = join(tempDir, "subdir");
    await mkdir(subDir, { recursive: true });
    await writeFile(join(subDir, "file1.txt"), "content1");
    await writeFile(join(subDir, "file2.txt"), "content2");
    
    // Test with baseDir set to subDir
    const files = await listAllFiles(subDir, subDir);
    
    assert.equal(files.length, 2);
    assert.ok(files.includes("file1.txt"));
    assert.ok(files.includes("file2.txt"));
    
    // All paths should be relative to baseDir
    for (const file of files) {
      assert.ok(!file.includes("subdir"), `Path should be relative to baseDir: ${file}`);
    }
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("listAllFiles handles special characters in filenames", async () => {
  const tempDir = await mkdtemp("get-owncloud-test-");
  
  try {
    // Create files with various special characters
    await writeFile(join(tempDir, "file with spaces.txt"), "content");
    await writeFile(join(tempDir, "file-with-dashes.txt"), "content");
    await writeFile(join(tempDir, "file_with_underscores.txt"), "content");
    await writeFile(join(tempDir, "file.multiple.dots.txt"), "content");
    
    const files = await listAllFiles(tempDir);
    
    assert.equal(files.length, 4);
    assert.ok(files.includes("file with spaces.txt"));
    assert.ok(files.includes("file-with-dashes.txt"));
    assert.ok(files.includes("file_with_underscores.txt"));
    assert.ok(files.includes("file.multiple.dots.txt"));
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("listAllFiles performance comparison with large directory", async () => {
  const tempDir = await mkdtemp("get-owncloud-test-");
  
  try {
    // Create a large directory structure
    // 50 directories with 50 files each = 2500 files
    const startSetup = performance.now();
    for (let i = 0; i < 50; i++) {
      const subDir = join(tempDir, `dir-${i}`);
      await mkdir(subDir, { recursive: true });
      for (let j = 0; j < 50; j++) {
        await writeFile(join(subDir, `file-${j}.txt`), `content-${i}-${j}`);
      }
    }
    const setupDuration = performance.now() - startSetup;
    
    const start = performance.now();
    const files = await listAllFiles(tempDir);
    const duration = performance.now() - start;
    
    assert.equal(files.length, 2500, `Expected 2500 files, found ${files.length}`);
    
    // Performance test: should complete in reasonable time
    // The optimized implementation should handle 2500 files efficiently
    assert.ok(duration < 200, `listAllFiles took ${duration.toFixed(2)}ms for 2500 files, expected < 200ms`);
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("listAllFiles returns empty array for empty directory", async () => {
  const tempDir = await mkdtemp("get-owncloud-test-");
  
  try {
    const files = await listAllFiles(tempDir);
    assert.equal(files.length, 0, "Empty directory should return empty array");
    assert.deepEqual(files, []);
    
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});