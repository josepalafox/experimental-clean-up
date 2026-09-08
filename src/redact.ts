// Callout: Defense-in-depth redaction covers common credentials before model assessment.
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_ACCESS_KEY]"],
  [/(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)[\s\S]*?(-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g, "$1\n[REDACTED]\n$2"],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}\b/gi, "$1[REDACTED]"],
  [/\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?([^\s"']{8,})["']?/gi, "$1=[REDACTED]"],
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (redacted, [pattern, replacement]) => redacted.replace(pattern, replacement),
    value,
  );
}

export function containsSecretLikeValue(value: string): boolean {
  return SECRET_PATTERNS.some(([pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}
