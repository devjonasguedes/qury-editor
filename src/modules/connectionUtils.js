export function isEntryReadOnly(entry) {
  if (!entry) return false;
  return !!(entry.readOnly || entry.read_only);
}

export function normalizePolicyMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'staging' || mode === 'prod') return mode;
  return 'dev';
}

export function getEntryPolicyMode(entry) {
  if (!entry) return 'dev';
  return normalizePolicyMode(entry.policyMode || entry.policy_mode);
}

export function isEntrySsh(entry) {
  if (!entry) return false;
  if (entry.ssh && entry.ssh.enabled) return true;
  return !!(entry.ssh_enabled || entry.sshEnabled);
}

export function getEntrySshConfig(entry) {
  if (!entry || !isEntrySsh(entry)) return { enabled: false };
  const ssh = entry.ssh || {};
  return {
    enabled: true,
    host: ssh.host || entry.ssh_host || entry.sshHost || '',
    port: ssh.port || entry.ssh_port || entry.sshPort || '',
    user: ssh.user || entry.ssh_user || entry.sshUser || '',
    password: ssh.password || entry.ssh_password || entry.sshPassword || '',
    privateKey: ssh.privateKey || entry.ssh_private_key || entry.sshPrivateKey || '',
    passphrase: ssh.passphrase || entry.ssh_passphrase || entry.sshPassphrase || '',
    localPort: ssh.localPort || entry.ssh_local_port || entry.sshLocalPort || ''
  };
}

export function buildConnectionKey(entry) {
  if (!entry) return null;
  const ssh = getEntrySshConfig(entry);
  const policyMode = getEntryPolicyMode(entry);
  const type = String(entry.type || '').toLowerCase();
  const filePath = entry.file_path || entry.filePath || entry.path || '';
  const hostValue = type === 'sqlite' ? filePath : (entry.host || '');
  const portValue = type === 'sqlite' ? '' : (entry.port || '');
  const userValue = type === 'sqlite' ? '' : (entry.user || '');
  const databaseValue = type === 'sqlite' ? '' : (entry.database || '');
  return [
    entry.type || '',
    hostValue,
    portValue,
    userValue,
    databaseValue,
    isEntryReadOnly(entry) ? 'ro' : 'rw',
    policyMode,
    ssh.enabled ? 'ssh' : 'direct',
    ssh.host || '',
    ssh.port || '',
    ssh.user || ''
  ].join('|');
}

export function buildConnectionBaseKey(entry) {
  if (!entry) return null;
  const ssh = getEntrySshConfig(entry);
  const policyMode = getEntryPolicyMode(entry);
  const type = String(entry.type || '').toLowerCase();
  const filePath = entry.file_path || entry.filePath || entry.path || '';
  const hostValue = type === 'sqlite' ? filePath : (entry.host || '');
  const portValue = type === 'sqlite' ? '' : (entry.port || '');
  const userValue = type === 'sqlite' ? '' : (entry.user || '');
  return [
    entry.type || '',
    hostValue,
    portValue,
    userValue,
    '',
    isEntryReadOnly(entry) ? 'ro' : 'rw',
    policyMode,
    ssh.enabled ? 'ssh' : 'direct',
    ssh.host || '',
    ssh.port || '',
    ssh.user || ''
  ].join('|');
}

export function getConnectionScopeKey(entry) {
  if (!entry) return null;
  if (entry.id) return String(entry.id);
  return buildConnectionBaseKey(entry);
}

export function normalizeKeyToBase(key) {
  if (!key) return null;
  const parts = String(key).split('|');
  if (parts.length < 10) return key;
  parts[4] = '';
  return parts.join('|');
}

export function connectionTitle(entry) {
  if (!entry) return 'Connection';
  if (entry.name) return entry.name;
  const filePath = entry.file_path || entry.filePath || entry.path || '';
  if (filePath) {
    const normalized = String(filePath).replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : filePath;
  }
  if (entry.database) return entry.database;
  if (entry.host) return entry.host;
  return 'Connection';
}
