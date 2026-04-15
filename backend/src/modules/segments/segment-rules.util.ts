import { Prisma } from '@prisma/client';

export function extractDependencySegmentIds(rules: unknown): string[] {
  const segmentIds = new Set<string>();

  const traverse = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        traverse(item);
      }
      return;
    }

    if (!node || typeof node !== 'object') {
      return;
    }

    const objectNode = node as Record<string, unknown>;

    for (const [key, value] of Object.entries(objectNode)) {
      if (key === 'segmentId' && typeof value === 'string') {
        segmentIds.add(value);
        continue;
      }

      if (
        key === 'segmentIds' &&
        Array.isArray(value) &&
        value.every((entry) => typeof entry === 'string')
      ) {
        for (const segmentId of value) {
          segmentIds.add(segmentId);
        }
        continue;
      }

      traverse(value);
    }
  };

  traverse(rules);
  return [...segmentIds];
}

export function toInputJsonValue(
  rules: Record<string, unknown>,
): Prisma.InputJsonValue {
  return rules as Prisma.InputJsonValue;
}
