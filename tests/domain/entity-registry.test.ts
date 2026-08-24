import { describe, it, expect } from 'vitest';
import { createEntity, markForRemoval, commitRemovals } from '../../src/world/EntityRegistry.js';
import { buildTestWorld } from '../helpers/testWorld.js';

describe('EntityRegistry (Subtask 2 §3/§4)', () => {
  it('vergibt fortlaufende IDs beginnend bei 1', () => {
    const world = buildTestWorld();
    const a = createEntity(world);
    const b = createEntity(world);
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it('hält entities.alive sortiert', () => {
    const world = buildTestWorld();
    createEntity(world);
    createEntity(world);
    createEntity(world);
    expect(world.entities.alive).toEqual([1, 2, 3]);
  });

  it('verwendet niemals eine ID erneut (ADR-13)', () => {
    const world = buildTestWorld();
    const a = createEntity(world);
    markForRemoval(world, a);
    commitRemovals(world);
    const b = createEntity(world);
    expect(b).not.toBe(a);
    expect(b).toBe(2); // nextEntityId wächst unbegrenzt, unabhängig von Entfernung
  });

  it('entfernt tote Entities erst durch commitRemovals, nicht sofort', () => {
    const world = buildTestWorld();
    const a = createEntity(world);
    markForRemoval(world, a);
    expect(world.entities.alive).toContain(a);
    commitRemovals(world);
    expect(world.entities.alive).not.toContain(a);
  });

  it('commitRemovals löscht auch aus allen Component Stores', () => {
    const world = buildTestWorld();
    const a = createEntity(world);
    world.components.identity.set(a, { kind: 'person', displayName: 'X' });
    markForRemoval(world, a);
    commitRemovals(world);
    expect(world.components.identity.has(a)).toBe(false);
  });

  it('leert pendingRemovals nach commitRemovals', () => {
    const world = buildTestWorld();
    const a = createEntity(world);
    markForRemoval(world, a);
    commitRemovals(world);
    expect(world.entities.pendingRemovals).toHaveLength(0);
  });
});
