/**
 * memory-console 的 Host 业务层（可热更）。
 *
 * 单独成文件、由 index.js 按 mtime 动态 import，是为了避免「改一行 Host 逻辑
 * 就要重启整个 Desktop」：这个文件改完，下一次请求就加载新代码。
 *
 * 约束（硬）：
 *  - 只动 D:\DS\memory 内的 .md；INDEX.md / README.md 只读
 *  - 路径归一化 + realpath 校验，拒绝 `..`、绝对路径、符号链接越界、.backup/.trash 直接写入
 *  - 保存前必写 .backup；删除只移动到 .trash，永不 unlink
 *  - 索引一律调用 bin\mem-index.ps1，不自己生成
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { loadSettings } from './settings.js';

const SETTINGS = loadSettings();
const ROOT = SETTINGS.memoryRoot;
// 留空则用内置生成器（格式与仓库里的 mem-index.ps1 一致）。
const INDEX_SCRIPT = SETTINGS.indexScript;
const POWERSHELL = SETTINGS.powershell;
const ATTRIB = 'C:\\Windows\\System32\\attrib.exe';
const INDEX_REL = 'INDEX.md';
const MD_EXT = '.md';
const EXCLUDED_NAMES = new Set(['INDEX.md', 'README.md']);
const ALLOWED_GROUPS = new Set(['', 'project', 'decision']);
const MAX_BYTES = 512 * 1024;
const MAX_WRITE_BYTES = 2 * 1024 * 1024;
const STALE_DAYS = 90;
const SEARCH_MAX_FILES = 200;
const SEARCH_MAX_MATCHES = 60;
const REQUIRED_CONFIG = path.join(SETTINGS.stateDir, 'required-files.json');
const REQUIRED_MAX_FILES = 12;
const REQUIRED_MAX_BYTES = 200 * 1024;

let cachedRoot;

function memoryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function errorResult(code, message, details) {
  return { ok: false, error: { code, message, details: details ?? {} } };
}

async function rootPath() {
  if (cachedRoot !== undefined) return cachedRoot;
  cachedRoot = await fs.realpath(ROOT);
  return cachedRoot;
}

function isInside(root, absolute) {
  const relative = path.relative(root, absolute);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function formatTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function readText(raw) {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

/** 与 mem-index.ps1 一致：第一个 `# 标题`、第一个 `> 摘要：`。 */
function parseMeta(text, fallbackTitle) {
  const lines = text.split(/\r?\n/);
  let title = '';
  for (const line of lines) {
    const match = /^#\s+(.+)$/.exec(line);
    if (match) {
      title = match[1].replace(/\*\*/g, '').trim();
      break;
    }
  }
  let summary = '';
  for (const line of lines) {
    const match = /^>\s*摘要[：:]\s*(.+)$/.exec(line);
    if (match) {
      summary = match[1].trim();
      break;
    }
  }
  return {
    title: title || fallbackTitle,
    summary,
    hasSummary: summary !== '',
    chars: [...text.replace(/\s/g, '')].length,
    lines: lines.length,
  };
}

function groupOf(relative) {
  const slash = relative.lastIndexOf('/');
  return slash === -1 ? '' : relative.slice(0, slash);
}

/** 相对路径 → 存在的 memory 内 .md 绝对路径。 */
async function resolveExisting(input) {
  if (typeof input !== 'string') throw memoryError('invalid_path', '路径必须是字符串');
  const raw = input.trim().replace(/\\/g, '/');
  if (raw === '') throw memoryError('invalid_path', '路径为空');
  if (raw.includes('\0')) throw memoryError('invalid_path', '路径包含非法字符');
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw memoryError('outside_root', '只接受 memory 目录内的相对路径');
  }
  if (raw.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw memoryError('invalid_path', '路径含有非法片段');
  }
  const root = await rootPath();
  const absolute = path.resolve(root, raw);
  if (!isInside(root, absolute)) throw memoryError('outside_root', '路径越出 memory 目录');
  if (path.extname(absolute).toLowerCase() !== MD_EXT) throw memoryError('not_markdown', '只允许操作 .md 文件');
  if (EXCLUDED_NAMES.has(path.basename(absolute))) throw memoryError('readonly_file', 'INDEX.md / README.md 不允许改动');
  const first = toPosix(path.relative(root, absolute)).split('/')[0];
  if (first.startsWith('.')) throw memoryError('readonly_file', '备份与回收站目录不参与编辑');
  let real;
  try {
    real = await fs.realpath(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') throw memoryError('not_found', `文件不存在：${raw}`);
    throw error;
  }
  if (!isInside(root, real)) throw memoryError('outside_root', '符号链接指向 memory 目录之外');
  return { root, absolute: real, relative: toPosix(path.relative(root, real)) };
}

