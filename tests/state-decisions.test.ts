import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { runStateDetection, loadTechState } from '../src/lib/state-decisions.js';

describe('runStateDetection', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'handoff-statedec-'));
    await mkdir(join(tmpDir, '.handoff'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array on first run (baseline only)', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { mongodb: '^6.0.0' },
    }));
    const decisions = await runStateDetection(tmpDir);
    expect(decisions).toEqual([]);
  });

  it('persists tech state after first run', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { mongodb: '^6.0.0' },
    }));
    await runStateDetection(tmpDir);
    const state = await loadTechState(tmpDir);
    expect(state).not.toBeNull();
    expect(state!.last.techs['database']).toContain('mongodb');
    expect(state!.history['database']).toContain('mongodb');
  });

  it('detects switch from one database to another', async () => {
    // First run: mongodb
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { mongodb: '^6.0.0' },
    }));
    await runStateDetection(tmpDir);

    // Second run: switched to mysql2
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { mysql2: '^3.0.0' },
    }));
    const decisions = await runStateDetection(tmpDir);

    expect(decisions.length).toBeGreaterThan(0);
    const dbDecision = decisions.find((d) => d.tags.includes('database'));
    expect(dbDecision).toBeDefined();
    expect(dbDecision!.title.toLowerCase()).toContain('mysql');
    expect(dbDecision!.source).toBe('state');
    expect(dbDecision!.alternatives.some((a) => a.toLowerCase().includes('mongodb'))).toBe(true);
  });

  it('records full lineage across multiple switches', async () => {
    // Run 1: mongodb
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { mongodb: '^6.0.0' } }));
    await runStateDetection(tmpDir);

    // Run 2: couchdb (nano is the couchdb client)
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { nano: '^10.0.0' } }));
    await runStateDetection(tmpDir);

    // Run 3: mysql2
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { mysql2: '^3.0.0' } }));
    const decisions = await runStateDetection(tmpDir);

    const state = await loadTechState(tmpDir);
    // History should contain all three
    expect(state!.history['database']).toContain('mongodb');
    expect(state!.history['database']).toContain('nano');
    expect(state!.history['database']).toContain('mysql2');

    // Decision should mention previous techs as alternatives
    const dbDecision = decisions.find((d) => d.tags.includes('database'));
    expect(dbDecision).toBeDefined();
    const altText = dbDecision!.alternatives.join(' ').toLowerCase();
    expect(altText).toContain('mongodb');
  });

  it('returns empty when nothing changed between runs', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { pg: '^8.0.0' } }));
    await runStateDetection(tmpDir); // baseline

    await runStateDetection(tmpDir); // same state
    const decisions = await runStateDetection(tmpDir);
    expect(decisions).toEqual([]);
  });

  it('detects new tech addition without removal', async () => {
    // Run 1: baseline with express
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { express: '^4.0.0' } }));
    await runStateDetection(tmpDir);

    // Run 2: added prisma (no removal)
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.0.0', prisma: '^5.0.0' },
    }));
    const decisions = await runStateDetection(tmpDir);

    const ormDecision = decisions.find((d) => d.tags.includes('orm'));
    expect(ormDecision).toBeDefined();
    expect(ormDecision!.title.toLowerCase()).toContain('prisma');
    expect(ormDecision!.source).toBe('state');
  });

  it('assigns confidence >= 0.6 for all state decisions', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { mongodb: '^6.0.0' } }));
    await runStateDetection(tmpDir);

    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { mysql2: '^3.0.0' } }));
    const decisions = await runStateDetection(tmpDir);

    for (const d of decisions) {
      expect(d.confidence).toBeGreaterThanOrEqual(0.6);
      expect(d.confidence).toBeLessThanOrEqual(1.0);
    }
  });

  it('returns empty array for empty project on second run', async () => {
    // First run with no package.json — nothing detected
    await runStateDetection(tmpDir); // no package.json, no techs

    // Second run still nothing
    const decisions = await runStateDetection(tmpDir);
    expect(decisions).toEqual([]);
  });
});
