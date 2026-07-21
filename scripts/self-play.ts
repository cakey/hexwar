import { runSimulation, summarizeSimulations } from '../src/model/simulation.js';

const countFlag = process.argv.find((argument) => argument.startsWith('--games='));
const games = Math.max(1, Number(countFlag?.split('=')[1] ?? 10));
const results = Array.from({ length: games }, (_, index) =>
  runSimulation({ depth: 1, maxCandidates: 10, seed: index + 1 }),
);

console.log(summarizeSimulations(results));
