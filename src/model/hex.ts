export type Hex = [number, number];

const key = ([column, row]: Hex): string => `${column},${row}`;

export function getAdjacent([column, row]: Hex, validHexes?: ReadonlySet<string>): Hex[] {
  const candidates: Hex[] =
    column % 2 === 0
      ? [
          [column - 1, row - 1],
          [column - 1, row],
          [column, row - 1],
          [column, row + 1],
          [column + 1, row - 1],
          [column + 1, row],
        ]
      : [
          [column - 1, row],
          [column - 1, row + 1],
          [column, row - 1],
          [column, row + 1],
          [column + 1, row],
          [column + 1, row + 1],
        ];

  return validHexes ? candidates.filter((hex) => validHexes.has(key(hex))) : candidates;
}

export function shortestPath(
  startHex: Hex,
  endHex: Hex,
  validHexes?: ReadonlySet<string>,
): Hex[] | undefined {
  if (!startHex || !endHex) {
    throw new Error('start/end missing');
  }

  const visited = new Set([key(startHex)]);
  const queue: Array<[Hex, Hex[]]> = [[startHex, [startHex]]];

  while (queue.length > 0) {
    const [current, path] = queue.shift()!;
    if (current[0] === endHex[0] && current[1] === endHex[1]) {
      return path;
    }

    for (const adjacent of getAdjacent(current, validHexes)) {
      const adjacentKey = key(adjacent);
      if (!visited.has(adjacentKey)) {
        visited.add(adjacentKey);
        queue.push([adjacent, [...path, adjacent]]);
      }
    }
  }

  return undefined;
}

function toCube([column, row]: Hex): [number, number, number] {
  const x = column;
  const z = row - (column - (column & 1)) / 2;
  return [x, -x - z, z];
}

export function distance(firstHex: Hex, secondHex: Hex): number {
  const first = toCube(firstHex);
  const second = toCube(secondHex);
  return (
    (Math.abs(first[0] - second[0]) +
      Math.abs(first[1] - second[1]) +
      Math.abs(first[2] - second[2])) /
    2
  );
}

export const hexKey = key;
