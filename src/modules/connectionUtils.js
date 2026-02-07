export function isEntryReadOnly(entry) {
  if (!entry) return false;
  return !!(entry.readOnly || entry.read_only);
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
  return [
    entry.type || '',
    entry.host || '',
    entry.port || '',
    entry.user || '',
    entry.database || '',
    isEntryReadOnly(entry) ? 'ro' : 'rw',
    ssh.enabled ? 'ssh' : 'direct',
    ssh.host || '',
    ssh.port || '',
    ssh.user || ''
  ].join('|');
}

export function buildConnectionBaseKey(entry) {
  if (!entry) return null;
  const ssh = getEntrySshConfig(entry);
  return [
    entry.type || '',
    entry.host || '',
    entry.port || '',
    entry.user || '',
    '',
    isEntryReadOnly(entry) ? 'ro' : 'rw',
    ssh.enabled ? 'ssh' : 'direct',
    ssh.host || '',
    ssh.port || '',
    ssh.user || ''
  ].join('|');
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
  if (entry.database) return entry.database;
  if (entry.host) return entry.host;
  return 'Connection';
}

export function makeRecentKey(entry) {
  if (!entry) return '';
  const ro = isEntryReadOnly(entry);
  const ssh = getEntrySshConfig(entry);
  return [
    entry.type,
    entry.host || '',
    entry.port || '',
    entry.user || '',
    entry.database || '',
    ro ? 'ro' : 'rw',
    ssh.enabled ? 'ssh' : 'direct',
    ssh.host || '',
    ssh.port || '',
    ssh.user || '',
    ssh.localPort || ''
  ].join('|');
}
