// Tag conventions understood by the reader. See docs/ARCHITECTURE.md.

export interface ParsedTag {
  key: string;
  value: string;
}

export function parseTag(tag: string): ParsedTag {
  const i = tag.indexOf(':');
  if (i === -1) return { key: tag.trim().toLowerCase(), value: '' };
  return { key: tag.slice(0, i).trim().toLowerCase(), value: tag.slice(i + 1).trim() };
}

export function findTag(tags: string[], key: string): string | undefined {
  for (const t of tags) {
    const p = parseTag(t);
    if (p.key === key) return p.value;
  }
  return undefined;
}

export interface BookMeta {
  title?: string;
  author?: string;
  description?: string;
  language?: string;
}

export function metaFromGlobalTags(tags: string[]): BookMeta {
  return {
    title: findTag(tags, 'title'),
    author: findTag(tags, 'author'),
    description: findTag(tags, 'description'),
    language: findTag(tags, 'language'),
  };
}
