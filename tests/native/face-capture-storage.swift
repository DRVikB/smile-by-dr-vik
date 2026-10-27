// Synthetic data only. Runs the extracted production Swift functions against real private temp files.
var failures = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if condition() { print("PASS \(message)") } else { failures += 1; print("FAIL \(message)") }
}
func waitUntil(_ condition: () -> Bool, seconds: Double = 8) {
    let end = Date().addingTimeInterval(seconds)
    while !condition() && Date() < end { _ = RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.02)) }
}
func imageBuffer() -> CVPixelBuffer {
    var buffer: CVPixelBuffer?
    precondition(CVPixelBufferCreate(nil, 160, 120, kCVPixelFormatType_420YpCbCr8BiPlanarFullRange, nil, &buffer) == kCVReturnSuccess)
    let image = buffer!
    CVPixelBufferLockBaseAddress(image, [])
    for plane in 0..<2 {
        memset(CVPixelBufferGetBaseAddressOfPlane(image, plane)!, plane == 0 ? 210 : 128,
               CVPixelBufferGetBytesPerRowOfPlane(image, plane) * CVPixelBufferGetHeightOfPlane(image, plane))
    }
    CVPixelBufferUnlockBaseAddress(image, [])
    return image
}

// A failed write must release the controller's in-flight photo slot exactly once.
let failedStore = PhotoShots()!
try! FileManager.default.removeItem(at: failedStore.folder)
var failureCallbacks: [Bool] = []
failedStore.add(image: imageBuffer(), depth: nil, visionOrientation: .up, maskMapping: nil, cameraToHead: matrix_identity_float4x4) { failureCallbacks.append($0) }
waitUntil({ !failureCallbacks.isEmpty })
check(failureCallbacks == [false], "photo write failure completes once with false instead of leaving capture pending")

