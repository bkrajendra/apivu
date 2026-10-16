import { createRequest, type ApiRequest, type HeaderPair } from './request';

export type CurlParseResult = {
  request: ApiRequest | null;
  errors: string[];
  warnings: string[];
};

const ANSI_C_SIMPLE_ESCAPES: Record<string, string> = {
  a: '\x07',
  b: '\b',
  e: '\x1b',
  E: '\x1b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '?': '?',
};

// Decodes the escape starting at command[index] === '\\' inside $'...'; returns the text and the last index consumed.
function readAnsiCEscape(command: string, index: number): { text: string; end: number } {
  const next = command[index + 1] ?? '';
  if (next in ANSI_C_SIMPLE_ESCAPES) return { text: ANSI_C_SIMPLE_ESCAPES[next]!, end: index + 1 };

  const hexLengths: Record<string, number> = { x: 2, u: 4, U: 8 };
  const hexLength = hexLengths[next];
  if (hexLength) {
    const digits = /^[0-9a-fA-F]*/.exec(command.slice(index + 2, index + 2 + hexLength))![0];
    if (digits) return { text: String.fromCodePoint(parseInt(digits, 16)), end: index + 1 + digits.length };
  }

  const octal = /^[0-7]{1,3}/.exec(command.slice(index + 1, index + 4));
  if (octal) return { text: String.fromCharCode(parseInt(octal[0], 8)), end: index + octal[0].length };

  return { text: `\\${next}`, end: index + (next ? 1 : 0) };
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let token = '';
  let quote: "'" | '"' | '$' | null = null;
  let started = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;

    if (char === '\\' && command[index + 1] === '\n') {
      index += 1;
      continue;
    }
    if (char === '\\' && command[index + 1] === '\r' && command[index + 2] === '\n') {
      index += 2;
      continue;
    }

    if (quote === "'") {
      if (char === "'") quote = null;
      else token += char;
      continue;
    }

    if (quote === '$') {
      if (char === "'") {
        quote = null;
      } else if (char === '\\') {
        const escape = readAnsiCEscape(command, index);
        token += escape.text;
        index = escape.end;
      } else {
        token += char;
      }
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === '\\' && ['"', '\\', '$', '`'].includes(command[index + 1] ?? '')) {
        token += command[index + 1];
        index += 1;
      } else {
        token += char;
      }
      continue;
    }

    if (char === '$' && command[index + 1] === "'") {
      quote = '$';
      started = true;
      index += 1;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === '\\' && index + 1 < command.length) {
      token += command[index + 1];
      index += 1;
      started = true;
    } else if ([';', '|', '&', '<', '>'].includes(char)) {
      if (started) tokens.push(token);
      tokens.push(char);
      token = '';
      started = false;
    } else if (/\s/.test(char)) {
      if (started) tokens.push(token);
      token = '';
      started = false;
    } else {
      token += char;
      started = true;
    }
  }

  if (quote) throw new Error('Unclosed quote in cURL command.');
  if (started) tokens.push(token);
  return tokens;
}

function parseCookiePairs(value: string): HeaderPair[] {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      return separator < 0
        ? { name: part, value: '' }
        : { name: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim() };
    });
}

