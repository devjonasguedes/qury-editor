export function createTableSearch({
  input,
  clearButton,
  onSearch,
  onClear,
  delay = 150
} = {}) {
  let timer = null;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (typeof onSearch === 'function') {
        onSearch(input ? input.value : '');
      }
    }, delay);
  };

  if (input) {
    input.addEventListener('input', () => {
      if (clearButton) {
        clearButton.classList.toggle('visible', !!input.value);
      }
      schedule();
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (input) {
        input.value = '';
        input.focus();
      }
      clearButton.classList.remove('visible');
      if (typeof onClear === 'function') {
        onClear();
        return;
      }
      if (typeof onSearch === 'function') {
        onSearch('');
      }
    });
  }

  return {
    schedule
  };
}
