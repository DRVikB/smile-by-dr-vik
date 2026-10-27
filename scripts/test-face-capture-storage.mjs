import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the production native photo persistence and export functions with synthetic data.
const source = readFileSync(new URL('../ios/App/App/CaseMediaPlugin.swift', import.meta.url), 'utf8');
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
const head = `import Foundation
import CoreVideo
import CoreImage
import Vision
import RealityKit
import ImageIO
import simd

// Native iOS bridge/mesh rendering is unavailable in a Mac executable. Only those dependencies
// are replaced; the photo writer, real CoreImage codec and disk exporter are production code.
enum CaseMediaStore {
  static let iso = ISO8601DateFormatter()
  static func recordFolder(_ caseId: String, _ recordId: String) -> URL? { TestDetailedPath.folder }
  static func readInfo(_ folder: URL) -> [String: Any]? {
    guard let data = try? Data(contentsOf: folder.appendingPathComponent("info.json")) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }
  static func file(_ name: Any?, in folder: URL) -> URL? {
    guard let name = name as? String, !name.isEmpty, !name.contains("/"), !name.contains("..") else { return nil }
    let url = folder.appendingPathComponent(name)
    return FileManager.default.fileExists(atPath: url.path) ? url : nil
  }
  static func write(_ data: Data, to url: URL) throws { try data.write(to: url, options: .atomic) }
  static func writeInfo(_ value: [String: Any], to folder: URL) throws {
    try write(try JSONSerialization.data(withJSONObject: value), to: folder.appendingPathComponent("info.json"))
  }
}
struct FaceMesh {
  var point: SIMD3<Float>
  var positions: [SIMD3<Float>] { [point] }
  var triangles: [UInt32] { [0, 0, 0] }
  static func read(_ url: URL) -> FaceMesh? {
    guard let data = try? Data(contentsOf: url), let values = try? JSONDecoder().decode([Float].self, from: data), values.count == 3 else { return nil }
    return FaceMesh(point: SIMD3(values[0], values[1], values[2]))
  }
  func transformed(_ transform: simd_float4x4) -> FaceMesh {
    let p = transform * SIMD4(point, 1)
    return FaceMesh(point: SIMD3(p.x, p.y, p.z))
  }
  func ply(comment: String) -> Data { try! JSONEncoder().encode([point.x, point.y, point.z]) }
}
struct UIImage {
  let image: CGImage
  init(cgImage: CGImage) { image = cgImage }
  func jpegData(compressionQuality: CGFloat) -> Data? {
    CIContext().jpegRepresentation(of: CIImage(cgImage: image), colorSpace: CGColorSpaceCreateDeviceRGB(),
      options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: compressionQuality])
  }
}
struct TexturedFace {
  let texture: CGImage
  func faceMesh() -> FaceMesh { FaceMesh(point: SIMD3(11, 22, 33)) }
  func obj(name: String, comment: String) -> (obj: Data, mtl: Data) {
    (Data("o synthetic-reconstruction".utf8), Data("newmtl synthetic".utf8))
  }
  func preview() -> UIImage? { nil }
}
enum TestDetailedPath { static var folder: URL? }
struct TestOrientation { var midlineTilt: Float }
struct FaceScanResult {
  var id: String, title: String, sensor: String
  var sharedFit: Float? = nil
  var registeredTo: String? = nil
  var scaleCorrection: Float = 1
  var orientation: TestOrientation? = nil
  var eyes: (left: SIMD3<Float>, right: SIMD3<Float>)? = nil
  var textured: Int? = nil
}
enum BackgroundFaceBuilder { static let sessionID = "current-test-session" }
enum TestListingPath { static var folder: URL? }
`;
const tests = readFileSync(new URL('../tests/native/face-capture-storage.swift', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'smile-face-capture-storage-'));
const input = join(dir, 'main.swift'), executable = join(dir, 'test');
const testsForCurrentAPI = source.includes('referenceScanId: String?') ? tests.replaceAll('/* reference */', ', referenceScanId: "smile"') : tests.replaceAll('/* reference */', '');
const frames = source.includes('enum FaceScanFrames {') ? declaration('enum FaceScanFrames {') : '';
const buildState = source.includes('enum FaceScanBuildState {') ? declaration('enum FaceScanBuildState {') : '';
const readme = `enum NativeReadme { ${declaration('static func readme(_ scans: [FaceScanResult])')} }`;
const detailed = `enum NativeDetailed { ${declaration('static func applyDetailed(_ face: TexturedFace?')} }`;
const pluginHelpers = `enum CaseMediaPlugin { ${declaration('static func slug(_ text: String)')} }`;
const listing = `enum NativeListing {
  static func caseFolder(_ caseId: String) -> URL? { TestListingPath.folder }
  static func readInfo(_ folder: URL) -> [String: Any]? { CaseMediaStore.readInfo(folder) }
  static func writeInfo(_ info: [String: Any], to folder: URL) throws { try CaseMediaStore.writeInfo(info, to: folder) }
  ${declaration('static func list(_ caseId: String)')}
}`;
writeFileSync(input, [head, pluginHelpers, declaration('final class PhotoShots {'), declaration('enum PixelCopy {'), frames, buildState, readme, listing, detailed, declaration('struct IntraoralOutcome {'), declaration('enum IntraoralExport {'), testsForCurrentAPI].join('\n\n'));
const compiler = spawnSync('xcrun', ['swiftc', '-O', '-module-cache-path', join(dir, 'modules'), input, '-o', executable], { encoding: 'utf8' });
if (compiler.status !== 0) { process.stderr.write(compiler.stderr || compiler.error?.message || 'Swift compilation failed'); process.exit(compiler.status ?? 1); }
const result = spawnSync(executable, { encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
