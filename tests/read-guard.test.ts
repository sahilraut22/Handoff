import { describe, it, expect, beforeEach } from 'vitest';
import { recordRead, checkReadGuard, clearReadGuard } from '../src/lib/read-guard.js';

describe('read-guard', () => {
  beforeEach(async () => {
    await clearReadGuard();
  });

  it('returns false when no read has been recorded', async () => {
    const result = await checkReadGuard('%0', '%1');
    expect(result).toBe(false);
  });

  it('returns true after recording a read', async () => {
    await recordRead('%0', '%1');
    const result = await checkReadGuard('%0', '%1');
    expect(result).toBe(true);
  });

  it('returns false for different caller/target pair', async () => {
    await recordRead('%0', '%1');
    const result = await checkReadGuard('%0', '%2');
    expect(result).toBe(false);
  });

  it('tracks multiple pairs independently', async () => {
    await recordRead('%0', '%1');
    await recordRead('%0', '%2');
    expect(await checkReadGuard('%0', '%1')).toBe(true);
    expect(await checkReadGuard('%0', '%2')).toBe(true);
    expect(await checkReadGuard('%1', '%0')).toBe(false);
  });

  it('clearReadGuard resets all state', async () => {
    await recordRead('%0', '%1');
    await clearReadGuard();
    const result = await checkReadGuard('%0', '%1');
    expect(result).toBe(false);
  });
});
