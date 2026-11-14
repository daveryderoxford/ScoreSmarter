const EXCERPT_LIMIT = 80_000;
const INTEREST = /scoring|discard|dnc|did not come|ood|duty|race officer|average points/i;

/** The scoring, discard, and duty passages, or the start of the document when none are marked. */
export function scoringExcerpt(text: string): string {
  const lines = text.split(/\n/);
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (!INTEREST.test(line)) return;
    const from = Math.max(0, index - 3);
    const to = Math.min(lines.length - 1, index + 40);
    for (let cursor = from; cursor <= to; cursor++) keep.add(cursor);
  });
  const excerpt = keep.size === 0
    ? text
    : [...keep].sort((left, right) => left - right).map(index => lines[index]).join('\n');
  return excerpt.slice(0, EXCERPT_LIMIT);
}

/** Sailwave declares ISO-8859-1 in a meta tag. A saved page is decoded by that tag, not as UTF-8. */
export function decodeHtml(bytes: ArrayBuffer): string {
  const head = new TextDecoder('windows-1252').decode(bytes.slice(0, 4096));
  const declared = head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase();
  if (declared && declared !== 'utf-8' && declared !== 'utf8') {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** The address a saved page came from, so its relative links resolve. */
export function savedPageAddress(html: string): string | null {
  const candidates = [
    html.match(/<!--\s*saved from url=\(\d+\)(\S+?)\s*-->/i)?.[1],
    html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1],
    html.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)/i)?.[1],
  ];
  return candidates.find(candidate => candidate?.startsWith('https://')) ?? null;
}

export async function textFromDocument(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return textFromPdf(await file.arrayBuffer());
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) return textFromDocx(await file.arrayBuffer());
  if (name.endsWith('.txt') || name.endsWith('.html') || name.endsWith('.htm') || file.type.startsWith('text/')) {
    return file.text();
  }
  throw new Error('Use a PDF, Word (.docx), or text file.');
}

async function textFromPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href;
  const documentTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const pdf = await documentTask.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const line = content.items.map(item => 'str' in item ? item.str : '').join(' ');
    pages.push(line);
  }
  return pages.join('\n');
}

export async function textFromDocx(buffer: ArrayBuffer): Promise<string> {
  const xml = await zipEntryText(buffer, 'word/document.xml');
  return xml
    .replace(/<w:p[^>]*\/>/g, '\n')
    .replace(/<w:p[\s>]/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

async function zipEntryText(buffer: ArrayBuffer, entryName: string): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entry = findZipEntry(bytes, view, entryName);
  if (!entry) throw new Error('This Word file has no document text.');
  const data = bytes.slice(entry.start, entry.start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method === 8) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  }
  throw new Error('This Word file uses a compression method the wizard cannot read.');
}

interface ZipSlice {
  start: number;
  compressedSize: number;
  method: number;
}

function findZipEntry(bytes: Uint8Array, view: DataView, entryName: string): ZipSlice | null {
  const central = centralDirectoryOffset(bytes, view);
  if (central == null) return readLocalEntries(bytes, view, entryName);
  let offset = central;
  while (offset + 46 <= bytes.length && view.getUint32(offset, true) === 0x02014b50) {
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name === entryName) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      return {
        start: localOffset + 30 + localNameLength + localExtraLength,
        compressedSize,
        method,
      };
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function centralDirectoryOffset(bytes: Uint8Array, view: DataView): number | null {
  const start = Math.max(0, bytes.length - 22 - 65536);
  for (let offset = bytes.length - 22; offset >= start; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return view.getUint32(offset + 16, true);
  }
  return null;
}

function readLocalEntries(bytes: Uint8Array, view: DataView, entryName: string): ZipSlice | null {
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    if (name === entryName && compressedSize > 0) return { start, compressedSize, method };
    if (compressedSize === 0) return null;
    offset = start + compressedSize;
  }
  return null;
}
