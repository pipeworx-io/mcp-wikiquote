interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Wikiquote MCP — sourced quotations
 *
 * Quotes on Wikiquote live inside <ul><li> structures inside the wikitext.
 * We parse those out heuristically — the extraction won't be perfect for
 * complex pages with multiple sections, but works well for person/topic
 * pages organized as simple bullet lists.
 *
 * Auth: none.
 */


const UA = 'pipeworx-mcp-wikiquote/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search',
    description: 'Wikiquote title + fulltext search.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        lang: { type: 'string' },
        limit: { type: 'number', description: '1-50 (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'summary',
    description: 'Page summary.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        lang: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'quotes',
    description: 'Extract sourced quotation items from a page.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        lang: { type: 'string' },
        limit: { type: 'number', description: 'Max quotes returned (default 50)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'quote_of_the_day',
    description: 'Daily featured quote (English Wikiquote — `lang=fr` returns its locale equivalent where available).',
    inputSchema: {
      type: 'object',
      properties: { lang: { type: 'string' } },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const lang = ((args.lang as string) ?? 'en').toLowerCase();
  switch (name) {
    case 'search': {
      return wikiAction(lang, {
        action: 'opensearch',
        search: reqStr(args, 'query', '"einstein"'),
        limit: String(Math.min(50, Math.max(1, (args.limit as number) ?? 10))),
        namespace: '0',
        format: 'json',
        formatversion: '2',
      });
    }
    case 'summary':
      return wikiRest(lang, `/page/summary/${encodeURIComponent(reqStr(args, 'title', '"Albert Einstein"'))}`);
    case 'quotes': {
      const title = reqStr(args, 'title', '"Albert Einstein"');
      const limit = Math.min(500, Math.max(1, (args.limit as number) ?? 50));
      const wt = (await wikiAction(lang, {
        action: 'parse',
        page: title,
        prop: 'wikitext',
        format: 'json',
        formatversion: '2',
      })) as { parse?: { wikitext?: string } };
      const text = wt.parse?.wikitext ?? '';
      return {
        title,
        lang,
        count: extractQuotes(text, limit).length,
        quotes: extractQuotes(text, limit),
      };
    }
    case 'quote_of_the_day':
      return wikiAction(lang, {
        action: 'parse',
        page: lang === 'en' ? 'Wikiquote:Quote of the day' : 'Wikiquote:Quote_of_the_day',
        prop: 'text|wikitext',
        format: 'json',
        formatversion: '2',
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Heuristic wikitext quote extraction. Looks for top-level "* …" bullets
// followed by indented attribution lines (** … or *: …).
function extractQuotes(wt: string, limit: number) {
  const out: { quote: string; attribution?: string }[] = [];
  const lines = wt.split('\n');
  let pending: { quote: string; attribution?: string } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('* ') && !line.startsWith('** ')) {
      if (pending) out.push(pending);
      if (out.length >= limit) break;
      pending = { quote: cleanWikitext(line.slice(2)) };
    } else if (pending && (line.startsWith('**') || line.startsWith('*:'))) {
      const attr = cleanWikitext(line.replace(/^[*:]+/, '').trim());
      pending.attribution = pending.attribution ? `${pending.attribution} — ${attr}` : attr;
    } else if (pending && !line.startsWith('=') && !line.startsWith('{|')) {
      // continuation of the same quote
      pending.quote = `${pending.quote} ${cleanWikitext(line)}`.trim();
    }
  }
  if (pending && out.length < limit) out.push(pending);
  return out;
}

function cleanWikitext(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''([^']+)'''/g, '$1')
    .replace(/''([^']+)''/g, '$1')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// SSRF guard: `lang` is caller-supplied and interpolated into the host, so a
// value like "evil.com/" would point the fetch at evil.com. Wikiquote language
// codes are bare labels (en, zh-yue, …).
function assertLang(lang: string): void {
  if (!/^[a-z0-9-]{1,32}$/i.test(lang)) throw new Error(`Wikiquote: invalid lang "${lang}".`);
}

async function wikiRest(lang: string, path: string) {
  assertLang(lang);
  const url = `https://${lang}.wikiquote.org/api/rest_v1${path}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (res.status === 404) throw new Error(`Wikiquote: page not found`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Wikiquote error: ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function wikiAction(lang: string, params: Record<string, string>) {
  assertLang(lang);
  const url = `https://${lang}.wikiquote.org/w/api.php?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Wikiquote error: ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing. Pass a string like ${example}.`);
  }
  return v;
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
