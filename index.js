/**
 * memory-console —— 记忆管理台，Host 半（壳）。
 *
 * 这里只做三件事：挂 /api/memory.rpc 路由、按 mtime 动态加载 handlers.js、把结果
 * 包成 JSON。业务逻辑全在 handlers.js 里，那个文件改完下一次请求就生效，不用重启
 * Desktop —— 只有本文件（壳）变化才需要重启。
 *
 * 用 ctx.connection.fetch.register() 而不是 rpc.handle()：0.2.1-rc.2/rc.3 里后者
 * 会拿连接插件自己的上下文去读 webServer，外部插件调用必抛
 * "cannot get property webServer without inject"。
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSettings, pluginDir } from './settings.js';

const SETTINGS = loadSettings();

const ROUTE = '/api/memory.rpc';
const HANDLERS = path.join(pluginDir, 'handlers.js');
const PERSONA_FILE = SETTINGS.personaFile;
const REQUIRED_CONFIG = path.join(SETTINGS.stateDir, 'required-files.json');
const REQUIRED_MAX_BYTES = 200 * 1024;

export const name = 'dsh-memory-console';
export const inject = ['connection'];

let systemPromptRef = null;
let anchorCache = { stamp: '', text: '' };

function defaultRequiredFiles() {
  return [{ path: PERSONA_FILE, enabled: true, note: '人格锚' }];
}

/** 读必读清单；配置文件缺失/损坏时退回默认（PERSONA.md）。 */
function readRequiredFiles() {
  try {
    const parsed = JSON.parse(fsSync.readFileSync(REQUIRED_CONFIG, 'utf8'));
    if (Array.isArray(parsed?.files) && parsed.files.length > 0) return parsed.files;
  } catch {
    /* 退默认 */
  }
  return defaultRequiredFiles();
}

/**
 * 每轮重新求值：清单里任何一个文件变化，下一次请求就用新拼接，不用重启。
 * 单个文件读失败只跳过它，绝不拖垮整个锚点。
 */
function requiredAnchor() {
  try {
    const files = readRequiredFiles();
    const parts = [];
    let stamp = '';
    for (const item of files) {
      if (!item || typeof item !== 'object' || item.enabled === false) continue;
      const filePath = typeof item.path === 'string' ? item.path : '';
      if (!filePath) continue;
      try {
        const stat = fsSync.statSync(filePath);
        if (!stat.isFile() || stat.size > REQUIRED_MAX_BYTES) continue;
        stamp += `${filePath}:${stat.mtimeMs}:${stat.size};`;
        const text = fsSync.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
        if (!text) continue;
        const label = typeof item.note === 'string' && item.note ? item.note : path.basename(filePath);
        parts.push(`━━━ ${label} ━━━\n${text}`);
      } catch {
        continue;
      }
    }
    if (parts.length === 0) return '';
    if (stamp !== anchorCache.stamp) {
      anchorCache = { stamp, text: `\n${parts.join('\n\n')}\n` };
    }
    return anchorCache.text;
  } catch {
    return '';
  }
}

let cached = { mtimeMs: -1, module: null };

async function loadHandlers() {
  const stat = await fs.stat(HANDLERS);
  if (cached.module !== null && cached.mtimeMs === stat.mtimeMs) return cached.module;
  const url = `${pathToFileURL(HANDLERS).href}?v=${stat.mtimeMs}`;
  const module = await import(url);
  cached = { mtimeMs: stat.mtimeMs, module };
  return module;
}

function errorResult(code, message) {
  return { ok: false, error: { code, message, details: {} } };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function route(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(errorResult('bad_request', '请求体不是合法 JSON'), 400);
  }
  if (body === null || typeof body !== 'object' || typeof body.op !== 'string') {
    return jsonResponse(errorResult('bad_request', '缺少 op 字段'), 400);
  }
  if (body.op === 'promptSections') {
    try {
      const value = { sections: [], contexts: [], anchorName: 'memory-console:persona-anchor' };
      const sp = systemPromptRef;
      if (sp && typeof sp.assemble === 'function') {
        const assembly = await sp.assemble();
        if (assembly && Array.isArray(assembly.sections)) {
          value.sections = assembly.sections.map((section) => ({
            name: section?.name ?? '',
            chars: typeof section?.text === 'string' ? section.text.length : 0,
          }));
        }
        if (assembly && Array.isArray(assembly.contexts)) {
          value.contexts = assembly.contexts.map((context) => ({
            name: context?.name ?? '',
            chars: typeof context?.text === 'string' ? context.text.length : 0,
          }));
        }
      }
      return jsonResponse({ ok: true, value });
    } catch (error) {
      return jsonResponse(errorResult('assemble_failed', `读取提示词顺序失败：${error?.message ?? String(error)}`));
    }
  }
  let handlers;
  try {
    handlers = await loadHandlers();
  } catch (error) {
    return jsonResponse(errorResult('handlers_unavailable', `业务层加载失败：${error?.message ?? String(error)}`));
  }
  return jsonResponse(await handlers.handle(body.op, body.payload));
}

export function apply(ctx) {
  ctx.effect(() => {
    const registration = ctx.connection.fetch.register({
      path: ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => route(request),
    });
    return () => {
      registration.then((dispose) => dispose()).catch(() => {});
    };
  }, 'memory-console: /api route');

  // 人格锚：固定注入到系统提示，每轮重算；任何异常都不许拖垮 /api 路由。
  try {
    if (typeof ctx.inject === 'function') {
      ctx.inject(['systemPrompt'], (scope) => {
        systemPromptRef = scope.systemPrompt ?? null;
        scope.effect(
          () =>
            scope.systemPrompt.section({
              name: 'memory-console:persona-anchor',
              order: 1,
              text: () => requiredAnchor(),
              interpolate: false,
            }),
          'memory-console: persona anchor section',
        );
      });
    }
  } catch (error) {
    console.warn('[memory-console] persona anchor not mounted:', error?.message ?? error);
  }
}
