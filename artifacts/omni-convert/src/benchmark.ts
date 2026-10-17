/**
 * Micro-benchmarks for the conversion core.
 *
 * Run with: `node --experimental-strip-types src/benchmark.ts`
 * (or `pnpm --filter @workspace/omni-convert run benchmark`).
 *
 * These are smoke benchmarks intended to catch regressions in hot paths, not
 * to produce statistically rigorous numbers. Each measurement warms up before
 * timing and reports throughput in operations per second.
 */

import { parseCsv } from "./lib/csv.ts";
import { evaluateExpression } from "./lib/expression.ts";
import { formatNumber } from "./lib/number-format.ts";
import { categories, convert, type Category, type Unit } from "./lib/units.ts";

interface Pair {
  category: Category;
  from: Unit;
  to: Unit;
}

function buildPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (const category of categories) {
    for (let index = 0; index < category.units.length; index += 1) {
      pairs.push({
        category,
        from: category.units[index]!,
        to: category.units[(index + 1) % category.units.length]!,
      });
    }
  }
  return pairs;
}

function measure(name: string, iterations: number, run: (iteration: number) => void): void {
  const warmup = Math.min(iterations, 5_000);
  for (let iteration = 0; iteration < warmup; iteration += 1) run(iteration);
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) run(iteration);
  const elapsedMs = performance.now() - start;
  const opsPerSecond = iterations / (elapsedMs / 1000);
  const ops = iterations.toLocaleString().padStart(11);
  const ms = `${elapsedMs.toFixed(1)} ms`.padStart(10);
  const throughput = `${Math.round(opsPerSecond).toLocaleString()} ops/s`.padStart(15);
  console.log(`${name.padEnd(34)} ${ops}  ${ms}  ${throughput}`);
}

function buildSampleCsv(rows: number): string {
  const lines = ["label,value,unit"];
  for (let index = 0; index < rows; index += 1) {
    lines.push(`Row ${index + 1},${(index * 1.37).toFixed(3)},kilometers`);
  }
  return lines.join("\n");
}

function main(): void {
  const pairs = buildPairs();
  console.log("OmniConvert conversion core — micro-benchmarks");
  console.log(`Categories: ${categories.length} · conversion pairs: ${pairs.length}`);
  console.log("".padEnd(72, "-"));

  measure("unit conversion (all pairs)", 400_000, (iteration) => {
    const pair = pairs[iteration % pairs.length]!;
    convert(pair.category, 1.5 + (iteration % 7), pair.from, pair.to);
  });

  measure("temperature conversion", 200_000, (iteration) => {
    const temperature = categories.find((item) => item.id === "temperature")!;
    convert(temperature, 20 + (iteration % 50), temperature.units[0]!, temperature.units[1]!);
  });

  measure("fuel economy (inverse)", 200_000, (iteration) => {
    const fuel = categories.find((item) => item.id === "fuel")!;
    convert(fuel, 5 + (iteration % 20), fuel.units[0]!, fuel.units[1]!);
  });

  measure("expression evaluation", 150_000, (iteration) => {
    evaluateExpression(`12 * ${1 + (iteration % 9)}.5 + sqrt(144) - 2^10 / 8`);
  });

  const csv = buildSampleCsv(5_000);
  measure("CSV parse (5,000 rows)", 200, () => {
    parseCsv(csv);
  });

  measure("number formatting", 400_000, (iteration) => {
    formatNumber(123456.7891273 * (1 + (iteration % 13)), { digits: 6, trimTrailingZeros: true });
  });

  console.log("".padEnd(72, "-"));
  console.log("Done.");
}

main();