async function collectFiles(dir, depth, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (depth > 0) await collectFiles(absolute, depth - 1, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (path.extname(entry.name).toLowerCase() !== MD_EXT) continue;
    if (EXCLUDED_NAMES.has(entry.name)) continue;
    out.push(absolute);
  }
}

async function readEntry(root, absolute) {
  const stat = await fs.stat(absolute);
  const relative = toPosix(path.relative(root, absolute));
  const text = readText(await fs.readFile(absolute, 'utf8'));
  const meta = parseMeta(text, path.basename(absolute, path.extname(absolute)));
  return {
    rel: relative,
    name: path.basename(absolute),
    group: groupOf(relative),
    title: meta.title,
    summary: meta.summary,
    hasSummary: meta.hasSummary,
    chars: meta.chars,
    lines: meta.lines,
    bytes: stat.size,
    modified: formatTime(stat.mtime),
    modifiedMs: stat.mtimeMs,
  };
}

async function listMemory() {
  const root = await rootPath();
  const files = [];
  await collectFiles(root, 2, files);
  const entries = [];
  for (const file of files) {
    try {
      entries.push(await readEntry(root, file));
    } catch {
      // 单个文件读失败就跳过，不拖垮整页。
    }
  }
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }
  const known = ['', 'project', 'decision'];
  const keys = [...groups.keys()].sort((left, right) => {
    const leftIndex = known.indexOf(left);
    const rightIndex = known.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    }
    return left.localeCompare(right);
  });
  return {
    root,
    entries,
    groups: keys.map((key) => ({
      key,
      entries: groups.get(key).sort((left, right) => left.name.localeCompare(right.name)),
    })),
    total: entries.length,
  };
}

async function readMemory(relative) {
  const target = await resolveExisting(relative);
  const stat = await fs.stat(target.absolute);
  if (stat.size > MAX_BYTES) {
    throw memoryError('file_too_large', `文件超过 ${Math.round(MAX_BYTES / 1024)} KB，暂不支持在页面里打开`);
  }
  const text = readText(await fs.readFile(target.absolute, 'utf8'));
  const meta = parseMeta(text, path.basename(target.absolute, path.extname(target.absolute)));
  return {
    rel: target.relative,
    text,
    title: meta.title,
    summary: meta.summary,
    hasSummary: meta.hasSummary,
    chars: meta.chars,
    lines: meta.lines,
    bytes: stat.size,
    modified: formatTime(stat.mtime),
    modifiedMs: stat.mtimeMs,
  };
}

async function readIndex() {
  const root = await rootPath();
  const absolute = path.join(root, INDEX_REL);
  let stat;
  let raw;
  try {
    stat = await fs.stat(absolute);
    raw = await fs.readFile(absolute, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw memoryError('index_missing', 'INDEX.md 不存在');
    throw error;
  }
  const text = readText(raw);
  const match = /条数[：:]\s*(\d+)/.exec(text);
  return {
    text,
    count: match ? Number(match[1]) : undefined,
    bytes: stat.size,
    modified: formatTime(stat.mtime),
    modifiedMs: stat.mtimeMs,
  };
}

/**
 * 重建 INDEX.md。
 *
 * 配置了 indexScript 就调用它（用户的既有脚本优先，绝不自己拼）；
 * 没配置就用内置生成器，格式与参考脚本 mem-index.ps1 完全一致。
 */
async function rebuildIndex() {
  if (INDEX_SCRIPT) return runIndexScript();
  return buildIndex();
}

function runIndexScript() {
  return new Promise((resolve) => {
    execFile(
      POWERSHELL,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', INDEX_SCRIPT],
      { windowsHide: true, timeout: 60000, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, message: String(error.message ?? error), output: `${stdout ?? ''}${stderr ?? ''}`.trim() });
          return;
        }
        resolve({ ok: true, output: String(stdout ?? '').trim() });
      },
    );
  });
}

