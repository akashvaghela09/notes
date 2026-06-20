import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { fileStamp } from './time';

/** Slug a title into a safe filename stem. */
export function slugify(title: string, fallback = 'note'): string {
  const s = title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
  return s || fallback;
}

/** Prompt for a location and write text. Returns the path, or null if the
 *  user cancelled. Shared by note export and backup export (DRY). */
export async function saveTextToFile(
  contents: string,
  opts: { defaultName: string; filters: { name: string; extensions: string[] }[] },
): Promise<string | null> {
  const path = await save({
    defaultPath: opts.defaultName,
    filters: opts.filters,
  });
  if (!path) return null;
  await writeTextFile(path, contents);
  return path;
}

/** Prompt to pick a file and read its text. Returns contents or null. */
export async function readTextFromFile(filters: {
  name: string;
  extensions: string[];
}[]): Promise<string | null> {
  const path = await open({ multiple: false, filters });
  if (!path || Array.isArray(path)) return null;
  return readTextFile(path);
}

/** Common text/code extensions offered by the import dialog. */
const IMPORT_EXTS = [
  'txt', 'md', 'markdown', 'text', 'rtf',
  'js', 'jsx', 'ts', 'tsx', 'json', 'html', 'css', 'scss',
  'py', 'rs', 'go', 'java', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs',
  'rb', 'php', 'swift', 'sh', 'bash', 'sql', 'yml', 'yaml', 'toml', 'ini', 'xml', 'log',
];

/** Pick a text/code file and read it in as a COPY (the original is untouched).
 *  Returns the file's base name (sans extension) + contents, or null. */
export async function importTextFile(): Promise<{ name: string; content: string } | null> {
  const path = await open({
    multiple: false,
    filters: [
      { name: 'Text & code', extensions: IMPORT_EXTS },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (!path || Array.isArray(path)) return null;
  const content = await readTextFile(path);
  const base = (path.split(/[\\/]/).pop() || 'Imported').replace(/\.[^.]+$/, '');
  return { name: base || 'Imported', content };
}

/** Export a single note as plain text. `name` is used only for the file name;
 *  the body is exactly the note's content (no synthetic/duplicate heading). */
export function exportAsText(name: string, content: string): Promise<string | null> {
  return saveTextToFile(content, {
    defaultName: `${slugify(name)}-${fileStamp()}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
}

/** Export a single note as Markdown. `name` names the file; the body is the
 *  note's content as-is (the first line already serves as its heading). */
export function exportAsMarkdown(name: string, content: string): Promise<string | null> {
  return saveTextToFile(content, {
    defaultName: `${slugify(name)}-${fileStamp()}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
}