function decodeBasic(value: string): { username: string; password: string } | null {
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function optionValue(tokens: string[], index: number, option: string): { value: string; next: number } {
  const token = tokens[index]!;
  const equals = token.indexOf('=');
  if (equals >= 0) return { value: token.slice(equals + 1), next: index + 1 };
  if (!token.startsWith('--') && token.length > option.length) {
    return { value: token.slice(option.length), next: index + 1 };
  }
  const value = tokens[index + 1];
  if (value === undefined) throw new Error(`Missing value for ${option}.`);
  return { value, next: index + 2 };
}

export function parseCurl(source: string): CurlParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let tokens: string[];

  try {
    tokens = tokenize(source.trim());
  } catch (error) {
    return { request: null, errors: [error instanceof Error ? error.message : 'Unable to parse cURL.'], warnings };
  }

  if (tokens[0] === 'curl' || tokens[0] === 'curl.exe') tokens.shift();
  if (tokens.length === 0) return { request: null, errors: ['Paste a cURL command to get started.'], warnings };

  const request = createRequest();
  request.sourceCurl = source;
  const bodies: string[] = [];
  let explicitMethod = '';
  let getData = false;
  let url = '';

  try {
    for (let index = 0; index < tokens.length;) {
    const token = tokens[index]!;
    const option = token.startsWith('--') ? token.split('=', 1)[0]! : token.length > 2 && token[0] === '-' ? token.slice(0, 2) : token;

    if (['-X', '--request'].includes(option)) {
      const result = optionValue(tokens, index, option);
      explicitMethod = result.value.toUpperCase();
      index = result.next;
    } else if (['-H', '--header'].includes(option)) {
      const result = optionValue(tokens, index, option);
      const separator = result.value.indexOf(':');
      if (separator < 1) warnings.push(`Skipped malformed header: ${result.value}`);
      else {
        const name = result.value.slice(0, separator).trim();
        const value = result.value.slice(separator + 1).trim();
        if (name.toLowerCase() === 'cookie') request.cookies.push(...parseCookiePairs(value));
        else if (name.toLowerCase() === 'authorization' && /^bearer\s+/i.test(value)) {
          request.auth = { ...request.auth, type: 'bearer', token: value.replace(/^bearer\s+/i, '') };
        } else if (name.toLowerCase() === 'authorization' && /^basic\s+/i.test(value)) {
          const credentials = decodeBasic(value.replace(/^basic\s+/i, ''));
          if (credentials) request.auth = { ...request.auth, type: 'basic', ...credentials };
          else request.headers.push({ name, value });
        } else request.headers.push({ name, value });
      }
      index = result.next;
    } else if (['-b', '--cookie'].includes(option)) {
      const result = optionValue(tokens, index, option);
      if (result.value.startsWith('@')) warnings.push('Cookie files are not read; paste cookie values directly if needed.');
      else request.cookies.push(...parseCookiePairs(result.value));
      index = result.next;
    } else if (['-u', '--user'].includes(option)) {
      const result = optionValue(tokens, index, option);
      const separator = result.value.indexOf(':');
      request.auth = {
        ...request.auth,
        type: 'basic',
        username: separator < 0 ? result.value : result.value.slice(0, separator),
        password: separator < 0 ? '' : result.value.slice(separator + 1),
      };
      index = result.next;
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(option)) {
      const result = optionValue(tokens, index, option);
      if (result.value.startsWith('@') && ['-d', '--data', '--data-binary'].includes(option)) {
        warnings.push('File-backed request bodies are not read; replace the file reference with its contents.');
      } else {
        bodies.push(result.value);
      }
      index = result.next;
    } else if (option === '--url') {
      const result = optionValue(tokens, index, option);
      url = result.value;
      index = result.next;
    } else if (token === '-G' || token === '--get') {
      getData = true;
      index += 1;
    } else if (token === '-I' || token === '--head') {
      explicitMethod = 'HEAD';
      index += 1;
    } else if (['-L', '--location', '--compressed', '-s', '--silent', '-S', '--show-error'].includes(token)) {
      index += 1;
    } else if (token === '--data-urlencode') {
      const result = optionValue(tokens, index, token);
      warnings.push('`--data-urlencode` needs manual review; its value was not copied into the body.');
      index = result.next;
    } else if (token.startsWith('-')) {
      warnings.push(`Unsupported cURL option: ${token}`);
      index += 1;
      if (['--proxy', '--connect-timeout', '--max-time', '--max-redirs', '--user-agent', '-A'].includes(token)) index += 1;
    } else {
      if (/^https?:\/\//i.test(token)) {
        if (url) warnings.push(`Multiple URLs found; using ${url}.`);
        else url = token;
      } else {
        warnings.push(`Unrecognized argument: ${token}`);
      }
      index += 1;
    }
  }
  } catch (error) {
    return { request: null, errors: [error instanceof Error ? error.message : 'Unable to parse cURL.'], warnings };
  }

  if (!url) errors.push('No HTTP or HTTPS URL was found.');
  if (url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) errors.push('Only HTTP and HTTPS URLs are supported.');
      if (parsed.username || parsed.password) {
        const decode = (value: string) => {
          try { return decodeURIComponent(value); } catch { return value; }
        };
        if (request.auth.type === 'none') {
          request.auth = {
            type: 'basic',
            token: '',
            username: decode(parsed.username),
            password: decode(parsed.password),
          };
        } else {
          warnings.push('Credentials embedded in the URL were removed; the explicit Authorization option was kept.');
        }
        parsed.username = '';
        parsed.password = '';
      }
      request.url = parsed.toString();
      request.name = parsed.pathname.split('/').filter(Boolean).at(-1) || parsed.hostname;
    } catch {
      errors.push('The URL is invalid.');
    }
  }

  request.body = bodies.join('&');
  request.method = explicitMethod || (getData ? 'GET' : bodies.length ? 'POST' : 'GET');
  if (getData && request.body && request.url) {
    const separator = request.url.includes('?') ? '&' : '?';
    request.url += `${separator}${request.body}`;
    request.body = '';
  }

  return { request: errors.length ? null : request, errors, warnings };
}