function clamp60(text) {
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/** 与 mem-index.ps1 的 Get-Summary 同规则。 */
function summaryOf(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^>\s*摘要[：:]\s*(.+)$/);
    if (match) return clamp60(match[1].trim());
  }
  for (const line of lines) {
    let trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('|')) continue;
    if (/导出|^（\d{4}|^\d{4}-\d{2}-\d{2}/.test(trimmed)) continue;
    trimmed = trimmed.replace(/^[-*\s]+/, '').replace(/\*\*/g, '').replace(/`/g, '');
    if (trimmed.length < 6) continue;
    return clamp60(trimmed);
  }
  return '';
}

/** 内置生成器：格式与 mem-index.ps1 保持一致（含 BOM、分组标题、截断规则）。 */
async function buildIndex() {
  const root = await rootPath();
  const files = [];
  async function walk(directory) {
    const names = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of names) {
      if (entry.name.startsWith('.')) continue; // .backup / .trash / .console-state 不进索引
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(MD_EXT)) continue;
      if (EXCLUDED_NAMES.has(entry.name)) continue;
      files.push(absolute);
    }
  }
  await walk(root);

  const entries = [];
  for (const absolute of files) {
    const text = readText(await fs.readFile(absolute, 'utf8'));
    const stat = await fs.stat(absolute);
    const relative = toPosix(path.relative(root, absolute));
    const directory = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
    const meta = parseMeta(text, path.basename(absolute, MD_EXT));
    entries.push({ relative, directory, title: meta.title, summary: summaryOf(text), date: formatTime(stat.mtime) });
  }

  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.directory)) groups.set(entry.directory, []);
    groups.get(entry.directory).push(entry);
  }

  const now = new Date();
  const stampText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const out = ['# 记忆索引 INDEX', '', '> 由记忆管理台生成，别手改。改了子记忆就重写一遍。', '> 用法：每轮先读这一份；命中关键词再去翻对应的子文件。', '', `生成：${stampText}　条数：${entries.length}`, ''];

  const order = ['', ...[...groups.keys()].filter((name) => name !== '').sort()];
  for (const group of order) {
    if (!groups.has(group)) continue;
    const header = group === '' ? '## 根目录：我是谁、你是谁、铁律'
      : group === 'project' ? '## 项目与事实（按话题翻）'
      : group === 'decision' ? '## 决策留档'
      : `## ${group}`;
    out.push(header, '');
    for (const item of groups.get(group).sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0))) {
      out.push(`- \`${item.relative}\` — ${item.title}${item.summary ? `｜${item.summary}` : ''}`);
    }
    out.push('');
  }

  await fs.writeFile(path.join(root, INDEX_REL), out.join('\r\n'), 'utf8');
  // 补 BOM：WriteAllText(..., UTF8Encoding $true) 在 PowerShell 里带了 BOM
  const written = await fs.readFile(path.join(root, INDEX_REL));
  if (!(written[0] === 0xef && written[1] === 0xbb && written[2] === 0xbf)) {
    await fs.writeFile(path.join(root, INDEX_REL), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), written]));
  }
  return { ok: true, output: `索引已生成（${entries.length} 条）` };
}

