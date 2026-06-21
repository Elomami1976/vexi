import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SnapshotManager } from './index.js';

async function mkTmp(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), 'vexi-snap-test-'));
}

async function writeFile(dir: string, name: string, content: string): Promise<string> {
  const p = join(dir, name);
  await fs.writeFile(p, content, 'utf8');
  return p;
}

describe('SnapshotManager', () => {
  let root: string;
  let manager: SnapshotManager;

  beforeEach(async () => {
    root = await mkTmp();
    manager = new SnapshotManager(root, 'test-session');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('round-trip: takeSnapshot → undo restores file content', async () => {
    const filePath = await writeFile(root, 'hello.txt', 'original');

    const snapped = await manager.takeSnapshot([filePath], 'initial write');
    expect(snapped).toBe(true);

    await fs.writeFile(filePath, 'modified', 'utf8');

    const entry = await manager.undo();
    expect(entry).not.toBeNull();
    expect(entry!.files.some((f) => f.endsWith('hello.txt') || f === filePath)).toBe(true);

    const restored = await fs.readFile(filePath, 'utf8');
    expect(restored).toBe('original');
  });

  it('round-trip: undo → redo restores modified content', async () => {
    const filePath = await writeFile(root, 'hello.txt', 'original');

    await manager.takeSnapshot([filePath], 'initial write');
    await fs.writeFile(filePath, 'modified', 'utf8');

    await manager.undo();
    const afterUndo = await fs.readFile(filePath, 'utf8');
    expect(afterUndo).toBe('original');

    const redoEntry = await manager.redo();
    expect(redoEntry).not.toBeNull();

    const afterRedo = await fs.readFile(filePath, 'utf8');
    expect(afterRedo).toBe('modified');
  });

  it('list() returns newest snapshot first', async () => {
    const filePath = await writeFile(root, 'a.txt', 'v1');
    await manager.takeSnapshot([filePath], 'first');
    await fs.writeFile(filePath, 'v2', 'utf8');
    await manager.takeSnapshot([filePath], 'second');

    const list = await manager.list();
    expect(list.length).toBe(2);
    expect(list[0].label).toBe('second');
    expect(list[1].label).toBe('first');
  });

  it('undo() returns null when stack is empty', async () => {
    const result = await manager.undo();
    expect(result).toBeNull();
  });

  it('redo() returns null when stack is empty', async () => {
    const result = await manager.redo();
    expect(result).toBeNull();
  });

  it('takeSnapshot clears redo stack', async () => {
    const filePath = await writeFile(root, 'b.txt', 'v1');
    await manager.takeSnapshot([filePath], 'snap1');
    await fs.writeFile(filePath, 'v2', 'utf8');
    await manager.undo();

    // new snapshot after undo — redo stack should be cleared
    await manager.takeSnapshot([filePath], 'snap2');
    const redo = await manager.redo();
    expect(redo).toBeNull();
  });

  it('takeSnapshot returns false when no files exist', async () => {
    const result = await manager.takeSnapshot([join(root, 'ghost.txt')], 'missing');
    expect(result).toBe(false);
  });
});

describe('SnapshotManager.extractFilePaths', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(join(tmpdir(), 'vexi-ext-test-'));
    // create the files so existsSync passes
    await fs.mkdir(join(cwd, 'src'), { recursive: true });
    await fs.writeFile(join(cwd, 'src', 'app.ts'), '', 'utf8');
    await fs.writeFile(join(cwd, 'src', 'utils.js'), '', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it('extracts path from cat > redirect', () => {
    const paths = SnapshotManager.extractFilePaths('cat > src/app.ts', cwd);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.endsWith('app.ts'))).toBe(true);
  });

  it('extracts path from sed -i command', () => {
    const paths = SnapshotManager.extractFilePaths("sed -i 's/foo/bar/' src/utils.js", cwd);
    expect(paths.some((p) => p.endsWith('utils.js'))).toBe(true);
  });

  it('returns empty array for non-file commands', () => {
    const paths = SnapshotManager.extractFilePaths('npm install', cwd);
    expect(paths).toEqual([]);
  });
});
