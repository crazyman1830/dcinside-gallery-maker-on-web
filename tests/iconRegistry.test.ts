import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONS } from '../components/Icon';

const root = path.resolve(__dirname, '..');
const sources = [
  'App.tsx',
  ...readdirSync(path.join(root, 'components'))
    .filter(file => file.endsWith('.tsx'))
    .map(file => `components/${file}`),
].map(file => ({ file, text: readFileSync(path.join(root, file), 'utf8') }));

describe('icon registry', () => {
  it('renders icons only through the Icon component', () => {
    // A FontAwesome class on a plain element renders nothing without the runtime.
    const rawIconTags = sources.flatMap(({ file, text }) =>
      [...text.matchAll(/<i\s+className=/g)].map(() => file),
    );
    expect(rawIconTags).toEqual([]);
  });

  it('registers every icon name referenced by the UI', () => {
    const referenced = new Set(
      sources.flatMap(({ text }) =>
        [...text.matchAll(/['"`](fa[srb] fa-[a-z0-9-]+)['"`]/g)].map(match => match[1]),
      ),
    );
    const missing = [...referenced].filter(name => !(name in ICONS));

    expect(referenced.size).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });
});
