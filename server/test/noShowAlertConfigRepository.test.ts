import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../src/db.js';
import { NoShowAlertConfigRepository } from '../src/repositories/noShowAlertConfigRepository.js';

describe('NoShowAlertConfigRepository', () => {
  let db: Database.Database;
  let repo: NoShowAlertConfigRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new NoShowAlertConfigRepository(db);
  });

  it('defaults to disabled with a 10 minute delay when unset', () => {
    expect(repo.get()).toEqual({ enabled: false, delayMinutes: 10 });
  });

  it('persists an update and returns it on the next get', () => {
    repo.update({ enabled: true, delayMinutes: 15 });
    expect(repo.get()).toEqual({ enabled: true, delayMinutes: 15 });
  });

  it('overwrites a previous update rather than inserting a second row', () => {
    repo.update({ enabled: true, delayMinutes: 15 });
    repo.update({ enabled: false, delayMinutes: 20 });
    expect(repo.get()).toEqual({ enabled: false, delayMinutes: 20 });
  });
});
