/**
 * List ZIP entry paths without extra npm dependencies (Windows + Python fallback).
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export function listZipEntries(zipPath) {
  const abs = resolve(zipPath);
  if (process.platform === 'win32') {
    return listZipEntriesWindows(abs);
  }
  const py = listZipEntriesPython(abs);
  if (py) return py;
  throw new Error(
    'Cannot read ZIP on this platform. Use Windows, or install Python for zipfile listing.'
  );
}

function listZipEntriesWindows(abs) {
  const ps = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$z = [System.IO.Compression.ZipFile]::OpenRead('${abs.replace(/'/g, "''")}')`,
    '$z.Entries | ForEach-Object { $_.FullName }',
    '$z.Dispose()'
  ].join('; ');
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || 'PowerShell failed to read ZIP');
  }
  return r.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.replace(/\\/g, '/'))
    .filter(Boolean);
}

function listZipEntriesPython(abs) {
  const r = spawnSync(
    'python',
    [
      '-c',
      'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print("\\n".join(z.namelist())); z.close()',
      abs
    ],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (r.status !== 0) return null;
  return r.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.replace(/\\/g, '/'))
    .filter(Boolean);
}
