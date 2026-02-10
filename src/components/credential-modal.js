// Credential prompt modal - asks for missing passwords when connecting

export function createCredentialModal() {
  const modal = document.getElementById('credentialModal');
  const backdrop = document.getElementById('credentialModalBackdrop');
  const title = document.getElementById('credentialModalTitle');
  const subtitle = document.getElementById('credentialModalSubtitle');
  const dbPassword = document.getElementById('credentialDbPassword');
  const sshFields = document.getElementById('credentialSshFields');
  const sshPassword = document.getElementById('credentialSshPassword');
  const sshPrivateKey = document.getElementById('credentialSshPrivateKey');
  const sshPassphrase = document.getElementById('credentialSshPassphrase');
  const closeBtn = document.getElementById('credentialCloseBtn');
  const cancelBtn = document.getElementById('credentialCancelBtn');
  const confirmBtn = document.getElementById('credentialConfirmBtn');

  let resolver = null;

  const close = (result = null) => {
    if (modal) modal.classList.add('hidden');
    const currentResolver = resolver;
    resolver = null;
    if (currentResolver) currentResolver(result);
  };

  const prompt = (entry) => {
    if (!modal) return Promise.resolve(null);
    
    // Close any existing prompt
    if (resolver) close(null);

    const isSsh = entry?.ssh?.enabled || false;
    
    if (title) {
      title.textContent = 'Enter password to connect';
    }
    
    if (subtitle) {
      const target = entry?.name || entry?.host || 'connection';
      subtitle.textContent = `${target} • password is not saved`;
    }

    // Reset fields
    if (dbPassword) dbPassword.value = '';
    if (sshPassword) sshPassword.value = '';
    if (sshPrivateKey) sshPrivateKey.value = '';
    if (sshPassphrase) sshPassphrase.value = '';
    
    // Show/hide SSH fields
    if (sshFields) sshFields.classList.toggle('hidden', !isSsh);

    modal.classList.remove('hidden');
    if (dbPassword) dbPassword.focus();

    return new Promise((resolve) => {
      resolver = resolve;
    });
  };

  const getCredentials = () => {
    return {
      password: dbPassword?.value || '',
      sshPassword: sshPassword?.value || '',
      sshPrivateKey: sshPrivateKey?.value || '',
      sshPassphrase: sshPassphrase?.value || '',
    };
  };

  // Event listeners
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      close(getCredentials());
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => close(null));
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => close(null));
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => close(null));
  }

  // Support Enter key
  if (modal) {
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        close(getCredentials());
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      }
    });
  }

  return {
    prompt,
    close,
  };
}
