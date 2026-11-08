// The detector. Looks for secrets in a piece of text. Plain Node, no packages.
//
//   findSecrets(text, secrets) -> [{ secret: <index in the secrets list>, form: 'plain', line: <1-based line number> }, ...]
//
// A leak is not always the plain text. CI tools encode what they print. Look for three forms of each secret:
//   plain     the secret as it is
//   url       the secret as encodeURIComponent writes it (/ becomes %2F, + becomes %2B, = becomes %3D)
//   base64    the secret as Buffer.from(secret).toString('base64') writes it
// Two traps: a secret that is the empty string (every text "contains" it) and a secret that is very short
// (it matches everywhere). Ignore secrets shorter than 8 characters.
//
// Never put the secret itself in what you return or print: the finding says WHERE, not WHAT.

/** All the ways a secret might appear, as [form, text] pairs. */
export function forms(secret) {
  // TODO: return [['plain', secret], ['url', ...], ['base64', ...]], and nothing at all for a secret shorter than 8 characters.
  return [];
}

/** Find every secret in the text, in every form. */
export function findSecrets(text, secrets) {
  const findings = [];
  const lines = String(text).split('\n');
  secrets.forEach((secret, index) => {
    for (const [form, needle] of forms(secret)) {
      lines.forEach((line, i) => {
        // TODO: when this line contains the needle, add { secret: index, form, line: i + 1 } to findings.
      });
    }
  });
  return findings;
}
