export function classifyUpdate(current, candidate) {
  const result = {
    automatic: false,
    delayHours: 0,
    reason: "manual-review-required"
  };
  if (!candidate.security) return result;
  if (candidate.breaking || candidate.migration || candidate.storageSchema || candidate.idmSchema) {
    result.reason = "security-release-has-breaking-or-migration-risk";
    return result;
  }
  const currentParts = String(current.version).split(".").map(Number);
  const candidateParts = String(candidate.version).split(".").map(Number);
  const sameMinor = currentParts[0] === candidateParts[0] && currentParts[1] === candidateParts[1];
  const patchIncrease = candidateParts[2] > currentParts[2];
  if (sameMinor && patchIncrease && candidate.rollbackSafe && candidate.backupReady) {
    return { automatic: true, delayHours: 24, reason: "eligible-same-minor-security-patch" };
  }
  return result;
}
