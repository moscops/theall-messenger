import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_NAME } from '../src/index.js';

describe('shared package wiring', () => {
  it('exports a name', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@theall/shared');
  });
});
