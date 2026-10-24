import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { localImagePath, readLocalImage, writeLocalImage, deleteLocalImage } from '@/lib/local-images';

let root: string | undefined;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });
it('rejects traversal and Windows path injection', () => {
  for (const key of ['../secret', 'lineups/../secret', 'lineups/a\\b.jpg', 'lineups/C:/a.jpg', 'lineups//a.jpg']) {
    expect(() => localImagePath(os.tmpdir(), key)).toThrow();
  }
});
it('stores and serves images with sniffed content type, handles absent and deleted files', async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'playbook-images-'));
  const key = 'lineups/test/photo.jpg';
  expect(await readLocalImage(root, key)).toBeNull();
  const bytes = new Uint8Array([255,216,255,224,0,0,0,0,0,0]);
  await writeLocalImage(root, key, bytes);
  const stored = await readLocalImage(root, key);
  expect(stored?.contentType).toBe('image/jpeg');
  expect(new Uint8Array(await new Response(stored!.body).arrayBuffer())).toEqual(bytes);
  await deleteLocalImage(root, key);
  expect(await readLocalImage(root, key)).toBeNull();
  await deleteLocalImage(root, key);
  await expect(writeLocalImage(root, key, new TextEncoder().encode('<html>'))).rejects.toThrow();
});