// Freeze the real writer queue so the upstream camera buffer can be reused before encoding.
// Reflection only controls scheduling here; no production test hook or substitute encoder is used.
let photoStore = PhotoShots()!
let writer = Mirror(reflecting: photoStore).children.first(where: { $0.label == "queue" })!.value as! DispatchQueue
writer.suspend()
let sourceImage = imageBuffer()
var keptCallbacks: [Bool] = []
photoStore.add(image: sourceImage, depth: nil, visionOrientation: .up, maskMapping: nil, cameraToHead: matrix_identity_float4x4) { keptCallbacks.append($0) }
CVPixelBufferLockBaseAddress(sourceImage, [])
memset(CVPixelBufferGetBaseAddressOfPlane(sourceImage, 0)!, 10, CVPixelBufferGetBytesPerRowOfPlane(sourceImage, 0) * 120)
CVPixelBufferUnlockBaseAddress(sourceImage, [])
writer.resume()
waitUntil({ !keptCallbacks.isEmpty })
check(keptCallbacks == [true] && photoStore.shots.count == 1, "a valid photo writes once and remains available on disk")
let savedShot = photoStore.shots[0]
let decoded = CIImage(contentsOf: savedShot.image)!
var rgba = [UInt8](repeating: 0, count: 4)
CIContext().render(decoded, toBitmap: &rgba, rowBytes: 4, bounds: CGRect(x: 80, y: 60, width: 1, height: 1), format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
check(rgba[0] > 150, "retained photo contains the accepted pixels even after the camera reuses its buffer")

// An incomplete depth payload must not be read beyond its Data allocation or attached as valid depth.
let corruptDepth = photoStore.folder.appendingPathComponent("corrupt.depth")
try! Data(repeating: 0, count: 15).write(to: corruptDepth)
let corrupted = PhotoShots.Shot(id: 42, image: savedShot.image, mask: savedShot.mask, depth: corruptDepth, hasMask: false, hasDepth: true,
                                depthSize: (2, 2), cameraToHead: matrix_identity_float4x4)
let sample = photoStore.sample(corrupted)
check(sample != nil && sample!.depthDataMap == nil, "truncated depth is omitted while the readable RGB sample remains usable")
photoStore.remove()

func exportFolder(_ captures: [[String: Any]]) -> URL {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("face-export-\(UUID().uuidString)")
    try! FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    for capture in captures {
        try! FaceMesh(point: SIMD3(10, 20, 30)).ply(comment: "synthetic").write(to: folder.appendingPathComponent(capture["mesh"] as! String))
    }
    try! CaseMediaStore.writeInfo(["kind": "scan", "captures": captures], to: folder)
    return folder
}
var alignment = matrix_identity_float4x4
alignment.columns.3 = SIMD4(5, 0, 0, 1)
let outcome = IntraoralOutcome(faceFromIntraoral: alignment, fitMm: 0.2, pairs: 3, refined: true)
let folder = exportFolder([
    ["id": "rest", "mesh": "rest.ply", "sharedFitMm": 0.0],
    ["id": "smile", "mesh": "smile.ply", "registeredTo": "rest", "sharedFitMm": 0.4],
    ["id": "orphan", "mesh": "orphan.ply", "intraoralMesh": "orphan-stale.ply"],
])
let exported = IntraoralExport.save(outcome, fileName: "upper.stl", folder: folder /* reference */)!
let exports = exported["captures"] as! [[String: Any]]
let restExport = exports[0]["intraoralMesh"] as? String, smileExport = exports[1]["intraoralMesh"] as? String
check(restExport?.hasPrefix("rest-intraoral-") == true && smileExport?.hasPrefix("smile-intraoral-") == true,
      "the chosen reference and its registered shared-frame peer export in the intraoral frame")
check(exports[2]["intraoralMesh"] == nil && !FileManager.default.fileExists(atPath: folder.appendingPathComponent("orphan-intraoral-frame.ply").path),
      "an independently oriented expression is excluded instead of receiving an unrelated alignment transform")
check(smileExport.flatMap { FaceMesh.read(folder.appendingPathComponent($0)) }?.point == SIMD3(5, 20, 30),
      "intraoral export applies the inverse recorded face-from-intraoral transform")
check((exported["intraoral"] as? [String: Any])?["referenceScanId"] as? String == "smile", "alignment provenance records the actual chosen scan")

let legacy = exportFolder([["id": "rest", "mesh": "rest.ply"], ["id": "smile", "mesh": "smile.ply"]])
let legacyInfo = IntraoralExport.save(outcome, fileName: "upper.stl", folder: legacy /* reference */)!
let legacyCaptures = legacyInfo["captures"] as! [[String: Any]]
check(legacyCaptures[0]["intraoralMesh"] == nil && legacyCaptures[1]["intraoralMesh"] != nil,
      "legacy scans without shared-frame evidence preserve data but export only the selected reference")

let independentNotes = NativeReadme.readme([
    FaceScanResult(id: "rest", title: "Relaxed", sensor: "trueDepth", sharedFit: 0),
    FaceScanResult(id: "smile", title: "Smile", sensor: "lidar"),
])
check(independentNotes.contains("Independent frames:") && !independentNotes.contains("every expression is in the same frame"),
      "lab README distinguishes an independently oriented expression instead of claiming shared registration")
check(independentNotes.contains("coarse LiDAR geometry"), "lab README makes incomplete photographic reconstruction explicit")
let sharedNotes = NativeReadme.readme([
    FaceScanResult(id: "rest", title: "Relaxed", sensor: "trueDepth", sharedFit: 0),
    FaceScanResult(id: "smile", title: "Smile", sensor: "trueDepth", sharedFit: 0.4, registeredTo: "rest"),
])
check(sharedNotes.contains("Shared frame:") && !sharedNotes.contains("Independent frames:"), "valid registered expressions retain their shared-frame explanation")

// App relaunch loses the in-memory reconstruction job; real record listing must clear only stale work.
let listingFolder = FileManager.default.temporaryDirectory.appendingPathComponent("face-listing-\(UUID().uuidString)")
try! FileManager.default.createDirectory(at: listingFolder, withIntermediateDirectories: true)
let relaunchRecord = listingFolder.appendingPathComponent("record")
try! FileManager.default.createDirectory(at: relaunchRecord, withIntermediateDirectories: true)
let originalMesh = Data("unchanged original coarse geometry".utf8)
try! originalMesh.write(to: relaunchRecord.appendingPathComponent("smile.ply"))
try! CaseMediaStore.writeInfo(["kind": "scan", "id": "record", "captures": [
    ["id": "stale", "mesh": "smile.ply", "source": "lidar", "building": true, "buildSession": "previous-process"],
    ["id": "active", "mesh": "smile.ply", "source": "lidar", "building": true, "buildSession": "current-test-session"],
    ["id": "legacy", "mesh": "smile.ply", "source": "lidar", "building": true],
    ["id": "complete", "mesh": "smile.ply", "source": "photos", "building": false, "detailedStatus": "complete"],
]], to: relaunchRecord)
TestListingPath.folder = listingFolder
let listed = NativeListing.list("synthetic-case")
let listedCaptures = listed[0].1["captures"] as! [[String: Any]]
check(listedCaptures[0]["building"] as? Bool == false && listedCaptures[0]["detailedStatus"] as? String == "interrupted",
      "relaunch listing exposes interrupted reconstruction instead of a permanent building spinner")
check(listedCaptures[1]["building"] as? Bool == true && listedCaptures[1]["buildSession"] as? String == "current-test-session",
      "same-process pending reconstruction remains active during listing")
check(listedCaptures[2]["building"] as? Bool == false && listedCaptures[2]["detailedStatus"] as? String == "interrupted",
      "legacy pending records without a process claim reconcile safely")
check(listedCaptures[3]["source"] as? String == "photos" && listedCaptures[3]["detailedStatus"] as? String == "complete",
      "completed photographic reconstruction is not changed by relaunch reconciliation")
let persisted = CaseMediaStore.readInfo(relaunchRecord)!["captures"] as! [[String: Any]]
check(persisted[0]["building"] as? Bool == false && (try! Data(contentsOf: relaunchRecord.appendingPathComponent("smile.ply"))) == originalMesh,
      "interruption status survives another read while original geometry remains byte-identical")

let pendingAlignment = exportFolder([["id": "smile", "mesh": "smile.ply", "building": true]])
check(IntraoralExport.save(outcome, fileName: "upper.stl", folder: pendingAlignment /* reference */) == nil,
      "native export refuses a new alignment while reconstructed geometry is still pending")

let detailedFolder = exportFolder([
    ["id": "smile", "mesh": "smile.ply", "source": "lidar", "building": true, "buildSession": "current-test-session", "intraoralMesh": "smile-old-intraoral.ply"],
    ["id": "rest", "mesh": "rest.ply", "source": "trueDepth", "intraoralMesh": "rest-old-intraoral.ply", "intraoralModel": "rest-old-intraoral.obj"],
])
let oldDerivative = Data("old alignment geometry, private history".utf8)
try! oldDerivative.write(to: detailedFolder.appendingPathComponent("smile-old-intraoral.ply"))
var detailedInfo = CaseMediaStore.readInfo(detailedFolder)!
detailedInfo["intraoral"] = ["file": "upper.stl", "fitMm": 0.2, "referenceScanId": "smile"]
try! CaseMediaStore.writeInfo(detailedInfo, to: detailedFolder)
try! JSONSerialization.data(withJSONObject: ["scans": ["smile": ["builtFrom": "LiDAR"]], "intraoralRegistration": ["intraoralFile": "upper.stl"]])
    .write(to: detailedFolder.appendingPathComponent("landmarks.json"))
TestDetailedPath.folder = detailedFolder
let syntheticTexture = CIContext().createCGImage(CIImage(color: CIColor(red: 0.7, green: 0.6, blue: 0.5)).cropped(to: CGRect(x: 0, y: 0, width: 4, height: 4)), from: CGRect(x: 0, y: 0, width: 4, height: 4))!
let replaced = NativeDetailed.applyDetailed(TexturedFace(texture: syntheticTexture), caseId: "fixture", recordId: "record", scanId: "smile", title: "Smile")!.1
let replacedCaptures = replaced["captures"] as! [[String: Any]]
check(replaced["intraoral"] == nil && replaced["intraoralStatus"] as? String == "registrationRequired",
      "successful geometry replacement retires an existing coarse intraoral alignment")
check(replacedCaptures.allSatisfy { $0["intraoralMesh"] == nil && $0["intraoralModel"] == nil },
      "all stale aligned-file links are removed from the active share metadata")
check(replaced["previousIntraoralRegistration"] != nil && (try! Data(contentsOf: detailedFolder.appendingPathComponent("smile-old-intraoral.ply"))) == oldDerivative,
      "retired registration metadata and derived geometry remain private history")
let detailedLandmarks = try! JSONSerialization.jsonObject(with: Data(contentsOf: detailedFolder.appendingPathComponent("landmarks.json"))) as! [String: Any]
check(detailedLandmarks["intraoralRegistration"] == nil && detailedLandmarks["intraoralStatus"] as? String == "registrationRequired",
      "the lab sidecar no longer presents the retired coarse registration as current")
check(replacedCaptures[0]["source"] as? String == "photos" && replacedCaptures[0]["mesh"] as? String == "smile-detailed.ply"
      && (try! Data(contentsOf: detailedFolder.appendingPathComponent("smile.ply"))) == FaceMesh(point: SIMD3(10, 20, 30)).ply(comment: "fixture"),
      "detailed output becomes active without overwriting the original coarse geometry")
let reRegistered = IntraoralExport.save(outcome, fileName: "upper.stl", folder: detailedFolder /* reference */)!
let firstRegistrationFile = (reRegistered["captures"] as! [[String: Any]])[0]["intraoralMesh"] as! String
let finalSidecar = try! JSONSerialization.jsonObject(with: Data(contentsOf: detailedFolder.appendingPathComponent("landmarks.json"))) as! [String: Any]
check(reRegistered["intraoralStatus"] == nil && finalSidecar["intraoralStatus"] == nil && finalSidecar["intraoralRegistration"] != nil,
      "manual registration of the completed geometry clears the re-registration-needed state in record and lab sidecar")
let secondRegistration = IntraoralExport.save(outcome, fileName: "upper.stl", folder: detailedFolder /* reference */)!
let secondRegistrationFile = (secondRegistration["captures"] as! [[String: Any]])[0]["intraoralMesh"] as! String
check(firstRegistrationFile != secondRegistrationFile && FileManager.default.fileExists(atPath: detailedFolder.appendingPathComponent(firstRegistrationFile).path),
      "a later registration uses a new derivative filename and retains the earlier private geometry")
try? FileManager.default.removeItem(at: folder)
try? FileManager.default.removeItem(at: legacy)
try? FileManager.default.removeItem(at: listingFolder)
try? FileManager.default.removeItem(at: pendingAlignment)
try? FileManager.default.removeItem(at: detailedFolder)
print("RESULT failures=\(failures)")
exit(failures == 0 ? 0 : 1)
