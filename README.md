# @pipeworx/wikiquote

Wikiquote MCP — sourced quotations by person, work, or topic. ~30k articles in English alone. No auth.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `search(query, lang?, limit?)` — title + fulltext search
- `summary(title, lang?)` — page summary
- `quotes(title, lang?, limit?)` — extract block-quote items from a page
- `quote_of_the_day(lang?)` — daily featured quote (English Wikiquote)

## Languages

`lang` is the Wikiquote subdomain — `en` (default), `fr`, `de`, `it`, `es`, `pt`, `ru`, `pl`, `ja`, `zh`.

## Data source

`https://<lang>.wikiquote.org/api/rest_v1/` + `/w/api.php`.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "wikiquote": {
      "url": "https://gateway.pipeworx.io/wikiquote/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Wikiquote data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
