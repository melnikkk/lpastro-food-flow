// Cloudflare helpers
export const b64 = (input: string | Uint8Array) => {
  const uint8Array =
    typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);

  return btoa(String.fromCharCode(...uint8Array))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

export const str2ab = (str: string) => {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);

  for (let i = 0; i < str.length; i++) {
    bufView[i] = str.charCodeAt(i);
  }

  return buf;
};
