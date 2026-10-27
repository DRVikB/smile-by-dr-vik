// Synthetic calibrated RGB-D input; no patient data. Executed against extracted native definitions.
var failures = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if condition() { print("PASS \(message)") } else { failures += 1; print("FAIL \(message)") }
}
func pixelBuffer(_ width: Int, _ height: Int, _ format: OSType) -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    let status = CVPixelBufferCreate(nil, width, height, format, nil, &buffer)
    precondition(status == kCVReturnSuccess && buffer != nil)
    return buffer!
}
func fixtureFrame(offset: Float = 0) -> FaceVolume.Frame {
    let w = 256, h = 320
    let depth = pixelBuffer(w, h, kCVPixelFormatType_DepthFloat32)
    let image = pixelBuffer(w, h, kCVPixelFormatType_420YpCbCr8BiPlanarFullRange)
    CVPixelBufferLockBaseAddress(depth, [])
    let data = CVPixelBufferGetBaseAddress(depth)!.assumingMemoryBound(to: Float.self)
    let row = CVPixelBufferGetBytesPerRow(depth) / 4
    for v in 0..<h { for u in 0..<w {
        let x = (Float(u) - 128) / 680 * 0.45
        let y = -(Float(v) - 160) / 680 * 0.45
        // Curved forehead/cheeks plus asymmetric nose detail; stable non-planar ICP fixture.
        let bulge = 0.026 * expf(-(x*x / 0.0002 + (y - 0.008)*(y - 0.008) / 0.001))
        let curve = 0.065 * (x*x / 0.007 + y*y / 0.02)
        data[v * row + u] = 0.45 + curve - bulge + offset
    } }
    CVPixelBufferUnlockBaseAddress(depth, [])
    CVPixelBufferLockBaseAddress(image, [])
    for plane in 0..<2 {
        memset(CVPixelBufferGetBaseAddressOfPlane(image, plane)!, plane == 0 ? 175 : 128,
               CVPixelBufferGetBytesPerRowOfPlane(image, plane) * CVPixelBufferGetHeightOfPlane(image, plane))
    }
    CVPixelBufferUnlockBaseAddress(image, [])
    let K = simd_float3x3(columns: (SIMD3(680, 0, 0), SIMD3(0, 680, 0), SIMD3(128, 160, 1)))
    var pose = matrix_identity_float4x4
    pose.columns.3 = SIMD4(0, 0, 0.56, 1)
    return FaceVolume.Frame(depth: depth, image: image, depthK: K, imageK: K, cameraToHead: pose,
                            cameraInHead: SIMD3(0, 0, 0.56), stride: 1)
}
let volume = FaceVolume(voxel: 0.001, lo: FaceVolume.frontLo, hi: FaceVolume.frontHi)
let frame = fixtureFrame()
let integrationStart = ProcessInfo.processInfo.systemUptime
for _ in 0..<8 { volume.integrate(frame) }
print(String(format: "METRIC integration_mean_ms=%.3f", (ProcessInfo.processInfo.systemUptime - integrationStart) * 1000 / 8))
if CommandLine.arguments.contains("--integration-only") { exit(0) }
let dense = volume.surface()
diagnosticDenseSurfacePasses = 0
let sampled = volume.trackingSurface()
check(diagnosticDenseSurfacePasses == 0, "live target does not walk the full dense volume")
check(volume.frames == 8, "real integration accepted eight calibrated depth frames")
check(dense.count > 2000 && sampled.count > 2000, "measured surface has enough tracking support")
check(sampled.count <= 25000, "tracking target is bounded at 25,000 points")
let denseGrid = FaceAlign.Grid(dense.map(\.0), cell: 2)
var maxGap: Float = 0, minDot: Float = 1
for (point, normal) in sampled {
    guard let (index, gap) = denseGrid.nearest(point, within: 1) else { maxGap = 999; continue }
    maxGap = max(maxGap, gap)
    minDot = min(minDot, simd_dot(normal, dense[index].1))
}
check(maxGap < 0.0001 && minDot > 0.9999, "every tracking point/normal is an actual fused TSDF zero crossing")
print("METRIC dense_points=\(dense.count) tracking_points=\(sampled.count) max_surface_gap_mm=\(maxGap) min_normal_dot=\(minDot)")
let grid = FaceAlign.Grid(sampled.map(\.0), cell: 10)
let points = sampled.enumerated().filter { $0.offset % 4 == 0 }.map { $0.element.0 + SIMD3<Float>(1.2, -0.8, 1.7) }
if let fit = FaceAlign.track(points, grid: grid, normals: sampled.map(\.1), reach: 9) {
    let position = SIMD3(fit.transform.columns.3.x, fit.transform.columns.3.y, fit.transform.columns.3.z)
    let error = simd_length(position - SIMD3(-1.2, 0.8, -1.7))
    check(error < 0.25 && fit.rms < 0.1 && fit.overlap > 0.95, "existing ICP recovers known translation within 0.25 mm")
    print("METRIC translation_error_mm=\(error) rms_mm=\(fit.rms) overlap=\(fit.overlap)")
} else { check(false, "existing ICP fits synthetic geometry") }
var benchmarkSink: Float = 0
@inline(never) func measure(_ body: () -> [(SIMD3<Float>, SIMD3<Float>)]) -> Double {
    let start = ProcessInfo.processInfo.systemUptime
    let values = body()
    precondition(values.count > 2000)
    benchmarkSink += values.reduce(Float(0)) { $0 + $1.0.z + $1.1.z }
    return (ProcessInfo.processInfo.systemUptime - start) * 1000
}
var denseTimes: [Double] = [], trackingTimes: [Double] = []
for i in 0..<7 {
    if i % 2 == 0 {
        denseTimes.append(measure { volume.surface() })
        trackingTimes.append(measure { volume.trackingSurface() })
    } else {
        trackingTimes.append(measure { volume.trackingSurface() })
        denseTimes.append(measure { volume.surface() })
    }
}
let denseMS = denseTimes.sorted()[3], trackingMS = trackingTimes.sorted()[3]
print(String(format: "METRIC dense_median_ms=%.3f tracking_median_ms=%.3f ratio=%.3f", denseMS, trackingMS, trackingMS / denseMS))
check(trackingMS < denseMS * 0.65, "live target extraction avoids dense-volume cost (less than 65% of dense extraction)")
print("METRIC benchmark_sink=\(benchmarkSink)")
check(volume.trackingSurface(limit: 1000).count <= 1000, "custom smaller target remains bounded")
check(volume.trackingSurface(limit: 0).isEmpty && volume.trackingSurface(limit: -1).isEmpty, "non-positive target limits return no points")
for voxel: Float in [0.001, 0.0012, 0.0016] {
    let trackedVolume = FaceVolume(voxel: voxel, lo: voxel < 0.0016 ? FaceVolume.frontLo : FaceVolume.headLo,
                                   hi: voxel < 0.0016 ? FaceVolume.frontHi : FaceVolume.headHi)
    let tracker = HeadTracker()
    diagnosticDenseSurfacePasses = 0
    for _ in 0..<16 {
        check(tracker.process(frame, guess: frame.cameraToHead, volume: trackedVolume) == .accepted,
              "stable depth frame accepted at \(voxel * 1000) mm voxel size")
    }
    var shiftedGuess = frame.cameraToHead
    shiftedGuess.columns.3.x += 0.002
    check(tracker.process(frame, guess: shiftedGuess, volume: trackedVolume) == .accepted,
          "small pose error tracks at \(voxel * 1000) mm voxel size")
    check(abs(tracker.correction.columns.3.x + 0.002) < 0.00025,
          "measured target corrects the known 2 mm pose error")
    check(diagnosticDenseSurfacePasses == 0, "real HeadTracker refresh never extracts dense surface")
    check(tracker.accepted == 17 && tracker.rejected == 0, "live tracker preserves accepted/rejected counters")
    print("METRIC voxel_mm=\(voxel * 1000) accepted=\(tracker.accepted) rms_mm=\(tracker.quality.rms)")
}
let empty = FaceVolume(voxel: 0.001)
check(empty.trackingSurface().isEmpty, "unobserved volume produces no invented target")
let weak = FaceVolume(voxel: 0.001, lo: FaceVolume.frontLo, hi: FaceVolume.frontHi)
weak.integrate(frame)
check(weak.trackingSurface(minWeight: 60).isEmpty, "insufficient measured support is rejected")
print("RESULT failures=\(failures)")
exit(failures == 0 ? 0 : 1)