async function writeAtomic(absolute, text) {
  const temporary = `${absolute}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, text, 'utf8');

  // Windows 上 rename 覆盖目标文件时，只要目标被别的进程短暂持有（杀毒、文件监视、
  // 宿主读取注入文件）就会 EPERM/EBUSY。重试几次基本都能过。
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.rename(temporary, absolute);
      return;
    } catch (error) {
      lastError = error;
      if (error && error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'EACCES') break;
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }

  // 兜底：直接覆盖写入。走到这里说明目标一直被锁，原子替换做不了，
  // 但 saveMemory 在调用前已经备份过，直接写不会丢内容。
  try {
    await fs.writeFile(absolute, text, 'utf8');
    await fs.rm(temporary, { force: true });
    return;
  } catch (error) {
    await fs.rm(temporary, { force: true });
    const suffix = lastError && lastError.code ? `（${lastError.code}）` : '';
    throw new Error(`文件被占用，保存失败${suffix}，稍等一秒再存一次就行`);
  }
}

/**
 * .backup / .trash 必须带隐藏属性：mem-index.ps1 用 Get-ChildItem -Recurse 扫描
 * memory 下所有 .md，默认不递归进隐藏目录。不设这个属性，备份文件会被写进 INDEX，
 * 把主人和两个 agent 看的索引污染掉。
 */
async function ensureHiddenDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  // 非 Windows 上没有 attrib：这些目录都以点开头，按约定本身就是隐藏的。
  if (process.platform !== 'win32') return;
  await new Promise((resolve) => {
    execFile(ATTRIB, ['+h', directory], { windowsHide: true, timeout: 15000 }, () => resolve());
  });
}

async function uniqueBackupName(directory, base) {
  const at = stamp();
  let candidate = `${base}.${at}.md`;
  let ordinal = 2;
  for (;;) {
    try {
      await fs.access(path.join(directory, candidate));
    } catch (error) {
      if (error?.code === 'ENOENT') return candidate;
      throw error;
    }
    candidate = `${base}.${at}-${ordinal}.md`;
    ordinal += 1;
  }
}

async function saveMemory(payload) {
  const relative = payload?.path;
  const text = payload?.text;
  if (typeof text !== 'string') throw memoryError('invalid_text', '正文必须是字符串');
  if (Buffer.byteLength(text, 'utf8') > MAX_WRITE_BYTES) throw memoryError('too_large', '正文过大');
  const target = await resolveExisting(relative);
  const previous = readText(await fs.readFile(target.absolute, 'utf8'));
  if (previous === text) {
    return { rel: target.relative, changed: false, backup: null, index: { ok: true, skipped: true } };
  }
  const backupDir = path.join(target.root, '.backup');
  await ensureHiddenDirectory(backupDir);
  const backupName = await uniqueBackupName(backupDir, path.basename(target.absolute));
  const backupPath = path.join(backupDir, backupName);
  await writeAtomic(backupPath, previous);
  await writeAtomic(target.absolute, text);
  const index = await rebuildIndex();
  return {
    rel: target.relative,
    changed: true,
    backup: toPosix(path.relative(target.root, backupPath)),
    index,
  };
}

function sanitizeTopic(topic) {
  return String(topic ?? '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
}

async function createMemory(payload) {
  const group = typeof payload?.group === 'string' ? payload.group : 'project';
  if (!ALLOWED_GROUPS.has(group)) throw memoryError('invalid_group', '分组只能是根目录 / project / decision');
  const topic = sanitizeTopic(payload?.topic);
  const summary = String(payload?.summary ?? '').replace(/[\r\n]+/g, ' ').trim();
  const text = typeof payload?.text === 'string' ? payload.text : '';
  if (topic === '') throw memoryError('invalid_topic', '话题不能为空');
  if (summary === '') throw memoryError('invalid_summary', '摘要不能为空');
  if (Buffer.byteLength(text, 'utf8') > MAX_WRITE_BYTES) throw memoryError('too_large', '正文过大');

  const root = await rootPath();
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const directory = group === '' ? root : path.join(root, group);
  if (!isInside(root, directory) && directory !== root) throw memoryError('outside_root', '分组目录越界');
  await fs.mkdir(directory, { recursive: true });
  const name = `${topic}_${yearMonth}.md`;
  const absolute = path.join(directory, name);
  const relative = toPosix(path.relative(root, absolute));
  try {
    await fs.access(absolute);
    throw memoryError('file_exists', `同名文件已存在：${relative}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const body = text.trim();
  const content = `# ${topic}\n\n> 摘要：${summary}\n\n${body === '' ? '- （待补充）\n' : `${body}\n`}`;
  await writeAtomic(absolute, content);
  const index = await rebuildIndex();
  return { rel: relative, index };
}

async function removeMemory(payload) {
  const target = await resolveExisting(payload?.path);
  const trashRoot = path.join(target.root, '.trash');
  await ensureHiddenDirectory(trashRoot);
  const bucket = stamp();
  const destination = path.join(trashRoot, bucket, target.relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.rename(target.absolute, destination);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    await fs.copyFile(target.absolute, destination);
    await fs.rm(target.absolute, { force: false });
  }
  const index = await rebuildIndex();
  return {
    rel: target.relative,
    trashed: toPosix(path.relative(target.root, destination)),
    bucket,
    index,
  };
}

async function listTrash() {
  const root = await rootPath();
  const trashRoot = path.join(root, '.trash');
  let buckets;
  try {
    buckets = await fs.readdir(trashRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { entries: [] };
    throw error;
  }
  const entries = [];
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue;
    const files = [];
    await collectFiles(path.join(trashRoot, bucket.name), 3, files);
    for (const file of files) {
      const stat = await fs.stat(file);
      const relative = toPosix(path.relative(path.join(trashRoot, bucket.name), file));
      entries.push({
        id: `${bucket.name}/${relative}`,
        bucket: bucket.name,
        rel: relative,
        name: path.basename(file),
        bytes: stat.size,
        modified: formatTime(stat.mtime),
        modifiedMs: stat.mtimeMs,
      });
    }
  }
  entries.sort((left, right) => right.modifiedMs - left.modifiedMs);
  return { entries, total: entries.length };
}

