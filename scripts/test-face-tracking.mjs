import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Compile the actual production volume/ICP definitions, not a rewritten JS model.
const source = readFileSync(process.argv[2] ?? new URL('../ios/App/App/CaseMediaPlugin.swift', import.meta.url), 'utf8');
function declaration(start) {
  const from = source.indexOf(start);
  if (from < 0) throw new Error(`Missing Swift declaration: ${start}`);
  let depth = 0;
  for (let i = source.indexOf('{', from); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(from, i + 1);
  }
  throw new Error(`Unclosed Swift declaration: ${start}`);
}
const head = `import Foundation\nimport CoreVideo\nimport simd\n
var diagnosticDenseSurfacePasses = 0
// Masks/meshes are not exercised here. Capture/fusion and ICP below are production code.
struct FaceMask {
  struct Reader { func contains(_ x: Float, _ y: Float) -> Bool { true } }
  func lock() -> Reader? { nil }
  func unlock() {}
}
struct FaceMesh {
  var positions: [SIMD3<Float>], colours: [SIMD3<UInt8>], triangles: [UInt32]
  func largestPiece() -> FaceMesh { self }
  mutating func smooth(iterations: Int, amount: Float) {}
  func normals() -> [SIMD3<Float>] { [] }
}
`;
const volume = declaration('final class FaceVolume {');
const surface = declaration('extension FaceVolume {').replace(/(func surface\([^\n]+\{)/, '$1\n        diagnosticDenseSurfacePasses += 1');
// The fallback reproduces today's live refresh (full surface, then downsample). It lets the
// performance regression fail on the old implementation before a repair is introduced.
const legacy = surface.includes('func trackingSurface(') ? '' : `extension FaceVolume {
  func trackingSurface(limit: Int = 25000, minWeight: Float = 3) -> [(SIMD3<Float>, SIMD3<Float>)] {
    let points = surface(minWeight: minWeight)
    guard points.count > limit else { return points }
    let step = Double(points.count) / Double(limit)
    return (0..<limit).map { points[Int(Double($0) * step)] }
  }
}`;
const tests = readFileSync(new URL('../tests/native/face-tracking.swift', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'smile-face-tracking-'));
const input = join(dir, 'main.swift'), executable = join(dir, 'test');
writeFileSync(input, [head, volume, surface, declaration('enum FaceAlign {'), declaration('extension FaceAlign {'), declaration('final class HeadTracker {'), 'extension FaceVolume.Frame { func compactCopy() -> FaceVolume.Frame? { nil } }', legacy, tests].join('\n\n'));
const compiler = spawnSync('xcrun', ['swiftc', '-O', '-module-cache-path', join(dir, 'modules'), input, '-o', executable], { encoding: 'utf8' });
if (compiler.status !== 0) {
  process.stderr.write(compiler.stderr || compiler.error?.message || 'Swift compilation failed');
  if (compiler.signal) process.stderr.write(`\nSwift compiler terminated by ${compiler.signal}\n`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(compiler.status ?? 1);
}
const result = spawnSync(executable, process.argv.slice(3), { encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.signal) process.stderr.write(`\nSwift tests terminated by ${result.signal}\n`);
rmSync(dir, { recursive: true, force: true });
process.exit(result.status ?? 1);
