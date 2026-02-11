// Policy approval modal - requires confirmation for dangerous operations in production

export const POLICY_APPROVAL_TOKEN = 'PROCEED';

export function createPolicyApprovalModal() {
  const modal = document.getElementById('policyApprovalModal');
  const backdrop = document.getElementById('policyApprovalModalBackdrop');
  const title = document.getElementById('policyApprovalTitle');
  const subtitle = document.getElementById('policyApprovalSubtitle');
  const input = document.getElementById('policyApprovalInput');
  const closeBtn = document.getElementById('policyApprovalCloseBtn');
  const cancelBtn = document.getElementById('policyApprovalCancelBtn');
  const confirmBtn = document.getElementById('policyApprovalConfirmBtn');

  let resolver = null;

  const isValidInput = (value) => {
    return String(value || '').trim().toUpperCase() === POLICY_APPROVAL_TOKEN;
  };

  const updateConfirmState = () => {
    if (!confirmBtn || !input) return;
    confirmBtn.disabled = !isValidInput(input.value);
  };

  const close = (result = '') => {
    if (modal) modal.classList.add('hidden');
    const currentResolver = resolver;
    resolver = null;
    if (currentResolver) currentResolver(result);
  };

  const prompt = ({ policyLabel, actionLabel } = {}) => {
    if (!modal) return Promise.resolve('');
    
    // Close any existing prompt
    if (resolver) close('');

    if (title) {
      title.textContent = `${policyLabel || 'Policy'} confirmation`;
    }

    if (subtitle) {
      const action = actionLabel ? ` ${actionLabel}` : '';
      subtitle.textContent = `${policyLabel || 'Policy'} requires confirmation for${action}. Type ${POLICY_APPROVAL_TOKEN} to continue.`;
    }

    if (input) {
      input.value = '';
      input.focus();
    }

    updateConfirmState();
    modal.classList.remove('hidden');

    return new Promise((resolve) => {
      resolver = resolve;
    });
  };

  const approve = () => {
    if (!input) {
      close('');
      return;
    }
    const value = input.value || '';
    close(isValidInput(value) ? value.trim().toUpperCase() : '');
  };

  // Event listeners
  if (input) {
    input.addEventListener('input', updateConfirmState);
    
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!confirmBtn?.disabled) {
          approve();
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close('');
      }
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', approve);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => close(''));
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => close(''));
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => close(''));
  }

  return {
    prompt,
    close,
    APPROVAL_TOKEN: POLICY_APPROVAL_TOKEN,
  };
}