async function emptyTrash() {
  const root = await rootPath();
  const trashRoot = path.join(root, '.trash');
  let buckets;
  try {
    buckets = await fs.readdir(trashRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { entries: 0, bytes: 0, buckets: 0, at: formatTime(new Date()) };
    throw error;
  }
  let entries = 0;
  let bytes = 0;
  let removed = 0;
  for (const bucket of buckets) {
    const full = path.join(trashRoot, bucket.name);
    if (!isInside(trashRoot, full)) continue;
    let info;
    try {
      info = await fs.lstat(full);
    } catch {
      continue;
    }
    if (!info.isDirectory()) {
      await fs.rm(full, { force: true });
      removed += 1;
      continue;
    }
    const files = [];
    try {
      await collectFiles(full, 4, files);
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const stat = await fs.lstat(file);
        if (stat.isFile()) {
          entries += 1;
          bytes += stat.size;
        }
      } catch {
        // 统计不到就算了，别耽误清空。
      }
    }
    await fs.rm(full, { recursive: true, force: true });
    removed += 1;
  }
  // 回收站目录本身保留（并继续隐藏），下次删除照常往里放。
  await ensureHiddenDirectory(trashRoot);
  return { entries, bytes, buckets: removed, at: formatTime(new Date()) };
}

async function restoreTrash(payload) {
  const id = typeof payload?.id === 'string' ? payload.id.trim() : '';
  const match = /^(\d{8}-\d{6})\/(.+)$/.exec(id);
  if (!match) throw memoryError('invalid_id', '回收站条目格式不对');
  const [, bucket, relativeRaw] = match;
  const root = await rootPath();
  const trashRoot = path.join(root, '.trash');
  const source = path.resolve(trashRoot, bucket, relativeRaw);
  if (!isInside(trashRoot, source)) throw memoryError('outside_root', '回收站路径越界');
  if (path.extname(source).toLowerCase() !== MD_EXT) throw memoryError('not_markdown', '只恢复 .md 文件');
  const relative = toPosix(path.relative(trashRoot, source)).split('/').slice(1).join('/');
  if (relative === '') throw memoryError('invalid_id', '回收站条目格式不对');
  if (EXCLUDED_NAMES.has(path.basename(relative))) throw memoryError('readonly_file', 'INDEX.md / README.md 不允许改动');
  const target = path.resolve(root, relative);
  if (!isInside(root, target)) throw memoryError('outside_root', '目标路径越界');
  try {
    await fs.realpath(source);
  } catch (error) {
    if (error?.code === 'ENOENT') throw memoryError('not_found', '回收站里找不到这条记忆');
    throw error;
  }
  try {
    await fs.access(target);
    throw memoryError('target_exists', `原位置已有同名文件：${relative}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(source, target);
  const index = await rebuildIndex();
  return { rel: relative, index };
}

async function searchMemory(payload) {
  const query = String(payload?.q ?? '').trim();
  if (query === '') return { query, total: 0, files: [] };
  const needle = query.toLowerCase();
  const root = await rootPath();
  const files = [];
  await collectFiles(root, 2, files);
  const results = [];
  let total = 0;
  for (const file of files.slice(0, SEARCH_MAX_FILES)) {
    let text;
    try {
      text = readText(await fs.readFile(file, 'utf8'));
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    const matches = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line === '' || !line.toLowerCase().includes(needle)) continue;
      matches.push({ line: index + 1, text: line.length > 260 ? `${line.slice(0, 260)}…` : line });
      if (matches.length >= SEARCH_MAX_MATCHES) break;
    }
    if (matches.length === 0) continue;
    const relative = toPosix(path.relative(root, file));
    const meta = parseMeta(text, path.basename(file, path.extname(file)));
    total += matches.length;
    results.push({ rel: relative, title: meta.title, summary: meta.summary, matches });
  }
  results.sort((left, right) => right.matches.length - left.matches.length || left.rel.localeCompare(right.rel));
  return { query, total, files: results };
}

function parseIndexPaths(text) {
  const paths = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = /^-\s+`([^`]+)`/.exec(line.trim());
    if (match) paths.add(match[1].replace(/\\/g, '/'));
  }
  return paths;
}

const SIMILAR_THRESHOLD = 0.55;

function foldSimilarityText(value) {
  return String(value ?? '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}

function bigramSet(value) {
  const text = foldSimilarityText(value);
  const grams = new Set();
  for (let index = 0; index + 2 <= text.length; index += 1) grams.add(text.slice(index, index + 2));
  return grams;
}

function diceScore(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function topicBaseOf(rel) {
  const name = String(rel).split('/').pop().replace(/\.md$/i, '');
  const stripped = name
    .replace(/[_（(]\s*\d{6,8}\s*[)）]?$/u, '')
    .replace(/^\d{6,8}[_\-.\s]+/u, '')
    .trim();
  return stripped || name;
}

function duplicateReport(entries, dismissed = new Set()) {
  const clusters = new Map();
  for (const entry of entries) {
    const base = topicBaseOf(entry.rel);
    if (base.length < 2) continue;
    const bucket = clusters.get(base) ?? [];
    bucket.push(entry);
    clusters.set(base, bucket);
  }
  const sameTopic = [...clusters.entries()]
    .filter(([, items]) => items.length >= 2)
    .map(([base, items]) => ({
      key: `cluster:${base}`,
      base,
      files: items
        .map((item) => ({ rel: item.rel, title: item.title, chars: item.chars, modified: item.modified }))
        .sort((left, right) => left.rel.localeCompare(right.rel)),
    }))
    .filter((cluster) => !dismissed.has(cluster.key))
    .sort((left, right) => right.files.length - left.files.length || left.base.localeCompare(right.base));

  const prepared = entries.map((entry) => ({
    entry,
    grams: bigramSet(`${entry.title} ${entry.summary ?? ''}`),
  }));
  const similar = [];
  for (let left = 0; left < prepared.length; left += 1) {
    for (let right = left + 1; right < prepared.length; right += 1) {
      const score = diceScore(prepared[left].grams, prepared[right].grams);
      if (score < SIMILAR_THRESHOLD) continue;
      const rels = [prepared[left].entry.rel, prepared[right].entry.rel].sort();
      similar.push({
        key: `pair:${rels[0]}|${rels[1]}`,
        a: { rel: prepared[left].entry.rel, title: prepared[left].entry.title, chars: prepared[left].entry.chars },
        b: { rel: prepared[right].entry.rel, title: prepared[right].entry.title, chars: prepared[right].entry.chars },
        score: Number(score.toFixed(2)),
      });
    }
  }
  const visible = similar.filter((pair) => !dismissed.has(pair.key));
  visible.sort((left, right) => right.score - left.score || left.a.rel.localeCompare(right.a.rel));
  return { sameTopic, similar: visible.slice(0, 12) };
}

async function stateDirectory() {
  const root = await rootPath();
  return path.join(root, '.state');
}

async function readDismissed() {
  try {
    const raw = await fs.readFile(path.join(await stateDirectory(), 'dismissed.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const keys = Array.isArray(parsed?.keys) ? parsed.keys : [];
    return new Set(keys.filter((key) => typeof key === 'string'));
  } catch {
    return new Set();
  }
}

async function writeDismissed(keys) {
  await ensureHiddenDirectory(await stateDirectory());
  const payload = JSON.stringify({ keys: [...keys].sort() }, null, 2);
  await writeAtomic(path.join(await stateDirectory(), 'dismissed.json'), `${payload}\n`);
}

/** 去标题、去摘要行，留正文。合并时并进去用。 */
function mergeBodyOf(text) {
  const kept = [];
  let skippedTitle = false;
  let skippedSummary = false;
  for (const line of text.split(/\r?\n/)) {
    if (!skippedTitle && /^#\s+/.test(line)) {
      skippedTitle = true;
      continue;
    }
    if (!skippedSummary && /^>\s*摘要[：:]/.test(line)) {
      skippedSummary = true;
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n').replace(/^\s*\n+/, '').trim();
}

async function mergeMemory(payload) {
  const requested = Array.isArray(payload?.paths) ? payload.paths : [];
  const unique = [...new Set(requested.filter((item) => typeof item === 'string'))];
  if (unique.length < 2) throw memoryError('invalid_merge', '至少要选中两条记忆');
  if (unique.length > 10) throw memoryError('invalid_merge', '一次最多合并 10 条');
  const resolved = [];
  for (const item of unique) resolved.push(await resolveExisting(item));
  const root = resolved[0].root;
  for (const item of resolved) {
    if (item.root !== root) throw memoryError('invalid_merge', '只能合并同一个记忆目录内的文件');
  }
  const texts = [];
  for (const item of resolved) {
    const raw = readText(await fs.readFile(item.absolute, 'utf8'));
    texts.push({ item, raw, meta: parseMeta(raw, path.basename(item.absolute, path.extname(item.absolute))) });
  }
  // 主文件 = 内容最长的那份（主人定的规则）。
  texts.sort((left, right) => right.meta.chars - left.meta.chars || left.item.relative.localeCompare(right.item.relative));
  const main = texts[0];
  const others = texts.slice(1);

  const backupDir = path.join(root, '.backup');
  await ensureHiddenDirectory(backupDir);
  const backups = [];
  for (const entry of texts) {
    const name = await uniqueBackupName(backupDir, path.basename(entry.item.absolute));
    const backupPath = path.join(backupDir, name);
    await writeAtomic(backupPath, entry.raw);
    backups.push(toPosix(path.relative(root, backupPath)));
  }

  const parts = [main.raw.trimEnd()];
  for (const entry of others) {
    const body = mergeBodyOf(entry.raw);
    parts.push(`\n\n---\n\n## 并入：${entry.meta.title}（${entry.item.relative}）\n\n${body}\n`);
  }
  await writeAtomic(main.item.absolute, `${parts.join('')}\n`);

  const trashRoot = path.join(root, '.trash');
  await ensureHiddenDirectory(trashRoot);
  const bucket = stamp();
  const trashed = [];
  for (const entry of others) {
    const destination = path.join(trashRoot, bucket, entry.item.relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.rename(entry.item.absolute, destination);
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error;
      await fs.copyFile(entry.item.absolute, destination);
      await fs.rm(entry.item.absolute, { force: false });
    }
    trashed.push(toPosix(path.relative(root, destination)));
  }

  const index = await rebuildIndex();

  const dismissed = await readDismissed();
  dismissed.add(`cluster:${topicBaseOf(main.item.relative)}`);
  for (let left = 0; left < resolved.length; left += 1) {
    for (let right = left + 1; right < resolved.length; right += 1) {
      const rels = [resolved[left].relative, resolved[right].relative].sort();
      dismissed.add(`pair:${rels[0]}|${rels[1]}`);
    }
  }
  await writeDismissed(dismissed);

  return {
    rel: main.item.relative,
    merged: others.map((entry) => entry.item.relative),
    backups,
    trashed,
    index,
    at: formatTime(new Date()),
  };
}

async function dismissDuplicates(payload) {
  const keys = Array.isArray(payload?.keys) ? payload.keys.filter((key) => typeof key === 'string' && key !== '') : [];
  if (keys.length === 0) throw memoryError('invalid_dismiss', '没有要忽略的条目');
  const dismissed = await readDismissed();
  for (const key of keys) dismissed.add(key);
  await writeDismissed(dismissed);
  return { keys, total: dismissed.size };
}

/* ------------------------------------------------------------ 必读清单 */

function defaultRequiredFiles() {
  return [{ path: SETTINGS.personaFile, enabled: true, note: '人格锚' }];
}

async function readRequiredConfig() {
  try {
    const parsed = JSON.parse(await fs.readFile(REQUIRED_CONFIG, 'utf8'));
    if (Array.isArray(parsed?.files) && parsed.files.length > 0) return parsed.files;
  } catch {
    /* 退默认 */
  }
  return defaultRequiredFiles();
}

function normalizeRequiredPath(input) {
  if (typeof input !== 'string') throw memoryError('invalid_path', '路径必须是字符串');
  const value = input.trim();
  if (!value) throw memoryError('invalid_path', '路径为空');
  if (!path.isAbsolute(value)) throw memoryError('invalid_path', `请给绝对路径，例如 ${path.join(SETTINGS.memoryRoot, 'PERSONA.md')}（收到：${value}）`);
  return path.normalize(value);
}

async function requiredInfo(item) {
  const filePath = normalizeRequiredPath(item.path);
  const entry = {
    path: filePath,
    name: path.basename(filePath),
    note: typeof item.note === 'string' ? item.note.slice(0, 40) : '',
    enabled: item.enabled !== false,
    exists: false,
    chars: 0,
    bytes: 0,
    tooLarge: false,
    error: '',
  };
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    entry.error = '文件不存在';
    return entry;
  }
  if (!stat.isFile()) {
    entry.error = '不是文件';
    return entry;
  }
  entry.exists = true;
  entry.bytes = stat.size;
  if (stat.size > REQUIRED_MAX_BYTES) {
    entry.tooLarge = true;
    entry.error = '超过 200 KB，不会注入';
    return entry;
  }
  try {
    entry.chars = readText(await fs.readFile(filePath, 'utf8')).trim().length;
  } catch {
    entry.error = '读不了（编码或权限）';
  }
  return entry;
}

async function requiredList() {
  const files = await readRequiredConfig();
  const entries = [];
  for (const item of files.slice(0, REQUIRED_MAX_FILES)) {
    entries.push(await requiredInfo(item));
  }
  const parts = [];
  let totalChars = 0;
  for (const entry of entries) {
    if (!entry.enabled || !entry.exists || entry.tooLarge) continue;
    try {
      const text = readText(await fs.readFile(entry.path, 'utf8')).trim();
      if (!text) continue;
      totalChars += text.length;
      parts.push(`━━━ ${entry.note || entry.name} ━━━\n${text}`);
    } catch {
      /* 跳过 */
    }
  }
  return { entries, totalChars, preview: parts.join('\n\n') };
}

async function requiredSave(payload) {
  const incoming = Array.isArray(payload?.files) ? payload.files : [];
  if (incoming.length > REQUIRED_MAX_FILES) {
    throw memoryError('too_many_files', `最多 ${REQUIRED_MAX_FILES} 个必读文件`);
  }
  const clean = [];
  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue;
    const filePath = normalizeRequiredPath(item?.path);
    if (!clean.some((entry) => entry.path === filePath)) {
      clean.push({
        path: filePath,
        enabled: item.enabled !== false,
        note: String(item?.note ?? '').slice(0, 40),
      });
    }
  }
  for (const entry of clean) {
    const info = await requiredInfo(entry);
    if (!info.exists) throw memoryError('not_found', `文件不存在：${entry.path}`);
    if (info.tooLarge) throw memoryError('too_large', `文件超过 200 KB：${entry.path}`);
  }
  await writeAtomic(REQUIRED_CONFIG, JSON.stringify({ files: clean }, null, 2) + '\n');
  return await requiredList();
}

async function healthCheck() {
  const root = await rootPath();
  const list = await listMemory();
  const missingSummary = list.entries
    .filter((entry) => !entry.hasSummary)
    .map((entry) => ({ rel: entry.rel, title: entry.title, modified: entry.modified }));

  const limit = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const stale = list.entries
    .filter((entry) => entry.modifiedMs < limit)
    .sort((left, right) => left.modifiedMs - right.modifiedMs)
    .map((entry) => ({
      rel: entry.rel,
      title: entry.title,
      modified: entry.modified,
      days: Math.floor((Date.now() - entry.modifiedMs) / (24 * 60 * 60 * 1000)),
    }));

  let missingInIndex = [];
  let missingFiles = [];
  let indexModified = '';
  try {
    const index = await readIndex();
    indexModified = index.modified;
    const listed = parseIndexPaths(index.text);
    const actual = new Set(list.entries.map((entry) => entry.rel));
    missingInIndex = [...actual].filter((rel) => !listed.has(rel)).sort();
    missingFiles = [...listed].filter((rel) => !actual.has(rel)).sort();
  } catch {
    missingInIndex = list.entries.map((entry) => entry.rel);
  }

  return {
    total: list.total,
    staleDays: STALE_DAYS,
    missingSummary,
    stale,
    duplicates: duplicateReport(list.entries, await readDismissed()),
    index: {
      modified: indexModified,
      missingInIndex,
      missingFiles,
      consistent: missingInIndex.length === 0 && missingFiles.length === 0,
    },
  };
}

const handlers = {
  list: () => listMemory(),
  read: (payload) => readMemory(payload?.path),
  index: () => readIndex(),
  rebuildIndex: async () => {
    const result = await rebuildIndex();
    if (!result.ok) throw memoryError('index_failed', `索引重建失败：${result.message}`);
    return { at: formatTime(new Date()), output: result.output };
  },
  save: (payload) => saveMemory(payload),
  create: (payload) => createMemory(payload),
  remove: (payload) => removeMemory(payload),
  trash: () => listTrash(),
  trashEmpty: () => emptyTrash(),
  restore: (payload) => restoreTrash(payload),
  search: (payload) => searchMemory(payload),
  merge: (payload) => mergeMemory(payload),
  dismiss: (payload) => dismissDuplicates(payload),
  health: () => healthCheck(),
  requiredList: () => requiredList(),
  requiredSave: (payload) => requiredSave(payload),
};

export async function handle(op, payload) {
  const handler = Object.prototype.hasOwnProperty.call(handlers, op) ? handlers[op] : undefined;
  if (handler === undefined) return errorResult('unknown_endpoint', `未知操作：${String(op)}`);
  try {
    return { ok: true, value: await handler(payload ?? {}) };
  } catch (error) {
    return errorResult(error?.code ?? 'internal_error', error?.message ?? String(error));
  }
}

export const internals = {
  handle,
  listMemory,
  readMemory,
  readIndex,
  saveMemory,
  createMemory,
  removeMemory,
  listTrash,
  emptyTrash,
  restoreTrash,
  searchMemory,
  healthCheck,
};
