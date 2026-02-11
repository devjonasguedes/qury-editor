
import { getEntryPolicyMode } from '../modules/connectionUtils.js';

export const POLICY_MODE_DEV = "dev";
export const POLICY_MODE_STAGING = "staging";
export const POLICY_MODE_PROD = "prod";

export const ENVIRONMENT_POLICY_DEFAULTS = Object.freeze({
  [POLICY_MODE_DEV]: Object.freeze({
    allowWrite: true,
    allowDdlAdmin: true,
    requireApproval: false,
  }),
  [POLICY_MODE_STAGING]: Object.freeze({
    allowWrite: true,
    allowDdlAdmin: false,
    requireApproval: true,
  }),
  [POLICY_MODE_PROD]: Object.freeze({
    allowWrite: false,
    allowDdlAdmin: false,
    requireApproval: false,
  }),
});

export const POLICY_WRITE_KEYWORDS = new Set([
  "insert",
  "update",
  "delete",
  "merge",
  "upsert",
  "replace",
  "copy",
]);

export const POLICY_DDL_ADMIN_KEYWORDS = new Set([
  "create",
  "alter",
  "drop",
  "truncate",
  "rename",
  "comment",
  "grant",
  "revoke",
  "call",
  "do",
  "refresh",
  "reindex",
  "cluster",
  "vacuum",
  "analyze",
]);

export function cloneEnvironmentPolicyRules(input) {
  const source = input || ENVIRONMENT_POLICY_DEFAULTS;
  return {
    [POLICY_MODE_DEV]: {
      ...(source[POLICY_MODE_DEV] ||
        ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV]),
    },
    [POLICY_MODE_STAGING]: {
      ...(source[POLICY_MODE_STAGING] ||
        ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_STAGING]),
    },
    [POLICY_MODE_PROD]: {
      ...(source[POLICY_MODE_PROD] ||
        ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_PROD]),
    },
  };
}

export function normalizeEnvironmentPolicyRule(input, fallback) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback || ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV];
  return {
    allowWrite:
      source.allowWrite !== undefined
        ? !!source.allowWrite
        : !!base.allowWrite,
    allowDdlAdmin:
      source.allowDdlAdmin !== undefined
        ? !!source.allowDdlAdmin
        : !!base.allowDdlAdmin,
    requireApproval:
      source.requireApproval !== undefined
        ? !!source.requireApproval
        : !!base.requireApproval,
  };
}

export function normalizeEnvironmentPolicyRules(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    [POLICY_MODE_DEV]: normalizeEnvironmentPolicyRule(
      source[POLICY_MODE_DEV],
      ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV],
    ),
    [POLICY_MODE_STAGING]: normalizeEnvironmentPolicyRule(
      source[POLICY_MODE_STAGING],
      ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_STAGING],
    ),
    [POLICY_MODE_PROD]: normalizeEnvironmentPolicyRule(
      source[POLICY_MODE_PROD],
      ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_PROD],
    ),
  };
}

export function resolveEnvironmentPoliciesPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.policies && typeof payload.policies === "object")
    return payload.policies;
  if (payload.environments && typeof payload.environments === "object")
    return payload.environments;
  return payload;
}

// Stateful environment rules are managed by the caller (render.js) or we can manage them here?
// In render.js `environmentPolicyRules` was a local variable.
// We can provide a helper to get rule based on mode and a set of rules.

export function getPolicyRule(mode, rules) {
  const policyMode = getEntryPolicyMode({ policyMode: mode });
  const effectiveRules = rules || ENVIRONMENT_POLICY_DEFAULTS;
  return (
    effectiveRules[policyMode] ||
    ENVIRONMENT_POLICY_DEFAULTS[policyMode] ||
    ENVIRONMENT_POLICY_DEFAULTS[POLICY_MODE_DEV]
  );
}

export function sanitizeSqlForPolicy(sqlText) {
  const text = String(sqlText || "");
  let sanitized = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        sanitized += "\n";
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }

    if (inDouble) {
      if (ch === '"' && next === '"') {
        i += 1;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }

    if (inBacktick) {
      if (ch === "`") inBacktick = false;
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "`") {
      inBacktick = true;
      continue;
    }

    sanitized += ch;
  }

  return sanitized.toLowerCase();
}

export function findFirstPolicyKeyword(text, keywords) {
  const tokenRegex = /\b[a-z]+\b/g;
  let match = tokenRegex.exec(text);
  while (match) {
    const token = match[0];
    if (keywords.has(token)) {
      return { token, index: match.index };
    }
    match = tokenRegex.exec(text);
  }
  return null;
}

export function classifyStatementByPolicy(statementSql) {
  const sanitized = sanitizeSqlForPolicy(statementSql);
  if (!sanitized.trim()) return null;

  const firstWrite = findFirstPolicyKeyword(sanitized, POLICY_WRITE_KEYWORDS);
  const firstDdlAdmin = findFirstPolicyKeyword(
    sanitized,
    POLICY_DDL_ADMIN_KEYWORDS,
  );
  const selectIntoMatch = /\bselect\b[\s\S]*\binto\b/.exec(sanitized);
  const selectIntoWrite = selectIntoMatch
    ? { token: "select into", index: selectIntoMatch.index }
    : null;

  let effectiveWrite = firstWrite;
  if (
    selectIntoWrite &&
    (!effectiveWrite || selectIntoWrite.index < effectiveWrite.index)
  ) {
    effectiveWrite = selectIntoWrite;
  }

  if (!effectiveWrite && !firstDdlAdmin) return null;

  if (
    firstDdlAdmin &&
    (!effectiveWrite || firstDdlAdmin.index <= effectiveWrite.index)
  ) {
    return {
      kind: "ddlAdmin",
      action: String(firstDdlAdmin.token || "").toUpperCase(),
    };
  }

  return {
    kind: "write",
    action: String(effectiveWrite.token || "").toUpperCase(),
  };
}
