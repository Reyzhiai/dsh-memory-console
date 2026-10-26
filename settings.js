/**
 * 配置读取：memory-console 的所有本机差异都收在这里。
 *
 * 优先级：环境变量 > config.json > 默认值。
 * config.json 放在插件根目录（也可以指向别处：DSH_MEMORY_CONSOLE_CONFIG）。
 */
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const pluginDir = path.dirname(fileURLToPath(import.meta.url));

export function readConfigFile() {
  const file = process.env.DSH_MEMORY_CONSOLE_CONFIG || path.join(pluginDir, 'config.json');
  try {
    const parsed = JSON.parse(fsSync.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadSettings() {
  const config = readConfigFile();
  const memoryRoot = path.resolve(
    process.env.DSH_MEMORY_ROOT || config.memoryRoot || path.join(os.homedir(), '.dsh', 'memory'),
  );
  const indexScript = config.indexScript || process.env.DSH_MEMORY_INDEX_SCRIPT || '';
  const stateDir = path.resolve(
    config.stateDir || process.env.DSH_MEMORY_CONSOLE_STATE || path.join(memoryRoot, '.console-state'),
  );
  const powershell =
    config.powershell ||
    process.env.DSH_MEMORY_POWERSHELL ||
    (process.platform === 'win32'
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'pwsh');
  return {
    memoryRoot,
    indexPath: path.join(memoryRoot, 'INDEX.md'),
    indexScript: indexScript ? path.resolve(indexScript) : '',
    stateDir,
    powershell,
    personaFile: path.resolve(config.personaFile || path.join(memoryRoot, 'PERSONA.md')),
  };
}
