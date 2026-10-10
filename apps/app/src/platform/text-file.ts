export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const file = input.files?.item(0) ?? null;
      if (file === null) {
        resolve(null);
        return;
      }
      file.text().then(resolve, reject);
    });
    input.addEventListener('cancel', () => {
      resolve(null);
    });
    input.click();
  });
}
