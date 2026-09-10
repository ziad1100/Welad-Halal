import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Convention guard: e2e specs must navigate via gotoApp() (hash assignment),
 * never page.goto('/#...') — CDP same-document navigations don't reliably
 * fire the events HashRouter listens for (silent blank-page flakes).
 */
describe('e2e conventions', () => {
  test('no raw page.goto with hash URLs in e2e specs', () => {
    const dir = path.join(__dirname, '..', 'e2e');
    const offenders: string[] = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.spec.ts')) continue;
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const line of src.split('\n')) {
        const t = line.trim();
        if (t.startsWith('//')) continue;
        if (/page\.goto\(\s*['"`]\/#/.test(t)) offenders.push(`${f}: ${t}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
