import Foundation
import UIKit
import AVFoundation
import ARKit
import SceneKit
import Metal
import Vision
import CoreImage
import ModelIO
import RealityKit
import Capacitor
import AVKit
import AudioToolbox
import UniformTypeIdentifiers

/// The speech video and the 3D face scan for a case's photo set (admin-only previews in the app for now).
///
/// Both are recorded here and kept in the app's private Application Support folder on this device, one folder
/// per record. They are never synced; the web layer lists them, shows them through the bridge's file URLs, and
/// they leave the device only through the share sheet when the clinician chooses.
@objc(CaseMediaPlugin)
public class CaseMediaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CaseMediaPlugin"
    public let jsName = "SmileCaseMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recordSpeech", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanFace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "faceScanAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFrame", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "alignIntraoral", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeCase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeAll", returnType: CAPPluginReturnPromise)
    ]

    private var open = false
    private var picker: DocumentPickerHandler?
    private let work = DispatchQueue(label: "uk.co.drvik.smilecompose.casemedia", qos: .userInitiated)

    /// The record as the web layer reads it: its info, plus its folder's URL through the bridge.
    private func publish(_ folder: URL, _ info: [String: Any]) -> [String: Any] {
        var out = info
        out["base"] = bridge?.portablePath(fromLocalURL: folder)?.absoluteString ?? ""
        return out
    }

    /// The detailed face built in the background (see BackgroundFaceBuilder) reaches the web layer as events.
    override public func load() {
        BackgroundFaceBuilder.shared.onUpdate = { [weak self] caseId, folder, info in
            guard let self else { return }
            self.notifyListeners("scanUpdated", data: ["caseId": caseId, "record": self.publish(folder, info)])
        }
        BackgroundFaceBuilder.shared.onProgress = { [weak self] caseId, recordId, scanId, fraction in
            self?.notifyListeners("scanProgress", data: ["caseId": caseId, "id": recordId, "scan": scanId, "progress": fraction])
        }
    }

    private func image(_ base64: String?) -> UIImage? { base64.flatMap { Data(base64Encoded: $0) }.flatMap { UIImage(data: $0) } }

    @objc func recordSpeech(_ call: CAPPluginCall) {
        guard let caseId = call.getString("caseId"), CaseMediaStore.caseFolder(caseId) != nil else { call.reject("No case was given."); return }
        let steps = (call.getArray("steps") as? [[String: Any]] ?? []).compactMap(SpeechStep.init(json:))
        guard !steps.isEmpty else { call.reject("No steps were given."); return }
        let tail = call.getDouble("tail") ?? 0.6
        let guide = image(call.getString("guide"))
        DispatchQueue.main.async {
            guard !self.open, let presenter = self.bridge?.viewController else { call.reject("The camera is already open."); return }
            self.open = true
            AVCaptureDevice.requestAccess(for: .video) { granted in
                guard granted else {
                    DispatchQueue.main.async { self.open = false; call.reject("Camera access is turned off.", "camera_denied") }
                    return
                }
                // Without the microphone the video is still recorded, silently.
                AVCaptureDevice.requestAccess(for: .audio) { sound in
                    DispatchQueue.main.async {
                        let camera = SpeechCameraViewController(steps: steps, tail: tail, guide: guide, sound: sound) { outcome in
                            switch outcome {
                            case .cancelled:
                                self.open = false
                                call.resolve(["cancelled": true])
                            case .failed(let message):
                                self.open = false
                                call.reject(message)
                            case .recorded(let take):
                                self.work.async {
                                    let saved = try? SpeechStore.save(take, caseId: caseId, steps: steps)
                                    DispatchQueue.main.async {
                                        self.open = false
                                        if let saved { call.resolve(["cancelled": false, "record": self.publish(saved.0, saved.1)]) }
                                        else { call.reject("The video couldn’t be saved.") }
                                    }
                                }
                            }
                        }
                        camera.modalPresentationStyle = .fullScreen
                        presenter.present(camera, animated: true)
                    }
                }
            }
        }
    }

    @objc func scanFace(_ call: CAPPluginCall) {
        guard LidarScanner.available || ARFaceTrackingConfiguration.isSupported else { call.reject("This needs the Face ID sensor or the LiDAR scanner.", "unsupported"); return }
        guard let caseId = call.getString("caseId"), CaseMediaStore.caseFolder(caseId) != nil else { call.reject("No case was given."); return }
        let captures = (call.getArray("captures") as? [[String: Any]] ?? []).compactMap(FaceCaptureSpec.init(json:))
        guard !captures.isEmpty else { call.reject("No scans were given."); return }
        let guide = image(call.getString("guide"))
        DispatchQueue.main.async {
            guard !self.open, let presenter = self.bridge?.viewController else { call.reject("The camera is already open."); return }
            self.open = true
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    guard granted else { self.open = false; call.reject("Camera access is turned off.", "camera_denied"); return }
                    let scanner = FaceScanViewController(captures: captures, guide: guide) { scans in
                        guard !scans.isEmpty else { self.open = false; call.resolve(["cancelled": true]); return }
                        self.work.async {
                            let saved = try? FaceScanStore.save(scans, caseId: caseId)
                            if let saved, let recordId = saved.1["id"] as? String {
                                for scan in scans where scan.buildLater { if let shots = scan.shots {
                                    // The detailed face is lined up on the scan as it came off the sensor, then turned like the saved one.
                                    let unturned = scan.unrotated ?? scan.exportFromScan.map { scan.mesh.transformed($0.inverse) } ?? scan.mesh
                                    BackgroundFaceBuilder.shared.enqueue(.init(caseId: caseId, recordId: recordId, scanId: scan.id, title: scan.title, shots: shots, lidar: unturned, orientation: scan.exportFromScan))
                                } }
                            } else { scans.forEach { $0.shots?.remove() } }
                            DispatchQueue.main.async {
                                self.open = false
                                if let saved { call.resolve(["cancelled": false, "record": self.publish(saved.0, saved.1)]) }
                                else { call.reject("The face scan couldn’t be saved.") }
                            }
                        }
                    }
                    scanner.modalPresentationStyle = .fullScreen
                    presenter.present(scanner, animated: true)
                }
            }
        }
    }

    @objc func faceScanAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": LidarScanner.available || ARFaceTrackingConfiguration.isSupported])
    }

    @objc func list(_ call: CAPPluginCall) {
        guard let caseId = call.getString("caseId") else { call.resolve(["records": []]); return }
        work.async {
            call.resolve(["records": CaseMediaStore.list(caseId).map { self.publish($0.0, $0.1) }])
        }
    }

    /// Moves a speech step's still frame to another moment in the video.
    @objc func setFrame(_ call: CAPPluginCall) {
        guard let caseId = call.getString("caseId"), let id = call.getString("id"), let step = call.getString("step"),
              let time = call.getDouble("time"), let folder = CaseMediaStore.recordFolder(caseId, id) else { call.reject("No video was given."); return }
        work.async {
            guard var info = CaseMediaStore.readInfo(folder), let video = CaseMediaStore.file(info["video"], in: folder),
                  var steps = info["steps"] as? [[String: Any]], let i = steps.firstIndex(where: { $0["id"] as? String == step }) else {
                call.reject("That video isn’t on this device.")
                return
            }
            do {
                let (name, at) = try SpeechFrames.grab(video, at: time, duration: info["duration"] as? Double ?? time + 1, step: step, in: folder)
                let old = steps[i]["frame"] as? String
                if let oldURL = CaseMediaStore.file(old, in: folder), oldURL.lastPathComponent != name { try? FileManager.default.removeItem(at: oldURL) }
                steps[i]["frame"] = name
                steps[i]["frameTime"] = at
                info["steps"] = steps
                if info["poster"] as? String == old { info["poster"] = name }
                try CaseMediaStore.writeInfo(info, to: folder)
                call.resolve(["record": self.publish(folder, info)])
            } catch {
                call.reject("That frame couldn’t be saved.")
            }
        }
    }

    /// The iOS share sheet with the record's files under names a lab can read, and the notes from the web layer.
    @objc func share(_ call: CAPPluginCall) {
        guard let caseId = call.getString("caseId"), let id = call.getString("id"), let folder = CaseMediaStore.recordFolder(caseId, id),
              let info = CaseMediaStore.readInfo(folder) else { call.reject("That record isn’t on this device."); return }
        let notes = call.getString("notes") ?? ""
        work.async {
            let out = FileManager.default.temporaryDirectory.appendingPathComponent("case-media-share", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true)
            var files: [URL] = []
            let add = { (name: Any?, label: String) in
                guard let source = CaseMediaStore.file(name, in: folder) else { return }
                let target = out.appendingPathComponent(label)
                if (try? FileManager.default.linkItem(at: source, to: target)) != nil || (try? FileManager.default.copyItem(at: source, to: target)) != nil { files.append(target) }
            }
            do {
                try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
                if info["kind"] as? String == "speech" {
                    add(info["video"], "speech-video.mov")
                    for (n, step) in (info["steps"] as? [[String: Any]] ?? []).enumerated() {
                        add(step["frame"], "frame-\(n + 1)-\(Self.slug(step["title"] as? String ?? step["id"] as? String ?? "step")).jpg")
                    }
                } else {
                    for capture in info["captures"] as? [[String: Any]] ?? [] {
                        let label = Self.slug(capture["title"] as? String ?? capture["id"] as? String ?? "scan")
                        add(capture["mesh"], "face-scan-\(label).ply")
                        add(capture["asScanned"], "face-scan-\(label)-as-scanned.ply")
                        add(capture["intraoralMesh"], "face-scan-\(label)-intraoral-frame.ply")
                        if let m = capture["model"] as? String, !m.isEmpty {
                            // The OBJ names its material and texture, so they keep their names.
                            add(m, m); add(capture["modelMaterial"], capture["modelMaterial"] as? String ?? ""); add(capture["modelTexture"], capture["modelTexture"] as? String ?? "")
                        } else {
                            add(capture["preview"], "face-scan-\(label).jpg")
                        }
                    }
                    add(info["landmarks"], "landmarks.json")
                    add(info["readme"], "README.txt")
                }
                if !notes.isEmpty, let data = notes.data(using: .utf8) {
                    let target = out.appendingPathComponent("lab-notes.txt")
                    try data.write(to: target)
                    files.append(target)
                }
            } catch {}
            DispatchQueue.main.async {
                guard !files.isEmpty, let presenter = self.bridge?.viewController else {
                    try? FileManager.default.removeItem(at: out)
                    call.reject("There’s nothing to share.")
                    return
                }
                let sheet = UIActivityViewController(activityItems: files, applicationActivities: nil)
                if let popover = sheet.popoverPresentationController {
                    popover.sourceView = presenter.view
                    popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                    popover.permittedArrowDirections = []
                }
                // The copies are removed once the sheet closes.
                sheet.completionWithItemsHandler = { _, completed, _, _ in
                    try? FileManager.default.removeItem(at: out)
                    call.resolve(["shared": completed])
                }
                presenter.present(sheet, animated: true)
            }
        }
    }

    static func slug(_ text: String) -> String {
        let s = text.lowercased().unicodeScalars.map { $0.isASCII && CharacterSet.alphanumerics.contains($0) ? String($0) : "-" }.joined()
        let collapsed = s.split(separator: "-").joined(separator: "-")
        return collapsed.isEmpty ? "file" : collapsed
    }

    /// All the case's face scans in 3D, starting at record `id`; `compare` opens with one laid over another.
    @objc func openScan(_ call: CAPPluginCall) {
        guard let caseId = call.getString("caseId"), let id = call.getString("id") else { call.reject("That scan isn’t on this device."); return }
        let compare = call.getBool("compare") ?? false
        let day = DateFormatter()
        day.dateFormat = "d MMM, HH:mm"
        var entries: [FaceScanViewerViewController.Entry] = [], focus = 0
        // Oldest first, so a later visit reads as laid over an earlier one.
        for (folder, info) in CaseMediaStore.list(caseId).reversed() where info["kind"] as? String == "scan" {
            let when = (info["createdAt"] as? String).flatMap { CaseMediaStore.iso.date(from: $0) }.map { day.string(from: $0) } ?? ""
            if info["id"] as? String == id { focus = entries.count }
            for capture in info["captures"] as? [[String: Any]] ?? [] {
                if let url = CaseMediaStore.file(capture["mesh"], in: folder) {
                    let obj = CaseMediaStore.file(capture["model"], in: folder), tex = CaseMediaStore.file(capture["modelTexture"], in: folder)
                    let eyeList = (capture["eyes"] as? [[Double]] ?? []).map { SIMD3<Float>(Float($0.first ?? 0), Float($0.count > 1 ? $0[1] : 0), Float($0.count > 2 ? $0[2] : 0)) }
                    let plane = (capture["midlinePlane"] as? [Double]).flatMap { $0.count == 4 ? SIMD4<Float>(Float($0[0]), Float($0[1]), Float($0[2]), Float($0[3])) : nil }
                    entries.append(.init(title: "\(when) · \(capture["title"] as? String ?? "Scan")", url: url, model: obj.flatMap { o in tex.map { (o, $0) } },
                                         eyes: eyeList.count == 2 ? (eyeList[0], eyeList[1]) : nil, oriented: capture["oriented"] as? Bool ?? false,
                                         midlinePlane: plane, midlineTilt: (capture["midlineTilt"] as? Double).map(Float.init)))
                }
            }
        }
        guard !entries.isEmpty else { call.reject("That scan isn’t on this device."); return }
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else { call.reject("The scan couldn’t be opened."); return }
            let viewer = FaceScanViewerViewController(entries: entries, focus: focus, compare: compare) { call.resolve() }
            viewer.modalPresentationStyle = .fullScreen
            presenter.present(viewer, animated: true)
        }
    }

    /// Lines the face scans up with the intraoral scan: the clinician picks the maxillary scan file, taps the same
    /// three points on it and on the smile scan's teeth (or on a bite fork's flag), and ICP on the front teeth does the
    /// rest. Every scan of the visit is then also saved in the intraoral scan's own frame.
    @objc func alignIntraoral(_ call: CAPPluginCall) {
        guard let caseId = call.getString("caseId"), let id = call.getString("id"), let folder = CaseMediaStore.recordFolder(caseId, id),
              let info = CaseMediaStore.readInfo(folder), let captures = info["captures"] as? [[String: Any]] else { call.reject("That scan isn’t on this device."); return }
        guard !captures.contains(where: { $0["building"] as? Bool == true }) else {
            call.reject("Wait for the detailed face to finish before lining it up with the intraoral scan.", "scan_build_pending")
            return
        }
        let pick = captures.first(where: { $0["id"] as? String == "retracted" }) ?? captures.first(where: { $0["id"] as? String == "smile" }) ?? captures.first
        guard let pick, let faceURL = CaseMediaStore.file(pick["mesh"], in: folder) else { call.reject("That scan has no face to line up."); return }
        let obj = CaseMediaStore.file(pick["model"], in: folder), tex = CaseMediaStore.file(pick["modelTexture"], in: folder)
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else { call.reject("The scan couldn’t be opened."); return }
            let types = ["stl", "ply", "obj"].compactMap { UTType(filenameExtension: $0) }
            let documentPicker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
            let handler = DocumentPickerHandler { url in
                self.picker = nil
                guard let url else { call.resolve(["cancelled": true]); return }
                self.work.async {
                    let ios = MeshImport.read(url)
                    let face = FaceMesh.read(faceURL)
                    let skin = obj.flatMap { o in tex.flatMap { TexturedFace.read(obj: o, texture: $0) } }
                    try? FileManager.default.removeItem(at: url)
                    DispatchQueue.main.async {
                        guard let ios, let face else { call.reject(ios == nil ? "That file couldn’t be read as a 3D scan (STL, PLY or OBJ)." : "The face scan couldn’t be opened."); return }
                        let aligner = IntraoralAlignViewController(face: face, skin: skin, intraoral: ios, title: pick["title"] as? String ?? "Wide smile") { outcome in
                            guard let outcome else { call.resolve(["cancelled": true]); return }
                            self.work.async {
                                guard let saved = IntraoralExport.save(outcome, fileName: url.lastPathComponent, folder: folder, referenceScanId: pick["id"] as? String) else { call.reject("The lined-up scans couldn’t be saved."); return }
                                call.resolve(["cancelled": false, "record": self.publish(folder, saved)])
                            }
                        }
                        aligner.modalPresentationStyle = .fullScreen
                        presenter.present(aligner, animated: true)
                    }
                }
            }
            self.picker = handler
            documentPicker.delegate = handler
            presenter.present(documentPicker, animated: true)
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        if let caseId = call.getString("caseId"), let id = call.getString("id"), let folder = CaseMediaStore.recordFolder(caseId, id) {
            BackgroundFaceBuilder.shared.cancel(caseId: caseId, recordId: id)
            try? FileManager.default.removeItem(at: folder)
        }
        call.resolve()
    }

    @objc func removeCase(_ call: CAPPluginCall) {
        if let caseId = call.getString("caseId"), let folder = CaseMediaStore.caseFolder(caseId) {
            BackgroundFaceBuilder.shared.cancel(caseId: caseId)
            try? FileManager.default.removeItem(at: folder)
        }
        call.resolve()
    }

    @objc func removeAll(_ call: CAPPluginCall) {
        BackgroundFaceBuilder.shared.cancel()
        try? FileManager.default.removeItem(at: CaseMediaStore.root)
        call.resolve()
    }
}


// MARK: - Storage

enum CaseMediaStore {
    static var root: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("case-media", isDirectory: true)
    }

    /// A folder name from an id: ASCII letters, digits, - and _ only.
    static func folderName(_ id: String) -> String? {
        let cleaned = String(String.UnicodeScalarView(id.unicodeScalars.map { ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "-" || $0 == "_" ? $0 : "_" }))
        return cleaned.isEmpty || cleaned.count > 100 ? nil : cleaned
    }
    static func caseFolder(_ caseId: String) -> URL? { folderName(caseId).map { root.appendingPathComponent($0, isDirectory: true) } }
    static func recordFolder(_ caseId: String, _ id: String) -> URL? {
        guard let c = caseFolder(caseId), let r = folderName(id) else { return nil }
        return c.appendingPathComponent(r, isDirectory: true)
    }

    static func newRecord(_ caseId: String, kind: String) throws -> (String, URL) {
        let id = "\(kind)-\(Int(Date().timeIntervalSince1970 * 1000))"
        guard let folder = recordFolder(caseId, id) else { throw CocoaError(.fileWriteInvalidFileName) }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        return (id, folder)
    }

    static func write(_ data: Data, to url: URL) throws { try data.write(to: url, options: [.atomic, .completeFileProtection]) }
    static func writeInfo(_ info: [String: Any], to folder: URL) throws {
        try write(try JSONSerialization.data(withJSONObject: info, options: [.prettyPrinted, .sortedKeys]), to: folder.appendingPathComponent("info.json"))
    }
    static func readInfo(_ folder: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: folder.appendingPathComponent("info.json")) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    static func list(_ caseId: String) -> [(URL, [String: Any])] {
        guard let folder = caseFolder(caseId), let items = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return [] }
        return items.compactMap { url -> (URL, [String: Any])? in
            guard let info = readInfo(url) else { return nil }
            if let reconciled = FaceScanBuildState.reconcile(info, sessionID: BackgroundFaceBuilder.sessionID) {
                // A killed process cannot resume its in-memory photo job. Keep the original scan and make the
                // interruption visible on this and subsequent opens instead of leaving a permanent spinner.
                try? writeInfo(reconciled, to: url)
                return (url, reconciled)
            }
            return (url, info)
        }
            .sorted { ($0.1["createdAt"] as? String ?? "") > ($1.1["createdAt"] as? String ?? "") }
    }

    /// A file a record names: a plain name inside its own folder.
    static func file(_ name: Any?, in folder: URL) -> URL? {
        guard let name = name as? String, !name.isEmpty, !name.contains("/"), !name.hasPrefix(".") else { return nil }
        return folder.appendingPathComponent(name)
    }

    static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}


// MARK: - Speech video

struct SpeechStep {
    let id, title, prompt: String
    let start, end, frameTime: Double
    init?(json: [String: Any]) {
        guard let id = json["id"] as? String, let start = json["start"] as? Double, let end = json["end"] as? Double, end > start else { return nil }
        self.id = id
        title = json["title"] as? String ?? ""
        prompt = json["prompt"] as? String ?? ""
        self.start = start
        self.end = end
        frameTime = json["frameTime"] as? Double ?? (start + end) / 2
    }
}

struct SpeechTake { let movie: URL; let front: Bool; let sound: Bool; let duration: Double }

enum SpeechStore {
    static func save(_ take: SpeechTake, caseId: String, steps: [SpeechStep]) throws -> (URL, [String: Any]) {
        let (id, folder) = try CaseMediaStore.newRecord(caseId, kind: "speech")
        do {
            let video = folder.appendingPathComponent("speech.mov")
            try FileManager.default.moveItem(at: take.movie, to: video)
            try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: video.path)
            var stepInfo: [[String: Any]] = []
            for step in steps where step.start < take.duration {
                let (frame, at) = try SpeechFrames.grab(video, at: step.frameTime, duration: take.duration, step: step.id, in: folder)
                stepInfo.append(["id": step.id, "title": step.title, "start": step.start, "end": min(step.end, take.duration), "frameTime": at, "frame": frame])
            }
            let info: [String: Any] = [
                "kind": "speech", "id": id, "createdAt": CaseMediaStore.iso.string(from: Date()), "duration": take.duration,
                "audio": take.sound, "camera": take.front ? "front" : "back", "video": "speech.mov",
                "poster": stepInfo.last?["frame"] as? String ?? "", "steps": stepInfo
            ]
            try CaseMediaStore.writeInfo(info, to: folder)
            return (folder, info)
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
    }
}

enum SpeechFrames {
    /// A full-size still from the video at `time`, saved beside it. Returns its name and the moment actually used.
    static func grab(_ video: URL, at time: Double, duration: Double, step: String, in folder: URL) throws -> (String, Double) {
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: video))
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 60)
        let t = max(0, min(time, duration - 0.05))
        final class Result { var image: CGImage?; var time = CMTime.zero }
        let result = Result(), done = DispatchSemaphore(value: 0)
        generator.generateCGImageAsynchronously(for: CMTime(seconds: t, preferredTimescale: 600)) { image, actual, _ in
            result.image = image
            result.time = actual
            done.signal()
        }
        done.wait()
        guard let image = result.image, let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.9) else { throw CocoaError(.fileReadCorruptFile) }
        let actual = CMTimeGetSeconds(result.time)
        let seconds = actual.isFinite ? actual : t
        let name = "frame-\(step)-\(Int((seconds * 1000).rounded())).jpg"
        try CaseMediaStore.write(data, to: folder.appendingPathComponent(name))
        return (name, seconds)
    }
}

/// The guided speech video: the face lined up with the At rest outline, a short countdown, then each line for the
/// patient to say appears in turn while the camera records. The video is kept unmirrored, as others see the patient.
final class SpeechCameraViewController: UIViewController, AVCaptureFileOutputRecordingDelegate {
    enum Outcome { case cancelled, failed(String), recorded(SpeechTake) }

    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    private let steps: [SpeechStep]
    private let tail: Double
    private let guide: UIImage?
    private let sound: Bool
    private let completion: (Outcome) -> Void

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "uk.co.drvik.smilecompose.speech")
    private let movieOutput = AVCaptureMovieFileOutput()
    private var rotationCoordinator: AVCaptureDevice.RotationCoordinator?
    private var front = true
    private var hasSound = false

    private enum Phase { case ready, countdown, recording, saving }
    private var phase = Phase.ready
    private var discard = false
    private var finished = false
    private var startedAt: CFTimeInterval = 0
    private var link: CADisplayLink?
    private var countdown = 0
    private var countdownTimer: Timer?
    private var shownStep = -1

    private let previewHost = UIView()
    private let previewLayer = AVCaptureVideoPreviewLayer()
    private let guideView = UIImageView()
    private let midlines = CAShapeLayer()
    private let closeButton = UIButton(type: .system)
    private let sideButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let stepLabel = UILabel()
    private let dots = UIStackView()
    private let card = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    private let cardTitle = UILabel()
    private let cardPrompt = UILabel()
    private let track = UIView()
    private let fill = UIView()
    private let countLabel = UILabel()
    private let hint = UILabel()
    private let recordRing = UIView()
    private let recordButton = UIButton(type: .custom)
    private let recordMark = UIView()

    private var total: Double { (steps.last?.end ?? 0) + tail }

    init(steps: [SpeechStep], tail: Double, guide: UIImage?, sound: Bool, completion: @escaping (Outcome) -> Void) {
        self.steps = steps
        self.tail = tail
        self.guide = guide
        self.sound = sound
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }
    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        previewHost.backgroundColor = UIColor(white: 0.07, alpha: 1)
        previewHost.layer.cornerRadius = 14
        previewHost.clipsToBounds = true
        previewLayer.session = session
        previewLayer.videoGravity = .resizeAspectFill
        previewHost.layer.addSublayer(previewLayer)
        view.addSubview(previewHost)
        guideView.image = guide
        guideView.contentMode = .scaleAspectFit
        guideView.alpha = 0.35
        previewHost.addSubview(guideView)
        midlines.strokeColor = UIColor(white: 1, alpha: 0.35).cgColor
        midlines.lineWidth = 1.5
        midlines.lineDashPattern = [6, 6]
        midlines.fillColor = nil
        previewHost.layer.addSublayer(midlines)

        titleLabel.text = "Speech video"
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center
        stepLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .regular)
        stepLabel.textColor = UIColor(white: 1, alpha: 0.7)
        stepLabel.textAlignment = .center
        dots.axis = .horizontal
        dots.spacing = 4
        dots.distribution = .fillEqually
        for _ in steps { let d = UIView(); d.layer.cornerRadius = 1.5; d.backgroundColor = UIColor(white: 1, alpha: 0.25); dots.addArrangedSubview(d) }
        [titleLabel, stepLabel, dots].forEach { view.addSubview($0) }

        card.layer.cornerRadius = 16
        card.clipsToBounds = true
        cardTitle.font = .systemFont(ofSize: 13, weight: .semibold)
        cardTitle.textColor = Self.gold
        cardPrompt.font = .systemFont(ofSize: 24, weight: .semibold)
        cardPrompt.textColor = .white
        cardPrompt.numberOfLines = 2
        cardPrompt.adjustsFontSizeToFitWidth = true
        cardPrompt.minimumScaleFactor = 0.7
        track.backgroundColor = UIColor(white: 1, alpha: 0.2)
        track.layer.cornerRadius = 2
        track.clipsToBounds = true
        fill.backgroundColor = Self.gold
        track.addSubview(fill)
        [cardTitle, cardPrompt, track].forEach { card.contentView.addSubview($0) }
        previewHost.addSubview(card)

        countLabel.font = .systemFont(ofSize: 110, weight: .bold)
        countLabel.textColor = .white
        countLabel.textAlignment = .center
        countLabel.layer.shadowColor = UIColor.black.cgColor
        countLabel.layer.shadowOpacity = 0.5
        countLabel.layer.shadowRadius = 12
        countLabel.layer.shadowOffset = .zero
        countLabel.isHidden = true
        previewHost.addSubview(countLabel)

        hint.font = .systemFont(ofSize: 13)
        hint.textColor = UIColor(white: 1, alpha: 0.75)
        hint.textAlignment = .center
        hint.numberOfLines = 2
        hint.adjustsFontSizeToFitWidth = true
        hint.minimumScaleFactor = 0.8
        view.addSubview(hint)

        let round = { (b: UIButton, symbol: String, label: String) in
            b.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)), for: .normal)
            b.tintColor = .white
            b.backgroundColor = UIColor(white: 1, alpha: 0.14)
            b.layer.cornerRadius = 22
            b.accessibilityLabel = label
            self.view.addSubview(b)
        }
        round(closeButton, "xmark", "Close")
        round(sideButton, "arrow.triangle.2.circlepath", "Switch camera")
        closeButton.addTarget(self, action: #selector(close), for: .touchUpInside)
        sideButton.addTarget(self, action: #selector(switchCamera), for: .touchUpInside)

        recordRing.layer.borderColor = UIColor.white.cgColor
        recordRing.layer.borderWidth = 3
        recordRing.isUserInteractionEnabled = false
        view.addSubview(recordRing)
        recordMark.backgroundColor = UIColor(red: 0.92, green: 0.23, blue: 0.2, alpha: 1)
        recordMark.isUserInteractionEnabled = false
        recordButton.addSubview(recordMark)
        recordButton.addTarget(self, action: #selector(recordTapped), for: .touchUpInside)
        view.addSubview(recordButton)

        updateControls()
        configureSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaLayoutGuide.layoutFrame
        let portrait = view.bounds.height >= view.bounds.width
        closeButton.frame = CGRect(x: safe.minX + 16, y: safe.minY + 8, width: 44, height: 44)
        titleLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 8, width: safe.width - 140, height: 24)
        stepLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 32, width: safe.width - 140, height: 16)
        let dotsWidth = min(CGFloat(steps.count) * 22, safe.width - 140)
        dots.frame = CGRect(x: safe.midX - dotsWidth / 2, y: safe.minY + 56, width: dotsWidth, height: 3)
        let top: CGFloat = 70, bottom: CGFloat = portrait ? 150 : 110
        let area = CGRect(x: safe.minX + 12, y: safe.minY + top, width: safe.width - 24, height: safe.height - top - bottom)
        let aspect: CGFloat = portrait ? 9.0 / 16.0 : 16.0 / 9.0
        var size = CGSize(width: area.width, height: area.width / aspect)
        if size.height > area.height { size = CGSize(width: area.height * aspect, height: area.height) }
        previewHost.frame = CGRect(x: area.midX - size.width / 2, y: area.midY - size.height / 2, width: size.width, height: size.height)
        // The At rest outline in its 3:4 frame, centred, as on the photo set camera.
        let guideWidth = min(size.width, size.height * 3 / 4)
        let guideFrame = CGRect(x: (size.width - guideWidth) / 2, y: (size.height - guideWidth * 4 / 3) / 2, width: guideWidth, height: guideWidth * 4 / 3)
        guideView.frame = guideFrame
        countLabel.frame = guideFrame
        CATransaction.begin(); CATransaction.setDisableActions(true)
        previewLayer.frame = previewHost.bounds
        midlines.frame = previewHost.bounds
        let path = UIBezierPath()
        path.move(to: CGPoint(x: size.width / 2, y: 6)); path.addLine(to: CGPoint(x: size.width / 2, y: size.height - 6))
        path.move(to: CGPoint(x: 6, y: guideFrame.midY)); path.addLine(to: CGPoint(x: size.width - 6, y: guideFrame.midY))
        midlines.path = path.cgPath
        CATransaction.commit()
        let cardHeight: CGFloat = 104
        card.frame = CGRect(x: 10, y: size.height - cardHeight - 10, width: size.width - 20, height: cardHeight)
        cardTitle.frame = CGRect(x: 16, y: 12, width: card.bounds.width - 32, height: 18)
        cardPrompt.frame = CGRect(x: 16, y: 32, width: card.bounds.width - 32, height: 52)
        track.frame = CGRect(x: 16, y: cardHeight - 14, width: card.bounds.width - 32, height: 4)
        countLabel.frame = CGRect(x: 0, y: size.height * 0.3, width: size.width, height: 130)
        hint.frame = CGRect(x: previewHost.frame.minX, y: previewHost.frame.maxY + 6, width: previewHost.frame.width, height: 34)
        recordButton.frame = CGRect(x: safe.midX - 32, y: safe.maxY - 84, width: 64, height: 64)
        recordRing.frame = recordButton.frame.insetBy(dx: -7, dy: -7)
        recordRing.layer.cornerRadius = recordRing.frame.width / 2
        sideButton.frame = CGRect(x: safe.maxX - 72, y: recordButton.frame.midY - 22, width: 44, height: 44)
        layoutRecordMark()
        view.keepClearOfCamera([closeButton, sideButton, recordButton, recordRing])
        applyRotation()
    }

    private func layoutRecordMark() {
        let recording = phase == .recording || phase == .saving
        let side: CGFloat = recording ? 26 : 54
        recordMark.frame = CGRect(x: (64 - side) / 2, y: (64 - side) / 2, width: side, height: side)
        recordMark.layer.cornerRadius = recording ? 6 : side / 2
    }

    private func clock(_ t: Double) -> String { String(format: "0:%02d", Int(max(0, t).rounded(.down))) }

    private func updateControls() {
        sideButton.isHidden = phase != .ready
        recordButton.accessibilityLabel = phase == .recording ? "Stop recording" : phase == .countdown ? "Cancel" : "Record"
        recordButton.isEnabled = phase != .saving
        UIView.animate(withDuration: 0.22) { self.layoutRecordMark() }
        switch phase {
        case .ready:
            stepLabel.text = "\(steps.count) sounds · about \(Int(total.rounded())) seconds"
            cardTitle.text = "Before you start"
            cardPrompt.text = "Line the face up with the outline"
            fill.frame = .zero
            hint.text = hasSound || sound ? "The patient reads each line aloud as it appears." : "The microphone is off, so the video will have no sound. Turn it on in Settings › SmileCompose."
            for d in dots.arrangedSubviews { d.backgroundColor = UIColor(white: 1, alpha: 0.25) }
        case .countdown:
            cardTitle.text = "Get ready"
            cardPrompt.text = steps.first?.prompt ?? ""
        case .recording:
            hint.text = "Recording · tap the button to stop"
        case .saving:
            hint.text = "Saving the video…"
        }
    }

    // MARK: Session

    private func configureSession(_ then: @escaping () -> Void = {}) {
        let front = self.front, sound = self.sound
        sessionQueue.async {
            self.session.beginConfiguration()
            self.session.sessionPreset = .high
            self.session.inputs.forEach { self.session.removeInput($0) }
            guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: front ? .front : .back),
                  let input = try? AVCaptureDeviceInput(device: camera), self.session.canAddInput(input) else {
                self.session.commitConfiguration()
                DispatchQueue.main.async { self.hint.text = "The camera couldn’t be started." }
                return
            }
            self.session.addInput(input)
            var withSound = false
            if sound, let mic = AVCaptureDevice.default(for: .audio), let micInput = try? AVCaptureDeviceInput(device: mic), self.session.canAddInput(micInput) {
                self.session.addInput(micInput)
                withSound = true
            }
            if !self.session.outputs.contains(self.movieOutput), self.session.canAddOutput(self.movieOutput) { self.session.addOutput(self.movieOutput) }
            // H.264, which opens on any computer the lab uses.
            if let c = self.movieOutput.connection(with: .video), self.movieOutput.availableVideoCodecTypes.contains(.h264) {
                self.movieOutput.setOutputSettings([AVVideoCodecKey: AVVideoCodecType.h264], for: c)
            }
            self.session.commitConfiguration()
            if !self.session.isRunning { self.session.startRunning() }
            DispatchQueue.main.async {
                self.hasSound = withSound
                self.rotationCoordinator = AVCaptureDevice.RotationCoordinator(device: camera, previewLayer: self.previewLayer)
                if let c = self.previewLayer.connection, c.isVideoMirroringSupported {
                    c.automaticallyAdjustsVideoMirroring = false
                    c.isVideoMirrored = front
                }
                self.applyRotation()
                self.updateControls()
                then()
            }
        }
    }

    private func applyRotation() {
        guard let angle = rotationCoordinator?.videoRotationAngleForHorizonLevelPreview else { return }
        if let c = previewLayer.connection, c.isVideoRotationAngleSupported(angle) { c.videoRotationAngle = angle }
    }

    @objc private func switchCamera() {
        guard phase == .ready else { return }
        front.toggle()
        UIView.animate(withDuration: 0.16) { self.previewHost.alpha = 0.25 }
        configureSession { UIView.animate(withDuration: 0.3, delay: 0.2) { self.previewHost.alpha = 1 } }
    }

    // MARK: Recording

    @objc private func recordTapped() {
        switch phase {
        case .ready: startCountdown()
        case .countdown: cancelCountdown()
        case .recording: stopEarly()
        case .saving: break
        }
    }

    private func startCountdown() {
        phase = .countdown
        countdown = 3
        updateControls()
        tickCountdown()
        countdownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.tickCountdown() }
    }

    private func tickCountdown() {
        guard phase == .countdown else { return }
        guard countdown > 0 else {
            countdownTimer?.invalidate(); countdownTimer = nil
            countLabel.isHidden = true
            beginRecording()
            return
        }
        countLabel.text = "\(countdown)"
        countLabel.isHidden = false
        countLabel.alpha = 0
        countLabel.transform = CGAffineTransform(scaleX: 1.4, y: 1.4)
        UIView.animate(withDuration: 0.35, delay: 0, options: [.curveEaseOut]) {
            self.countLabel.alpha = 1
            self.countLabel.transform = .identity
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        countdown -= 1
    }

    private func cancelCountdown() {
        countdownTimer?.invalidate(); countdownTimer = nil
        countLabel.isHidden = true
        phase = .ready
        updateControls()
    }

    private func beginRecording() {
        let angle = rotationCoordinator?.videoRotationAngleForHorizonLevelCapture
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("speech-\(UUID().uuidString).mov")
        let limit = total + 3
        discard = false
        sessionQueue.async {
            // Recording needs a running camera; without one the movie output would throw.
            guard self.session.isRunning, let connection = self.movieOutput.connection(with: .video), connection.isActive, connection.isEnabled else {
                DispatchQueue.main.async {
                    self.phase = .ready
                    self.updateControls()
                    self.cardTitle.text = "The camera isn’t ready"
                    self.cardPrompt.text = "Close and open the speech video again"
                }
                return
            }
            if let c = self.movieOutput.connection(with: .video) {
                if let angle, c.isVideoRotationAngleSupported(angle) { c.videoRotationAngle = angle }
                // As others see the patient: the right side on the left of the picture.
                if c.isVideoMirroringSupported { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = false }
            }
            self.movieOutput.maxRecordedDuration = CMTime(seconds: limit, preferredTimescale: 600)
            self.movieOutput.startRecording(to: url, recordingDelegate: self)
        }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        DispatchQueue.main.async {
            guard !self.finished else { return }
            self.phase = .recording
            self.startedAt = CACurrentMediaTime()
            self.shownStep = -1
            self.updateControls()
            let link = CADisplayLink(target: self, selector: #selector(self.tick))
            link.add(to: .main, forMode: .common)
            self.link = link
        }
    }

    @objc private func tick() {
        guard phase == .recording else { return }
        let t = CACurrentMediaTime() - startedAt
        let i = steps.firstIndex { t < $0.end } ?? steps.count
        if i != shownStep { shownStep = i; showStep(i) }
        if i < steps.count {
            let s = steps[i]
            let p = t < s.start ? 0 : (t - s.start) / (s.end - s.start)
            fill.frame = CGRect(x: 0, y: 0, width: track.bounds.width * CGFloat(max(0, min(1, p))), height: track.bounds.height)
        }
        stepLabel.text = "\(clock(t)) of \(clock(total))"
        if t >= total { stopRecording() }
    }

    private func showStep(_ i: Int) {
        for (n, d) in dots.arrangedSubviews.enumerated() { d.backgroundColor = n < i ? Self.gold : n == i ? .white : UIColor(white: 1, alpha: 0.25) }
        guard i < steps.count else {
            cardTitle.text = "Done"
            cardPrompt.text = "Hold still a moment"
            fill.frame = CGRect(x: 0, y: 0, width: track.bounds.width, height: track.bounds.height)
            return
        }
        let s = steps[i]
        UIView.transition(with: card, duration: 0.22, options: .transitionCrossDissolve) {
            self.cardTitle.text = "\(i + 1) of \(self.steps.count) · \(s.title)"
            self.cardPrompt.text = s.prompt
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func stopRecording() {
        link?.invalidate(); link = nil
        phase = .saving
        updateControls()
        sessionQueue.async { self.movieOutput.stopRecording() }
    }

    private func stopEarly() {
        discard = true
        link?.invalidate(); link = nil
        sessionQueue.async { self.movieOutput.stopRecording() }
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        let ok = error == nil || ((error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool ?? false)
        let length = CMTimeGetSeconds(output.recordedDuration)
        DispatchQueue.main.async {
            self.link?.invalidate(); self.link = nil
            if self.discard || !ok || self.finished {
                try? FileManager.default.removeItem(at: outputFileURL)
                guard !self.finished else { return }
                self.phase = .ready
                self.updateControls()
                self.cardTitle.text = ok ? "Stopped" : "That recording didn’t work"
                self.cardPrompt.text = "Tap record to start again"
                return
            }
            self.finish(.recorded(SpeechTake(movie: outputFileURL, front: self.front, sound: self.hasSound, duration: length.isFinite && length > 0 ? length : self.total)))
        }
    }

    @objc private func close() {
        countdownTimer?.invalidate(); countdownTimer = nil
        if phase == .recording { discard = true; sessionQueue.async { self.movieOutput.stopRecording() } }
        finish(.cancelled)
    }

    private func finish(_ outcome: Outcome) {
        guard !finished else { return }
        finished = true
        link?.invalidate(); link = nil
        sessionQueue.async { if self.session.isRunning { self.session.stopRunning() } }
        dismiss(animated: true) { self.completion(outcome) }
    }
}


// MARK: - 3D face scan

/// Rear-camera scans require measured depth as well as photographs.
enum LidarScanner {
    static var available: Bool { ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) }
}

// BEGIN FACE_SCAN_CAPTURE_POLICY
/// One capture owns its asynchronous photographs and its monotonically advancing depth stream.
/// Pure policy so cancellation, failed writes and camera timestamp edge cases can be replayed off-device.
struct FaceScanCapturePolicy {
    private(set) var runID = UUID()
    private(set) var pendingPhoto: UUID?
    private(set) var lastDepthTimestamp: TimeInterval?

    mutating func reset() {
        runID = UUID()
        pendingPhoto = nil
        lastDepthTimestamp = nil
    }
    func isCurrent(_ run: UUID) -> Bool { run == runID }

    mutating func acceptDepth(imageTimestamp: TimeInterval, depthTimestamp: TimeInterval) -> Bool {
        guard imageTimestamp.isFinite, depthTimestamp.isFinite,
              imageTimestamp > 0, depthTimestamp > 0,
              abs(imageTimestamp - depthTimestamp) <= 0.05,
              lastDepthTimestamp.map({ depthTimestamp > $0 }) ?? true else { return false }
        lastDepthTimestamp = depthTimestamp
        return true
    }
    mutating func beginPhoto(run: UUID) -> UUID? {
        guard isCurrent(run), pendingPhoto == nil else { return nil }
        let ticket = UUID()
        pendingPhoto = ticket
        return ticket
    }
    mutating func finishPhoto(_ ticket: UUID, run: UUID) -> Bool {
        guard isCurrent(run), pendingPhoto == ticket else { return false }
        pendingPhoto = nil
        return true
    }
}
// END FACE_SCAN_CAPTURE_POLICY

struct FaceCaptureSpec {
    let id, title, hint, expression: String
    /// How far round each side, and how far above and below, in degrees.
    let turn, tilt: Float
    init?(json: [String: Any]) {
        guard let id = json["id"] as? String else { return nil }
        self.id = id
        title = json["title"] as? String ?? id
        hint = json["hint"] as? String ?? ""
        expression = json["expression"] as? String ?? "any"
        turn = Float(max(30, min(80, json["turn"] as? Double ?? 60)))
        tilt = Float(max(10, min(40, json["tilt"] as? Double ?? 20)))
    }
}

struct FaceScanResult {
    let id, title: String
    var mesh: FaceMesh
    var preview: UIImage?
    /// The face built from the scan's photographs, with photographic skin, when that worked.
    var textured: TexturedFace?
    /// The photographs taken during the scan (temporary; used to build `textured`).
    var shots: PhotoShots?
    /// "trueDepth" (the front Face ID sensor) or "lidar" (the rear LiDAR scanner).
    var sensor = "lidar"
    /// The centre of each eye, in the mesh's millimetres.
    var eyes: (left: SIMD3<Float>, right: SIMD3<Float>)?
    /// How far round each side (the patient's right, then left) and how far above and below were seen, in degrees.
    let turned: (right: Float, left: Float)
    let tilted: (up: Float, down: Float)
    /// The share of the face seen closely enough, 0–1.
    let coverage: Float
    /// How well the frames fitted the face (mm) and the share kept: a patient who moved shows here.
    var tracking: (rms: Float, kept: Float) = (0, 1)
    var trackingPoor: Bool { tracking.rms > 1.6 || tracking.kept < 0.6 }
    /// The export frame and what was measured making it (see FaceFinish).
    var orientation: FaceFinish.Orientation?
    /// Head frame (as scanned, mm) to the export frame.
    var exportFromScan: simd_float4x4?
    /// The scan as it came off the sensor (cleaned, not turned), shipped alongside for anyone who wants it raw.
    var unrotated: FaceMesh?
    /// Which scan this one was lined up on for the shared frame, and how well (mm over the upper face).
    var registeredTo: String?
    var sharedFit: Float?
    /// Gravity's up in the head frame when the scan started (natural head position); nil if not recorded.
    var gravityUp: SIMD3<Float>?
    /// Front-camera photos for the skin (dropped once used).
    var views: [FrontView] = []
    var holesFilled = 0
    var scaleCorrection: Float = 1
    /// A rear scan with enough photographs: saved at once with its LiDAR shape, and its detailed face built from the
    /// photographs in the background afterwards.
    var canBuildDetailed: Bool { sensor == "lidar" && textured == nil && PhotoRefiner.isSupported && (shots?.shots.count ?? 0) >= PhotoRefiner.minimumShots }
    /// The clinician chose to build it (Object Capture warms the phone, so it never starts on its own).
    var wantsDetailed = false
    var buildLater: Bool { wantsDetailed && canBuildDetailed }
}

/// An independently oriented expression must never inherit another expression's intraoral registration.
/// Older records without shared-frame evidence remain readable; only their selected reference is exported.
enum FaceScanBuildState {
    /// Returns only a changed record. Same-process queued/running jobs and completed scans stay untouched.
    static func reconcile(_ info: [String: Any], sessionID: String) -> [String: Any]? {
        guard info["kind"] as? String == "scan", var captures = info["captures"] as? [[String: Any]] else { return nil }
        var changed = false
        for i in captures.indices where captures[i]["building"] as? Bool == true && captures[i]["buildSession"] as? String != sessionID {
            captures[i]["building"] = false
            captures[i]["detailedStatus"] = "interrupted"
            captures[i].removeValue(forKey: "buildSession")
            changed = true
        }
        guard changed else { return nil }
        var result = info
        result["captures"] = captures
        return result
    }
}

enum FaceScanFrames {
    static func referenceId(_ captures: [[String: Any]], preferred: String? = nil) -> String? {
        if let preferred { return captures.contains(where: { $0["id"] as? String == preferred }) ? preferred : nil }
        return (captures.first(where: { $0["id"] as? String == "retracted" })
            ?? captures.first(where: { $0["id"] as? String == "smile" }) ?? captures.first)?["id"] as? String
    }

    static func groupId(_ capture: [String: Any]) -> String? {
        guard let id = capture["id"] as? String, !id.isEmpty,
              let fit = capture["sharedFitMm"] as? Double, fit.isFinite, fit >= 0 else { return nil }
        if let base = capture["registeredTo"] as? String, !base.isEmpty { return base }
        return fit == 0 ? id : nil
    }

    static func sharesFrame(_ capture: [String: Any], with reference: [String: Any]) -> Bool {
        if let id = capture["id"] as? String, id == reference["id"] as? String { return true }
        guard let group = groupId(reference) else { return false }
        return groupId(capture) == group
    }

    static func allShareFrame(_ captures: [[String: Any]]) -> Bool {
        guard let first = captures.first else { return false }
        return captures.allSatisfy { sharesFrame($0, with: first) }
    }

    /// Geometry changed after a legacy coarse alignment. Retire active links, without deleting its private files.
    static func invalidateIntraoral(_ info: [String: Any], changedScanId: String) -> [String: Any] {
        guard var captures = info["captures"] as? [[String: Any]] else { return info }
        var retired: [[String: Any]] = []
        for i in captures.indices {
            var files: [String: Any] = ["scanId": captures[i]["id"] as? String ?? ""]
            for key in Array(captures[i].keys) where key == "intraoralMesh" || key.hasPrefix("intraoralModel") {
                files[key] = captures[i].removeValue(forKey: key)
            }
            if files.count > 1 { retired.append(files) }
        }
        guard info["intraoral"] != nil || !retired.isEmpty else { return info }
        var result = info, previous = info["intraoral"] as? [String: Any] ?? [:]
        previous["derivedFiles"] = retired
        result["previousIntraoralRegistration"] = previous
        result.removeValue(forKey: "intraoral")
        result["intraoralStatus"] = "registrationRequired"
        result["intraoralInvalidatedByScanId"] = changedScanId
        result["captures"] = captures
        return result
    }
}

enum FaceScanStore {
    static func save(_ scans: [FaceScanResult], caseId: String) throws -> (URL, [String: Any]) {
        let (id, folder) = try CaseMediaStore.newRecord(caseId, kind: "scan")
        do {
            var captures: [[String: Any]] = [], landmarks: [String: Any] = [:]
            for scan in scans {
                let mesh = "\(scan.id).ply", preview = "\(scan.id).jpg", raw = "\(scan.id)-as-scanned.ply"
                let source = scan.sensor == "trueDepth" ? "trueDepth" : scan.textured != nil ? "photos" : "lidar"
                let built = source == "photos" ? "built from photographs, lined up on the LiDAR scan"
                    : source == "trueDepth" ? (scan.textured != nil ? "Face ID (TrueDepth) sensor, with photographic skin from the front camera" : "Face ID (TrueDepth) sensor") : "LiDAR scanner"
                try CaseMediaStore.write(scan.mesh.ply(comment: "\(scan.title), \(built); export frame (see README.txt)"), to: folder.appendingPathComponent(mesh))
                if let u = scan.unrotated { try CaseMediaStore.write(u.ply(comment: "\(scan.title), as scanned: the scanner's head frame, not turned"), to: folder.appendingPathComponent(raw)) }
                // The textured face as OBJ + material + texture, named as the lab will see them.
                var model = "", modelTexture = "", modelMaterial = ""
                if let t = scan.textured {
                    let stem = "face-scan-\(CaseMediaPlugin.slug(scan.title))"
                    let files = t.obj(name: stem, comment: "\(scan.title), \(built); export frame (see README.txt)")
                    if let jpeg = UIImage(cgImage: t.texture).jpegData(compressionQuality: 0.9) {
                        try CaseMediaStore.write(files.obj, to: folder.appendingPathComponent("\(stem).obj"))
                        try CaseMediaStore.write(files.mtl, to: folder.appendingPathComponent("\(stem).mtl"))
                        try CaseMediaStore.write(jpeg, to: folder.appendingPathComponent("\(stem).jpg"))
                        model = "\(stem).obj"; modelMaterial = "\(stem).mtl"; modelTexture = "\(stem).jpg"
                    }
                }
                var hasPreview = false
                if let data = scan.preview?.jpegData(compressionQuality: 0.88) {
                    try CaseMediaStore.write(data, to: folder.appendingPathComponent(preview))
                    hasPreview = true
                }
                let o = scan.orientation
                var eyeTilt: Double?
                if let e = scan.eyes { let d = e.left - e.right; eyeTilt = (Double(atan2f(d.y, d.x) * 180 / .pi) * 10).rounded() / 10 }
                var capture: [String: Any] = [
                    "id": scan.id, "title": scan.title, "mesh": mesh, "preview": hasPreview ? preview : "",
                    "vertices": scan.mesh.positions.count, "triangles": scan.mesh.triangles.count / 3,
                    "turned": [Double(scan.turned.right), Double(scan.turned.left)],
                    "tilted": [Double(scan.tilted.up), Double(scan.tilted.down)],
                    "coverage": (Double(scan.coverage) * 100).rounded() / 100,
                    "tracking": ["fitMm": (Double(scan.tracking.rms) * 100).rounded() / 100, "kept": (Double(scan.tracking.kept) * 100).rounded() / 100, "poor": scan.trackingPoor],
                    "sensor": scan.sensor, "source": source, "model": model, "modelMaterial": modelMaterial, "modelTexture": modelTexture,
                    "building": scan.buildLater, "oriented": o?.symmetryFit != nil,
                    "eyes": scan.eyes.map { [mm($0.left), mm($0.right)] } ?? [],
                    "asScanned": scan.unrotated != nil ? raw : "",
                    "holesFilled": scan.holesFilled, "scaleCorrection": (Double(scan.scaleCorrection) * 10000).rounded() / 10000
                ]
                if scan.buildLater { capture["detailedStatus"] = "pending" }
                else if source != "lidar" { capture["detailedStatus"] = "complete" }
                if scan.buildLater { capture["buildSession"] = BackgroundFaceBuilder.sessionID }
                if let o {
                    capture["midlinePlane"] = [o.midlinePlane.x, o.midlinePlane.y, o.midlinePlane.z, o.midlinePlane.w].map { (Double($0) * 10000).rounded() / 10000 }
                    capture["midlineTilt"] = (Double(o.midlineTilt) * 10).rounded() / 10
                    capture["gravity"] = o.gravityRecorded
                }
                if let eyeTilt { capture["eyeTilt"] = eyeTilt }
                if let fit = scan.sharedFit { capture["sharedFitMm"] = (Double(fit) * 100).rounded() / 100 }
                if let to = scan.registeredTo { capture["registeredTo"] = to }
                captures.append(capture)

                var entry: [String: Any] = [
                    "title": scan.title, "sensor": scan.sensor, "builtFrom": built, "faceCoverage": (Double(scan.coverage) * 100).rounded() / 100,
                    "seenDegrees": ["patientRight": Double(scan.turned.right.rounded()), "patientLeft": Double(scan.turned.left.rounded()),
                                    "above": Double(scan.tilted.up.rounded()), "below": Double(scan.tilted.down.rounded())],
                    "holesFilled": scan.holesFilled,
                    "scaleCorrection": scan.scaleCorrection == 1 ? "none" : String(format: "×%.4f from this device's scale check", scan.scaleCorrection)
                ]
                if let e = scan.eyes { entry["eyeCentres"] = ["left": mm(e.left), "right": mm(e.right)] }
                if let eyeTilt { entry["eyeLineTiltFromTrueHorizontalDegrees"] = eyeTilt }
                if let o {
                    entry["midline"] = o.symmetryFit.map { String(format: "found from the face's own symmetry (upper face, nose and philtrum mirrored and lined up on themselves, %.1f mm fit)", $0) }
                        ?? "not found from symmetry; taken from the scanner's head frame (nose and eyes)"
                    entry["midlinePlane"] = ["normal": [o.midlinePlane.x, o.midlinePlane.y, o.midlinePlane.z].map { (Double($0) * 10000).rounded() / 10000 },
                                             "d": (Double(o.midlinePlane.w) * 100).rounded() / 100, "equation": "normal · p = d"]
                    entry["midlineTiltFromTrueVerticalDegrees"] = (Double(o.midlineTilt) * 10).rounded() / 10
                    entry["trueVertical"] = o.gravityRecorded ? "from gravity when the scan started" : "not recorded; the scanner's head frame"
                    if let p = o.pronasale { entry["pronasale"] = mm(p) }
                    if let p = o.subnasale { entry["subnasale"] = mm(p) }
                }
                if let to = scan.registeredTo, let fit = scan.sharedFit {
                    entry["sharedFrame"] = String(format: "lined up on the %@ scan by the forehead, nasal root and cheekbones (%.2f mm fit)", scans.first(where: { $0.id == to })?.title ?? to, fit)
                } else if scan.sharedFit == 0 {
                    entry["sharedFrame"] = "defines the shared frame"
                } else {
                    entry["sharedFrame"] = "own frame: it couldn't be lined up on the other scans"
                }
                if let E = scan.exportFromScan { entry["exportFromAsScanned"] = (0..<4).flatMap { c in (0..<4).map { r in (Double(E[c][r]) * 100000).rounded() / 100000 } } }
                landmarks[scan.id] = entry
            }
            let sharedFrame = FaceScanFrames.allShareFrame(captures)
            let file: [String: Any] = [
                "units": "mm",
                "frame": "+y true vertical (natural head position, from gravity), +x towards the patient's left (horizontal), +z forward out of the face; origin at subnasale",
                "facialMidline": "x = 0 is the vertical plane along the midline's direction; the midline plane itself is given per scan with how far it leans from true vertical",
                "registration": scans.count <= 1 ? "register the scan to the intraoral scan on the front teeth visible in the smile"
                    : sharedFrame ? "the expressions are in one registered frame: register the scan that shows the teeth to the intraoral scan once and the registered others follow"
                    : "some expressions have independent frames: only the selected intraoral reference and expressions with matching shared-frame evidence can follow its registration",
                "exportFromAsScanned": "column-major 4×4 from each *-as-scanned.ply to the exported scan",
                "scans": landmarks
            ]
            try CaseMediaStore.write(try JSONSerialization.data(withJSONObject: file, options: [.prettyPrinted, .sortedKeys]), to: folder.appendingPathComponent("landmarks.json"))
            try CaseMediaStore.write(Data(readme(scans).utf8), to: folder.appendingPathComponent("README.txt"))
            let info: [String: Any] = [
                "kind": "scan", "id": id, "createdAt": CaseMediaStore.iso.string(from: Date()),
                "poster": captures.first(where: { ($0["preview"] as? String ?? "") != "" })?["preview"] as? String ?? "",
                "captures": captures, "landmarks": "landmarks.json", "readme": "README.txt"
            ]
            try CaseMediaStore.writeInfo(info, to: folder)
            return (folder, info)
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
    }

    /// What a lab needs to read the files without opening landmarks.json (CAD software ignores sidecar files).
    static func readme(_ scans: [FaceScanResult]) -> String {
        let groups: [[String: Any]] = scans.map { scan in
            var value: [String: Any] = ["id": scan.id]
            if let fit = scan.sharedFit { value["sharedFitMm"] = Double(fit) }
            if let base = scan.registeredTo { value["registeredTo"] = base }
            return value
        }
        let frameNote = scans.count <= 1 ? "Registration: line the scan up with the intraoral scan on the front teeth visible in the smile."
            : FaceScanFrames.allShareFrame(groups) ? "Shared frame: every expression has shared-frame registration evidence. Register the scan that shows the teeth to the intraoral scan (anterior teeth) and the registered others are placed with it."
            : "Independent frames: one or more expressions could not be registered to the shared frame. Do not apply another expression's intraoral transform to them; they require their own registration."
        var lines = [
            "SmileCompose 3D face scan",
            "",
            "Units: millimetres.",
            "Axes: +y is true vertical (natural head position, from the phone's gravity sensor when the scan started), +x points to the patient's left and is horizontal, +z points forward out of the face.",
            "Origin: subnasale (the base of the nose on the midline).",
            "Midline: x = 0 is the vertical plane along the facial midline's direction. The midline itself is found from the face's own symmetry; any lean from true vertical is reported below, not removed.",
            frameNote,
            "",
            "Files per scan: <scan>.ply (vertex colour) and, where present, face-scan-<scan>.obj + .mtl + .jpg (photographic texture), all in the frame above; <scan>-as-scanned.ply is the same scan in the scanner's own frame. landmarks.json has the numbers.",
            "",
        ]
        for s in scans {
            var parts = ["\(s.title):"]
            parts.append(s.sensor == "lidar" && s.textured == nil ? "coarse LiDAR geometry (photographic reconstruction is not complete)" : s.sensor == "trueDepth" ? "TrueDepth geometry" : "photographic reconstruction")
            if scans.count > 1, s.sharedFit == nil { parts.append("independent frame; not registered to the other expressions") }
            if let o = s.orientation { parts.append(String(format: "midline leans %.1f° from true vertical", o.midlineTilt)) }
            if let e = s.eyes { let d = e.left - e.right; parts.append(String(format: "eye line %.1f° from true horizontal", atan2f(d.y, d.x) * 180 / .pi)) }
            if let fit = s.sharedFit, s.registeredTo != nil { parts.append(String(format: "lined up on the upper face (%.2f mm fit)", fit)) }
            if s.scaleCorrection != 1 { parts.append(String(format: "scale corrected ×%.4f by this device's scale check", s.scaleCorrection)) }
            lines.append(parts.joined(separator: " "))
        }
        lines += ["", "These are phone scans: use them for facial proportions, the midline, the incisal plane and lip relationships, not for fine measurements around the lips."]
        return lines.joined(separator: "\n")
    }

    private static func mm(_ p: SIMD3<Float>) -> [Double] { [p.x, p.y, p.z].map { (Double($0) * 10).rounded() / 10 } }

    /// The detailed face built after saving goes into the record in place of the LiDAR shape. Without one the
    /// scan keeps its LiDAR shape and is no longer marked as building. Nil when the record has since been deleted.
    static func applyDetailed(_ face: TexturedFace?, caseId: String, recordId: String, scanId: String, title: String) -> (URL, [String: Any])? {
        guard let folder = CaseMediaStore.recordFolder(caseId, recordId), var info = CaseMediaStore.readInfo(folder),
              var captures = info["captures"] as? [[String: Any]], let i = captures.firstIndex(where: { $0["id"] as? String == scanId }) else { return nil }
        var capture = captures[i]
        var geometryReplaced = false
        capture["building"] = false
        capture["detailedStatus"] = "failed"
        capture.removeValue(forKey: "buildSession")
        if let face {
            let mesh = face.faceMesh()
            let stem = "face-scan-\(CaseMediaPlugin.slug(title))"
            let detailedMesh = "\(scanId)-detailed.ply"
            let files = face.obj(name: stem, comment: "\(title), built from photographs")
            if let jpeg = UIImage(cgImage: face.texture).jpegData(compressionQuality: 0.9),
               (try? CaseMediaStore.write(files.obj, to: folder.appendingPathComponent("\(stem).obj"))) != nil,
               (try? CaseMediaStore.write(files.mtl, to: folder.appendingPathComponent("\(stem).mtl"))) != nil,
               (try? CaseMediaStore.write(jpeg, to: folder.appendingPathComponent("\(stem).jpg"))) != nil,
               (try? CaseMediaStore.write(mesh.ply(comment: "\(title), built from photographs, lined up on the LiDAR scan"), to: folder.appendingPathComponent(detailedMesh))) != nil {
                capture["source"] = "photos"
                capture["mesh"] = detailedMesh
                capture["detailedStatus"] = "complete"
                geometryReplaced = true
                capture["model"] = "\(stem).obj"; capture["modelMaterial"] = "\(stem).mtl"; capture["modelTexture"] = "\(stem).jpg"
                capture["vertices"] = mesh.positions.count; capture["triangles"] = mesh.triangles.count / 3
                // A new name for the new preview, so nothing shows the old picture from a cache.
                let oldPreview = capture["preview"] as? String ?? ""
                if let data = face.preview()?.jpegData(compressionQuality: 0.88) {
                    let name = "\(scanId)-detailed.jpg"
                    if (try? CaseMediaStore.write(data, to: folder.appendingPathComponent(name))) != nil {
                        capture["preview"] = name
                        if info["poster"] as? String == oldPreview { info["poster"] = name }
                        if !oldPreview.isEmpty, oldPreview != name { try? FileManager.default.removeItem(at: folder.appendingPathComponent(oldPreview)) }
                    }
                }
                let landmarksURL = folder.appendingPathComponent("landmarks.json")
                if let data = try? Data(contentsOf: landmarksURL), var file = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                   var scans = file["scans"] as? [String: Any], var entry = scans[scanId] as? [String: Any] {
                    entry["builtFrom"] = "built from photographs, lined up on the LiDAR scan"
                    scans[scanId] = entry; file["scans"] = scans
                    if let out = try? JSONSerialization.data(withJSONObject: file, options: [.prettyPrinted, .sortedKeys]) { try? CaseMediaStore.write(out, to: landmarksURL) }
                }
            }
        }
        captures[i] = capture
        info["captures"] = captures
        if geometryReplaced {
            info = FaceScanFrames.invalidateIntraoral(info, changedScanId: scanId)
            if info["intraoralStatus"] as? String == "registrationRequired" {
                let landmarksURL = folder.appendingPathComponent("landmarks.json")
                if let data = try? Data(contentsOf: landmarksURL), var file = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
                    if let previous = file.removeValue(forKey: "intraoralRegistration") { file["previousIntraoralRegistration"] = previous }
                    file["intraoralStatus"] = "registrationRequired"
                    file["intraoralInvalidatedByScanId"] = scanId
                    if let out = try? JSONSerialization.data(withJSONObject: file, options: [.prettyPrinted, .sortedKeys]) { try? CaseMediaStore.write(out, to: landmarksURL) }
                }
            }
        }
        guard (try? CaseMediaStore.writeInfo(info, to: folder)) != nil else { return nil }
        return (folder, info)
    }
}

/// Builds rear scans' detailed faces from their photographs after the scanner has closed, one at a time, so the
/// clinician isn't kept waiting (the quick LiDAR face is saved straight away). Runs while the app is open, with a
/// little extra time if it goes to the background; a build that can't finish leaves the LiDAR face in place.
/// Every piece of state here is read and changed on the main queue only (each entry point hops there first),
/// which is what lets its closures cross threads safely.
final class BackgroundFaceBuilder: @unchecked Sendable {
    static let shared = BackgroundFaceBuilder()
    /// Process-scoped: unfinished in-memory jobs from a previous launch must not remain marked as running.
    static let sessionID = UUID().uuidString
    /// Immutable once queued; its photographs are only removed on the main queue when the job ends.
    struct Job: @unchecked Sendable { let caseId, recordId, scanId, title: String; let shots: PhotoShots; let lidar: FaceMesh; let orientation: simd_float4x4? }

    var onUpdate: ((String, URL, [String: Any]) -> Void)?
    var onProgress: ((String, String, String, Double) -> Void)?
    private var queue: [Job] = []
    private var current: (job: Job, refiner: PhotoRefiner)?
    private var lastReport: CFTimeInterval = 0

    func enqueue(_ job: Job) { DispatchQueue.main.async { self.queue.append(job); self.next() } }

    /// Stops builds for a deleted record or case (or everything) and drops their photographs.
    func cancel(caseId: String? = nil, recordId: String? = nil) {
        DispatchQueue.main.async {
            let matches = { (j: Job) in (caseId == nil || j.caseId == caseId) && (recordId == nil || j.recordId == recordId) }
            self.queue.filter(matches).forEach { $0.shots.remove() }
            self.queue.removeAll(where: matches)
            if let c = self.current, matches(c.job) { c.refiner.cancel() }
        }
    }

    private func next() {
        guard current == nil, !queue.isEmpty else { return }
        let job = queue.removeFirst(), refiner = PhotoRefiner()
        current = (job, refiner)
        var task = UIBackgroundTaskIdentifier.invalid
        task = UIApplication.shared.beginBackgroundTask(withName: "Detailed face") { refiner.cancel() }
        onProgress?(job.caseId, job.recordId, job.scanId, 0)
        Task { @MainActor in
            var face = await refiner.refine(job.shots, lidar: job.lidar, progress: { f in
                DispatchQueue.main.async {
                    let now = CACurrentMediaTime()
                    guard now - self.lastReport > 0.5 else { return }
                    self.lastReport = now
                    self.onProgress?(job.caseId, job.recordId, job.scanId, f)
                }
            })
            if let m = job.orientation { face = face?.transformed(m) }
            let saved: (URL, [String: Any])? = await withCheckedContinuation { done in
                DispatchQueue.global(qos: .utility).async {
                    done.resume(returning: FaceScanStore.applyDetailed(face, caseId: job.caseId, recordId: job.recordId, scanId: job.scanId, title: job.title))
                }
            }
            job.shots.remove()
            if let saved { self.onUpdate?(job.caseId, saved.0, saved.1) }
            if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
            self.current = nil
            self.next()
        }
    }
}

/// A coloured triangle mesh in millimetres: x towards the patient's left, y up, z out through the face.
struct FaceMesh {
    var positions: [SIMD3<Float>]
    var colours: [SIMD3<UInt8>]
    var triangles: [UInt32]

    /// Binary PLY with vertex colours, which dental CAD, MeshLab and Blender all open.
    func ply(comment: String) -> Data {
        let note = comment.replacingOccurrences(of: "\n", with: " ")
        var header = "ply\nformat binary_little_endian 1.0\ncomment SmileCompose face scan: \(note)\n"
        header += "comment units mm; x towards the patient's left, y up, z out through the face\n"
        header += "element vertex \(positions.count)\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\n"
        header += "element face \(triangles.count / 3)\nproperty list uchar int vertex_indices\nend_header\n"
        var body = [UInt8]()
        body.reserveCapacity(positions.count * 15 + triangles.count / 3 * 13)
        func put<T>(_ value: T) { withUnsafeBytes(of: value) { body.append(contentsOf: $0) } }
        for (p, c) in zip(positions, colours) {
            put(p.x.bitPattern.littleEndian); put(p.y.bitPattern.littleEndian); put(p.z.bitPattern.littleEndian)
            body.append(c.x); body.append(c.y); body.append(c.z)
        }
        for t in stride(from: 0, to: triangles.count - 2, by: 3) {
            body.append(3)
            put(Int32(triangles[t]).littleEndian); put(Int32(triangles[t + 1]).littleEndian); put(Int32(triangles[t + 2]).littleEndian)
        }
        var data = Data(header.utf8)
        data.append(contentsOf: body)
        return data
    }

    /// Reads a PLY written by `ply(comment:)`.
    static func read(_ url: URL) -> FaceMesh? {
        guard let data = try? Data(contentsOf: url), let end = data.range(of: Data("end_header\n".utf8)) else { return nil }
        let header = String(decoding: data[data.startIndex..<end.upperBound], as: UTF8.self)
        guard header.contains("format binary_little_endian"), header.contains("property uchar red") else { return nil }
        func count(_ element: String) -> Int? {
            header.split(separator: "\n").first { $0.hasPrefix("element \(element) ") }.flatMap { Int($0.split(separator: " ").last ?? "") }
        }
        guard let nv = count("vertex"), let nf = count("face") else { return nil }
        var positions = [SIMD3<Float>](), colours = [SIMD3<UInt8>](), triangles = [UInt32]()
        positions.reserveCapacity(nv); colours.reserveCapacity(nv); triangles.reserveCapacity(nf * 3)
        let ok = data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) -> Bool in
            var o = end.upperBound - data.startIndex
            guard raw.count >= o + nv * 15 + nf * 13 else { return false }
            let float = { (at: Int) in Float(bitPattern: UInt32(littleEndian: raw.loadUnaligned(fromByteOffset: at, as: UInt32.self))) }
            let int = { (at: Int) in Int32(littleEndian: raw.loadUnaligned(fromByteOffset: at, as: Int32.self)) }
            for _ in 0..<nv {
                positions.append(SIMD3(float(o), float(o + 4), float(o + 8)))
                colours.append(SIMD3(raw[o + 12], raw[o + 13], raw[o + 14]))
                o += 15
            }
            for _ in 0..<nf {
                guard raw[o] == 3 else { return false }
                let a = int(o + 1), b = int(o + 5), c = int(o + 9)
                guard a >= 0, b >= 0, c >= 0, Int(a) < nv, Int(b) < nv, Int(c) < nv else { return false }
                triangles.append(UInt32(a)); triangles.append(UInt32(b)); triangles.append(UInt32(c))
                o += 13
            }
            return true
        }
        return ok ? FaceMesh(positions: positions, colours: colours, triangles: triangles) : nil
    }

    func normals() -> [SIMD3<Float>] {
        var n = [SIMD3<Float>](repeating: .zero, count: positions.count)
        for t in stride(from: 0, to: triangles.count - 2, by: 3) {
            let a = Int(triangles[t]), b = Int(triangles[t + 1]), c = Int(triangles[t + 2])
            let f = simd_cross(positions[b] - positions[a], positions[c] - positions[a])
            n[a] += f; n[b] += f; n[c] += f
        }
        return n.map { simd_length($0) > 0 ? simd_normalize($0) : SIMD3(0, 0, 1) }
    }

    /// The mesh moved by `m` (a rigid transform in millimetres).
    func transformed(_ m: simd_float4x4) -> FaceMesh {
        var out = self
        out.positions = positions.map { let p = m * SIMD4<Float>($0, 1); return SIMD3(p.x, p.y, p.z) }
        return out
    }

    /// For SceneKit: the camera's colours (unlit), the bare shape under light (`tint` colours it), or `override`
    /// colours per point (linear RGB, for the difference map).
    func geometry(coloured: Bool, override: [SIMD3<Float>]? = nil, tint: UIColor? = nil, opacity: CGFloat = 1) -> SCNGeometry {
        let count = positions.count, stride = MemoryLayout<SIMD3<Float>>.stride
        let vertexData = positions.withUnsafeBufferPointer { Data(buffer: $0) }
        let normalData = normals().withUnsafeBufferPointer { Data(buffer: $0) }
        var sources = [
            SCNGeometrySource(data: vertexData, semantic: .vertex, vectorCount: count, usesFloatComponents: true, componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: stride),
            SCNGeometrySource(data: normalData, semantic: .normal, vectorCount: count, usesFloatComponents: true, componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: stride)
        ]
        let perPoint = override != nil && override!.count == count
        if coloured || perPoint {
            // SceneKit works in linear colour; the camera's colours are sRGB.
            var rgb = [Float]()
            rgb.reserveCapacity(count * 3)
            if let override, perPoint { for c in override { rgb.append(c.x); rgb.append(c.y); rgb.append(c.z) } }
            else { for c in colours { rgb.append(powf(Float(c.x) / 255, 2.2)); rgb.append(powf(Float(c.y) / 255, 2.2)); rgb.append(powf(Float(c.z) / 255, 2.2)) } }
            sources.append(SCNGeometrySource(data: rgb.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .color, vectorCount: count, usesFloatComponents: true,
                                             componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12))
        }
        let geometry = SCNGeometry(sources: sources, elements: [SCNGeometryElement(indices: triangles, primitiveType: .triangles)])
        let material = SCNMaterial()
        if coloured && !perPoint {
            material.lightingModel = .constant
        } else {
            material.lightingModel = .blinn
            material.diffuse.contents = perPoint ? UIColor.white : (tint ?? UIColor(red: 0.93, green: 0.89, blue: 0.83, alpha: 1))
            material.specular.contents = UIColor(white: 0.2, alpha: 1)
        }
        if opacity < 1 {
            material.transparency = opacity
            material.transparencyMode = .dualLayer
            material.isDoubleSided = true
        }
        geometry.materials = [material]
        return geometry
    }

    /// The face from the front, in a dark square, for the photo set tile.
    func preview(size: CGFloat = 720) -> UIImage? {
        guard !positions.isEmpty, let device = MTLCreateSystemDefaultDevice() else { return nil }
        let scene = FaceMesh.scene(with: geometry(coloured: true))
        let renderer = SCNRenderer(device: device, options: nil)
        renderer.scene = scene
        renderer.pointOfView = scene.rootNode.childNode(withName: "camera", recursively: false)
        return renderer.snapshot(atTime: 0, with: CGSize(width: size, height: size), antialiasingMode: .multisampling4X)
    }

    static func scene(with geometry: SCNGeometry) -> SCNScene {
        let scene = SCNScene()
        scene.background.contents = UIColor(red: 0.10, green: 0.09, blue: 0.08, alpha: 1)
        let face = SCNNode(geometry: geometry)
        face.name = "face"
        scene.rootNode.addChildNode(face)
        let camera = SCNCamera()
        camera.zNear = 10
        camera.zFar = 5000
        camera.fieldOfView = 30
        let eye = SCNNode()
        eye.name = "camera"
        eye.camera = camera
        eye.position = SCNVector3(0, -5, 620)
        // Lights move with the view, so the shape always reads.
        let key = SCNNode()
        key.light = SCNLight()
        key.light?.type = .directional
        key.light?.intensity = 900
        key.eulerAngles = SCNVector3(-0.35, 0.25, 0)
        eye.addChildNode(key)
        scene.rootNode.addChildNode(eye)
        let fill = SCNNode()
        fill.light = SCNLight()
        fill.light?.type = .ambient
        fill.light?.intensity = 350
        scene.rootNode.addChildNode(fill)
        return scene
    }
}


/// Builds the head from depth frames, from any direction: a block of 1.6 mm cubes round the head, each holding its
/// signed distance to the nearest surface seen (a truncated signed distance volume) and its colour. Every depth
/// point updates the cubes along its line of sight just in front of and behind it; many views average out the
/// sensor's noise. The surface is then read off where the distance changes sign (surface nets), keeping the
/// largest piece. Coordinates are the head's own frame, in metres: x towards the patient's left, y up, z out
/// through the face, origin at the centre of the head.
final class FaceVolume {
    /// Cube size: 1.6 mm for the LiDAR scanner, finer for the Face ID sensor's denser depth.
    let voxel: Float
    // The face, the sides of the head and under the chin; the back of the head (and the headrest behind it) and
    // the chest are left out.
    static let headLo = SIMD3<Float>(-0.12, -0.135, -0.07), headHi = SIMD3<Float>(0.12, 0.16, 0.17)
    /// The front of the face only (forehead to chin, cheek to cheek): for the short frontal holds, at finer cubes.
    static let frontLo = SIMD3<Float>(-0.085, -0.125, -0.02), frontHi = SIMD3<Float>(0.085, 0.135, 0.17)
    let lo: SIMD3<Float>, hi: SIMD3<Float>
    /// How far either side of a measured point the distance is recorded.
    let trunc: Float
    let nx, ny, nz: Int
    private let dist, weight: UnsafeMutablePointer<Float16>
    private let rgb: UnsafeMutablePointer<UInt8>
    private(set) var frames = 0
    /// Where the surface has been seen, on a 2.5 mm grid, and how many times: the live picture of the scan.
    private var seen: [Int64: (SIMD3<Float>, UInt16)] = [:]
    /// A coarse index of measured surface locations, not a second reconstructed surface. Live registration
    /// reads nearby zero crossings from the same fused TSDF used by the final mesh, instead of scanning every
    /// unobserved cube. One seed per 3 mm cell bounds storage independently of the number of captured frames.
    private let trackingSpacing: Float
    private let trackingNX, trackingNY, trackingNZ: Int
    private var trackingCells: [Int32]
    private var trackingLocations: [SIMD3<Float>] = []
    func seenPoints(limit: Int = 16000) -> [(SIMD3<Float>, UInt16)] {
        let all = Array(seen.values)
        guard all.count > limit else { return all }
        let step = Double(all.count) / Double(limit)
        return (0..<limit).map { all[Int(Double($0) * step)] }
    }

    struct Frame {
        /// Depth in metres (DepthFloat32), and for LiDAR its confidence (0 low, 1 medium, 2 high).
        let depth: CVPixelBuffer
        var confidence: CVPixelBuffer? = nil
        /// The camera image (420f), for colour.
        let image: CVPixelBuffer
        let depthK, imageK: simd_float3x3
        var cameraToHead: simd_float4x4
        var cameraInHead: SIMD3<Float>
        /// Every nth depth pixel.
        var stride = 1
        var nearest: Float = 0.15, farthest: Float = 0.9
        /// Where the patient is; depth outside it (the room, the chair) is left out.
        var mask: FaceMask? = nil
    }

    init(voxel: Float = 0.0016, lo: SIMD3<Float> = FaceVolume.headLo, hi: SIMD3<Float> = FaceVolume.headHi) {
        self.voxel = voxel
        self.lo = lo; self.hi = hi
        trunc = max(0.0032, voxel * 3.5)
        nx = Int(((hi.x - lo.x) / voxel).rounded())
        ny = Int(((hi.y - lo.y) / voxel).rounded())
        nz = Int(((hi.z - lo.z) / voxel).rounded())
        trackingSpacing = max(0.003, voxel * 2)
        trackingNX = Int(ceilf((hi.x - lo.x) / trackingSpacing))
        trackingNY = Int(ceilf((hi.y - lo.y) / trackingSpacing))
        trackingNZ = Int(ceilf((hi.z - lo.z) / trackingSpacing))
        trackingCells = [Int32](repeating: -1, count: trackingNX * trackingNY * trackingNZ)
        let n = nx * ny * nz
        dist = .allocate(capacity: n); dist.initialize(repeating: 1, count: n)
        weight = .allocate(capacity: n); weight.initialize(repeating: 0, count: n)
        rgb = .allocate(capacity: n * 3); rgb.initialize(repeating: 0, count: n * 3)
    }
    deinit { dist.deallocate(); weight.deallocate(); rgb.deallocate() }
    func withStorage<T>(_ body: (UnsafeMutablePointer<Float16>, UnsafeMutablePointer<Float16>) -> T) -> T { body(dist, weight) }

    func integrate(_ f: Frame) {
        let depth = f.depth, image = f.image
        CVPixelBufferLockBaseAddress(depth, .readOnly)
        CVPixelBufferLockBaseAddress(image, .readOnly)
        if let c = f.confidence { CVPixelBufferLockBaseAddress(c, .readOnly) }
        defer {
            CVPixelBufferUnlockBaseAddress(depth, .readOnly)
            CVPixelBufferUnlockBaseAddress(image, .readOnly)
            if let c = f.confidence { CVPixelBufferUnlockBaseAddress(c, .readOnly) }
        }
        let maskReader = f.mask?.lock()
        defer { if maskReader != nil { f.mask?.unlock() } }
        guard CVPixelBufferGetPixelFormatType(depth) == kCVPixelFormatType_DepthFloat32, CVPixelBufferGetPlaneCount(image) >= 2,
              let dBase = CVPixelBufferGetBaseAddress(depth), let yBase = CVPixelBufferGetBaseAddressOfPlane(image, 0),
              let cBase = CVPixelBufferGetBaseAddressOfPlane(image, 1) else { return }
        let dw = CVPixelBufferGetWidth(depth), dh = CVPixelBufferGetHeight(depth), dStride = CVPixelBufferGetBytesPerRow(depth) / 4
        let d = dBase.assumingMemoryBound(to: Float32.self)
        var conf: UnsafeMutablePointer<UInt8>?, confRow = 0
        if let c = f.confidence, CVPixelBufferGetWidth(c) == dw, CVPixelBufferGetHeight(c) == dh, let base = CVPixelBufferGetBaseAddress(c) {
            conf = base.assumingMemoryBound(to: UInt8.self); confRow = CVPixelBufferGetBytesPerRow(c)
        }
        let iw = CVPixelBufferGetWidthOfPlane(image, 0), ih = CVPixelBufferGetHeightOfPlane(image, 0)
        let yRow = CVPixelBufferGetBytesPerRowOfPlane(image, 0), cRow = CVPixelBufferGetBytesPerRowOfPlane(image, 1)
        let yp = yBase.assumingMemoryBound(to: UInt8.self), cp = cBase.assumingMemoryBound(to: UInt8.self)
        let fx = f.depthK[0][0], fy = f.depthK[1][1], cx = f.depthK[2][0], cy = f.depthK[2][1]
        let ifx = f.imageK[0][0], ify = f.imageK[1][1], icx = f.imageK[2][0], icy = f.imageK[2][1]
        // (A focal length can be negative: that's how a mirrored front-camera image is described.)
        guard fx != 0, fy != 0, dw > 4, dh > 4 else { return }
        let m = f.cameraToHead
        let c0 = SIMD3(m.columns.0.x, m.columns.0.y, m.columns.0.z), c1 = SIMD3(m.columns.1.x, m.columns.1.y, m.columns.1.z)
        let c2 = SIMD3(m.columns.2.x, m.columns.2.y, m.columns.2.z), c3 = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
        let cam = f.cameraInHead
        let sx = ifx / fx, sy = ify / fy, ox = icx - cx * sx, oy = icy - cy * sy
        let lo = self.lo, hi = self.hi, v = voxel, inv = 1 / voxel, trunc = self.trunc, steps = Int((trunc / v).rounded(.up))
        let nx = self.nx, ny = self.ny, nz = self.nz, plane = nx * ny
        let st = max(1, f.stride), edge = 0.012 as Float
        let trackingInv = 1 / trackingSpacing
        var vv = st
        while vv < dh - st {
            let row = vv * dStride
            var uu = st
            while uu < dw - st {
                defer { uu += st }
                let z = d[row + uu]
                guard z > f.nearest, z < f.farthest else { continue }
                if let m = maskReader, !m.contains(Float(uu) / Float(dw), Float(vv) / Float(dh)) { continue }
                // Points on an edge (between the face and what's behind it) are unreliable.
                guard abs(d[row + uu - st] - z) < edge, abs(d[row + uu + st] - z) < edge,
                      abs(d[row - st * dStride + uu] - z) < edge, abs(d[row + st * dStride + uu] - z) < edge else { continue }
                var w: Float = 1
                if let conf { let k = conf[vv * confRow + uu]; if k == 0 { continue }; w = k >= 2 ? 1 : 0.4 }
                let xn = (Float(uu) - cx) / fx, yn = (Float(vv) - cy) / fy
                let p = c0 * (xn * z) - c1 * (yn * z) - c2 * z + c3
                guard p.x > lo.x, p.x < hi.x, p.y > lo.y, p.y < hi.y, p.z > lo.z, p.z < hi.z else { continue }
                // Surfaces seen square-on are trusted more than ones seen at a steep angle (the sides of the face).
                let zl = d[row + uu - st], zr = d[row + uu + st], zu = d[row - st * dStride + uu], zd = d[row + st * dStride + uu]
                let pl = SIMD3<Float>((Float(uu - st) - cx) / fx * zl, -((Float(vv) - cy) / fy) * zl, -zl)
                let pr = SIMD3<Float>((Float(uu + st) - cx) / fx * zr, -((Float(vv) - cy) / fy) * zr, -zr)
                let pu = SIMD3<Float>((Float(uu) - cx) / fx * zu, -((Float(vv - st) - cy) / fy) * zu, -zu)
                let pd = SIMD3<Float>((Float(uu) - cx) / fx * zd, -((Float(vv + st) - cy) / fy) * zd, -zd)
                let nrm = simd_cross(pr - pl, pd - pu), here = SIMD3<Float>(xn * z, -yn * z, -z)
                let nl = simd_length(nrm)
                if nl > 1e-9 { w *= max(0.15, abs(simd_dot(nrm / nl, simd_normalize(here)))) }
                let ray = simd_normalize(p - cam)
                if uu % 3 == 0, vv % 3 == 0 {
                    let g = (p - lo) / 0.0025
                    let key = Int64(g.x) | (Int64(g.y) << 20) | (Int64(g.z) << 40)
                    let old = seen[key]
                    seen[key] = (old.map { ($0.0 + (p - $0.0) * 0.2) } ?? p, min((old?.1 ?? 0) + 1, 999))
                }
                // Colour from the camera image at the same point.
                let iu = Int(Float(uu) * sx + ox), iv = Int(Float(vv) * sy + oy)
                guard iu >= 0, iu < iw, iv >= 0, iv < ih else { continue }
                let luma = Float(yp[iv * yRow + iu]), chroma = (iv / 2) * cRow + (iu / 2) * 2
                let cb = Float(cp[chroma]) - 128, cr = Float(cp[chroma + 1]) - 128
                let colour = SIMD3<Float>(luma + 1.402 * cr, luma - 0.344136 * cb - 0.714136 * cr, luma + 1.772 * cb)
                let ti = min(trackingNX - 1, Int((p.x - lo.x) * trackingInv))
                let tj = min(trackingNY - 1, Int((p.y - lo.y) * trackingInv))
                let tl = min(trackingNZ - 1, Int((p.z - lo.z) * trackingInv))
                let key = (tl * trackingNY + tj) * trackingNX + ti
                let seed = Int(trackingCells[key])
                if seed < 0 {
                    trackingCells[key] = Int32(trackingLocations.count)
                    trackingLocations.append(p)
                } else {
                    trackingLocations[seed] = p
                }
                for k in -steps...steps {
                    let s = Float(k) * v
                    let q = p + ray * s
                    let i = Int(((q.x - lo.x) * inv).rounded()), j = Int(((q.y - lo.y) * inv).rounded()), l = Int(((q.z - lo.z) * inv).rounded())
                    guard i >= 0, i < nx, j >= 0, j < ny, l >= 0, l < nz else { continue }
                    let idx = l * plane + j * nx + i
                    // The distance from this cube's centre to the surface point, along the line of sight.
                    let centre = lo + SIMD3<Float>(Float(i), Float(j), Float(l)) * v
                    let along = simd_dot(centre - p, ray)
                    guard along > -trunc * 1.2, along < trunc * 1.2 else { continue }
                    let sdf = max(-1, min(1, -along / trunc))
                    let w0 = Float(weight[idx]), d0 = Float(dist[idx])
                    let nw = w0 + w
                    dist[idx] = Float16((d0 * w0 + sdf * w) / nw)
                    weight[idx] = Float16(min(nw, 60))
                    if abs(along) <= v * 1.2 {
                        let o = idx * 3, a = w / nw
                        for ch in 0..<3 {
                            let old = Float(rgb[o + ch])
                            rgb[o + ch] = UInt8(max(0, min(255, (old + (colour[ch] - old) * (w0 == 0 ? 1 : a)).rounded())))
                        }
                    }
                }
            }
            vv += st
        }
        frames += 1
    }

    /// The surface where the distance changes sign, in millimetres, keeping the largest connected piece.
    func mesh(minWeight: Float = 2) -> FaceMesh? {
        let nx = self.nx, ny = self.ny, nz = self.nz, plane = nx * ny
        let weight = self.weight, dist = self.dist, rgb = self.rgb
        let ok = { (i: Int) -> Bool in Float(weight[i]) >= minWeight }
        var vertexOf = [Int32](repeating: -1, count: nx * ny * nz)
        var positions = [SIMD3<Float>](), colours = [SIMD3<UInt8>]()
        let corners = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0), (0, 0, 1), (1, 0, 1), (0, 1, 1), (1, 1, 1)]
        let edges = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
        // One vertex per cube that the surface passes through, at the mean of its edge crossings.
        for l in 0..<(nz - 1) { for j in 0..<(ny - 1) { for i in 0..<(nx - 1) {
            let base = l * plane + j * nx + i
            var val = SIMD8<Float>(), inside = 0, valid = true
            for n in 0..<8 {
                let c = corners[n], k = base + c.2 * plane + c.1 * nx + c.0
                let w = Float(weight[k])
                if w < minWeight { valid = false; break }
                val[n] = Float(dist[k]); if val[n] < 0 { inside += 1 }
            }
            guard valid, inside > 0, inside < 8 else { continue }
            var sum = SIMD3<Float>.zero, count: Float = 0
            for (a, b) in edges where (val[a] < 0) != (val[b] < 0) {
                let t = val[a] / (val[a] - val[b])
                let pa = SIMD3<Float>(Float(corners[a].0), Float(corners[a].1), Float(corners[a].2))
                let pb = SIMD3<Float>(Float(corners[b].0), Float(corners[b].1), Float(corners[b].2))
                sum += pa + (pb - pa) * t; count += 1
            }
            let local = sum / count
            let p = (lo + (SIMD3<Float>(Float(i), Float(j), Float(l)) + local) * voxel) * 1000
            // Colour from the corners nearest the surface.
            var c = SIMD3<Float>.zero, cw: Float = 0
            for n in 0..<8 {
                let cn = corners[n], o = (base + cn.2 * plane + cn.1 * nx + cn.0) * 3
                let colour = SIMD3<Float>(Float(rgb[o]), Float(rgb[o + 1]), Float(rgb[o + 2]))
                guard colour != .zero else { continue }
                let w = max(0.05, 1 - abs(val[n])); c += colour * w; cw += w
            }
            if cw > 0 { c /= cw }
            vertexOf[base] = Int32(positions.count)
            positions.append(p)
            colours.append(SIMD3(UInt8(c.x.rounded()), UInt8(c.y.rounded()), UInt8(c.z.rounded())))
        } } }
        guard positions.count > 3000 else { return nil }
        // Two triangles for every cube edge the surface crosses, joining the four cubes round it.
        var triangles = [UInt32]()
        func quad(_ a: Int, _ b: Int, _ c: Int, _ d: Int, flip: Bool) {
            let va = vertexOf[a], vb = vertexOf[b], vc = vertexOf[c], vd = vertexOf[d]
            guard va >= 0, vb >= 0, vc >= 0, vd >= 0 else { return }
            let (A, B, C, D) = (UInt32(va), UInt32(vb), UInt32(vc), UInt32(vd))
            if flip { triangles += [A, D, C, A, C, B] } else { triangles += [A, B, C, A, C, D] }
        }
        for l in 1..<(nz - 1) { for j in 1..<(ny - 1) { for i in 1..<(nx - 1) {
            let k = l * plane + j * nx + i
            guard ok(k) else { continue }
            let here = Float(dist[k]) < 0
            // Edge along x to (i+1, j, l): cubes (i, j-1..j, l-1..l).
            if i < nx - 1, ok(k + 1), (Float(dist[k + 1]) < 0) != here {
                quad(k - nx - plane, k - plane, k, k - nx, flip: !here)
            }
            if j < ny - 1, ok(k + nx), (Float(dist[k + nx]) < 0) != here {
                quad(k - 1 - plane, k - plane, k, k - 1, flip: here)
            }
            if l < nz - 1, ok(k + plane), (Float(dist[k + plane]) < 0) != here {
                quad(k - 1 - nx, k - nx, k, k - 1, flip: !here)
            }
        } } }
        var mesh = FaceMesh(positions: positions, colours: colours, triangles: triangles)
        mesh = mesh.largestPiece()
        mesh.smooth(iterations: 2, amount: 0.35)
        return mesh.triangles.count >= 6000 ? mesh : nil
    }
}

extension FaceMesh {
    /// Only the largest connected piece (drops loose bits from the room or hair).
    func largestPiece() -> FaceMesh {
        var parent = Array(0..<Int32(positions.count))
        func find(_ x: Int32) -> Int32 { var x = x; while parent[Int(x)] != x { parent[Int(x)] = parent[Int(parent[Int(x)])]; x = parent[Int(x)] }; return x }
        for t in stride(from: 0, to: triangles.count - 2, by: 3) {
            let a = find(Int32(triangles[t])), b = find(Int32(triangles[t + 1])), c = find(Int32(triangles[t + 2]))
            parent[Int(b)] = a; parent[Int(c)] = a
        }
        var size = [Int32: Int]()
        for t in triangles { size[find(Int32(t)), default: 0] += 1 }
        guard let keep = size.max(by: { $0.value < $1.value })?.key else { return self }
        var map = [Int32](repeating: -1, count: positions.count)
        var out = FaceMesh(positions: [], colours: [], triangles: [])
        for t in stride(from: 0, to: triangles.count - 2, by: 3) where find(Int32(triangles[t])) == keep {
            for k in 0..<3 {
                let v = Int(triangles[t + k])
                if map[v] < 0 { map[v] = Int32(out.positions.count); out.positions.append(positions[v]); out.colours.append(colours[v]) }
                out.triangles.append(UInt32(map[v]))
            }
        }
        return out
    }

    /// A light smoothing of the surface (each point moves part way to the mean of its neighbours).
    mutating func smooth(iterations: Int, amount: Float) {
        var neighbours = [[Int32]](repeating: [], count: positions.count)
        for t in stride(from: 0, to: triangles.count - 2, by: 3) {
            let a = Int32(triangles[t]), b = Int32(triangles[t + 1]), c = Int32(triangles[t + 2])
            neighbours[Int(a)] += [b, c]; neighbours[Int(b)] += [a, c]; neighbours[Int(c)] += [a, b]
        }
        for _ in 0..<iterations {
            var next = positions
            for (i, n) in neighbours.enumerated() where !n.isEmpty {
                var m = SIMD3<Float>.zero
                for k in n { m += positions[Int(k)] }
                m /= Float(n.count)
                next[i] = positions[i] + (m - positions[i]) * amount
            }
            positions = next
        }
    }
}

/// Which parts of the face have been seen closely enough: points spread over the face (from the patient's right ear
/// round to the left, brow to chin), each counted once a view has faced it within 35°. Only the points this pose can
/// actually reach count (a smile scan turns 45°, so the far side of the ear can never be seen); otherwise the meter
/// stalls short of the target and the scan never finishes.
struct FaceCoverage {
    static let azimuths = Array(stride(from: -80, through: 80, by: 10)).map(Float.init)
    static let elevations = Array(stride(from: -30, through: 40, by: 10)).map(Float.init)
    private(set) var seen = Set<Int>()
    /// The points a sweep round this pose (to about 85% of its turn and tilt) can face.
    let reachable: Set<Int>
    static var total: Int { azimuths.count * elevations.count }

    init(turn: Float = 80, tilt: Float = 40) {
        var r = Set<Int>()
        let cone = cosf(35 * .pi / 180)
        for x in stride(from: Float(-1), through: 1, by: 0.1) { for y in stride(from: Float(-1), through: 1, by: 0.1) where x * x + y * y <= 1 {
            let view = Self.direction(x * turn * 0.85, y * tilt * 0.85)
            for (a, az) in Self.azimuths.enumerated() { for (e, el) in Self.elevations.enumerated() where simd_dot(view, Self.direction(az, el)) > cone {
                r.insert(e * Self.azimuths.count + a)
            } }
        } }
        reachable = r
    }

    /// `azimuth` and `elevation` of the camera as seen from the head, in degrees. True when a new point was seen.
    @discardableResult
    mutating func add(azimuth: Float, elevation: Float) -> Bool {
        let before = seen.count
        let view = Self.direction(azimuth, elevation)
        for (a, az) in Self.azimuths.enumerated() { for (e, el) in Self.elevations.enumerated() {
            if simd_dot(view, Self.direction(az, el)) > cosf(35 * .pi / 180) { seen.insert(e * Self.azimuths.count + a) }
        } }
        return seen.count > before
    }
    /// Share of the reachable face seen so far.
    var fraction: Float { Float(seen.intersection(reachable).count) / Float(max(1, reachable.count)) }
    /// Seen share of one side: negative azimuths are the patient's right.
    func fraction(right: Bool) -> Float {
        let side = reachable.filter { right ? Self.azimuths[$0 % Self.azimuths.count] < 0 : Self.azimuths[$0 % Self.azimuths.count] > 0 }
        return Float(seen.intersection(side).count) / Float(max(1, side.count))
    }
    static func direction(_ az: Float, _ el: Float) -> SIMD3<Float> {
        let a = az * .pi / 180, e = el * .pi / 180
        return SIMD3(sinf(a) * cosf(e), sinf(e), cosf(a) * cosf(e))
    }
}

/// The finished scans, as a lab needs them, made once all the expressions are captured:
/// cleaned (ragged edges trimmed, small holes filled — never in the mouth — and sensor noise smoothed without
/// shrinking the face); given photographic skin (Face ID scans); scale-corrected where this device's scale check
/// found an error; then put in one shared frame — natural head position from gravity, the facial midline from the
/// face's own symmetry, origin at subnasale — with the other expressions lined up on the Relaxed scan by the forehead,
/// nasal root and cheekbones, so one teeth registration in the lab places them all.
enum FaceFinish {
    struct Orientation {
        /// Head frame (mm) to the export frame.
        let transform: simd_float4x4
        /// How far the facial midline leans from true vertical, in degrees (+: its top towards the patient's left).
        let midlineTilt: Float
        /// The mirror fit (mm), or nil when the midline couldn't be found from symmetry.
        let symmetryFit: Float?
        /// The midline plane in the export frame: n · p = d (n.xyz, d).
        let midlinePlane: SIMD4<Float>
        let pronasale: SIMD3<Float>?, subnasale: SIMD3<Float>?
        let gravityRecorded: Bool
    }

    /// Lips and teeth (head frame): never patched, so nothing invented sits where the teeth are set.
    static let mouth: FaceAlign.Region = { p in p.y > -66 && p.y < -6 && abs(p.x) < 44 && p.z > 40 }

    static func clean(_ mesh: FaceMesh) -> (mesh: FaceMesh, holesFilled: Int) {
        var m = mesh
        m.trimSpikes(passes: 3)
        m = m.largestPiece()
        let filled = m.fillHoles(maxEdges: 40, keepOpen: mouth)
        m.taubin(iterations: 6)
        return (m, filled)
    }

    /// The face mirrored and lined up on itself (upper face, nose and philtrum) gives the reflection across its
    /// midline: the plane n · p = d in the head frame, and the fit.
    static func symmetryPlane(_ m: FaceMesh) -> (n: SIMD3<Float>, d: Float, fit: Float)? {
        var mirrored = m
        mirrored.positions = m.positions.map { SIMD3(-$0.x, $0.y, $0.z) }
        for t in Swift.stride(from: 0, to: mirrored.triangles.count - 2, by: 3) { mirrored.triangles.swapAt(t + 1, t + 2) }
        guard let fit = FaceAlign.align(base: m, moving: mirrored, region: FaceAlign.midlineRegion), fit.rms < 2.5, fit.overlap > 0.5 else { return nil }
        var flip = matrix_identity_float4x4
        flip.columns.0 = SIMD4(-1, 0, 0, 0)
        let S = fit.transform * flip
        let L = simd_float3x3(SIMD3(S.columns.0.x, S.columns.0.y, S.columns.0.z), SIMD3(S.columns.1.x, S.columns.1.y, S.columns.1.z), SIMD3(S.columns.2.x, S.columns.2.y, S.columns.2.z))
        let K = matrix_identity_float3x3 - L          // = 2 n nᵀ for a reflection
        let col = [K.columns.0, K.columns.1, K.columns.2].max(by: { simd_length($0) < simd_length($1) })!
        guard simd_length(col) > 0.5 else { return nil }
        var n = simd_normalize(col)
        if n.x < 0 { n = -n }
        guard n.x > cosf(20 * .pi / 180) else { return nil }
        let t = SIMD3(S.columns.3.x, S.columns.3.y, S.columns.3.z)
        return (n, simd_dot(t, n) / 2, fit.rms)
    }

    /// The export frame for a scan: +y true vertical (gravity in the head frame when the scan started), x horizontal
    /// towards the patient's left with the midline's horizontal direction as x = 0, z forward, origin at subnasale.
    /// The midline's lean from vertical is measured and reported, not removed.
    static func orientation(_ m: FaceMesh, gravityUp: SIMD3<Float>?, eyes: (left: SIMD3<Float>, right: SIMD3<Float>)?) -> Orientation {
        let g = gravityUp.map(simd_normalize) ?? SIMD3(0, 1, 0)
        let R1 = simd_float4x4(simd_quatf(from: g, to: SIMD3(0, 1, 0)))
        let plane = symmetryPlane(m)
        let nHead = plane?.n ?? SIMD3(1, 0, 0), dHead = plane?.d ?? 0
        let n1v = R1 * SIMD4<Float>(nHead, 0), n1 = SIMD3(n1v.x, n1v.y, n1v.z)
        let yaw = atan2f(n1.z, n1.x), c = cosf(yaw), s = sinf(yaw)
        var R2 = matrix_identity_float4x4
        R2.columns.0 = SIMD4(c, 0, -s, 0); R2.columns.2 = SIMD4(s, 0, c, 0)
        let M = R2 * R1
        let n2v = M * SIMD4<Float>(nHead, 0), n2 = simd_normalize(SIMD3(n2v.x, n2v.y, n2v.z))
        let q = m.positions.map { p -> SIMD3<Float> in let v = M * SIMD4<Float>(p, 1); return SIMD3(v.x, v.y, v.z) }
        // Nose tip and subnasale on the midline profile: in each 1 mm band of height, the point nearest the midline.
        var profile: [Int: (SIMD3<Float>, Float)] = [:]
        for p in q {
            let off = abs(simd_dot(n2, p) - dHead)
            guard off < 3 else { continue }
            let band = Int(floorf(p.y))
            if let have = profile[band], have.1 <= off { continue }
            profile[band] = (p, off)
        }
        let line = profile.values.map(\.0)
        var eyeY: Float?
        if let e = eyes { let mid = M * SIMD4<Float>((e.left + e.right) / 2, 1); eyeY = mid.y }
        let tipRange: ClosedRange<Float> = eyeY.map { ($0 - 80)...($0 - 15) } ?? (-35)...35
        let tip = line.filter { tipRange.contains($0.y) }.max(by: { $0.z < $1.z })
        var sub: SIMD3<Float>?
        if let tip {
            let below = line.filter { $0.y < tip.y - 6 && $0.y > tip.y - 28 && $0.z > tip.z - 40 }
            if below.count > 5 { sub = below.min(by: { $0.z < $1.z }) }
        }
        let origin = sub ?? tip ?? .zero
        var T = matrix_identity_float4x4
        T.columns.3 = SIMD4(-origin, 1)
        return Orientation(transform: T * M, midlineTilt: asinf(max(-1, min(1, n2.y))) * 180 / .pi, symmetryFit: plane?.fit,
                           midlinePlane: SIMD4(n2, dHead - simd_dot(n2, origin)), pronasale: tip.map { $0 - origin }, subnasale: sub.map { $0 - origin },
                           gravityRecorded: gravityUp != nil)
    }

    /// All the expressions finished together (heavy work, so it waits until every scan is captured).
    static func finishAll(_ input: [FaceScanResult], scale: Float) -> [FaceScanResult] {
        var results = input
        for i in results.indices {
            var r = results[i]
            let cleaned = clean(r.mesh)
            r.mesh = cleaned.mesh; r.holesFilled = cleaned.holesFilled
            if r.sensor == "trueDepth", !r.views.isEmpty, let made = ViewTexture.make(r.mesh, views: r.views) { r.textured = made.textured; r.mesh = made.mesh }
            r.views = []
            if r.textured == nil { r.mesh.smoothColours(iterations: 2) }
            // This device's scale check (Face ID sensor only).
            if r.sensor == "trueDepth", abs(scale - 1) > 0.001 {
                let S = simd_float4x4(diagonal: SIMD4(scale, scale, scale, 1))
                r.mesh = r.mesh.transformed(S); r.textured = r.textured?.transformed(S)
                r.eyes = r.eyes.map { (left: $0.left * scale, right: $0.right * scale) }
                r.scaleCorrection = scale
            }
            r.unrotated = r.mesh
            results[i] = r
        }
        guard !results.isEmpty else { return results }
        let base = results.firstIndex(where: { $0.id == "rest" }) ?? 0
        let o = orientation(results[base].mesh, gravityUp: results[base].gravityUp, eyes: results[base].eyes)
        for i in results.indices {
            var E = o.transform, own = o
            results[i].registeredTo = nil; results[i].sharedFit = nil
            if i == base {
                results[i].sharedFit = 0
            } else if let a = FaceAlign.align(base: results[base].mesh, moving: results[i].mesh, region: FaceAlign.upperFace), a.rms < 1.5, a.overlap > 0.4 {
                E = o.transform * a.transform
                results[i].registeredTo = results[base].id; results[i].sharedFit = a.rms
            } else {
                own = orientation(results[i].mesh, gravityUp: results[i].gravityUp, eyes: results[i].eyes)
                E = own.transform
            }
            var r = results[i]
            r.mesh = r.mesh.transformed(E); r.textured = r.textured?.transformed(E)
            r.eyes = r.eyes.map { e in
                let l = E * SIMD4<Float>(e.left, 1), rr = E * SIMD4<Float>(e.right, 1)
                return (SIMD3(l.x, l.y, l.z), SIMD3(rr.x, rr.y, rr.z))
            }
            r.orientation = own
            r.exportFromScan = E
            r.preview = r.textured?.preview() ?? r.mesh.preview()
            results[i] = r
        }
        return results
    }
}

extension FaceMesh {
    private func neighbourLists() -> [[Int32]] {
        var n = [[Int32]](repeating: [], count: positions.count)
        for t in Swift.stride(from: 0, to: triangles.count - 2, by: 3) {
            let a = Int32(triangles[t]), b = Int32(triangles[t + 1]), c = Int32(triangles[t + 2])
            n[Int(a)] += [b, c]; n[Int(b)] += [a, c]; n[Int(c)] += [a, b]
        }
        return n.map { Array(Set($0)) }
    }

    private func boundaryHalfEdges() -> [(UInt32, UInt32)] {
        var edges = Set<UInt64>()
        let key = { (a: UInt32, b: UInt32) in UInt64(a) << 32 | UInt64(b) }
        for t in Swift.stride(from: 0, to: triangles.count - 2, by: 3) {
            let a = triangles[t], b = triangles[t + 1], c = triangles[t + 2]
            edges.insert(key(a, b)); edges.insert(key(b, c)); edges.insert(key(c, a))
        }
        return edges.compactMap { e in
            let a = UInt32(e >> 32), b = UInt32(e & 0xFFFF_FFFF)
            return edges.contains(key(b, a)) ? nil : (a, b)
        }
    }

    /// Drops triangles hanging off the edge by a single corner (two of their sides on the border).
    mutating func trimSpikes(passes: Int) {
        for _ in 0..<passes {
            let border = Set(boundaryHalfEdges().map { UInt64($0.0) << 32 | UInt64($0.1) })
            var kept: [UInt32] = []
            kept.reserveCapacity(triangles.count)
            for t in Swift.stride(from: 0, to: triangles.count - 2, by: 3) {
                let a = triangles[t], b = triangles[t + 1], c = triangles[t + 2]
                let open = [(a, b), (b, c), (c, a)].filter { border.contains(UInt64($0.0) << 32 | UInt64($0.1)) }.count
                if open < 2 { kept += [a, b, c] }
            }
            if kept.count == triangles.count { break }
            triangles = kept
        }
    }

    /// Closes small holes (up to `maxEdges` round) with a fan from their centre, coloured from their rim. The
    /// longest border, the edge of the face, is left open.
    @discardableResult
    mutating func fillHoles(maxEdges: Int, keepOpen: FaceAlign.Region? = nil) -> Int {
        var next: [UInt32: [UInt32]] = [:]
        for (a, b) in boundaryHalfEdges() { next[a, default: []].append(b) }
        var loops: [[UInt32]] = []
        while let start = next.keys.first {
            var loop: [UInt32] = [start], here = start, closed = false
            while let outs = next[here], let to = outs.first {
                if outs.count > 1 { next[here] = Array(outs.dropFirst()) } else { next[here] = nil }
                if to == start { closed = true; break }
                loop.append(to); here = to
                if loop.count > 4000 { break }
            }
            if next[start]?.isEmpty == true { next[start] = nil }
            if closed { loops.append(loop) }
        }
        guard let outer = loops.indices.max(by: { loops[$0].count < loops[$1].count }) else { return 0 }
        var filled = 0
        for (i, loop) in loops.enumerated() where i != outer && loop.count >= 3 && loop.count <= maxEdges {
            var centre = SIMD3<Float>.zero, colour = SIMD3<Float>.zero
            for v in loop { centre += positions[Int(v)]; colour += SIMD3<Float>(colours[Int(v)]) }
            centre /= Float(loop.count); colour /= Float(loop.count)
            if let keepOpen, keepOpen(centre) { continue }
            filled += 1
            let c = UInt32(positions.count)
            positions.append(centre)
            colours.append(SIMD3(UInt8(colour.x.rounded()), UInt8(colour.y.rounded()), UInt8(colour.z.rounded())))
            for k in 0..<loop.count { triangles += [loop[(k + 1) % loop.count], loop[k], c] }
        }
        return filled
    }

    /// Taubin smoothing: alternate shrinking and inflating steps, so noise goes without the face getting smaller.
    mutating func taubin(iterations: Int, lambda: Float = 0.5, mu: Float = -0.53) {
        let neighbours = neighbourLists()
        func step(_ f: Float) {
            var out = positions
            for (i, n) in neighbours.enumerated() where n.count >= 3 {
                var m = SIMD3<Float>.zero
                for k in n { m += positions[Int(k)] }
                out[i] = positions[i] + (m / Float(n.count) - positions[i]) * f
            }
            positions = out
        }
        for _ in 0..<iterations { step(lambda); step(mu) }
    }

    /// Evens out blotchy colour by blending each point with its neighbours.
    mutating func smoothColours(iterations: Int) {
        let neighbours = neighbourLists()
        for _ in 0..<iterations {
            var out = colours
            for (i, n) in neighbours.enumerated() where !n.isEmpty {
                var m = SIMD3<Float>.zero
                for k in n { m += SIMD3<Float>(colours[Int(k)]) }
                let mixed = (SIMD3<Float>(colours[i]) + m / Float(n.count)) / 2
                out[i] = SIMD3(UInt8(mixed.x.rounded()), UInt8(mixed.y.rounded()), UInt8(mixed.z.rounded()))
            }
            colours = out
        }
    }
}

/// Lines one scan up on another (rigid only): iterative closest points on the forehead, eyes, nose and cheekbones,
/// which change little with expression, then measures how far apart the surfaces are.
enum FaceAlign {
    struct Result { let transform: simd_float4x4; let rms: Float; let overlap: Float }

    /// Parts of the face (head frame, mm) that change little with expression.
    typealias Region = (SIMD3<Float>) -> Bool
    static let defaultRegion: Region = { p in p.y > -15 && p.y < 95 && p.z > 20 && abs(p.x) < 70 }
    /// Forehead, nasal root, cheekbones and orbital rims: the eyes, lips, cheeks and chin left out. Used to put every
    /// expression's scan in one frame.
    static let upperFace: Region = { p in
        guard p.y > 5, p.y < 100, p.z > 20, abs(p.x) < 70 else { return false }
        let ax = abs(p.x)
        return !(p.y > 24 && p.y < 58 && ax > 8 && ax < 56 && p.z > 45)
    }
    /// The upper face plus the nose and philtrum, for finding the midline from the face's symmetry.
    static let midlineRegion: Region = { p in
        guard p.y > -32, p.y < 100, p.z > 20, abs(p.x) < 70 else { return false }
        let ax = abs(p.x)
        if p.y > 24 && p.y < 58 && ax > 8 && ax < 56 && p.z > 45 { return false }   // eyes
        if p.y < -4 && ax > 13 { return false }                                        // cheeks beside the mouth
        return true
    }

    private static func stable(_ m: FaceMesh, limit: Int, region: Region = defaultRegion) -> [Int] {
        let idx = m.positions.indices.filter { region(m.positions[$0]) }
        let step = max(1, idx.count / limit)
        return Swift.stride(from: 0, to: idx.count, by: step).map { idx[$0] }
    }

    /// A grid for nearest-point searches, in millimetres.
    struct Grid {
        let cell: Float
        let points: [SIMD3<Float>]
        private var map: [Int64: [Int32]] = [:]
        init(_ points: [SIMD3<Float>], cell: Float) {
            self.cell = cell; self.points = points
            for (i, p) in points.enumerated() { map[key(p), default: []].append(Int32(i)) }
        }
        private func cellOf(_ p: SIMD3<Float>) -> SIMD3<Int64> { SIMD3(Int64(floorf(p.x / cell)), Int64(floorf(p.y / cell)), Int64(floorf(p.z / cell))) }
        private func key(_ c: SIMD3<Int64>) -> Int64 { (c.x & 0x1FFFFF) | ((c.y & 0x1FFFFF) << 21) | ((c.z & 0x1FFFFF) << 42) }
        private func key(_ p: SIMD3<Float>) -> Int64 { key(cellOf(p)) }
        /// The nearest point within `radius` (no more than one cell).
        func nearest(_ p: SIMD3<Float>, within radius: Float) -> (Int, Float)? {
            let c = cellOf(p)
            var best = -1, bestD = radius * radius
            for dz in -1...1 { for dy in -1...1 { for dx in -1...1 {
                guard let list = map[key(c &+ SIMD3(Int64(dx), Int64(dy), Int64(dz)))] else { continue }
                for i in list { let d = simd_length_squared(points[Int(i)] - p); if d < bestD { bestD = d; best = Int(i) } }
            } } }
            return best < 0 ? nil : (best, bestD.squareRoot())
        }
    }

    static func align(base: FaceMesh, moving: FaceMesh, region: Region = defaultRegion) -> Result? {
        let ti = stable(base, limit: 14000, region: region), baseNormals = base.normals()
        let target = ti.map { base.positions[$0] }, targetNormals = ti.map { baseNormals[$0] }
        let source = stable(moving, limit: 5000, region: region).map { moving.positions[$0] }
        guard target.count > 400, source.count > 400 else { return nil }
        return icp(source: source, target: target, targetNormals: targetNormals)
    }

    /// Point-to-plane ICP of `source` onto the `target` surface, from `initial`, the search narrowing from `reach` mm.
    static func icp(source: [SIMD3<Float>], target: [SIMD3<Float>], targetNormals: [SIMD3<Float>], initial: simd_float4x4 = matrix_identity_float4x4, reach: Float = 12) -> Result? {
        guard target.count > 50, source.count > 50 else { return nil }
        let grid = Grid(target, cell: max(reach, 3))
        // Point-to-plane: each step solves for the small turn and shift that bring the moving points onto the
        // base's surface (not just its nearest points), so it doesn't slide along smooth areas.
        var M = initial
        var last: [Float] = []
        for it in 0..<40 {
            let maxD: Float = it < 15 ? reach - Float(it) * (reach - 3) / 15 : 3
            var rows: [(SIMD3<Float>, SIMD3<Float>, SIMD3<Float>, Float)] = []
            rows.reserveCapacity(source.count)
            for s in source {
                let p4 = M * SIMD4<Float>(s, 1), p = SIMD3(p4.x, p4.y, p4.z)
                guard let (j, _) = grid.nearest(p, within: maxD) else { continue }
                let n = targetNormals[j]
                rows.append((p, target[j], n, simd_dot(p - target[j], n)))
            }
            guard rows.count > min(200, source.count / 3) else { return nil }
            rows.sort { abs($0.3) < abs($1.3) }
            let kept = rows.prefix(Int(Float(rows.count) * 0.9))
            last = kept.map { abs($0.3) }
            // Normal equations for x = (rx, ry, rz, tx, ty, tz).
            var A = [[Double]](repeating: [Double](repeating: 0, count: 6), count: 6), bvec = [Double](repeating: 0, count: 6)
            for (p, _, n, r) in kept {
                let c = simd_cross(p, n)
                let J = [Double(c.x), Double(c.y), Double(c.z), Double(n.x), Double(n.y), Double(n.z)]
                for i in 0..<6 { bvec[i] -= J[i] * Double(r); for k in 0..<6 { A[i][k] += J[i] * J[k] } }
            }
            guard let x = solve(A, bvec) else { return nil }
            let rot = SIMD3<Float>(Float(x[0]), Float(x[1]), Float(x[2]))
            let angle = simd_length(rot)
            let R = angle > 1e-9 ? simd_matrix3x3(simd_quatf(angle: angle, axis: rot / angle)) : matrix_identity_float3x3
            let step = simd_float4x4(columns: (SIMD4(R.columns.0, 0), SIMD4(R.columns.1, 0), SIMD4(R.columns.2, 0), SIMD4(Float(x[3]), Float(x[4]), Float(x[5]), 1)))
            M = step * M
            if it > 15, angle < 1e-5, abs(x[3]) + abs(x[4]) + abs(x[5]) < 1e-3 { break }
        }
        let close = last.filter { $0 < 3 }
        let rms = close.isEmpty ? 99 : (close.map { $0 * $0 }.reduce(0, +) / Float(close.count)).squareRoot()
        return Result(transform: M, rms: rms, overlap: Float(close.count) / Float(source.count))
    }

    /// Gaussian elimination with partial pivoting.
    static func solve(_ A0: [[Double]], _ b0: [Double]) -> [Double]? {
        var A = A0, b = b0
        let n = b.count
        for c in 0..<n {
            guard let p = (c..<n).max(by: { abs(A[$0][c]) < abs(A[$1][c]) }), abs(A[p][c]) > 1e-12 else { return nil }
            A.swapAt(c, p); b.swapAt(c, p)
            for r in (c + 1)..<n { let f = A[r][c] / A[c][c]; for k in c..<n { A[r][k] -= f * A[c][k] }; b[r] -= f * b[c] }
        }
        var x = [Double](repeating: 0, count: n)
        for r in stride(from: n - 1, through: 0, by: -1) { var s = b[r]; for k in (r + 1)..<n { s -= A[r][k] * x[k] }; x[r] = s / A[r][r] }
        return x
    }

    /// The rotation and shift that best carry `a` onto `b` (Horn's quaternion method).
    static func horn(_ a: [SIMD3<Float>], _ b: [SIMD3<Float>]) -> (simd_float3x3, SIMD3<Float>) {
        let n = Double(a.count)
        var ca = SIMD3<Double>.zero, cb = SIMD3<Double>.zero
        for (p, q) in zip(a, b) { ca += SIMD3<Double>(p); cb += SIMD3<Double>(q) }
        ca /= n; cb /= n
        var S = [[Double]](repeating: [0, 0, 0], count: 3)
        for (p, q) in zip(a, b) {
            let x = SIMD3<Double>(p) - ca, y = SIMD3<Double>(q) - cb
            for r in 0..<3 { for c in 0..<3 { S[r][c] += x[r] * y[c] } }
        }
        let (xx, xy, xz, yx, yy, yz, zx, zy, zz) = (S[0][0], S[0][1], S[0][2], S[1][0], S[1][1], S[1][2], S[2][0], S[2][1], S[2][2])
        var N: [[Double]] = [
            [xx + yy + zz, yz - zy, zx - xz, xy - yx],
            [yz - zy, xx - yy - zz, xy + yx, zx + xz],
            [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
            [xy - yx, zx + xz, yz + zy, -xx - yy + zz]
        ]
        // The largest eigenvector, by power iteration on a shifted (positive) matrix.
        let shift = N.flatMap { $0 }.map(abs).reduce(0, +)
        for i in 0..<4 { N[i][i] += shift }
        var q: [Double] = [1, 0, 0, 0]
        for _ in 0..<300 {
            var r = [0.0, 0, 0, 0]
            for i in 0..<4 { for j in 0..<4 { r[i] += N[i][j] * q[j] } }
            let len = (r.map { $0 * $0 }.reduce(0, +)).squareRoot()
            guard len > 0 else { break }
            q = r.map { $0 / len }
        }
        let R = simd_matrix3x3(simd_quatf(ix: Float(q[1]), iy: Float(q[2]), iz: Float(q[3]), r: Float(q[0])).normalized)
        let t = SIMD3<Float>(cb) - R * SIMD3<Float>(ca)
        return (R, t)
    }

    /// For each point of `base`, how far `moving` (already lined up) sits in front (+) or behind (−), in mm;
    /// nil where it isn't within 5 mm.
    static func gaps(base: FaceMesh, moving: FaceMesh) -> [Float?] {
        let grid = Grid(moving.positions, cell: 5)
        let normals = base.normals()
        return base.positions.enumerated().map { i, p in
            guard let (j, _) = grid.nearest(p, within: 5) else { return nil }
            return simd_dot(normals[i], moving.positions[j] - p)
        }
    }

    /// Blue (behind) through white to red (in front), at ±2 mm; grey where there's nothing to compare.
    static func colours(_ gaps: [Float?]) -> [SIMD3<Float>] {
        gaps.map { g in
            guard let g else { return SIMD3(0.18, 0.18, 0.18) }
            let t = max(-1, min(1, g / 2))
            return t < 0 ? SIMD3(1 + t, 1 + t * 0.6, 1) * SIMD3(1, 1, 1) : SIMD3(1, 1 - t * 0.75, 1 - t)
        }
    }
}

/// Where the patient is in a camera frame (Vision's person cut-out), so the background never joins the face.
struct FaceMask {
    let buffer: CVPixelBuffer
    /// How the camera's raw image is turned to match the mask (.up when the mask is in the raw image's orientation).
    let orientation: CGImagePropertyOrientation

    struct Reader {
        let pixels: UnsafePointer<UInt8>?
        let width, height, row: Int
        let orientation: CGImagePropertyOrientation
        /// Whether the raw-image position (0–1 from the top left) is on the patient.
        func contains(_ rx: Float, _ ry: Float) -> Bool {
            guard let pixels else { return true }
            var ux = rx, uy = ry
            switch orientation {
            case .right, .rightMirrored: ux = 1 - ry; uy = rx
            case .left, .leftMirrored: ux = ry; uy = 1 - rx
            case .down, .downMirrored: ux = 1 - rx; uy = 1 - ry
            default: break
            }
            let x = min(width - 1, max(0, Int(ux * Float(width)))), y = min(height - 1, max(0, Int(uy * Float(height))))
            return pixels[y * row + x] > 100
        }
    }

    func lock() -> Reader {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        let base = CVPixelBufferGetBaseAddress(buffer)?.assumingMemoryBound(to: UInt8.self)
        return Reader(pixels: base.map { UnsafePointer($0) }, width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer),
                      row: CVPixelBufferGetBytesPerRow(buffer), orientation: orientation)
    }
    func unlock() { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
}

/// A face built from photographs: the shape with its photographic skin (a texture). Millimetres, head frame.
struct TexturedFace {
    var positions: [SIMD3<Float>]
    /// Texture coordinates, origin at the bottom left of the texture.
    var uvs: [SIMD2<Float>]
    var triangles: [UInt32]
    let texture: CGImage

    func transformed(_ m: simd_float4x4) -> TexturedFace {
        var out = self
        out.positions = positions.map { let p = m * SIMD4<Float>($0, 1); return SIMD3(p.x, p.y, p.z) }
        return out
    }

    /// Only the triangles inside the box, as the largest connected piece.
    func cropped(lo: SIMD3<Float>, hi: SIMD3<Float>) -> TexturedFace {
        let inside = positions.map { $0.x > lo.x && $0.x < hi.x && $0.y > lo.y && $0.y < hi.y && $0.z > lo.z && $0.z < hi.z }
        var parent = Array(0..<Int32(positions.count))
        func find(_ x: Int32) -> Int32 { var x = x; while parent[Int(x)] != x { parent[Int(x)] = parent[Int(parent[Int(x)])]; x = parent[Int(x)] }; return x }
        var kept: [Int] = []
        for t in Swift.stride(from: 0, to: triangles.count - 2, by: 3) {
            let a = Int(triangles[t]), b = Int(triangles[t + 1]), c = Int(triangles[t + 2])
            guard inside[a], inside[b], inside[c] else { continue }
            kept.append(t)
            let ra = find(Int32(a)); parent[Int(find(Int32(b)))] = ra; parent[Int(find(Int32(c)))] = ra
        }
        var size = [Int32: Int]()
        for t in kept { size[find(Int32(triangles[t])), default: 0] += 1 }
        guard let root = size.max(by: { $0.value < $1.value })?.key else { return self }
        var map = [Int32](repeating: -1, count: positions.count)
        var out = TexturedFace(positions: [], uvs: [], triangles: [], texture: texture)
        for t in kept where find(Int32(triangles[t])) == root {
            for k in 0..<3 {
                let v = Int(triangles[t + k])
                if map[v] < 0 { map[v] = Int32(out.positions.count); out.positions.append(positions[v]); out.uvs.append(uvs[v]) }
                out.triangles.append(UInt32(map[v]))
            }
        }
        return out
    }

    private func pixels() -> (data: [UInt8], w: Int, h: Int) {
        let w = texture.width, h = texture.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        data.withUnsafeMutableBytes { buf in
            if let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
                ctx.draw(texture, in: CGRect(x: 0, y: 0, width: w, height: h))
            }
        }
        return (data, w, h)
    }

    /// The same shape with each point coloured from the texture (for the PLY and for comparing scans).
    func faceMesh() -> FaceMesh {
        let (px, w, h) = pixels()
        let colours = uvs.map { uv -> SIMD3<UInt8> in
            let x = min(w - 1, max(0, Int(uv.x * Float(w)))), y = min(h - 1, max(0, Int((1 - uv.y) * Float(h))))
            let o = (y * w + x) * 4
            return SIMD3(px[o], px[o + 1], px[o + 2])
        }
        return FaceMesh(positions: positions, colours: colours, triangles: triangles)
    }

    /// For SceneKit: the shape with its photographic skin, unlit (the photographs carry the light).
    func geometry() -> SCNGeometry {
        let n = FaceMesh(positions: positions, colours: [], triangles: triangles).normals()
        let stride = MemoryLayout<SIMD3<Float>>.stride
        let sources = [
            SCNGeometrySource(data: positions.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .vertex, vectorCount: positions.count, usesFloatComponents: true, componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: stride),
            SCNGeometrySource(data: n.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .normal, vectorCount: n.count, usesFloatComponents: true, componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: stride),
            // SceneKit's texture origin is the top left.
            SCNGeometrySource(textureCoordinates: uvs.map { CGPoint(x: CGFloat($0.x), y: CGFloat(1 - $0.y)) })
        ]
        let g = SCNGeometry(sources: sources, elements: [SCNGeometryElement(indices: triangles, primitiveType: .triangles)])
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = texture
        m.isDoubleSided = true
        g.materials = [m]
        return g
    }

    func preview(size: CGFloat = 720) -> UIImage? {
        guard let device = MTLCreateSystemDefaultDevice() else { return nil }
        let scene = FaceMesh.scene(with: geometry())
        let renderer = SCNRenderer(device: device, options: nil)
        renderer.scene = scene
        renderer.pointOfView = scene.rootNode.childNode(withName: "camera", recursively: false)
        return renderer.snapshot(atTime: 0, with: CGSize(width: size, height: size), antialiasingMode: .multisampling4X)
    }

    /// OBJ with its material and texture, the way dental CAD opens a textured scan. `name` is the file stem.
    func obj(name: String, comment: String) -> (obj: Data, mtl: Data) {
        var s = "# SmileCompose face scan: \(comment.replacingOccurrences(of: "\n", with: " "))\n# units mm; x towards the patient's left, y up, z out through the face\nmtllib \(name).mtl\nusemtl face\n"
        s.reserveCapacity(positions.count * 60 + triangles.count * 12)
        for p in positions { s += String(format: "v %.3f %.3f %.3f\n", p.x, p.y, p.z) }
        for t in uvs { s += String(format: "vt %.5f %.5f\n", t.x, t.y) }
        for t in Swift.stride(from: 0, to: triangles.count - 2, by: 3) {
            let a = triangles[t] + 1, b = triangles[t + 1] + 1, c = triangles[t + 2] + 1
            s += "f \(a)/\(a) \(b)/\(b) \(c)/\(c)\n"
        }
        let mtl = "newmtl face\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nillum 1\nmap_Kd \(name).jpg\n"
        return (Data(s.utf8), Data(mtl.utf8))
    }

    /// Reads an OBJ written by `obj(name:comment:)` with its texture.
    static func read(obj url: URL, texture: URL) -> TexturedFace? {
        guard let text = try? String(contentsOf: url, encoding: .utf8), let src = CGImageSourceCreateWithURL(texture as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
        var v: [SIMD3<Float>] = [], vt: [SIMD2<Float>] = [], tris: [UInt32] = []
        for line in text.split(separator: "\n", omittingEmptySubsequences: true) {
            let p = line.split(separator: " ")
            guard let k = p.first else { continue }
            if k == "v", p.count >= 4, let x = Float(p[1]), let y = Float(p[2]), let z = Float(p[3]) { v.append(SIMD3(x, y, z)) }
            else if k == "vt", p.count >= 3, let a = Float(p[1]), let b = Float(p[2]) { vt.append(SIMD2(a, b)) }
            else if k == "f", p.count >= 4 {
                for i in 1...3 { if let n = UInt32(p[i].split(separator: "/").first ?? "") { tris.append(n - 1) } }
            }
        }
        guard v.count == vt.count, !tris.isEmpty, tris.allSatisfy({ Int($0) < v.count }) else { return nil }
        return TexturedFace(positions: v, uvs: vt, triangles: tris, texture: image)
    }
}

enum Similarity {
    /// The scale, turn and shift that best carry `src` onto `dst` (Umeyama), as one matrix.
    static func fit(_ src: [SIMD3<Float>], _ dst: [SIMD3<Float>]) -> (matrix: simd_float4x4, scale: Float)? {
        guard src.count >= 3, src.count == dst.count else { return nil }
        let n = Float(src.count)
        let cs = src.reduce(.zero, +) / n, cd = dst.reduce(.zero, +) / n
        let ss = src.map { simd_length_squared($0 - cs) }.reduce(0, +), sd = dst.map { simd_length_squared($0 - cd) }.reduce(0, +)
        guard ss > 1e-9 else { return nil }
        let s = (sd / ss).squareRoot()
        let (R, _) = FaceAlign.horn(src.map { ($0 - cs) * s }, dst.map { $0 - cd })
        let t = cd - R * (cs * s)
        let m = simd_float4x4(columns: (SIMD4(R.columns.0 * s, 0), SIMD4(R.columns.1 * s, 0), SIMD4(R.columns.2 * s, 0), SIMD4(t, 1)))
        return (m, s)
    }
}

extension FaceVolume {
    /// A bounded tracking target made only of current measured TSDF crossings. At most `limit` spatial seeds
    /// are examined, each in a 3×3×3 neighbourhood; sparse/unobserved neighbours cannot invent a target. This
    /// leaves the full surface extraction for final reconstruction, not the serial live-fusion queue.
    func trackingSurface(limit: Int = 25000, minWeight: Float = 3) -> [(SIMD3<Float>, SIMD3<Float>)] {
        guard limit > 0, !trackingLocations.isEmpty else { return [] }
        let count = min(limit, trackingLocations.count), step = Double(trackingLocations.count) / Double(count)
        let plane = nx * ny
        var out: [(SIMD3<Float>, SIMD3<Float>)] = []
        out.reserveCapacity(count)
        for sample in 0..<count {
            let seedCell = (trackingLocations[Int(Double(sample) * step)] - lo) / voxel
            let sx = min(nx - 2, max(1, Int(seedCell.x.rounded())))
            let sy = min(ny - 2, max(1, Int(seedCell.y.rounded())))
            let sz = min(nz - 2, max(1, Int(seedCell.z.rounded())))
            var nearest: (point: SIMD3<Float>, normal: SIMD3<Float>, distance: Float)?
            for l in max(1, sz - 1)...min(nz - 2, sz + 1) {
                for j in max(1, sy - 1)...min(ny - 2, sy + 1) {
                    for i in max(1, sx - 1)...min(nx - 2, sx + 1) {
                        let k = l * plane + j * nx + i
                        guard Float(weight[k]) >= minWeight else { continue }
                        let d0 = Float(dist[k])
                        for (offset, axis) in [(1, 0), (nx, 1), (plane, 2)] where Float(weight[k + offset]) >= minWeight {
                            let d1 = Float(dist[k + offset])
                            guard (d0 < 0) != (d1 < 0) else { continue }
                            var cell = SIMD3<Float>(Float(i), Float(j), Float(l))
                            cell[axis] += d0 / (d0 - d1)
                            let distance = simd_length_squared(cell - seedCell)
                            if let nearest, distance >= nearest.distance { continue }
                            var normal = SIMD3<Float>(Float(dist[k + 1]) - Float(dist[k - 1]), Float(dist[k + nx]) - Float(dist[k - nx]), Float(dist[k + plane]) - Float(dist[k - plane]))
                            let length = simd_length(normal)
                            guard length > 1e-4 else { continue }
                            normal /= length
                            nearest = ((lo + cell * voxel) * 1000, normal, distance)
                        }
                    }
                }
            }
            if let nearest { out.append((nearest.point, nearest.normal)) }
        }
        return out
    }

    /// The surface seen so far as points with outward normals (millimetres), for lining new frames up with it.
    func surface(minWeight: Float = 3) -> [(SIMD3<Float>, SIMD3<Float>)] {
        let nx = self.nx, ny = self.ny, nz = self.nz, plane = nx * ny
        var out: [(SIMD3<Float>, SIMD3<Float>)] = []
        out.reserveCapacity(60000)
        withStorage { dist, weight in
            for l in 1..<(nz - 1) { for j in 1..<(ny - 1) { for i in 1..<(nx - 1) {
                let k = l * plane + j * nx + i
                guard Float(weight[k]) >= minWeight else { continue }
                let d0 = Float(dist[k])
                for (o, axis) in [(1, 0), (nx, 1), (plane, 2)] where Float(weight[k + o]) >= minWeight {
                    let d1 = Float(dist[k + o])
                    guard (d0 < 0) != (d1 < 0) else { continue }
                    let t = d0 / (d0 - d1)
                    var g = SIMD3<Float>(Float(dist[k + 1]) - Float(dist[k - 1]), Float(dist[k + nx]) - Float(dist[k - nx]), Float(dist[k + plane]) - Float(dist[k - plane]))
                    let len = simd_length(g)
                    guard len > 1e-4 else { continue }
                    g /= len
                    var cell = SIMD3<Float>(Float(i), Float(j), Float(l))
                    cell[axis] += t
                    out.append(((lo + cell * voxel) * 1000, g))
                }
            } } }
        }
        return out
    }
}

extension FaceAlign {
    /// Point-to-plane ICP of `source` (mm) onto a surface, from `start`. The search radius narrows from `reach` to
    /// 3 mm. Returns the transform (mm), the RMS distance of the points within 3 mm and their share of the source.
    static func track(_ source: [SIMD3<Float>], grid: Grid, normals: [SIMD3<Float>], start: simd_float4x4 = matrix_identity_float4x4,
                      reach: Float, iterations: Int = 10) -> Result? {
        var M = start
        var last: [Float] = []
        for it in 0..<iterations {
            let maxD = max(3, reach - (reach - 3) * Float(it) / Float(max(1, iterations / 2)))
            var A = [[Double]](repeating: [Double](repeating: 0, count: 6), count: 6), b = [Double](repeating: 0, count: 6)
            var residuals: [Float] = []
            residuals.reserveCapacity(source.count)
            var rows: [(SIMD3<Float>, SIMD3<Float>, Float)] = []
            rows.reserveCapacity(source.count)
            for s in source {
                let p4 = M * SIMD4<Float>(s, 1), p = SIMD3(p4.x, p4.y, p4.z)
                guard let (j, _) = grid.nearest(p, within: maxD) else { continue }
                let n = normals[j], r = simd_dot(p - grid.points[j], n)
                rows.append((p, n, r))
            }
            guard rows.count > 80 else { return nil }
            let sorted = rows.map { abs($0.2) }.sorted()
            let cut = sorted[min(sorted.count - 1, Int(Float(sorted.count) * 0.85))]
            for (p, n, r) in rows where abs(r) <= cut {
                let c = simd_cross(p, n)
                let J = [Double(c.x), Double(c.y), Double(c.z), Double(n.x), Double(n.y), Double(n.z)]
                for i in 0..<6 { b[i] -= J[i] * Double(r); for k in 0..<6 { A[i][k] += J[i] * J[k] } }
                residuals.append(abs(r))
            }
            last = rows.map { abs($0.2) }
            for i in 0..<6 { A[i][i] += 1e-3 }
            guard let x = solve6(A, b) else { return nil }
            let rot = SIMD3<Float>(Float(x[0]), Float(x[1]), Float(x[2])), angle = simd_length(rot)
            let R = angle > 1e-9 ? simd_matrix3x3(simd_quatf(angle: angle, axis: rot / angle)) : matrix_identity_float3x3
            M = simd_float4x4(columns: (SIMD4(R.columns.0, 0), SIMD4(R.columns.1, 0), SIMD4(R.columns.2, 0), SIMD4(Float(x[3]), Float(x[4]), Float(x[5]), 1))) * M
            if it >= iterations / 2, angle < 2e-5, abs(x[3]) + abs(x[4]) + abs(x[5]) < 0.01 { break }
        }
        let close = last.filter { $0 < 3 }
        guard !close.isEmpty else { return nil }
        let rms = (close.map { $0 * $0 }.reduce(0, +) / Float(close.count)).squareRoot()
        return Result(transform: M, rms: rms, overlap: Float(close.count) / Float(source.count))
    }

    static func solve6(_ A0: [[Double]], _ b0: [Double]) -> [Double]? {
        var A = A0, b = b0
        let n = b.count
        for c in 0..<n {
            guard let p = (c..<n).max(by: { abs(A[$0][c]) < abs(A[$1][c]) }), abs(A[p][c]) > 1e-12 else { return nil }
            A.swapAt(c, p); b.swapAt(c, p)
            for r in (c + 1)..<n { let f = A[r][c] / A[c][c]; for k in c..<n { A[r][k] -= f * A[c][k] }; b[r] -= f * b[c] }
        }
        var x = [Double](repeating: 0, count: n)
        for r in stride(from: n - 1, through: 0, by: -1) { var s = b[r]; for k in (r + 1)..<n { s -= A[r][k] * x[k] }; x[r] = s / A[r][r] }
        return x
    }
}

/// Keeps the scan locked to the patient's head rather than the room, so a patient who moves doesn't smear the face.
/// Each LiDAR frame is lined up with the face built so far (point-to-plane ICP on the forehead, nose, cheekbones and
/// sides, which don't change with expression), starting from where the phone's own tracking puts it. Frames that
/// need a sudden large correction or don't fit well are left out; a frame where the mouth no longer matches is left
/// out as a change of expression. Every other kept frame is stored small, so the finished face can be rebuilt with
/// each frame lined up again against the whole face.
final class HeadTracker {
    enum Outcome: Equatable { case accepted, moved, lost, expression }
    struct Keyframe { var frame: FaceVolume.Frame }

    /// From the head as the phone placed it at the start to the head now (metres).
    private(set) var correction = matrix_identity_float4x4
    /// How the head moved between the last two kept frames, carried forward as the guess for the next: a patient
    /// turning their head steadily is followed smoothly.
    private var velocity = matrix_identity_float4x4
    private var searchTick = 0
    private var target: (grid: FaceAlign.Grid, normals: [SIMD3<Float>])?
    private var sinceRefresh = 0
    private(set) var accepted = 0, rejected = 0, misses = 0
    private var tracked = 0, rmsTotal: Float = 0
    private(set) var keyframes: [Keyframe] = []
    static let maxKeyframes = 100

    /// Mean fit of the tracked frames (mm) and the share of frames kept.
    var quality: (rms: Float, kept: Float) { (tracked > 0 ? rmsTotal / Float(tracked) : 0, Float(accepted) / Float(max(1, accepted + rejected))) }
    var isLost: Bool { misses >= 12 }

    /// `guess`: camera to head as the phone's tracking alone puts it. Adds the frame to `volume` when it's kept.
    func process(_ frame: FaceVolume.Frame, guess: simd_float4x4, volume: FaceVolume) -> Outcome {
        var f = frame
        guard let target, volume.frames >= 6 else {
            // The first frames, from straight in front, start the face.
            place(&f, correction * guess)
            volume.integrate(f)
            accepted += 1
            keep(f)
            refresh(volume)
            return .accepted
        }
        let lost = isLost
        // When the face is lost, look for it on every other frame (the search tries several turns of the head).
        if lost { searchTick += 1; if searchTick % 2 == 1 { return miss() } }
        let cam = Self.cameraPoints(f)
        var candidates = [velocity * correction]
        if lost {
            candidates.append(correction)
            candidates.append(matrix_identity_float4x4)   // Apple's face tracking alone, in case the correction drifted
            for yaw in Swift.stride(from: -48, through: 48, by: 12) where yaw != 0 { candidates.append(Self.turn(yaw: Float(yaw), pitch: 0) * correction) }
            for pitch: Float in [-18, 18] { candidates.append(Self.turn(yaw: 0, pitch: pitch) * correction) }
        }
        var best: (r: FaceAlign.Result, base: simd_float4x4, pts: (stable: [SIMD3<Float>], mouth: [SIMD3<Float>]))?
        for c in candidates {
            let pts = Self.classify(cam, cameraToHead: c * guess)
            guard pts.stable.count > 120,
                  let r = FaceAlign.track(pts.stable, grid: target.grid, normals: target.normals, reach: lost ? 25 : 9) else { continue }
            if let b = best, r.overlap / max(0.3, r.rms) <= b.r.overlap / max(0.3, b.r.rms) { continue }
            best = (r, c, pts)
        }
        guard let best else { return miss() }
        let r = best.r, step = r.transform
        let angle = acosf(max(-1, min(1, (step[0][0] + step[1][1] + step[2][2] - 1) / 2))) * 180 / .pi
        let shift = simd_length(SIMD3(step.columns.3.x, step.columns.3.y, step.columns.3.z))
        if (!lost && (angle > 6 || shift > 12)) || r.rms > 2.4 || r.overlap < 0.5 { return miss() }
        let next = Self.metres(step) * best.base
        velocity = lost ? matrix_identity_float4x4 : Self.limited(next * correction.inverse)
        correction = next
        misses = 0
        // The mouth should fit too; if it no longer does, the expression changed.
        let mouth = best.pts.mouth.map { s -> SIMD3<Float> in let p = step * SIMD4<Float>(s, 1); return SIMD3(p.x, p.y, p.z) }
        var gaps: [Float] = []
        for p in mouth { if let (j, _) = target.grid.nearest(p, within: 5) { gaps.append(abs(simd_dot(p - target.grid.points[j], target.normals[j]))) } }
        if gaps.count >= 60 {
            gaps.sort()
            if gaps[gaps.count / 2] > max(1.6, r.rms * 2.2) { rejected += 1; return .expression }
        }
        place(&f, correction * guess)
        volume.integrate(f)
        accepted += 1; tracked += 1; rmsTotal += r.rms
        keep(f)
        refresh(volume)
        return .accepted
    }

    private func miss() -> Outcome {
        rejected += 1; misses += 1
        if misses >= 2 { velocity = matrix_identity_float4x4 }
        return isLost ? .lost : .moved
    }

    /// A turn of the head about its centre (degrees), in the head's own frame.
    static func turn(yaw: Float, pitch: Float) -> simd_float4x4 {
        simd_float4x4(simd_quatf(angle: yaw * .pi / 180, axis: SIMD3(0, 1, 0))) * simd_float4x4(simd_quatf(angle: pitch * .pi / 180, axis: SIMD3(1, 0, 0)))
    }

    /// The movement carried forward, but only while it's a plausible steady turn (up to 5° and 8 mm a frame).
    static func limited(_ m: simd_float4x4) -> simd_float4x4 {
        let angle = acosf(max(-1, min(1, (m[0][0] + m[1][1] + m[2][2] - 1) / 2))) * 180 / .pi
        let shift = simd_length(SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z))
        return angle < 5 && shift < 0.008 ? m : matrix_identity_float4x4
    }

    private func place(_ f: inout FaceVolume.Frame, _ m: simd_float4x4) {
        f.cameraToHead = m
        f.cameraInHead = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
    }

    private func refresh(_ volume: FaceVolume) {
        sinceRefresh += 1
        guard target == nil ? volume.frames >= 6 : sinceRefresh >= 8 else { return }
        sinceRefresh = 0
        let s = volume.trackingSurface()
        guard s.count > 2000 else { return }
        target = (FaceAlign.Grid(s.map(\.0), cell: 10), s.map(\.1))
    }

    private func keep(_ f: FaceVolume.Frame) {
        guard accepted % 3 == 1, keyframes.count < Self.maxKeyframes, let small = f.compactCopy() else { return }
        keyframes.append(Keyframe(frame: small))
    }

    /// The finished face built again, every stored frame lined up afresh against the whole face. Nil if too few.
    func rebuild(from volume: FaceVolume) -> FaceVolume? {
        guard keyframes.count >= 20 else { return nil }
        let s = volume.surface()
        guard s.count > 2000 else { return nil }
        let grid = FaceAlign.Grid(s.map(\.0), cell: 10), normals = s.map(\.1)
        let out = FaceVolume(voxel: volume.voxel, lo: volume.lo, hi: volume.hi)
        for k in keyframes {
            var f = k.frame
            let pts = Self.points(f, cameraToHead: f.cameraToHead)
            if pts.stable.count > 120, let r = FaceAlign.track(pts.stable, grid: grid, normals: normals, reach: 5, iterations: 8), r.rms < 2.4, r.overlap > 0.5 {
                place(&f, Self.metres(r.transform) * f.cameraToHead)
            }
            out.integrate(f)
        }
        return out
    }

    static func metres(_ m: simd_float4x4) -> simd_float4x4 {
        var out = m
        out.columns.3 = SIMD4(m.columns.3.x / 1000, m.columns.3.y / 1000, m.columns.3.z / 1000, 1)
        return out
    }

    /// The frame's depth points in the head's frame (mm): `stable` (brow, nose, cheekbones and the sides of the
    /// head, not the eyes or mouth) for tracking, `mouth` for the expression check. Origin: the centre of the head,
    /// 10 cm behind the nose tip, at the nose tip's height.
    static func points(_ f: FaceVolume.Frame, cameraToHead m: simd_float4x4) -> (stable: [SIMD3<Float>], mouth: [SIMD3<Float>]) {
        classify(cameraPoints(f), cameraToHead: m)
    }

    /// The frame's depth points on the patient, in the camera's frame (metres): a sparse, even sample.
    static func cameraPoints(_ f: FaceVolume.Frame) -> [SIMD3<Float>] {
        let depth = f.depth
        CVPixelBufferLockBaseAddress(depth, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depth, .readOnly) }
        if let c = f.confidence { CVPixelBufferLockBaseAddress(c, .readOnly) }
        defer { if let c = f.confidence { CVPixelBufferUnlockBaseAddress(c, .readOnly) } }
        let maskReader = f.mask?.lock()
        defer { if maskReader != nil { f.mask?.unlock() } }
        guard CVPixelBufferGetPixelFormatType(depth) == kCVPixelFormatType_DepthFloat32, let base = CVPixelBufferGetBaseAddress(depth) else { return [] }
        let w = CVPixelBufferGetWidth(depth), h = CVPixelBufferGetHeight(depth), row = CVPixelBufferGetBytesPerRow(depth) / 4
        let d = base.assumingMemoryBound(to: Float32.self)
        var conf: UnsafeMutablePointer<UInt8>?, confRow = 0
        if let c = f.confidence, CVPixelBufferGetWidth(c) == w, CVPixelBufferGetHeight(c) == h, let cb = CVPixelBufferGetBaseAddress(c) { conf = cb.assumingMemoryBound(to: UInt8.self); confRow = CVPixelBufferGetBytesPerRow(c) }
        let fx = f.depthK[0][0], fy = f.depthK[1][1], cx = f.depthK[2][0], cy = f.depthK[2][1]
        let step = max(2, Int((Float(w) / 128).rounded()))
        var out: [SIMD3<Float>] = []
        out.reserveCapacity((w / step) * (h / step))
        for v in Swift.stride(from: 0, to: h, by: step) { for u in Swift.stride(from: 0, to: w, by: step) {
            let z = d[v * row + u]
            guard z > f.nearest, z < f.farthest else { continue }
            if let conf, conf[v * confRow + u] == 0 { continue }
            if let m = maskReader, !m.contains(Float(u) / Float(w), Float(v) / Float(h)) { continue }
            out.append(SIMD3((Float(u) - cx) / fx * z, -(Float(v) - cy) / fy * z, -z))
        } }
        return out
    }

    static func classify(_ cam: [SIMD3<Float>], cameraToHead m: simd_float4x4) -> (stable: [SIMD3<Float>], mouth: [SIMD3<Float>]) {
        var stable: [SIMD3<Float>] = [], mouth: [SIMD3<Float>] = []
        stable.reserveCapacity(cam.count)
        for q in cam {
            let h = m * SIMD4<Float>(q, 1), p = SIMD3(h.x, h.y, h.z) * 1000
            guard p.x > -120, p.x < 120, p.y > -130, p.y < 130, p.z > -60, p.z < 170 else { continue }
            let ax = abs(p.x)
            let eyes = p.y > 28 && p.y < 56 && ax > 10 && ax < 54 && p.z > 50
            let isMouth = p.y > -52 && p.y < -14 && ax < 36 && p.z > 50
            if isMouth { mouth.append(p); continue }
            if eyes { continue }
            if (p.y > -12 && p.y < 105) || (ax > 55 && p.y > -45 && p.y < 60) { stable.append(p) }
        }
        return (stable, mouth)
    }
}

extension FaceVolume.Frame {
    /// A small copy that doesn't hold on to the camera's buffers (ARKit reuses them): the depth and confidence as
    /// they are, the camera image at a quarter of the size.
    func compactCopy() -> FaceVolume.Frame? {
        guard let d = Self.copy(depth), let img = Self.shrink(image, by: 4) else { return nil }
        var f = self
        f = FaceVolume.Frame(depth: d, confidence: confidence.flatMap { Self.copy($0) }, image: img, depthK: depthK,
                             imageK: simd_float3x3(diagonal: SIMD3(0.25, 0.25, 1)) * imageK, cameraToHead: cameraToHead,
                             cameraInHead: cameraInHead, stride: stride, nearest: nearest, farthest: farthest,
                             mask: mask.flatMap { m in Self.copy(m.buffer).map { FaceMask(buffer: $0, orientation: m.orientation) } })
        return f
    }

    private static func copy(_ src: CVPixelBuffer) -> CVPixelBuffer? {
        let w = CVPixelBufferGetWidth(src), h = CVPixelBufferGetHeight(src), fmt = CVPixelBufferGetPixelFormatType(src)
        var out: CVPixelBuffer?
        guard CVPixelBufferCreate(nil, w, h, fmt, nil, &out) == kCVReturnSuccess, let dst = out else { return nil }
        CVPixelBufferLockBaseAddress(src, .readOnly); CVPixelBufferLockBaseAddress(dst, [])
        defer { CVPixelBufferUnlockBaseAddress(src, .readOnly); CVPixelBufferUnlockBaseAddress(dst, []) }
        guard let s = CVPixelBufferGetBaseAddress(src), let t = CVPixelBufferGetBaseAddress(dst) else { return nil }
        let sr = CVPixelBufferGetBytesPerRow(src), tr = CVPixelBufferGetBytesPerRow(dst)
        for y in 0..<h { memcpy(t + y * tr, s + y * sr, min(sr, tr)) }
        return dst
    }

    /// A bi-planar YCbCr image at 1/`k` size (nearest sample).
    private static func shrink(_ src: CVPixelBuffer, by k: Int) -> CVPixelBuffer? {
        guard CVPixelBufferGetPlaneCount(src) >= 2 else { return nil }
        let w = CVPixelBufferGetWidthOfPlane(src, 0) / k / 2 * 2, h = CVPixelBufferGetHeightOfPlane(src, 0) / k / 2 * 2
        var out: CVPixelBuffer?
        guard w > 2, h > 2, CVPixelBufferCreate(nil, w, h, CVPixelBufferGetPixelFormatType(src), nil, &out) == kCVReturnSuccess, let dst = out else { return nil }
        CVPixelBufferLockBaseAddress(src, .readOnly); CVPixelBufferLockBaseAddress(dst, [])
        defer { CVPixelBufferUnlockBaseAddress(src, .readOnly); CVPixelBufferUnlockBaseAddress(dst, []) }
        guard let sy = CVPixelBufferGetBaseAddressOfPlane(src, 0)?.assumingMemoryBound(to: UInt8.self),
              let sc = CVPixelBufferGetBaseAddressOfPlane(src, 1)?.assumingMemoryBound(to: UInt8.self),
              let ty = CVPixelBufferGetBaseAddressOfPlane(dst, 0)?.assumingMemoryBound(to: UInt8.self),
              let tc = CVPixelBufferGetBaseAddressOfPlane(dst, 1)?.assumingMemoryBound(to: UInt8.self) else { return nil }
        let syr = CVPixelBufferGetBytesPerRowOfPlane(src, 0), scr = CVPixelBufferGetBytesPerRowOfPlane(src, 1)
        let tyr = CVPixelBufferGetBytesPerRowOfPlane(dst, 0), tcr = CVPixelBufferGetBytesPerRowOfPlane(dst, 1)
        for y in 0..<h { for x in 0..<w { ty[y * tyr + x] = sy[(y * k) * syr + x * k] } }
        for y in 0..<(h / 2) { for x in 0..<(w / 2) {
            tc[y * tcr + x * 2] = sc[(y * k) * scr + (x * k) * 2]
            tc[y * tcr + x * 2 + 1] = sc[(y * k) * scr + (x * k) * 2 + 1]
        } }
        return dst
    }
}

/// The sharp photographs taken during a scan, for building the face from photos (Object Capture). Each is stored
/// on disk straight away (memory stays low): the picture, the patient cut out from the background, the LiDAR depth
/// at that moment, and where the camera was relative to the head.
final class PhotoShots {
    struct Shot {
        let id: Int
        let image, mask, depth: URL
        let hasMask, hasDepth: Bool
        let depthSize: (Int, Int)
        let cameraToHead: simd_float4x4
    }
    /// Photogrammetry apps take dozens to a hundred or more overlapping photos of a still subject.
    static let maxShots = 120
    static let maxSide: CGFloat = 2016
    let folder: URL
    private let queue = DispatchQueue(label: "uk.co.drvik.smilecompose.photoshots", qos: .utility)
    private var stored: [Shot] = []
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let segmentation: VNGeneratePersonSegmentationRequest = {
        let r = VNGeneratePersonSegmentationRequest()
        r.qualityLevel = .accurate
        r.outputPixelFormat = kCVPixelFormatType_OneComponent8
        return r
    }()

    init?() {
        let f = FileManager.default.temporaryDirectory.appendingPathComponent("face-photos-\(UUID().uuidString)", isDirectory: true)
        guard (try? FileManager.default.createDirectory(at: f, withIntermediateDirectories: true)) != nil else { return nil }
        folder = f
    }

    /// The shots stored so far (waits for any still being written).
    var shots: [Shot] { queue.sync { stored } }

    /// Stores a photo. `visionOrientation` turns the raw image upright for Vision; `maskMapping` says how the mask
    /// Vision returns lines up with the raw image (nil: no cut-out).
    /// Sharpness of the photos kept so far (variance of the Laplacian over the face area).
    private var sharpness: [Float] = []

    /// `done` (on the main queue) says whether the photo was kept: a blurred one is left out, so that view gets
    /// photographed again.
    func add(image: CVPixelBuffer, depth: CVPixelBuffer?, visionOrientation: CGImagePropertyOrientation, maskMapping: CGImagePropertyOrientation?,
             cameraToHead: simd_float4x4, done: @escaping (Bool) -> Void = { _ in }) {
        // Release ARKit's camera buffer before the asynchronous writer runs. The stored picture must remain the
        // accepted frame even if the capture pipeline reuses its original pixels while this queue is busy.
        guard let image = PixelCopy.copy(image) else { DispatchQueue.main.async { done(false) }; return }
        let depthCopy = depth.flatMap { Self.depthBytes($0) }
        queue.async { [self] in
            var kept = false
            defer { let result = kept; DispatchQueue.main.async { done(result) } }
            let id = stored.count
            guard id < Self.maxShots else { return }
            // Blur ruins photogrammetry: a photo much softer than the ones kept so far is left out.
            let sharp = Self.sharpness(image)
            if sharpness.count >= 5 {
                let median = sharpness.sorted()[sharpness.count / 2]
                if sharp < median * 0.55 { return }
            }
            let base = folder.appendingPathComponent(String(format: "shot-%03d", id))
            let imageURL = base.appendingPathExtension("jpg"), maskURL = base.appendingPathExtension("png"), depthURL = base.appendingPathExtension("depth")
            let raw = CIImage(cvPixelBuffer: image)
            let scale = min(1, Self.maxSide / max(raw.extent.width, raw.extent.height))
            let picture = raw.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            guard let jpeg = context.jpegRepresentation(of: picture, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                                                        options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.92]),
                  (try? jpeg.write(to: imageURL)) != nil else { return }
            var hasMask = false
            if let mapping = maskMapping {
                let handler = VNImageRequestHandler(cvPixelBuffer: image, orientation: visionOrientation)
                if (try? handler.perform([segmentation])) != nil, let m = segmentation.results?.first?.pixelBuffer {
                    // Back into the raw image's orientation and size.
                    var mask = CIImage(cvPixelBuffer: m)
                    switch mapping {
                    case .right, .rightMirrored: mask = mask.oriented(.left)
                    case .left, .leftMirrored: mask = mask.oriented(.right)
                    case .down, .downMirrored: mask = mask.oriented(.down)
                    default: break
                    }
                    mask = mask.transformed(by: CGAffineTransform(translationX: -mask.extent.minX, y: -mask.extent.minY))
                    mask = mask.transformed(by: CGAffineTransform(scaleX: picture.extent.width / mask.extent.width, y: picture.extent.height / mask.extent.height))
                    if let png = context.pngRepresentation(of: mask, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray()), (try? png.write(to: maskURL)) != nil { hasMask = true }
                }
            }
            var hasDepth = false, size = (0, 0)
            if let (bytes, w, h) = depthCopy, (try? bytes.write(to: depthURL)) != nil { hasDepth = true; size = (w, h) }
            stored.append(Shot(id: id, image: imageURL, mask: maskURL, depth: depthURL, hasMask: hasMask, hasDepth: hasDepth, depthSize: size, cameraToHead: cameraToHead))
            sharpness.append(sharp)
            kept = true
        }
    }

    /// Variance of the Laplacian over the middle of the picture (where the face is), from the brightness plane.
    static func sharpness(_ image: CVPixelBuffer) -> Float {
        guard CVPixelBufferGetPlaneCount(image) >= 1 else { return 0 }
        CVPixelBufferLockBaseAddress(image, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(image, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(image, 0)?.assumingMemoryBound(to: UInt8.self) else { return 0 }
        let w = CVPixelBufferGetWidthOfPlane(image, 0), h = CVPixelBufferGetHeightOfPlane(image, 0), row = CVPixelBufferGetBytesPerRowOfPlane(image, 0)
        let step = max(1, w / 640)
        var sum: Double = 0, sum2: Double = 0, n: Double = 0
        for y in Swift.stride(from: h / 4, to: h * 3 / 4, by: step) { for x in Swift.stride(from: w / 4, to: w * 3 / 4, by: step) {
            guard x >= step, y >= step, x + step < w, y + step < h else { continue }
            let c = Double(base[y * row + x]) * 4
            let l = c - Double(base[y * row + x - step]) - Double(base[y * row + x + step]) - Double(base[(y - step) * row + x]) - Double(base[(y + step) * row + x])
            sum += l; sum2 += l * l; n += 1
        } }
        guard n > 0 else { return 0 }
        let mean = sum / n
        return Float(sum2 / n - mean * mean)
    }

    private static func depthBytes(_ b: CVPixelBuffer) -> (Data, Int, Int)? {
        guard CVPixelBufferGetPixelFormatType(b) == kCVPixelFormatType_DepthFloat32 else { return nil }
        CVPixelBufferLockBaseAddress(b, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(b, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(b) else { return nil }
        let w = CVPixelBufferGetWidth(b), h = CVPixelBufferGetHeight(b), row = CVPixelBufferGetBytesPerRow(b)
        var data = Data(capacity: w * h * 4)
        for y in 0..<h { data.append(Data(bytes: base + y * row, count: w * 4)) }
        return (data, w, h)
    }

    /// The photogrammetry sample for a shot, read from disk only when Object Capture asks for it.
    func sample(_ s: Shot) -> PhotogrammetrySample? {
        guard let picture = CIImage(contentsOf: s.image) else { return nil }
        let w = Int(picture.extent.width), h = Int(picture.extent.height)
        guard let image = Self.buffer(w, h, kCVPixelFormatType_32BGRA) else { return nil }
        context.render(picture, to: image)
        var sample = PhotogrammetrySample(id: s.id, image: image)
        if s.hasMask, let m = CIImage(contentsOf: s.mask), let mask = Self.buffer(w, h, kCVPixelFormatType_OneComponent8) {
            context.render(m, to: mask, bounds: CGRect(x: 0, y: 0, width: w, height: h), colorSpace: nil)
            sample.objectMask = mask
        }
        let (pixels, pixelOverflow) = s.depthSize.0.multipliedReportingOverflow(by: s.depthSize.1)
        let (depthBytes, byteOverflow) = pixels.multipliedReportingOverflow(by: MemoryLayout<Float32>.size)
        if s.hasDepth, s.depthSize.0 > 0, s.depthSize.1 > 0, !pixelOverflow, !byteOverflow,
           let data = try? Data(contentsOf: s.depth), data.count == depthBytes,
           let depth = Self.buffer(s.depthSize.0, s.depthSize.1, kCVPixelFormatType_DepthFloat32) {
            CVPixelBufferLockBaseAddress(depth, [])
            if let base = CVPixelBufferGetBaseAddress(depth) {
                let row = CVPixelBufferGetBytesPerRow(depth), w4 = s.depthSize.0 * 4
                data.withUnsafeBytes { raw in for y in 0..<s.depthSize.1 { memcpy(base + y * row, raw.baseAddress! + y * w4, w4) } }
            }
            CVPixelBufferUnlockBaseAddress(depth, [])
            sample.depthDataMap = depth
        }
        return sample
    }

    private static func buffer(_ w: Int, _ h: Int, _ format: OSType) -> CVPixelBuffer? {
        var b: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()]
        return CVPixelBufferCreate(nil, w, h, format, attrs as CFDictionary, &b) == kCVReturnSuccess ? b : nil
    }

    func remove() { queue.async { try? FileManager.default.removeItem(at: self.folder) } }
}

/// A sharp front-camera photograph taken during a Face ID scan, for the face's skin: the picture as JPEG, the
/// camera's intrinsics for that picture (a negative focal length marks a mirrored image), and where the camera was.
struct FrontView {
    let jpeg: Data
    let width: Int, height: Int
    let K: simd_float3x3
    /// Camera to head, in metres.
    let cameraToHead: simd_float4x4
}

/// A copy of a camera picture (all its planes), so ARKit's own buffer goes straight back to it.
enum PixelCopy {
    static func copy(_ src: CVPixelBuffer) -> CVPixelBuffer? {
        let w = CVPixelBufferGetWidth(src), h = CVPixelBufferGetHeight(src), fmt = CVPixelBufferGetPixelFormatType(src)
        var out: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()]
        guard CVPixelBufferCreate(nil, w, h, fmt, attrs as CFDictionary, &out) == kCVReturnSuccess, let dst = out else { return nil }
        CVPixelBufferLockBaseAddress(src, .readOnly); CVPixelBufferLockBaseAddress(dst, [])
        defer { CVPixelBufferUnlockBaseAddress(src, .readOnly); CVPixelBufferUnlockBaseAddress(dst, []) }
        let planes = CVPixelBufferGetPlaneCount(src)
        if planes == 0 {
            guard let s = CVPixelBufferGetBaseAddress(src), let t = CVPixelBufferGetBaseAddress(dst) else { return nil }
            let sr = CVPixelBufferGetBytesPerRow(src), tr = CVPixelBufferGetBytesPerRow(dst)
            for y in 0..<h { memcpy(t + y * tr, s + y * sr, min(sr, tr)) }
        } else {
            for p in 0..<planes {
                guard let s = CVPixelBufferGetBaseAddressOfPlane(src, p), let t = CVPixelBufferGetBaseAddressOfPlane(dst, p) else { return nil }
                let sr = CVPixelBufferGetBytesPerRowOfPlane(src, p), tr = CVPixelBufferGetBytesPerRowOfPlane(dst, p)
                for y in 0..<CVPixelBufferGetHeightOfPlane(src, p) { memcpy(t + y * tr, s + y * sr, min(sr, tr)) }
            }
        }
        return dst
    }
}

/// Photographic skin for a Face ID scan, after Waechter et al. ("Let There Be Color!") and Zhou & Koltun:
/// 1. each photo's camera is nudged until its colours agree with the other photos (removes blur from small pose errors);
/// 2. each triangle takes one photo — the one that sees it most squarely and sharply, unhidden — with a smoothness rule
///    so the face isn't cut into many small patches, and the whole mouth from the single most frontal photo, so no
///    seam crosses the lips or teeth;
/// 3. brightness is matched between photos, then colour is levelled across every seam and the correction spread
///    smoothly over each patch.
/// Gives the textured face (colour view and the lab's OBJ) and the mesh recoloured from the same photos.
enum ViewTexture {
    private struct Picture { let rgba: [UInt8]; let w: Int; let h: Int; let K: simd_float3x3; var toCamera: simd_float4x4; var at: SIMD3<Float>; let sharpness: Float }

    /// The mouth and lips, in the head frame (mm): one photo covers all of it.
    static func perioral(_ p: SIMD3<Float>) -> Bool { p.y > -66 && p.y < -6 && abs(p.x) < 44 && p.z > 40 }

    private static func decode(_ v: FrontView) -> Picture? {
        guard let src = CGImageSourceCreateWithData(v.jpeg as CFData, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
        let w = img.width, h = img.height
        var rgba = [UInt8](repeating: 0, count: w * h * 4)
        let ok: Bool = rgba.withUnsafeMutableBytes { buf in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ok else { return nil }
        var sum: Float = 0, sum2: Float = 0, n: Float = 0
        let g = { (x: Int, y: Int) -> Float in let o = (y * w + x) * 4; return Float(rgba[o]) * 0.3 + Float(rgba[o + 1]) * 0.59 + Float(rgba[o + 2]) * 0.11 }
        for y in Swift.stride(from: h / 4, to: h * 3 / 4, by: 3) { for x in Swift.stride(from: w / 4, to: w * 3 / 4, by: 3) {
            let l = 4 * g(x, y) - g(x - 2, y) - g(x + 2, y) - g(x, y - 2) - g(x, y + 2)
            sum += l; sum2 += l * l; n += 1
        } }
        let sharp = n > 0 ? sum2 / n - (sum / n) * (sum / n) : 0
        let sx = Float(w) / Float(v.width), sy = Float(h) / Float(v.height)
        let K = simd_float3x3(diagonal: SIMD3(sx, sy, 1)) * v.K
        let at = SIMD3(v.cameraToHead.columns.3.x, v.cameraToHead.columns.3.y, v.cameraToHead.columns.3.z) * 1000
        return Picture(rgba: rgba, w: w, h: h, K: K, toCamera: v.cameraToHead.inverse, at: at, sharpness: sharp)
    }

    /// Head point (mm) to pixel and depth (m).
    private static func project(_ p: SIMD3<Float>, _ pic: Picture) -> (Float, Float, Float)? {
        let c = pic.toCamera * SIMD4<Float>(p / 1000, 1)
        let z = -c.z
        guard z > 0.05 else { return nil }
        return (c.x / z * pic.K[0][0] + pic.K[2][0], -c.y / z * pic.K[1][1] + pic.K[2][1], z)
    }

    private static func sample(_ pic: Picture, _ u: Float, _ v: Float) -> SIMD3<Float> {
        let x = max(0, min(Float(pic.w) - 1.001, u)), y = max(0, min(Float(pic.h) - 1.001, v))
        let x0 = Int(x), y0 = Int(y), fx = x - Float(x0), fy = y - Float(y0)
        func px(_ xx: Int, _ yy: Int) -> SIMD3<Float> { let o = (yy * pic.w + xx) * 4; return SIMD3(Float(pic.rgba[o]), Float(pic.rgba[o + 1]), Float(pic.rgba[o + 2])) }
        let a = px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx, b = px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx
        return a * (1 - fy) + b * fy
    }
    private static let luma = SIMD3<Float>(0.3, 0.59, 0.11)
    private static func grey(_ pic: Picture, _ u: Float, _ v: Float) -> Float { simd_dot(sample(pic, u, v), luma) }

    /// How squarely and sharply each photo sees each point, unhidden by the face itself (a coarse depth buffer),
    /// and where the point falls in the photo.
    private static func visibility(_ mesh: FaceMesh, _ normals: [SIMD3<Float>], _ pic: Picture, maxSharp: Float) -> (score: [Float], uv: [SIMD2<Float>]) {
        let nv = mesh.positions.count, bw = max(1, pic.w / 4), bh = max(1, pic.h / 4)
        var score = [Float](repeating: 0, count: nv), uv = [SIMD2<Float>](repeating: .zero, count: nv)
        var zbuf = [Float](repeating: .infinity, count: bw * bh)
        var proj = [(Float, Float, Float)?](repeating: nil, count: nv)
        for i in 0..<nv { proj[i] = project(mesh.positions[i], pic) }
        for t in Swift.stride(from: 0, to: mesh.triangles.count - 2, by: 3) {
            guard let a = proj[Int(mesh.triangles[t])], let b = proj[Int(mesh.triangles[t + 1])], let c = proj[Int(mesh.triangles[t + 2])] else { continue }
            let ax = a.0 / 4, ay = a.1 / 4, bx = b.0 / 4, by = b.1 / 4, cx = c.0 / 4, cy = c.1 / 4
            let x0 = max(0, Int(min(ax, bx, cx))), x1 = min(bw - 1, Int(max(ax, bx, cx)) + 1)
            let y0 = max(0, Int(min(ay, by, cy))), y1 = min(bh - 1, Int(max(ay, by, cy)) + 1)
            guard x0 <= x1, y0 <= y1, x1 - x0 < 60, y1 - y0 < 60 else { continue }
            let area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
            guard abs(area) > 1e-6 else { continue }
            for y in y0...y1 { for x in x0...x1 {
                let px = Float(x) + 0.5, py = Float(y) + 0.5
                let w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area
                let w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area
                let w2 = 1 - w0 - w1
                guard w0 >= -0.01, w1 >= -0.01, w2 >= -0.01 else { continue }
                let z = w0 * a.2 + w1 * b.2 + w2 * c.2
                if z < zbuf[y * bw + x] { zbuf[y * bw + x] = z }
            } }
        }
        let margin: Float = 12
        for i in 0..<nv {
            guard let (u, v, z) = proj[i], u > margin, v > margin, u < Float(pic.w) - margin, v < Float(pic.h) - margin else { continue }
            let bx = min(bw - 1, Int(u / 4)), by = min(bh - 1, Int(v / 4))
            guard z <= zbuf[by * bw + bx] + 0.003 else { continue }
            let facing = simd_dot(normals[i], simd_normalize(pic.at - mesh.positions[i]))
            guard facing > 0.3 else { continue }
            score[i] = facing * facing * (0.6 + 0.4 * pic.sharpness / max(1, maxSharp))
            uv[i] = SIMD2(u, v)
        }
        return (score, uv)
    }

    /// Each photo's brightness and colour balance matched to `ref`, from the points both see well.
    private static func gains(_ pics: [Picture], _ score: [[Float]], _ uv: [[SIMD2<Float>]], ref: Int) -> [SIMD3<Float>] {
        var gain = [SIMD3<Float>](repeating: SIMD3(1, 1, 1), count: pics.count)
        let nv = score.first?.count ?? 0
        for k in pics.indices where k != ref {
            var a = SIMD3<Float>.zero, b = SIMD3<Float>.zero, n = 0
            for i in Swift.stride(from: 0, to: nv, by: 3) where score[k][i] > 0.4 && score[ref][i] > 0.4 {
                a += sample(pics[ref], uv[ref][i].x, uv[ref][i].y); b += sample(pics[k], uv[k][i].x, uv[k][i].y); n += 1
            }
            if n > 200 { gain[k] = simd_clamp(a / simd_max(b, SIMD3(repeating: 1)), SIMD3(repeating: 0.7), SIMD3(repeating: 1.4)) }
        }
        return gain
    }

    /// Nudges one photo's camera (a small turn and shift) until its brightness agrees with the consensus of all the
    /// photos at the points it sees (Gauss–Newton on the photometric error). Kept only if the error drops.
    private static func refinePose(_ pic: inout Picture, mesh: FaceMesh, points: [Int], consensus: [Float], gain: Float) {
        guard points.count > 300 else { return }
        let fx = pic.K[0][0], fy = pic.K[1][1]
        func error(_ T: simd_float4x4) -> Float {
            var e: Float = 0, n: Float = 0
            var probe = pic; probe.toCamera = T
            for i in points { if let (u, v, _) = project(mesh.positions[i], probe) { e += min(40, abs(grey(probe, u, v) * gain - consensus[i])); n += 1 } }
            return n > 0 ? e / n : .infinity
        }
        var best = error(pic.toCamera)
        let start = pic.toCamera
        for _ in 0..<6 {
            var A = [[Double]](repeating: [Double](repeating: 0, count: 6), count: 6), b = [Double](repeating: 0, count: 6)
            for i in points {
                let c4 = pic.toCamera * SIMD4<Float>(mesh.positions[i] / 1000, 1), c = SIMD3(c4.x, c4.y, c4.z), z = -c.z
                guard z > 0.05 else { continue }
                let u = c.x / z * fx + pic.K[2][0], v = -c.y / z * fy + pic.K[2][1]
                guard u > 2, v > 2, u < Float(pic.w) - 3, v < Float(pic.h) - 3 else { continue }
                let r = grey(pic, u, v) * gain - consensus[i]
                let ix = (grey(pic, u + 1, v) - grey(pic, u - 1, v)) / 2 * gain, iy = (grey(pic, u, v + 1) - grey(pic, u, v - 1)) / 2 * gain
                let g = SIMD3<Float>(ix * fx / z, -iy * fy / z, ix * fx * c.x / (z * z) - iy * fy * c.y / (z * z))
                let jw = simd_cross(c, g)
                let J = [Double(jw.x), Double(jw.y), Double(jw.z), Double(g.x), Double(g.y), Double(g.z)]
                let w = abs(r) < 20 ? 1.0 : 20.0 / Double(abs(r))   // Huber: outliers count less
                for p in 0..<6 { b[p] -= w * J[p] * Double(r); for q in 0..<6 { A[p][q] += w * J[p] * J[q] } }
            }
            var trace = 0.0
            for p in 0..<6 { trace += A[p][p] }
            let damp: Double = trace / 6 * 1e-3 + 1e-9
            for p in 0..<6 { A[p][p] += damp }
            guard let x = FaceAlign.solve(A, b) else { break }
            var rot = SIMD3<Float>(Float(x[0]), Float(x[1]), Float(x[2])), sh = SIMD3<Float>(Float(x[3]), Float(x[4]), Float(x[5]))
            if simd_length(rot) > 0.02 { rot *= 0.02 / simd_length(rot) }
            if simd_length(sh) > 0.003 { sh *= 0.003 / simd_length(sh) }
            let angle = simd_length(rot)
            let R = angle > 1e-9 ? simd_matrix3x3(simd_quatf(angle: angle, axis: rot / angle)) : matrix_identity_float3x3
            let step = simd_float4x4(columns: (SIMD4(R.columns.0, 0), SIMD4(R.columns.1, 0), SIMD4(R.columns.2, 0), SIMD4(sh, 1)))
            let next = step * pic.toCamera, e = error(next)
            guard e < best else { break }
            best = e; pic.toCamera = next
        }
        // Never more than a small correction overall.
        let moved = simd_distance(SIMD3(pic.toCamera.columns.3.x, pic.toCamera.columns.3.y, pic.toCamera.columns.3.z), SIMD3(start.columns.3.x, start.columns.3.y, start.columns.3.z))
        if moved > 0.008 { pic.toCamera = start }
        let inv = pic.toCamera.inverse
        pic.at = SIMD3(inv.columns.3.x, inv.columns.3.y, inv.columns.3.z) * 1000
    }

    static func make(_ mesh: FaceMesh, views: [FrontView]) -> (textured: TexturedFace, mesh: FaceMesh)? {
        var pics = views.compactMap(decode)
        guard pics.count >= 3 else { return nil }
        let normals = mesh.normals(), nv = mesh.positions.count, nt = mesh.triangles.count / 3
        let maxSharp = pics.map(\.sharpness).max() ?? 1
        func seeAll() -> ([[Float]], [[SIMD2<Float>]]) {
            let v = pics.map { visibility(mesh, normals, $0, maxSharp: maxSharp) }
            return (v.map(\.score), v.map(\.uv))
        }
        var (score, uv) = seeAll()
        let ref = pics.indices.max(by: { pics[$0].at.z / max(1, simd_length(pics[$0].at)) < pics[$1].at.z / max(1, simd_length(pics[$1].at)) })!
        // 1. Each photo's camera nudged onto the consensus (one round: a second gained nothing in testing).
        for _ in 0..<1 {
            let gain = gains(pics, score, uv, ref: ref).map { simd_dot($0, luma) / simd_dot(SIMD3<Float>(1, 1, 1), luma) }
            var consensus = [Float](repeating: 0, count: nv), support = [Int](repeating: 0, count: nv)
            var weightSum = [Float](repeating: 0, count: nv)
            for k in pics.indices { for i in 0..<nv where score[k][i] > 0.2 {
                consensus[i] += grey(pics[k], uv[k][i].x, uv[k][i].y) * gain[k] * score[k][i]; weightSum[i] += score[k][i]; support[i] += 1
            } }
            for i in 0..<nv where weightSum[i] > 0 { consensus[i] /= weightSum[i] }
            for k in pics.indices {
                let pts = Swift.stride(from: 0, to: nv, by: max(1, nv / 6000)).filter { score[k][$0] > 0.35 && support[$0] >= 2 }
                refinePose(&pics[k], mesh: mesh, points: Array(pts.prefix(3000)), consensus: consensus, gain: gain[k])
            }
            (score, uv) = seeAll()
        }
        let gain = gains(pics, score, uv, ref: ref)

        // 2. One photo per triangle.
        let tri = { (t: Int, j: Int) in Int(mesh.triangles[t * 3 + j]) }
        func minScore(_ t: Int, _ k: Int) -> Float { min(score[k][tri(t, 0)], score[k][tri(t, 1)], score[k][tri(t, 2)]) }
        var label = [Int](repeating: -1, count: nt), locked = [Bool](repeating: false, count: nt)
        for t in 0..<nt {
            let centre = (mesh.positions[tri(t, 0)] + mesh.positions[tri(t, 1)] + mesh.positions[tri(t, 2)]) / 3
            if perioral(centre), minScore(t, ref) > 0 { label[t] = ref; locked[t] = true; continue }
            var best = -1, bestS: Float = 0
            for k in pics.indices { let sc = minScore(t, k); if sc > bestS { bestS = sc; best = k } }
            label[t] = best
        }
        // Neighbouring triangles (sharing an edge).
        var edgeTris: [UInt64: [Int32]] = [:]
        for t in 0..<nt { for j in 0..<3 {
            let a = UInt64(tri(t, j)), b = UInt64(tri(t, (j + 1) % 3))
            edgeTris[min(a, b) << 32 | max(a, b), default: []].append(Int32(t))
        } }
        var neighbours = [[Int32]](repeating: [], count: nt)
        for list in edgeTris.values where list.count == 2 { neighbours[Int(list[0])].append(list[1]); neighbours[Int(list[1])].append(list[0]) }
        // Smoothness: a triangle changes photo only where it saves more than it costs in seams (iterated conditional modes).
        let lambda: Float = 0.3
        for _ in 0..<5 {
            var changed = 0
            for t in 0..<nt where !locked[t] && label[t] >= 0 {
                var candidates = Set(neighbours[t].map { label[Int($0)] }.filter { $0 >= 0 }); candidates.insert(label[t])
                var bestL = label[t], bestE = Float.infinity
                for l in candidates {
                    let d = minScore(t, l)
                    guard d > 0 else { continue }
                    let e = (1 - d) + lambda * Float(neighbours[t].filter { label[Int($0)] != l }.count)
                    if e < bestE { bestE = e; bestL = l }
                }
                if bestL != label[t] { label[t] = bestL; changed += 1 }
            }
            if changed == 0 { break }
        }
        // Up to 16 photos in the texture; triangles of others move to their best kept photo.
        var used = [Int: Int]()
        for l in label where l >= 0 { used[l, default: 0] += 1 }
        let kept = used.sorted { $0.value > $1.value }.prefix(16).map(\.key)
        guard !kept.isEmpty else { return nil }
        let keptSet = Set(kept)
        for t in 0..<nt where label[t] >= 0 && !keptSet.contains(label[t]) {
            let k = kept.max(by: { minScore(t, $0) < minScore(t, $1) })!
            label[t] = minScore(t, k) > 0 ? k : -1
        }

        // 3. Colour levelled across seams: at each seam point every photo is moved to their mean, and the correction
        //    spread smoothly over each photo's patch (fixed at the seams, harmonic inside).
        let colourAt = { (i: Int, k: Int) -> SIMD3<Float> in sample(pics[k], uv[k][i].x, uv[k][i].y) * gain[k] }
        var labelsAt = [[Int]](repeating: [], count: nv)
        for t in 0..<nt where label[t] >= 0 { for j in 0..<3 { let v = tri(t, j); if !labelsAt[v].contains(label[t]) { labelsAt[v].append(label[t]) } } }
        var delta = [Int: SIMD3<Float>]()   // vertex * 32 + photo
        var fixed = Set<Int>()
        for v in 0..<nv where labelsAt[v].count > 1 {
            let cs = labelsAt[v].map { colourAt(v, $0) }
            let mean = cs.reduce(SIMD3<Float>.zero, +) / Float(cs.count)
            for (n, k) in labelsAt[v].enumerated() { delta[v * 32 + k] = mean - cs[n]; fixed.insert(v * 32 + k) }
        }
        for k in kept {
            var adj: [Int: Set<Int>] = [:]
            for t in 0..<nt where label[t] == k { for j in 0..<3 {
                let a = tri(t, j), b = tri(t, (j + 1) % 3)
                adj[a, default: []].insert(b); adj[b, default: []].insert(a)
            } }
            let free = adj.keys.filter { !fixed.contains($0 * 32 + k) }
            guard !free.isEmpty, adj.keys.contains(where: { fixed.contains($0 * 32 + k) }) else { continue }
            for _ in 0..<60 {
                var next = [Int: SIMD3<Float>]()
                for v in free {
                    let ns = adj[v]!
                    var m = SIMD3<Float>.zero
                    for n in ns { m += delta[n * 32 + k] ?? .zero }
                    next[v] = m / Float(ns.count)
                }
                for (v, d) in next { delta[v * 32 + k] = d }
            }
        }

        // The atlas: the kept photos side by side, brightness-matched, each patch corrected.
        let cols = Int(ceilf(sqrtf(Float(kept.count)))), rows = Int(ceilf(Float(kept.count) / Float(cols)))
        let cellW = min(1024, pics[kept[0]].w), cellH = Int(Float(cellW) * Float(pics[kept[0]].h) / Float(pics[kept[0]].w))
        let aw = cols * cellW, ah = rows * cellH
        var atlas = [Float](repeating: 0, count: aw * ah * 3)
        var cell = [Int: (Int, Int, Float, Float)]()
        for (n, k) in kept.enumerated() {
            let pic = pics[k], x0 = (n % cols) * cellW, y0 = (n / cols) * cellH
            let sx = Float(pic.w) / Float(cellW), sy = Float(pic.h) / Float(cellH)
            cell[k] = (x0, y0, 1 / sx, 1 / sy)
            for y in 0..<cellH { for x in 0..<cellW {
                let c = sample(pic, (Float(x) + 0.5) * sx, (Float(y) + 0.5) * sy) * gain[k]
                let o = ((y0 + y) * aw + x0 + x) * 3
                atlas[o] = c.x; atlas[o + 1] = c.y; atlas[o + 2] = c.z
            } }
        }
        var corrected = [Bool](repeating: false, count: aw * ah)
        for t in 0..<nt where label[t] >= 0 {
            let k = label[t], (x0, y0, kx, ky) = cell[k]!
            let vs = (0..<3).map { tri(t, $0) }
            let p = vs.map { SIMD2(Float(x0) + uv[k][$0].x * kx, Float(y0) + uv[k][$0].y * ky) }
            let d = vs.map { delta[$0 * 32 + k] ?? .zero }
            let minX = max(0, Int(min(p[0].x, p[1].x, p[2].x)) - 1), maxX = min(aw - 1, Int(max(p[0].x, p[1].x, p[2].x)) + 1)
            let minY = max(0, Int(min(p[0].y, p[1].y, p[2].y)) - 1), maxY = min(ah - 1, Int(max(p[0].y, p[1].y, p[2].y)) + 1)
            guard minX <= maxX, minY <= maxY, maxX - minX < 200, maxY - minY < 200 else { continue }
            let area = (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[2].x - p[0].x) * (p[1].y - p[0].y)
            guard abs(area) > 1e-6 else { continue }
            for y in minY...maxY { for x in minX...maxX where !corrected[y * aw + x] {
                let q = SIMD2(Float(x) + 0.5, Float(y) + 0.5)
                let w0 = ((p[1].x - q.x) * (p[2].y - q.y) - (p[2].x - q.x) * (p[1].y - q.y)) / area
                let w1 = ((p[2].x - q.x) * (p[0].y - q.y) - (p[0].x - q.x) * (p[2].y - q.y)) / area
                let w2 = 1 - w0 - w1
                guard w0 >= -0.15, w1 >= -0.15, w2 >= -0.15 else { continue }
                let c = d[0] * w0 + d[1] * w1 + d[2] * w2, o = (y * aw + x) * 3
                atlas[o] += c.x; atlas[o + 1] += c.y; atlas[o + 2] += c.z
                corrected[y * aw + x] = true
            } }
        }
        var bytes = [UInt8](repeating: 255, count: aw * ah * 4)
        for i in 0..<(aw * ah) { for ch in 0..<3 { bytes[i * 4 + ch] = UInt8(max(0, min(255, atlas[i * 3 + ch]))) } }
        guard let provider = CGDataProvider(data: Data(bytes) as CFData),
              let texture = CGImage(width: aw, height: ah, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: aw * 4, space: CGColorSpaceCreateDeviceRGB(),
                                    bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue), provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return nil }
        var positions: [SIMD3<Float>] = [], uvs: [SIMD2<Float>] = [], tris: [UInt32] = []
        var index = [Int: UInt32]()
        for t in 0..<nt where label[t] >= 0 {
            let k = label[t], (x0, y0, kx, ky) = cell[k]!
            for j in 0..<3 {
                let v = tri(t, j), key = v * 32 + k
                if let i = index[key] { tris.append(i); continue }
                let q = uv[k][v], i = UInt32(positions.count)
                positions.append(mesh.positions[v])
                uvs.append(SIMD2((Float(x0) + q.x * kx) / Float(aw), 1 - (Float(y0) + q.y * ky) / Float(ah)))
                index[key] = i; tris.append(i)
            }
        }
        guard tris.count > 3000 else { return nil }
        // The mesh's own colours: each point from its patch's photo with the same levelling; elsewhere the best two.
        var recoloured = mesh
        for i in 0..<nv {
            var c = SIMD3<Float>.zero
            if !labelsAt[i].isEmpty {
                for k in labelsAt[i] { c += colourAt(i, k) + (delta[i * 32 + k] ?? .zero) }
                c /= Float(labelsAt[i].count)
            } else {
                let best = pics.indices.filter { score[$0][i] > 0 }.sorted { score[$0][i] > score[$1][i] }.prefix(2)
                guard !best.isEmpty else { continue }
                var w: Float = 0
                for k in best { c += colourAt(i, k) * score[k][i]; w += score[k][i] }
                c /= w
            }
            recoloured.colours[i] = SIMD3(UInt8(max(0, min(255, c.x))), UInt8(max(0, min(255, c.y))), UInt8(max(0, min(255, c.z))))
        }
        return (TexturedFace(positions: positions, uvs: uvs, triangles: tris, texture: texture), recoloured)
    }
}

/// The shots as Object Capture's input, loaded one at a time.
struct ShotSequence: Sequence {
    let shots: [PhotoShots.Shot]
    let store: PhotoShots
    func makeIterator() -> AnyIterator<PhotogrammetrySample> {
        var i = 0
        return AnyIterator {
            while i < shots.count {
                defer { i += 1 }
                if let s = store.sample(shots[i]) { return s }
            }
            return nil
        }
    }
}

/// Builds the face from the scan's photographs with Apple's Object Capture, on the iPhone. The result is lined up
/// onto the LiDAR face (from where the camera was for each photo, then fine-tuned on the face's shape), trimmed to
/// the head, and kept only if it fits; otherwise the LiDAR face stays.
final class PhotoRefiner {
    private var session: PhotogrammetrySession?
    private var cancelled = false
    static var isSupported: Bool { PhotogrammetrySession.isSupported }
    static let minimumShots = 30

    func cancel() { cancelled = true; session?.cancel() }

    /// `status` gets a short line for the screen ("Lining up the photos · about 1 min left").
    func refine(_ shots: PhotoShots, lidar: FaceMesh, progress: @escaping (Double) -> Void, status: @escaping (String) -> Void = { _ in }) async -> TexturedFace? {
        let list = shots.shots
        guard Self.isSupported, list.count >= Self.minimumShots, !cancelled else { return nil }
        var configuration = PhotogrammetrySession.Configuration()
        configuration.isObjectMaskingEnabled = true
        configuration.sampleOrdering = .sequential
        configuration.featureSensitivity = .high
        let out = shots.folder.appendingPathComponent("face.usdz")
        var poses: [Int: SIMD3<Float>] = [:], model: URL?
        do {
            let s = try PhotogrammetrySession(input: ShotSequence(shots: list, store: shots), configuration: configuration)
            session = s
            try s.process(requests: [.poses, .modelFile(url: out, detail: .reduced)])
            // Never left hanging: after 6 minutes the LiDAR face is kept.
            let watchdog = Task { [weak s] in
                try? await Task.sleep(nanoseconds: 360 * 1_000_000_000)
                s?.cancel()
            }
            defer { watchdog.cancel() }
            status("Reading the photos")
            outputs: for try await o in s.outputs {
                switch o {
                case .requestProgress(let request, let fraction):
                    if case .modelFile = request { progress(fraction) }
                case .requestProgressInfo(let request, let info):
                    guard case .modelFile = request else { break }
                    let stage: String
                    switch info.processingStage {
                    case .preProcessing: stage = "Reading the photos"
                    case .imageAlignment: stage = "Lining up the photos"
                    case .pointCloudGeneration: stage = "Measuring the face"
                    case .meshGeneration: stage = "Building the shape"
                    case .textureMapping: stage = "Adding the skin"
                    case .optimization: stage = "Finishing"
                    default: stage = "Working"
                    }
                    if let left = info.estimatedRemainingTime, left.isFinite, left > 0 {
                        status("\(stage) · about \(left < 90 ? "\(max(1, Int(left.rounded()))) s" : "\(Int((left / 60).rounded())) min") left")
                    } else { status(stage) }
                case .stitchingIncomplete:
                    status("Some photos didn’t line up")
                case .requestComplete(_, let result):
                    switch result {
                    case .poses(let p): poses = p.posesBySample.mapValues(\.translation)
                    case .modelFile(let url): model = url
                    default: break
                    }
                case .processingComplete, .processingCancelled: break outputs
                default: break
                }
            }
        } catch { return nil }
        session = nil
        guard !cancelled, let model, var face = Self.load(model) else { return nil }
        // Object Capture's frame → the head's frame: from the camera positions of the photos.
        let pairs = list.compactMap { s -> (SIMD3<Float>, SIMD3<Float>)? in
            poses[s.id].map { ($0, SIMD3(s.cameraToHead.columns.3.x, s.cameraToHead.columns.3.y, s.cameraToHead.columns.3.z)) }
        }
        guard pairs.count >= 8, let fit = Similarity.fit(pairs.map(\.0), pairs.map(\.1)), fit.scale > 0.6, fit.scale < 1.6 else { return nil }
        var toMillimetres = matrix_identity_float4x4
        toMillimetres.columns.0.x = 1000; toMillimetres.columns.1.y = 1000; toMillimetres.columns.2.z = 1000
        face = face.transformed(toMillimetres * fit.matrix)
        face = face.cropped(lo: SIMD3(-125, -190, -80), hi: SIMD3(125, 170, 180))
        guard face.triangles.count > 3000 else { return nil }
        // Fine-tuned onto the LiDAR face; kept only if the two agree.
        guard let r = FaceAlign.align(base: lidar, moving: face.faceMesh()), r.rms < 2.2, r.overlap > 0.4 else { return nil }
        return face.transformed(r.transform)
    }

    /// The textured mesh from Object Capture's USDZ (metres, its own frame).
    static func load(_ url: URL) -> TexturedFace? {
        let asset = MDLAsset(url: url)
        asset.loadTextures()
        var meshes: [(MDLMesh, simd_float4x4)] = []
        func walk(_ o: MDLObject) {
            if let m = o as? MDLMesh { meshes.append((m, MDLTransform.globalTransform(with: o, atTime: 0))) }
            for c in o.children.objects { walk(c) }
        }
        for i in 0..<asset.count { walk(asset.object(at: i)) }
        var positions: [SIMD3<Float>] = [], uvs: [SIMD2<Float>] = [], triangles: [UInt32] = []
        var texture: CGImage?
        for (mesh, m) in meshes {
            guard let p = mesh.vertexAttributeData(forAttributeNamed: MDLVertexAttributePosition, as: .float3),
                  let t = mesh.vertexAttributeData(forAttributeNamed: MDLVertexAttributeTextureCoordinate, as: .float2) else { continue }
            let base = UInt32(positions.count)
            for i in 0..<mesh.vertexCount {
                let v = (p.dataStart + i * p.stride).assumingMemoryBound(to: Float.self)
                let q = m * SIMD4<Float>(v[0], v[1], v[2], 1)
                positions.append(SIMD3(q.x, q.y, q.z))
                let u = (t.dataStart + i * t.stride).assumingMemoryBound(to: Float.self)
                uvs.append(SIMD2(u[0], u[1]))
            }
            for case let sub as MDLSubmesh in mesh.submeshes ?? [] where sub.geometryType == .triangles {
                let ib = sub.indexBuffer(asIndexType: .uInt32)
                let map = ib.map()
                let idx = map.bytes.assumingMemoryBound(to: UInt32.self)
                for k in 0..<sub.indexCount { triangles.append(base + idx[k]) }
                if texture == nil, let tex = sub.material?.property(with: .baseColor)?.textureSamplerValue?.texture?.imageFromTexture()?.takeUnretainedValue() { texture = tex }
            }
        }
        guard let texture, !triangles.isEmpty else { return nil }
        return TexturedFace(positions: positions, uvs: uvs, triangles: triangles, texture: texture)
    }
}

/// The face scan, always with the rear LiDAR scanner: the patient keeps still and the clinician moves the phone
/// round them, to the patient's right, to their left, above and below. A cross under the face fills as each
/// direction is reached, and "Face mapped" counts the share of the face seen closely enough; the scan finishes
/// only when both are complete. Closing keeps the scans already made.
final class FaceScanViewController: UIViewController, ARSessionDelegate {
    /// Front: the Face ID (TrueDepth) sensor, dense depth and 60 fps face tracking; the clinician holds the phone with
    /// the screen towards the patient, who follows the prompts. Rear: the LiDAR scanner and camera; the patient keeps
    /// still while the clinician moves round them, and the detailed face is built from the photos taken on the way.
    enum Sensor: String { case front, rear }
    static var frontAvailable: Bool {
        ARFaceTrackingConfiguration.isSupported && AVCaptureDevice.default(.builtInTrueDepthCamera, for: .video, position: .front) != nil
    }
    private var rearAvailable: Bool { LidarScanner.available }
    private var sensor: Sensor
    private var switchingSensor = false
    private let sensorPicker = UISegmentedControl(items: ["Front · Face ID", "Rear · camera + LiDAR"])
    private var capturePolicy = FaceScanCapturePolicy()
    /// Gravity's up in the head frame when the scan started: natural head position for the lab.
    private var gravityUp: SIMD3<Float>?
    /// Automatic start: the face centred, frontal and still for a moment, then a short counted start.
    private var steadySince: CFTimeInterval?
    /// Clinician cues while the screen faces the patient: milestones heard, and the last "too fast" buzz.
    private var milestone = 0
    private var lastFastWarning: CFTimeInterval = 0
    /// When this pose's ready screen appeared, and whether the patient has moved since (retractors going in).
    private var readySince: CFTimeInterval = 0
    private var movedSinceReady = false
    private var lastAnchor: simd_float4x4?
    private var countdown = 0
    private var countdownTimer: Timer?
    private var finishing = false
    // This device's scale check: a bank card (85.60 × 53.98 mm) held flat in front of the Face ID sensor.
    private var scaleMode = false
    private var scaleSamples: [Float] = []
    private var measuring = false
    private let scaleButton = UIButton(type: .system)
    /// The count-in (3, 2, 1) and the finished tick, large in the middle of the outline, readable at arm's length.
    private let countLabel = UILabel()
    /// Face ID scans use a calm page: the camera only inside a face-shaped window, a ring of ticks round it that fills
    /// where the face has been captured, and the one instruction at the top.
    private let eggMask = CAShapeLayer()
    private let tickRing = TickRingView()
    /// Round the face window the room stays visible but frosted, so the face stands out without a blank page.
    private let frosted = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterialDark))
    private let frostedHole = CAShapeLayer()
    private static let ivory = UIColor(red: 0.98, green: 0.976, blue: 0.965, alpha: 1)
    private static let ink = UIColor(red: 0.14, green: 0.13, blue: 0.12, alpha: 1)
    /// Front: from the face anchor's frame to the head frame (origin 10 cm behind the nose tip, at its height).
    private var faceOffset: simd_float4x4?
    /// Front: whether the camera's raw image runs mirrored to ARKit's camera (checked when the scan starts).
    private var frontMirror = false

    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    /// The share of the face that must be seen before a scan can finish by itself.
    static let mappedTarget: Float = 0.9
    /// Once the ring is done and most of the face is in, a short pause with nothing new finishes the scan.
    static let settledFraction: Float = 0.8
    static let settleSeconds: CFTimeInterval = 2.5
    private let captures: [FaceCaptureSpec]
    private let completion: ([FaceScanResult]) -> Void
    private var index = 0
    private var results: [FaceScanResult] = []

    private enum Phase { case ready, locking, scanning, building, refining }
    private var phase = Phase.ready
    private var finished = false
    private var volume: FaceVolume?
    private var tracker: HeadTracker?
    /// The sharp photos for the detailed build, and where they were taken from (head frame directions).
    private var shots: PhotoShots?
    private var shotDirections: [SIMD3<Float>] = []
    private var lastShotAt: CFTimeInterval = 0
    private var finishAfterPhoto = false
    /// How fast the view of the head is turning (degrees a second); photos are taken only when it's steady.
    private var lastTurnRate: Float = 0
    private var latestDepth: CVPixelBuffer?
    /// Vision's person cut-out: how to turn the raw image upright for it, and how its mask lines up with the raw
    /// image (checked on the face when the scan starts; nil turns the cut-out off).
    private var visionOrientation: CGImagePropertyOrientation = .right
    private var maskMapping: CGImagePropertyOrientation?
    private let liveSegmentation: VNGeneratePersonSegmentationRequest = {
        let r = VNGeneratePersonSegmentationRequest()
        r.qualityLevel = .fast
        r.outputPixelFormat = kCVPixelFormatType_OneComponent8
        return r
    }()
    private let liveHandler = VNSequenceRequestHandler()
    private var refiner: PhotoRefiner?
    private var refineProgress: Float = 0
    /// The high-resolution video format is used for sharper photos unless it stops the depth arriving.
    private var useHighResFormat = true
    private var framesWithoutDepth = 0
    /// The last thing the tracker asked for (the patient moved, or the expression changed), shown for a moment.
    private var trackingIssue: (text: String, at: CFTimeInterval)?
    private var lastView: (cam: SIMD3<Float>, at: CFTimeInterval)?
    private let fuseQueue = DispatchQueue(label: "uk.co.drvik.smilecompose.facescan", qos: .userInitiated)
    private var fusing = false
    private var reach = (right: Float(0), left: Float(0), up: Float(0), down: Float(0))
    private var coverage = FaceCoverage()
    private var lastCoverageGain = CACurrentMediaTime()
    /// The head's frame in the world, fixed when the scan starts, and the eyes found then (head frame, metres).
    private var headToWorld: simd_float4x4?
    private var lidarEyes: (left: SIMD3<Float>, right: SIMD3<Float>)?
    /// Sharp front-camera photos from different angles during a Face ID scan (up to 12), for photographic skin.
    private var frontViews: [FrontView] = []
    private let photoContext = CIContext(options: [.cacheIntermediates: false])
    private var noseTip: SIMD3<Float>?
    private var lastPromptTap: CFTimeInterval = 0

    private let sceneView = ARSCNView()
    private let closeButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let stepLabel = UILabel()
    private let sensorLabel = UILabel()
    private let dots = UIStackView()
    private let meter = RingMeterView()
    private let shade = CAShapeLayer()
    private let wellSeen = CAShapeLayer(), partlySeen = CAShapeLayer()
    private var livePoints: [(SIMD3<Float>, UInt16)] = []
    private var overlayTick = 0
    private let guideView = UIImageView()
    private let guide: UIImage?
    private let mapped = UILabel()
    private let progressTrack = UIView(), progressFill = UIView()
    private let bar = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    private let prompt = UILabel()
    private let detail = UILabel()
    private let startButton = UIButton(type: .system)
    private let finishButton = UIButton(type: .system)
    private let skipButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .large)
    private let topFade = CAGradientLayer(), bottomFade = CAGradientLayer()

    init(captures: [FaceCaptureSpec], guide: UIImage?, completion: @escaping ([FaceScanResult]) -> Void) {
        self.captures = captures
        self.guide = guide
        self.completion = completion
        let saved = UserDefaults.standard.string(forKey: "faceScanSensor").flatMap(Sensor.init(rawValue:))
        switch (saved, Self.frontAvailable, LidarScanner.available) {
        case (.some(.rear), _, true), (_, false, true): sensor = .rear
        default: sensor = .front
        }
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }
    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        sceneView.session.delegate = self
        sensorPicker.accessibilityIdentifier = "faceScan.sensor"
        sensorPicker.accessibilityLabel = "Scan camera"
        sceneView.automaticallyUpdatesLighting = false
        sceneView.scene = SCNScene()
        view.addSubview(sceneView)
        for (fade, top) in [(topFade, true), (bottomFade, false)] {
            fade.colors = top ? [UIColor(white: 0, alpha: 0.55).cgColor, UIColor.clear.cgColor] : [UIColor.clear.cgColor, UIColor(white: 0, alpha: 0.65).cgColor]
            view.layer.addSublayer(fade)
        }
        // Outside the ring is dimmed; inside, the points captured so far: gold once well seen, pale until then.
        shade.fillRule = .evenOdd
        shade.fillColor = UIColor(white: 0, alpha: 0.42).cgColor
        view.layer.addSublayer(shade)
        wellSeen.fillColor = Self.gold.withAlphaComponent(0.9).cgColor
        partlySeen.fillColor = UIColor(white: 1, alpha: 0.35).cgColor
        view.layer.addSublayer(partlySeen)
        view.layer.addSublayer(wellSeen)
        // The At rest outline to line the face up with; it turns gold once the scanner has found the face.
        guideView.image = guide?.withRenderingMode(.alwaysTemplate)
        guideView.contentMode = .scaleAspectFit
        guideView.tintColor = UIColor(white: 1, alpha: 0.45)
        guideView.isUserInteractionEnabled = false
        view.addSubview(guideView)

        titleLabel.text = "3D face scan"
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center
        stepLabel.font = .systemFont(ofSize: 12)
        stepLabel.textColor = UIColor(white: 1, alpha: 0.75)
        stepLabel.textAlignment = .center
        sensorLabel.font = .systemFont(ofSize: 11, weight: .semibold)
        sensorLabel.textColor = Self.gold
        sensorLabel.textAlignment = .center
        dots.axis = .horizontal
        dots.spacing = 4
        dots.distribution = .fillEqually
        for _ in captures { let d = UIView(); d.layer.cornerRadius = 1.5; dots.addArrangedSubview(d) }
        mapped.font = .monospacedDigitSystemFont(ofSize: 13, weight: .semibold)
        mapped.textColor = .white
        mapped.textAlignment = .center
        [titleLabel, stepLabel, sensorLabel, dots, meter].forEach { view.addSubview($0) }
        sensorPicker.selectedSegmentTintColor = Self.gold
        sensorPicker.setTitleTextAttributes([.foregroundColor: UIColor.white, .font: UIFont.systemFont(ofSize: 13, weight: .medium)], for: .normal)
        sensorPicker.setTitleTextAttributes([.foregroundColor: UIColor(white: 0.08, alpha: 1), .font: UIFont.systemFont(ofSize: 13, weight: .semibold)], for: .selected)
        sensorPicker.backgroundColor = UIColor(white: 0.1, alpha: 0.5)
        sensorPicker.selectedSegmentIndex = sensor == .front ? 0 : 1
        sensorPicker.addTarget(self, action: #selector(sensorChanged), for: .valueChanged)
        view.addSubview(sensorPicker)

        bar.layer.cornerRadius = 18
        bar.clipsToBounds = true
        prompt.font = .systemFont(ofSize: 21, weight: .semibold)
        prompt.textColor = .white
        prompt.textAlignment = .center
        prompt.adjustsFontSizeToFitWidth = true
        prompt.minimumScaleFactor = 0.7
        detail.font = .systemFont(ofSize: 13)
        detail.textColor = UIColor(white: 1, alpha: 0.75)
        detail.textAlignment = .center
        detail.numberOfLines = 2
        progressTrack.backgroundColor = UIColor(white: 1, alpha: 0.16)
        progressTrack.layer.cornerRadius = 2.5
        progressTrack.clipsToBounds = true
        progressFill.backgroundColor = Self.gold
        progressTrack.addSubview(progressFill)
        [prompt, detail, progressTrack, mapped].forEach { bar.contentView.addSubview($0) }
        view.addSubview(bar)

        let round = { (b: UIButton, symbol: String, label: String) in
            b.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)), for: .normal)
            b.tintColor = .white
            b.backgroundColor = UIColor(white: 0.1, alpha: 0.45)
            b.layer.cornerRadius = 22
            b.accessibilityLabel = label
            self.view.addSubview(b)
        }
        round(closeButton, "xmark", "Close")
        closeButton.addTarget(self, action: #selector(close), for: .touchUpInside)

        startButton.setTitle("Start scan", for: .normal)
        startButton.accessibilityIdentifier = "faceScan.start"
        startButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        startButton.setTitleColor(UIColor(white: 0.08, alpha: 1), for: .normal)
        startButton.backgroundColor = Self.gold
        startButton.layer.cornerRadius = 27
        startButton.addTarget(self, action: #selector(start), for: .touchUpInside)
        finishButton.setTitle("Finish", for: .normal)
        finishButton.accessibilityIdentifier = "faceScan.finish"
        finishButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        finishButton.tintColor = .white
        finishButton.backgroundColor = UIColor(white: 0.1, alpha: 0.45)
        finishButton.layer.cornerRadius = 22
        finishButton.addTarget(self, action: #selector(finishTapped), for: .touchUpInside)
        skipButton.setTitle("Skip", for: .normal)
        skipButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        skipButton.tintColor = UIColor(white: 1, alpha: 0.9)
        skipButton.addTarget(self, action: #selector(skip), for: .touchUpInside)
        spinner.color = .white
        spinner.hidesWhenStopped = true
        [startButton, finishButton, skipButton, spinner].forEach { view.addSubview($0) }
        countLabel.font = .systemFont(ofSize: 96, weight: .semibold)
        countLabel.textColor = Self.gold
        countLabel.textAlignment = .center
        countLabel.alpha = 0
        countLabel.layer.shadowColor = UIColor.black.cgColor
        countLabel.layer.shadowOpacity = 0.5
        countLabel.layer.shadowRadius = 12
        countLabel.layer.shadowOffset = .zero
        view.addSubview(countLabel)
        view.insertSubview(frosted, aboveSubview: sceneView)
        view.insertSubview(tickRing, aboveSubview: frosted)
        frosted.isUserInteractionEnabled = false
        frostedHole.fillRule = .evenOdd
        let holeView = UIView(); holeView.layer.addSublayer(frostedHole)
        frosted.mask = holeView
        scaleButton.setTitle("Check scale", for: .normal)
        scaleButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
        scaleButton.tintColor = .white
        scaleButton.backgroundColor = UIColor(white: 0.1, alpha: 0.45)
        scaleButton.layer.cornerRadius = 18
        scaleButton.addTarget(self, action: #selector(scaleTapped), for: .touchUpInside)
        view.addSubview(scaleButton)
        // The volume buttons start and stop a scan, so the clinician needn't reach round to the screen.
        if #available(iOS 17.2, *) {
            let buttons = AVCaptureEventInteraction { [weak self] event in
                guard event.phase == .began else { return }
                self?.hardwareButton()
            }
            view.addInteraction(buttons)
        }
        NotificationCenter.default.addObserver(self, selector: #selector(thermalChanged), name: ProcessInfo.thermalStateDidChangeNotification, object: nil)
        show(0)
    }

    private func hardwareButton() {
        if phase == .ready, !scaleMode { start() }
        else if phase == .scanning, finishButton.isEnabled { build() }
    }

    @objc private func thermalChanged() {
        DispatchQueue.main.async {
            guard ProcessInfo.processInfo.thermalState.rawValue >= ProcessInfo.ThermalState.serious.rawValue, self.phase == .ready || self.phase == .scanning else { return }
            self.detail.text = "The phone is warm, so the scan may slow down. Let it cool for a minute between patients."
        }
    }

    /// Exposure and white balance held once metered on the face, so every photo of the skin matches.
    private func holdExposure(_ hold: Bool) {
        guard sensor == .front, #available(iOS 16.0, *), let device = ARFaceTrackingConfiguration.configurableCaptureDeviceForPrimaryCamera,
              (try? device.lockForConfiguration()) != nil else { return }
        if hold {
            if device.isExposureModeSupported(.locked) { device.exposureMode = .locked }
            if device.isWhiteBalanceModeSupported(.locked) { device.whiteBalanceMode = .locked }
        } else {
            if device.isExposureModeSupported(.continuousAutoExposure) { device.exposureMode = .continuousAutoExposure }
            if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) { device.whiteBalanceMode = .continuousAutoWhiteBalance }
        }
        device.unlockForConfiguration()
    }

    private static func tone(_ id: SystemSoundID) { AudioServicesPlaySystemSound(id) }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        runSession()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
    }

    private func runSession() {
        meter.mirrored = sensor == .front
        tickRing.mirrored = sensor == .front
        if sensor == .front {
            let c = ARFaceTrackingConfiguration()
            c.isLightEstimationEnabled = false
            c.maximumNumberOfTrackedFaces = 1
            c.worldAlignment = .gravity
            // 30 fps keeps the phone cooler (the depth rate halves when it gets hot), at the sharpest size offered.
            if let format = ARFaceTrackingConfiguration.supportedVideoFormats.filter({ $0.framesPerSecond <= 30 })
                .max(by: { $0.imageResolution.width * $0.imageResolution.height < $1.imageResolution.width * $1.imageResolution.height }) { c.videoFormat = format }
            sceneView.session.run(c, options: [.resetTracking, .removeExistingAnchors])
            sensorLabel.text = "Face ID sensor · screen towards the patient"
            noseTip = nil
            return
        }
        let c = ARWorldTrackingConfiguration()
        c.worldAlignment = .gravity
        c.isLightEstimationEnabled = false
        c.frameSemantics = ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) ? [.smoothedSceneDepth] : [.sceneDepth]
        if #available(iOS 16.0, *), useHighResFormat, let format = ARWorldTrackingConfiguration.recommendedVideoFormatForHighResolutionFrameCapturing { c.videoFormat = format }
        framesWithoutDepth = 0
        sceneView.session.run(c, options: [.resetTracking, .removeExistingAnchors])
        sensorLabel.text = "LiDAR scanner · rear camera"
        noseTip = nil
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaLayoutGuide.layoutFrame
        sceneView.frame = view.bounds
        CATransaction.begin(); CATransaction.setDisableActions(true)
        topFade.frame = CGRect(x: 0, y: 0, width: view.bounds.width, height: safe.minY + 130)
        bottomFade.frame = CGRect(x: 0, y: safe.maxY - 330, width: view.bounds.width, height: view.bounds.height - safe.maxY + 330)
        CATransaction.commit()
        closeButton.frame = CGRect(x: safe.minX + 16, y: safe.minY + 8, width: 44, height: 44)
        titleLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 8, width: safe.width - 190, height: 24)
        titleLabel.center.x = safe.midX
        stepLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 32, width: safe.width - 140, height: 16)
        let dotsWidth = min(CGFloat(captures.count) * 22, safe.width - 140)
        dots.frame = CGRect(x: safe.midX - dotsWidth / 2, y: safe.minY + 54, width: dotsWidth, height: 3)
        sensorLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 62, width: safe.width - 140, height: 15)
        sensorPicker.frame = CGRect(x: safe.midX - 150, y: safe.minY + 84, width: 300, height: 32)
        scaleButton.frame = CGRect(x: safe.maxX - 128, y: safe.minY + 12, width: 112, height: 36)
        startButton.frame = CGRect(x: safe.midX - 110, y: safe.maxY - 74, width: 220, height: 54)
        finishButton.frame = CGRect(x: safe.maxX - 124, y: safe.maxY - 69, width: 104, height: 44)
        skipButton.frame = CGRect(x: safe.minX + 20, y: safe.maxY - 69, width: phase == .refining ? 190 : 70, height: 44)
        spinner.center = CGPoint(x: safe.midX, y: safe.maxY - 47)
        let barWidth = min(safe.width - 32, 520)
        bar.frame = CGRect(x: safe.midX - barWidth / 2, y: safe.maxY - 196, width: barWidth, height: 112)
        prompt.frame = CGRect(x: 16, y: 14, width: barWidth - 32, height: 28)
        detail.frame = CGRect(x: 16, y: 40, width: barWidth - 32, height: 34)
        // The outline in a 3:4 frame above the prompts, with the ring round it.
        let room = bar.frame.minY - 46 - (safe.minY + 104)
        let gw = min(safe.width * 0.72, room * 0.75 - 30), gh = gw * 4 / 3
        let guideFrame = CGRect(x: safe.midX - gw / 2, y: safe.minY + 104 + (room - gh) / 2, width: gw, height: gh)
        guideView.frame = guideFrame
        meter.frame = guideFrame.insetBy(dx: -22, dy: -18)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let hole = UIBezierPath(rect: view.bounds)
        hole.append(UIBezierPath(ovalIn: meter.frame.insetBy(dx: 10, dy: 10)))
        shade.path = hole.cgPath
        let clip = CAShapeLayer(); clip.path = UIBezierPath(ovalIn: meter.frame.insetBy(dx: 12, dy: 12)).cgPath
        let clip2 = CAShapeLayer(); clip2.path = clip.path
        wellSeen.mask = clip; partlySeen.mask = clip2
        CATransaction.commit()
        progressTrack.frame = CGRect(x: 22, y: 82, width: barWidth - 44 - 64, height: 5)
        mapped.frame = CGRect(x: barWidth - 22 - 56, y: 72, width: 56, height: 24)
        progressFill.frame = CGRect(x: 0, y: 0, width: progressTrack.bounds.width * CGFloat(min(1, coverage.fraction / Self.mappedTarget)), height: 5)
        layoutForSensor(safe)
        view.keepClearOfCamera([closeButton, startButton, finishButton, skipButton, scaleButton])
    }

    /// Front: an ivory page with the camera in a face-shaped window and the instruction at the top. Rear (Labs):
    /// the full camera picture with the prompts in a panel at the foot.
    private func layoutForSensor(_ safe: CGRect) {
        let front = sensor == .front
        view.backgroundColor = front ? Self.ivory : .black
        [topFade, bottomFade, shade].forEach { $0.isHidden = front }
        guideView.isHidden = front
        meter.isHidden = front
        bar.isHidden = front
        tickRing.isHidden = !front
        frosted.isHidden = !front
        titleLabel.isHidden = front; stepLabel.isHidden = front
        if front { sensorLabel.isHidden = true }
        let moveTo: UIView = front ? view : bar.contentView
        for v in [prompt, detail, mapped] where v.superview !== moveTo { moveTo.addSubview(v) }
        // On the dark frosting the words are white, as on the camera picture.
        prompt.textColor = .white
        detail.textColor = UIColor(white: 1, alpha: 0.72)
        mapped.textColor = front ? UIColor(white: 1, alpha: 0.7) : .white
        for b in [closeButton, finishButton, scaleButton] {
            b.tintColor = .white
            b.backgroundColor = front ? UIColor(white: 1, alpha: 0.14) : UIColor(white: 0.1, alpha: 0.45)
        }
        spinner.color = .white
        guard front else {
            sceneView.layer.mask = nil
            wellSeen.mask = nil; partlySeen.mask = nil
            prompt.font = .systemFont(ofSize: 20, weight: .semibold)
            detail.font = .systemFont(ofSize: 14)
            countLabel.layer.shadowOpacity = 0.7
            return
        }
        // The window: a face shape, a little narrower at the chin.
        let w = min(safe.width * 0.68, 330), h = w * 1.3
        let window = CGRect(x: safe.midX - w / 2, y: safe.minY + 172, width: w, height: h)
        let egg = TickRingView.egg(in: window)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        // The camera fills the screen; frosting covers all but the face window.
        sceneView.layer.mask = nil
        frosted.frame = view.bounds
        frosted.mask?.frame = view.bounds
        frostedHole.frame = view.bounds
        let cutout = UIBezierPath(rect: view.bounds); cutout.append(egg)
        frostedHole.path = cutout.cgPath
        let clip = CAShapeLayer(); clip.path = egg.cgPath
        let clip2 = CAShapeLayer(); clip2.path = egg.cgPath
        wellSeen.mask = clip; partlySeen.mask = clip2
        CATransaction.commit()
        tickRing.frame = view.bounds
        tickRing.faceWindow = window
        prompt.font = .systemFont(ofSize: 22, weight: .semibold)
        prompt.frame = CGRect(x: safe.minX + 24, y: safe.minY + 58, width: safe.width - 48, height: 30)
        detail.font = .systemFont(ofSize: 14)
        detail.frame = CGRect(x: safe.minX + 32, y: safe.minY + 92, width: safe.width - 64, height: 36)
        countLabel.font = .systemFont(ofSize: 44, weight: .semibold)
        countLabel.layer.shadowOpacity = 0
        // The count-in and the tick sit where the grey line is (it's blank then), clear of the ring.
        countLabel.frame = CGRect(x: safe.midX - 70, y: safe.minY + 86, width: 140, height: 50)
        mapped.textAlignment = .center
        mapped.frame = CGRect(x: safe.midX - 80, y: window.maxY + 34, width: 160, height: 20)
        progressTrack.isHidden = true
    }

    // MARK: Steps

    private var capture: FaceCaptureSpec { captures[index] }

    private func resetCapture() {
        capturePolicy.reset()
        fusing = false
        gravityUp = nil
        milestone = 0
        steadySince = nil
        cancelCountdown()
        frontViews = []
        finishAfterPhoto = false
        faceOffset = nil
        expressionIssue = nil
        shots?.remove()
        shots = nil
        shotDirections = []
        lastShotAt = 0
        volume = nil
        tracker = nil
        trackingIssue = nil
        lastView = nil
        reach = (0, 0, 0, 0)
        coverage = FaceCoverage(turn: Float(capture.turn), tilt: Float(capture.tilt))
        lastCoverageGain = CACurrentMediaTime()
        lit = []
        livePoints = []
        wellSeen.path = nil; partlySeen.path = nil
        headToWorld = nil
        lidarEyes = nil
    }

    private func show(_ i: Int) {
        index = i
        phase = .ready
        resetCapture()
        stepLabel.text = captures.count == 1 ? capture.title : "\(capture.title) · \(i + 1) of \(captures.count)"
        dots.isHidden = captures.count == 1
        for (n, d) in dots.arrangedSubviews.enumerated() { d.backgroundColor = n < i ? Self.gold : n == i ? .white : UIColor(white: 1, alpha: 0.25) }
        meter.lit = []; meter.current = nil; meter.heading = nil
        tickRing.lit = []; tickRing.current = nil; tickRing.done = false
        guideView.tintColor = UIColor(white: 1, alpha: 0.45)
        if sensor == .front { prompt.text = "Point the screen at the patient"; detail.text = Self.scaleUnchecked ? "Check the scale once on this iPad first (top right)." : "Level with their eyes, 25–35 cm away" }
        else { prompt.text = capture.hint; detail.text = readyDetail }
        holdExposure(false)
        readySince = CACurrentMediaTime()
        movedSinceReady = false
        updateControls()
    }

    private var readyDetail: String {
        if sensor == .front, Self.scaleUnchecked { return "Check the scale once on this iPad before scanning: tap Check scale, then hold a bank card flat towards the screen." }
        return sensor == .front
            ? "Hold the phone level with the patient’s eyes, 25–35 cm away, screen towards them, in even light. Ask for a wide smile showing the teeth: it starts once they’re smiling and still, or press a volume button."
            : "The patient keeps their head and expression still. Move the phone slowly round them, 30–50 cm away, in even light. Sharp overlapping photos build the detailed face."
    }

    /// Before the scan: one short instruction for the patient (big) with a line under it, changed without a tap.
    private func setReady(_ title: String, _ line: String) {
        let lineText = sensor == .front && Self.scaleUnchecked && !scaleMode ? "Check the scale once on this iPad first (top right)." : line
        if prompt.text != title { UIView.transition(with: prompt, duration: 0.18, options: .transitionCrossDissolve) { self.prompt.text = title } }
        if detail.text != lineText { detail.text = lineText }
    }

    private func showCount(_ text: String?) {
        if let text {
            countLabel.text = text
            countLabel.alpha = 1
            countLabel.transform = CGAffineTransform(scaleX: 1.25, y: 1.25)
            UIView.animate(withDuration: 0.3, delay: 0, usingSpringWithDamping: 0.6, initialSpringVelocity: 0) { self.countLabel.transform = .identity }
        } else if countLabel.alpha > 0 {
            UIView.animate(withDuration: 0.2) { self.countLabel.alpha = 0 }
        }
    }

    // MARK: Automatic start

    /// The face centred, square to the screen, at a good distance and still for a second: count in, then start.
    /// Works held in the hand (a stand is optional): steadiness is the face against the camera, so a hand's small
    /// movements count like the head's, and eye level comes from gravity.
    private func considerAutoStart(_ face: ARFaceAnchor, frame: ARFrame, cameraToAnchor: simd_float4x4, distance d: Float) {
        guard sensor == .front, !switchingSensor, !scaleMode, ProcessInfo.processInfo.thermalState != .critical else { return }
        let toCamera = simd_normalize(SIMD3(cameraToAnchor.columns.3.x, cameraToAnchor.columns.3.y, cameraToAnchor.columns.3.z))
        let frontal = toCamera.z > cosf(14 * .pi / 180)
        var still = false
        if let last = lastAnchor {
            let moved = simd_distance(SIMD3(last.columns.3.x, last.columns.3.y, last.columns.3.z), SIMD3(cameraToAnchor.columns.3.x, cameraToAnchor.columns.3.y, cameraToAnchor.columns.3.z))
            let turned = acosf(max(-1, min(1, simd_dot(SIMD3(last.columns.2.x, last.columns.2.y, last.columns.2.z), SIMD3(cameraToAnchor.columns.2.x, cameraToAnchor.columns.2.y, cameraToAnchor.columns.2.z))))) * 180 / .pi
            still = moved < 0.006 && turned < 2
        }
        lastAnchor = cameraToAnchor
        // Natural head position needs the phone at the patient's eye level: a phone held low makes them look down.
        let faceInCamera = frame.camera.transform.inverse * face.transform
        let look = simd_normalize(SIMD3(faceInCamera.columns.3.x, faceInCamera.columns.3.y, faceInCamera.columns.3.z))
        let cam = frame.camera.transform
        let lookWorld = SIMD3(cam.columns.0.x, cam.columns.0.y, cam.columns.0.z) * look.x + SIMD3(cam.columns.1.x, cam.columns.1.y, cam.columns.1.z) * look.y + SIMD3(cam.columns.2.x, cam.columns.2.y, cam.columns.2.z) * look.z
        let elevation = asinf(max(-1, min(1, lookWorld.y))) * 180 / .pi
        let level = abs(elevation) < 12
        if !still { movedSinceReady = true }
        let now = CACurrentMediaTime()
        // A moment to settle after each pose; for Teeth showing, the retractors go in first (the patient moves, then
        // settles), so it waits for that.
        let paced = now - readySince > (capture.id == "retracted" ? 4 : 1.5) && (capture.id != "retracted" || movedSinceReady)
        let smiling = expressionCheck(face) == nil
        let ready = paced && frontal && still && level && d > 0.2 && d < 0.5 && smiling
        // One instruction at a time, most important first.
        if countdownTimer == nil {
            if d >= 0.45 { setReady("Come a little closer", "25–35 cm from the face") }
            else if d <= 0.2 { setReady("Move back a little", "25–35 cm from the face") }
            else if !level { setReady(elevation > 0 ? "Raise the phone" : "Lower the phone", "Level with the patient’s eyes") }
            else if !frontal { setReady("Look at the screen", "Face the phone straight on") }
            else if !smiling { setReady("Give us a wide smile", "Show your teeth and look at the screen") }
            else { setReady("Hold still", "Keep smiling at the screen") }
        }
        if ready {
            if steadySince == nil { steadySince = now }
            if countdownTimer == nil, now - (steadySince ?? now) > 0.8 { beginCountdown() }
        } else if !frontal || !level || d <= 0.2 || d >= 0.5 {
            steadySince = nil
            if countdownTimer != nil { cancelCountdown() }
        }
    }

    private func beginCountdown() {
        countdown = 3
        tick()
        countdownTimer = Timer.scheduledTimer(withTimeInterval: 0.75, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.countdown -= 1
            if self.countdown > 0 { self.tick() } else { self.cancelCountdown(); if self.phase == .ready { self.start() } }
        }
    }
    private func tick() {
        Self.tone(1103)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        setReady("Hold still", sensor == .front ? " " : "Keep smiling at the screen")
        showCount("\(countdown)")
    }
    private func cancelCountdown() { countdownTimer?.invalidate(); countdownTimer = nil; showCount(nil) }


    private func updateControls() {
        sensorPicker.isHidden = !(phase == .ready && Self.frontAvailable && rearAvailable) || scaleMode
        sensorLabel.isHidden = phase != .ready
        // Only on iPad (where the Face ID sensor's known calibration faults are), so iPhone patients see one less button.
        scaleButton.isHidden = !(phase == .ready && sensor == .front && UIDevice.current.userInterfaceIdiom == .pad)
        scaleButton.setTitle(scaleMode ? "Cancel" : "Check scale", for: .normal)
        startButton.isHidden = phase != .ready
        startButton.isEnabled = !switchingSensor
        sensorPicker.isEnabled = !switchingSensor
        finishButton.isHidden = phase != .scanning
        skipButton.isHidden = phase == .building || phase == .locking || captures.count == 1
        skipButton.setTitle(phase == .refining ? "Use quick versions" : "Skip", for: .normal)
        skipButton.frame.size.width = phase == .refining ? 190 : 70
        if phase == .refining {
            spinner.stopAnimating()
            mapped.isHidden = false; progressTrack.isHidden = false
            mapped.text = "\(Int((refineProgress * 100).rounded()))%"
            mapped.textColor = .white
            UIView.animate(withDuration: 0.25) { self.progressFill.frame.size.width = self.progressTrack.bounds.width * CGFloat(self.refineProgress) }
            return
        }
        if phase == .building || phase == .locking { spinner.startAnimating() } else { spinner.stopAnimating() }
        finishButton.isEnabled = reach.right >= 20 && reach.left >= 20
        finishButton.alpha = finishButton.isEnabled ? 1 : 0.5
        let shown = min(100, Int((coverage.fraction / Self.mappedTarget * 100).rounded()))
        mapped.text = "\(shown)%"
        mapped.textColor = shown >= 100 ? Self.gold : .white
        mapped.textAlignment = .right
        mapped.accessibilityLabel = "Face mapped \(shown) percent"
        mapped.isHidden = phase == .ready
        progressTrack.isHidden = phase == .ready
        UIView.animate(withDuration: 0.25) { self.progressFill.frame.size.width = self.progressTrack.bounds.width * CGFloat(min(1, self.coverage.fraction / Self.mappedTarget)) }
    }

    @objc private func sensorChanged() {
        guard phase == .ready, !switchingSensor else { return }
        switchingSensor = true
        cancelCountdown()
        capturePolicy.reset()
        updateControls()
        sensor = sensorPicker.selectedSegmentIndex == 0 ? .front : .rear
        UserDefaults.standard.set(sensor.rawValue, forKey: "faceScanSensor")
        UIView.animate(withDuration: 0.16) { self.sceneView.alpha = 0.2 } completion: { _ in
            guard !self.finished, !self.finishing else { return }
            self.switchingSensor = false
            self.runSession()
            self.show(self.index)
            self.view.setNeedsLayout()
            UIView.animate(withDuration: 0.3, delay: 0.25) { self.sceneView.alpha = 1 }
        }
    }

    @objc private func start() {
        guard !switchingSensor, phase == .ready else { return }
        cancelCountdown()
        if scaleMode { return }
        if sensor == .front { startFront(); return }
        resetCapture()
        volume = FaceVolume()
        tracker = HeadTracker()
        shots = PhotoShots()
        shotDirections = []
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        // Fix the head's frame from where the face is now.
        guard let frame = sceneView.session.currentFrame, let nose = noseTip else {
            say("Point the phone at the patient’s face", force: true)
            volume = nil
            return
        }
        phase = .locking
        updateControls()
        detail.text = "Finding the face…"
        let orientation = Self.imageOrientation(view.window?.windowScene?.interfaceOrientation ?? .portrait)
        let run = capturePolicy.runID
        fuseQueue.async {
            let eyes = Self.pupils(frame, orientation: orientation)
            let head = Self.headFrame(nose: nose, camera: frame.camera.transform, eyes: eyes)
            let mapping = Self.maskMapping(frame, nose: nose, orientation: orientation)
            DispatchQueue.main.async {
                guard !self.finished, self.capturePolicy.isCurrent(run), self.phase == .locking else { return }
                self.headToWorld = head
                self.gravityUp = SIMD3(0, 1, 0)   // the rear head frame is built on gravity
                self.visionOrientation = orientation
                self.maskMapping = mapping
                if let eyes {
                    let inv = head.inverse
                    let a = inv * SIMD4<Float>(eyes.0, 1), b = inv * SIMD4<Float>(eyes.1, 1)
                    let pa = SIMD3(a.x, a.y, a.z), pb = SIMD3(b.x, b.y, b.z)
                    self.lidarEyes = pa.x > pb.x ? (pa, pb) : (pb, pa)
                }
                self.phase = .scanning
                self.guideView.tintColor = UIColor(white: 1, alpha: 0.22)
                self.updateControls()
            }
        }
    }

    @objc private func finishTapped() { build() }
    @objc private func skip() {
        if phase == .refining { refiner?.cancel(); finish() } else { advance() }
    }
    @objc private func close() { refiner?.cancel(); finish() }

    private func advance() {
        if index + 1 < captures.count { show(index + 1) } else { offerDetailedBuild() }
    }

    /// Rear scans whose detailed build didn't happen keep only the LiDAR shape, which has little facial detail: say
    /// so plainly before saving, rather than leaving a soft face to be found later.
    /// Rear scans: building the detailed face (Object Capture) warms the phone, so it only happens if chosen.
    private func offerDetailedBuild() {
        let candidates = results.indices.filter { results[$0].canBuildDetailed }
        guard !candidates.isEmpty else { finishReportingLidarOnly(); return }
        let alert = UIAlertController(title: "Build the detailed faces?",
                                      message: "The rear scans have their quick LiDAR shape now. Building the detailed faces from the photos takes about two minutes each and warms the phone; it carries on while you use the app.",
                                      preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Build them", style: .default) { _ in
            for i in candidates { self.results[i].wantsDetailed = true }
            self.finishReportingLidarOnly()
        })
        alert.addAction(UIAlertAction(title: "Not now", style: .cancel) { _ in self.finishReportingLidarOnly() })
        present(alert, animated: true)
    }

    private func finishReportingLidarOnly() {
        let soft = results.filter { $0.sensor == "lidar" && $0.textured == nil && !$0.canBuildDetailed }.map(\.title)
        guard !soft.isEmpty, !finished else { finish(); return }
        let names = ListFormatter.localizedString(byJoining: soft)
        let alert = UIAlertController(title: "Low-detail scan",
                                      message: "Too few sharp photos were taken for \(names) to build the detailed face, so \(soft.count == 1 ? "it has" : "they have") the LiDAR shape only, without facial detail. For a detailed face, scan with the Face ID sensor, or scan again from the rear in good light, moving slowly round the still patient.",
                                      preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Keep", style: .default) { _ in self.finish() })
        present(alert, animated: true)
    }

    private func finish() {
        guard !finished, !finishing else { return }
        capturePolicy.reset()
        finishAfterPhoto = false
        cancelCountdown()
        sceneView.session.pause()
        holdExposure(false)
        shots?.remove(); shots = nil
        guard !results.isEmpty else {
            finished = true
            dismiss(animated: true) { self.completion([]) }
            return
        }
        // Clean, skin, scale and the shared frame for every expression together.
        finishing = true
        phase = .building
        updateControls()
        showCount(nil)
        prompt.text = "Finishing the scan"
        detail.text = "A few seconds…"
        let scans = results, scale = Self.deviceScale
        DispatchQueue.global(qos: .userInitiated).async {
            let done = FaceFinish.finishAll(scans, scale: scale)
            DispatchQueue.main.async {
                self.finished = true
                done.forEach { if !$0.buildLater { $0.shots?.remove() } }
                self.dismiss(animated: true) { self.completion(done) }
            }
        }
    }

    // MARK: Scale check

    static var deviceModel: String {
        var info = utsname(); uname(&info)
        return Mirror(reflecting: info.machine).children.reduce("") { id, el in
            guard let v = el.value as? Int8, v != 0 else { return id }
            return id + String(UnicodeScalar(UInt8(v)))
        }
    }
    private static var scaleKey: String { "faceScanScale.\(deviceModel)" }
    /// The correction this device's scale check found (1 when checked and correct, or not checked).
    static var deviceScale: Float { (UserDefaults.standard.object(forKey: scaleKey) as? Double).map(Float.init) ?? 1 }
    /// iPads whose Face ID sensor is known to report the wrong size until checked (factory calibration off by
    /// 5–7%: 2018/2020 and M1 iPad Pro).
    static var scaleUnchecked: Bool {
        guard UserDefaults.standard.object(forKey: scaleKey) == nil else { return false }
        let m = deviceModel
        let parts = m.split(separator: ",")
        guard parts.count == 2, let minor = Int(parts[1]) else { return false }
        return (parts[0] == "iPad13" && (4...11).contains(minor)) || (parts[0] == "iPad8" && (1...12).contains(minor))
    }

    @objc private func scaleTapped() {
        guard phase == .ready, sensor == .front else { return }
        cancelCountdown()
        scaleMode.toggle()
        scaleSamples = []
        if scaleMode {
            prompt.text = "Hold a bank card flat towards the screen"
            detail.text = "25–35 cm away, the whole card in view and square to the phone. Keep it still for a few seconds."
        } else {
            setReady("Point the screen at the patient", "Level with their eyes, 25–35 cm away")
        }
        updateControls()
    }

    private func scaleFrame(_ frame: ARFrame) {
        guard !measuring else { return }
        measuring = true
        DispatchQueue.global(qos: .userInitiated).async {
            let factor = Self.measureCard(frame)
            DispatchQueue.main.async {
                self.measuring = false
                guard self.scaleMode else { return }
                if let factor {
                    self.scaleSamples.append(factor)
                    self.detail.text = "Measuring the card… \(min(100, self.scaleSamples.count * 4))%"
                }
                if self.scaleSamples.count >= 25 { self.finishScaleCheck() }
            }
        }
    }

    private func finishScaleCheck() {
        let sorted = scaleSamples.sorted()
        let median = sorted[sorted.count / 2]
        let spread = sorted[sorted.count * 3 / 4] - sorted[sorted.count / 4]
        scaleMode = false
        scaleSamples = []
        updateControls()
        prompt.text = "Point the screen at the patient"
        let error = (1 / median - 1) * 100
        let title: String, message: String
        if spread > 0.03 {
            title = "Couldn’t measure the card steadily"; message = "Try again with the card flat, square to the screen and still, in even light."
        } else if abs(error) < 1.5 {
            UserDefaults.standard.set(1.0, forKey: Self.scaleKey)
            title = "Scale is correct"; message = String(format: "The card measured within %.1f%% of its true size, so scans from this device need no correction.", abs(error))
        } else if abs(error) < 12 {
            UserDefaults.standard.set(Double(median), forKey: Self.scaleKey)
            title = "Scale corrected"; message = String(format: "This device’s Face ID sensor reads %.1f%% %@. Scans from it are corrected from now on, and the lab notes say so.", abs(error), error > 0 ? "large" : "small")
        } else {
            title = "The measurement looks wrong"; message = String(format: "The card read %.0f%% off its true size, which is more than a sensor error. Check it’s a standard bank card and try again.", abs(error))
        }
        detail.text = readyDetail
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    /// One frame's scale factor (true size ÷ measured size) from a bank card: Vision finds the card's corners, the
    /// depth inside it gives its plane, and the corners' sight lines meet that plane. Nil if the card isn't clear.
    static func measureCard(_ frame: ARFrame) -> Float? {
        guard let depthData = frame.capturedDepthData else { return nil }
        let request = VNDetectRectanglesRequest()
        request.minimumAspectRatio = 0.5; request.maximumAspectRatio = 0.8
        request.minimumSize = 0.12; request.minimumConfidence = 0.6; request.quadratureTolerance = 15; request.maximumObservations = 1
        guard (try? VNImageRequestHandler(cvPixelBuffer: frame.capturedImage, orientation: .up).perform([request])) != nil,
              let card = request.results?.first else { return nil }
        let size = frame.camera.imageResolution, W = Float(size.width), H = Float(size.height)
        let corner = { (p: CGPoint) in SIMD2<Float>(Float(p.x) * W, (1 - Float(p.y)) * H) }
        let quad = [corner(card.topLeft), corner(card.topRight), corner(card.bottomRight), corner(card.bottomLeft)]
        let converted = depthData.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
        let map = converted.depthDataMap
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return nil }
        let dw = CVPixelBufferGetWidth(map), dh = CVPixelBufferGetHeight(map), row = CVPixelBufferGetBytesPerRow(map) / 4
        let d = base.assumingMemoryBound(to: Float32.self)
        let dK = depthIntrinsics(converted, camera: frame.camera, width: Float(dw), height: Float(dh)), iK = frame.camera.intrinsics
        let fx = dK[0][0], fy = dK[1][1], cx = dK[2][0], cy = dK[2][1]
        let ifx = iK[0][0], ify = iK[1][1], icx = iK[2][0], icy = iK[2][1]
        let sx = ifx / fx, sy = ify / fy, ox = icx - cx * sx, oy = icy - cy * sy
        // Points inside the card (away from its edges), in the camera's frame.
        var pts: [SIMD3<Float>] = []
        for a in stride(from: Float(0.2), through: 0.8, by: 0.1) { for b in stride(from: Float(0.2), through: 0.8, by: 0.1) {
            let top = quad[0] + (quad[1] - quad[0]) * a, bottom = quad[3] + (quad[2] - quad[3]) * a
            let p = top + (bottom - top) * b
            let uu = Int((p.x - ox) / sx), vv = Int((p.y - oy) / sy)
            guard uu > 1, vv > 1, uu < dw - 2, vv < dh - 2 else { continue }
            var zs: [Float] = []
            for j in -1...1 { for i in -1...1 { let z = d[(vv + j) * row + uu + i]; if z > 0.12, z < 0.8 { zs.append(z) } } }
            guard zs.count >= 5 else { continue }
            let z = zs.sorted()[zs.count / 2]
            pts.append(SIMD3((Float(uu) - cx) / fx * z, -(Float(vv) - cy) / fy * z, -z))
        } }
        guard pts.count >= 25 else { return nil }
        // The card's plane: Z = aX + bY + c.
        var A = [[Double]](repeating: [0, 0, 0], count: 3), r = [0.0, 0, 0]
        for p in pts {
            let v = [Double(p.x), Double(p.y), 1]
            for i in 0..<3 { r[i] += v[i] * Double(p.z); for j in 0..<3 { A[i][j] += v[i] * v[j] } }
        }
        guard let plane = FaceAlign.solve(A, r) else { return nil }
        let pa = Float(plane[0]), pb = Float(plane[1]), pc = Float(plane[2])
        let corners: [SIMD3<Float>] = quad.compactMap { q in
            let xn = (q.x - icx) / ifx, yn = (q.y - icy) / ify
            let denom = -1 - pa * xn + pb * yn
            guard abs(denom) > 1e-4 else { return nil }
            let t = pc / denom
            return SIMD3(xn, -yn, -1) * t
        }
        guard corners.count == 4 else { return nil }
        let e1 = (simd_distance(corners[0], corners[1]) + simd_distance(corners[3], corners[2])) / 2
        let e2 = (simd_distance(corners[0], corners[3]) + simd_distance(corners[1], corners[2])) / 2
        let long = max(e1, e2) * 1000, short = min(e1, e2) * 1000
        guard short > 20, abs(long / short - 85.60 / 53.98) < 0.06 else { return nil }
        return (85.60 / long + 53.98 / short) / 2
    }

    /// The finished capture becomes a mesh and its preview, then the next.
    private func build() {
        guard phase == .scanning, let volume else { return }
        // The final accepted view may still be encoding. Do not lose it or let an old
        // callback append to the next expression; finish this capture only after it drains.
        if capturePolicy.pendingPhoto != nil {
            finishAfterPhoto = true
            detail.text = "Saving the last sharp photograph…"
            return
        }
        finishAfterPhoto = false
        phase = .building
        updateControls()
        say("Done – you can relax", force: true)
        showCount("✓")
        tickRing.done = true
        Self.tone(1114)
        detail.text = sensor == .front ? " " : "Building the 3D face…"
        let capture = self.capture, reach = self.reach, coverage = self.coverage.fraction
        let eyes = lidarEyes.map { (left: $0.left * 1000, right: $0.right * 1000) }
        let tracker = self.tracker
        let run = capturePolicy.runID, captureSensor = sensor
        let shots = self.shots
        self.shots = nil
        let views = sensor == .front ? frontViews : []
        frontViews = []
        let gravity = gravityUp
        holdExposure(false)
        let waitForFusion = fuseQueue
        waitForFusion.async {
            // Every stored frame lined up again against the whole face, then the face built afresh. Cleaning, skin and
            // the shared frame wait until every expression is in (FaceFinish.finishAll).
            let mesh = tracker?.rebuild(from: volume)?.mesh() ?? volume.mesh()
            let quality: (rms: Float, kept: Float) = tracker?.quality ?? (0, 1)
            DispatchQueue.main.async {
                guard !self.finished, !self.finishing, self.capturePolicy.isCurrent(run), self.phase == .building else {
                    shots?.remove()
                    return
                }
                self.volume = nil
                self.tracker = nil
                guard let mesh else {
                    shots?.remove()
                    self.phase = .ready
                    self.updateControls()
                    self.prompt.text = "That scan didn’t work"
                    self.detail.text = "Try again, moving a little more slowly."
                    return
                }
                var result = FaceScanResult(id: capture.id, title: capture.title, mesh: mesh, preview: nil, eyes: eyes,
                                            turned: (reach.right, reach.left), tilted: (reach.up, reach.down), coverage: coverage)
                result.tracking = quality
                result.views = views
                result.gravityUp = gravity
                result.shots = shots
                result.sensor = captureSensor == .front ? "trueDepth" : "lidar"
                guard result.trackingPoor else {
                    self.results.append(result)
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    self.advance()
                    return
                }
                // The patient moved a lot: offer to scan again rather than keep a face that may be out of shape.
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
                let alert = UIAlertController(title: "The patient moved during this scan",
                                              message: "Only \(Int((quality.kept * 100).rounded()))% of it lined up well, so the face may be slightly out of shape.", preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "Scan again", style: .default) { _ in result.shots?.remove(); self.show(self.index) })
                alert.addAction(UIAlertAction(title: "Keep it", style: .cancel) { _ in self.results.append(result); self.advance() })
                self.present(alert, animated: true)
            }
        }
    }

    /// Shows the prompt; a light tap when it changes, so a new instruction is felt without looking at the screen.
    private func say(_ text: String, force: Bool = false) {
        guard prompt.text != text || force else { return }
        UIView.transition(with: prompt, duration: 0.18, options: .transitionCrossDissolve) { self.prompt.text = text }
        let now = CACurrentMediaTime()
        if now - lastPromptTap > 1.2 { lastPromptTap = now; UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    }

    // MARK: Tracking

    func session(_ session: ARSession, didFailWithError error: Error) {
        DispatchQueue.main.async {
            if self.sensor == .rear, self.useHighResFormat, (error as? ARError)?.code != .cameraUnauthorized {
                self.useHighResFormat = false
                self.runSession()
                if self.phase != .ready { self.show(self.index) }
                return
            }
            self.prompt.text = "The camera stopped"
            self.detail.text = (error as? ARError)?.code == .cameraUnauthorized ? "Camera access is turned off. Turn it on in Settings › SmileCompose." : "Close the scan and try again."
        }
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard !finished, !finishAfterPhoto, phase != .building, phase != .locking, phase != .refining else { return }
        if sensor == .front { frontFrame(frame); return }
        if frame.sceneDepth == nil && frame.smoothedSceneDepth == nil {
            framesWithoutDepth += 1
            // The high-resolution format didn't bring depth on this phone: back to the standard one.
            if framesWithoutDepth > 45, useHighResFormat { useHighResFormat = false; runSession(); if phase != .ready { show(index) } }
            return
        }
        framesWithoutDepth = 0
        lidarFrame(frame)
    }

    private func lidarFrame(_ frame: ARFrame) {
        guard let depth = frame.smoothedSceneDepth ?? frame.sceneDepth else { return }
        latestDepth = depth.depthMap
        if case .normal = frame.camera.trackingState {} else {
            if phase == .scanning { say("Move the phone more slowly") } else { detail.text = "Move the phone gently so it can find its place." }
            return
        }
        let depthK = Self.scaled(frame.camera.intrinsics, from: frame.camera.imageResolution, to: CGSize(width: CVPixelBufferGetWidth(depth.depthMap), height: CVPixelBufferGetHeight(depth.depthMap)))
        if phase == .ready {
            noseTip = Self.findNose(depth, depthK: depthK, camera: frame.camera.transform)
            if let nose = noseTip {
                guideView.tintColor = Self.gold.withAlphaComponent(0.8)
                let d = simd_distance(nose, SIMD3(frame.camera.transform.columns.3.x, frame.camera.transform.columns.3.y, frame.camera.transform.columns.3.z))
                detail.text = d > 0.65 ? "Come a little closer: 30–50 cm from the face." : d < 0.25 ? "Move back a little: 30–50 cm from the face." : "Face found. Tap Start scan."
            } else {
                guideView.tintColor = UIColor(white: 1, alpha: 0.45)
                detail.text = readyDetail
            }
            return
        }
        guard phase == .scanning, let headToWorld, let volume, let tracker else { return }
        // Where the phone's tracking alone puts the camera, then corrected to where the patient's head is now.
        let guess = headToWorld.inverse * frame.camera.transform
        let cameraToHead = tracker.correction * guess
        let cam = SIMD3(cameraToHead.columns.3.x, cameraToHead.columns.3.y, cameraToHead.columns.3.z)
        drawPoints(headToWorld * tracker.correction.inverse)
        // Moving too fast blurs the depth and makes the patient harder to follow.
        let now = CACurrentMediaTime()
        var tooFast = false
        if let last = lastView, now - last.at > 0.05 {
            let turn = acosf(max(-1, min(1, simd_dot(simd_normalize(cam), simd_normalize(last.cam))))) * 180 / .pi
            lastTurnRate = turn / Float(now - last.at)
            tooFast = lastTurnRate > 35
            lastView = (cam, now)
        } else if lastView == nil { lastView = (cam, now) }
        guard let view = viewing(cam, slowDown: tooFast) else { return }
        guard !fusing, capturePolicy.acceptDepth(imageTimestamp: frame.timestamp, depthTimestamp: frame.timestamp) else { return }
        var item = FaceVolume.Frame(depth: depth.depthMap, confidence: depth.confidenceMap, image: frame.capturedImage, depthK: depthK,
                                    imageK: frame.camera.intrinsics, cameraToHead: cameraToHead, cameraInHead: cam, stride: 1, nearest: 0.2, farthest: 1.0)
        item.nearest = 0.2
        track(item, guess: guess, tracker: tracker, into: volume, view: view)
    }

    /// What's been captured, drawn on the face as gold contour lines: the points at every 6 mm of depth (front to
    /// back of the head), so the lines follow the shape of the face like a map. Faint dots where it's only just seen.
    private func drawPoints(_ headToWorld: simd_float4x4) {
        overlayTick += 1
        guard overlayTick % 2 == 0, !livePoints.isEmpty else { return }
        let good = UIBezierPath(), part = UIBezierPath()
        for (p, n) in livePoints {
            let band = (p.z * 1000 / 6).truncatingRemainder(dividingBy: 1)
            let contour = abs(band) < 0.26 || abs(band) > 0.94
            if n >= 4 && !contour { continue }
            if n < 4 && Int(p.x * 1000 / 2.5 + p.y * 1000 / 2.5) % 3 != 0 { continue }
            let w = headToWorld * SIMD4<Float>(p, 1)
            let s = sceneView.projectPoint(SCNVector3(w.x, w.y, w.z))
            guard s.z > 0, s.z < 1 else { continue }
            let size: CGFloat = n >= 4 ? 2.4 : 1.8
            (n >= 4 ? good : part).append(UIBezierPath(ovalIn: CGRect(x: CGFloat(s.x) - size / 2, y: CGFloat(s.y) - size / 2, width: size, height: size)))
        }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        wellSeen.path = good.cgPath; partlySeen.path = part.cgPath
        CATransaction.commit()
    }

    private struct Viewing { let azimuth, elevation: Float }

    /// Where the camera is seen from the head; prompts for distance and the next direction. Nil while something
    /// needs putting right (then nothing is added to the scan).
    private func viewing(_ cam: SIMD3<Float>, slowDown: Bool = false) -> Viewing? {
        let azimuth = atan2f(cam.x, cam.z) * 180 / .pi
        let elevation = atan2f(cam.y, (cam.x * cam.x + cam.z * cam.z).squareRoot()) * 180 / .pi
        let distance = simd_length(cam)
        let rx = azimuth / capture.turn, ry = elevation / capture.tilt, r = (rx * rx + ry * ry).squareRoot()
        meter.current = r > 0.15 ? (atan2f(ry, rx) * 180 / .pi, r >= 0.75) : nil
        tickRing.current = meter.current
        var problem: String?
        if distance > 0.75 { problem = "Bring the phone closer" }
        else if distance < 0.22 { problem = "Move the phone back a little" }
        else if abs(azimuth) > capture.turn + 18 { problem = sensor == .front ? "That’s far enough: turn back a little" : "That’s far enough: come back a little" }
        else if elevation > capture.tilt + 15 { problem = sensor == .front ? "Not so far: chin up a little" : "Lower the phone a little" }
        else if elevation < -capture.tilt - 15 { problem = sensor == .front ? "Not so far: chin down a little" : "Raise the phone a little" }
        else if slowDown { problem = sensor == .front ? "Turn a little more slowly" : "Move the phone more slowly" }
        else if sensor == .front, let issue = expressionIssue { problem = issue }
        else if let issue = trackingIssue, CACurrentMediaTime() - issue.at < 1.2 { problem = issue.text }
        guard phase == .scanning else {
            detail.text = problem ?? readyDetail
            return nil
        }
        say(problem ?? nextPrompt(azimuth, elevation))
        detail.text = sensor == .front ? (problem == nil ? "Keep turning slowly until the ring fills" : " ") : problem == nil ? "\(shotDirections.count) sharp photos · keep the expression still; move the phone slowly." : (problem == trackingIssue?.text ? "That part wasn’t added, so the face stays sharp." : " ")
        // A tracking message doesn't stop the scan: the next frames are tried again.
        return problem == nil || problem == trackingIssue?.text ? Viewing(azimuth: azimuth, elevation: elevation) : nil
    }

    /// Lines the frame up with the face so far and adds it, or leaves it out when the patient moved.
    private func track(_ item: FaceVolume.Frame, guess: simd_float4x4, tracker: HeadTracker, into volume: FaceVolume, view: Viewing) {
        fusing = true
        let mapping = maskMapping, upright = visionOrientation
        let run = capturePolicy.runID, front = sensor == .front, turnRate = lastTurnRate
        fuseQueue.async {
            var item = item
            // The patient cut out from the room, so the background never pulls on the face.
            if let mapping, (try? self.liveHandler.perform([self.liveSegmentation], on: item.image, orientation: upright)) != nil,
               let m = self.liveSegmentation.results?.first?.pixelBuffer {
                item.mask = FaceMask(buffer: m, orientation: mapping)
            }
            let outcome = tracker.process(item, guess: guess, volume: volume)
            let corrected = tracker.correction * guess
            let points = outcome == .accepted && volume.frames % 3 == 0 ? volume.seenPoints() : nil
            let acceptedFrame = item
            DispatchQueue.main.async {
                guard self.capturePolicy.isCurrent(run), self.volume === volume else { return }
                self.fusing = false
                if let points { self.livePoints = points }
                guard self.phase == .scanning else { return }
                switch outcome {
                case .accepted:
                    self.trackingIssue = nil
                    let c = SIMD3(corrected.columns.3.x, corrected.columns.3.y, corrected.columns.3.z)
                    // A photograph and its pose come from the same accepted sensor frame.
                    // Neither a later camera frame nor an earlier depth map may stand in for it.
                    if front {
                        self.keepFrontView(image: acceptedFrame.image, intrinsics: acceptedFrame.imageK, cameraToHead: corrected, at: c, turnRate: turnRate, run: run)
                    } else {
                        self.maybeTakeShot(acceptedFrame, cameraToHead: corrected, turnRate: turnRate, run: run)
                    }
                    self.record(Viewing(azimuth: atan2f(c.x, c.z) * 180 / .pi, elevation: atan2f(c.y, (c.x * c.x + c.z * c.z).squareRoot()) * 180 / .pi))
                case .moved: self.trackingIssue = (self.sensor == .front ? "Turn a little more slowly" : "Ask the patient to keep still", CACurrentMediaTime())
                case .expression: self.trackingIssue = (self.sensor == .front ? "Hold the expression" : "Ask the patient to hold the expression", CACurrentMediaTime())
                case .lost: self.trackingIssue = (self.sensor == .front ? "Hold still a moment" : "Point the phone back at the face", CACurrentMediaTime())
                }
                _ = view
            }
        }
    }

    /// The ring has a dash every 6°, round the face: 0° is the patient's left (screen right), 90° above.
    static let ticks = 60
    private var lit = Set<Int>()
    private var ringComplete: Bool { lit.count >= Self.ticks * 9 / 10 }

    /// Where on the ring this view sits, once the phone is well round the face that way (degrees), else nil.
    private func ringAngle(_ azimuth: Float, _ elevation: Float) -> Float? {
        let x = azimuth / capture.turn, y = elevation / capture.tilt
        guard (x * x + y * y).squareRoot() >= 0.75 else { return nil }
        return atan2f(y, x) * 180 / .pi
    }

    /// What this view adds to the ring and to the face mapped.
    private func record(_ v: Viewing) {
        if abs(v.elevation) < 20 { if v.azimuth < 0 { reach.right = max(reach.right, -v.azimuth) } else { reach.left = max(reach.left, v.azimuth) } }
        if abs(v.azimuth) < 20 { if v.elevation > 0 { reach.up = max(reach.up, v.elevation) } else { reach.down = max(reach.down, -v.elevation) } }
        if let angle = ringAngle(v.azimuth, v.elevation) {
            let step = 360 / Float(Self.ticks)
            for k in 0..<Self.ticks {
                var d = abs(Float(k) * step - angle).truncatingRemainder(dividingBy: 360)
                if d > 180 { d = 360 - d }
                if d <= 10 { lit.insert(k) }
            }
        }
        if coverage.add(azimuth: v.azimuth, elevation: v.elevation) { lastCoverageGain = CACurrentMediaTime() }
        // Heard by the clinician holding the phone (the screen faces the patient): a tick at each quarter mapped.
        let quarter = Int(min(1, coverage.fraction / Self.mappedTarget) * 4)
        if quarter > milestone, quarter < 4 { milestone = quarter; Self.tone(1104) }
        meter.lit = lit
        tickRing.lit = lit
        updateControls()
        let settled = coverage.fraction >= Self.settledFraction && CACurrentMediaTime() - lastCoverageGain > Self.settleSeconds
        let photoReady = sensor == .front || !PhotoRefiner.isSupported || shots == nil || shotDirections.count >= PhotoRefiner.minimumShots
        if ringComplete, coverage.fraction >= Self.mappedTarget || settled {
            if photoReady { build() }
            else { detail.text = "\(shotDirections.count) of \(PhotoRefiner.minimumShots) sharp photos · make another slow pass for the detailed face." }
        }
    }

    /// Towards the nearest part of the ring not yet lit, so the phone sweeps round in one circle (starting at the
    /// patient's right); once the ring is done, round again for any of the face still missing.
    private func nextPrompt(_ azimuth: Float, _ elevation: Float) -> String {
        if ringComplete {
            meter.heading = nil
            if sensor == .front { return coverage.fraction < Self.mappedTarget ? "Nearly there: once more round, slowly" : "Look straight at the screen" }
            return coverage.fraction < Self.mappedTarget ? "Nearly there: once more round, slowly" : "Back to the front of the face"
        }
        let here = lit.isEmpty ? 180 : (ringAngle(azimuth, elevation) ?? atan2f(elevation / capture.tilt, azimuth / capture.turn) * 180 / .pi)
        let step = 360 / Float(Self.ticks)
        var best: Float = 180, bestD: Float = 999
        for k in 0..<Self.ticks where !lit.contains(k) {
            var d = abs(Float(k) * step - here).truncatingRemainder(dividingBy: 360)
            if d > 180 { d = 360 - d }
            if d < bestD { bestD = d; best = Float(k) * step }
        }
        var a = best.truncatingRemainder(dividingBy: 360); if a > 180 { a -= 360 }
        meter.heading = lit.isEmpty ? 180 : a
        if sensor == .rear {
            // The patient keeps still and the phone goes round them.
            switch a {
            case -22.5..<22.5: return "Move round to the patient’s left"
            case 22.5..<67.5: return "Up and round to the patient’s left"
            case 67.5..<112.5: return "Raise the phone, looking down at the face"
            case 112.5..<157.5: return "Up and round to the patient’s right"
            case -67.5..<(-22.5): return "Down and round to the patient’s left"
            case -112.5..<(-67.5): return "Lower the phone, looking up under the chin"
            case -157.5..<(-112.5): return "Down and round to the patient’s right"
            default: return "Move round to the patient’s right"
            }
        }
        switch a {
        // The phone stays put and the patient, reading the screen, turns: to show their left side they turn right.
        case -22.5..<22.5: return "Turn slowly to your right"
        case 22.5..<67.5: return "Chin down a little, turning right"
        case 67.5..<112.5: return "Lower your chin slowly"
        case 112.5..<157.5: return "Chin down a little, turning left"
        case -67.5..<(-22.5): return "Chin up a little, turning right"
        case -112.5..<(-67.5): return "Lift your chin slowly"
        case -157.5..<(-112.5): return "Chin up a little, turning left"
        default: return "Turn slowly to your left"
        }
    }

    // MARK: Front (Face ID) sensor

    private var expressionIssue: String?

    private func startFront() {
        guard let frame = sceneView.session.currentFrame,
              let face = frame.anchors.lazy.compactMap({ $0 as? ARFaceAnchor }).first, face.isTracked else {
            say("Point the screen at the patient’s face", force: true)
            return
        }
        guard frame.capturedDepthData != nil, frame.capturedDepthDataTimestamp > 0 else {
            setReady("Waiting for Face ID depth", "Keep the face in view. No depth has been added yet.")
            return
        }
        resetCapture()
        // Short sweeps (the wide smile) over the front of the face, where the lips and teeth are.
        // 1 mm cubes over the front of the face for the short smile sweep (0.8 mm was too slow for live tracking on
        // the phone: build 19 lost the face and stalled); 1.2 mm over the whole head for a long sweep.
        volume = capture.turn <= 40 ? FaceVolume(voxel: 0.001, lo: FaceVolume.frontLo, hi: FaceVolume.frontHi) : FaceVolume(voxel: 0.0012)
        tracker = HeadTracker()
        maskMapping = nil
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        // The head frame: the face anchor's axes (x to the patient's left, y up, z out of the face), with the
        // origin 10 cm behind the nose tip at its height.
        let nose = face.geometry.vertices.max(by: { $0.z < $1.z }) ?? SIMD3(0, 0, 0.06)
        var offset = matrix_identity_float4x4
        offset.columns.3 = SIMD4(0, nose.y, nose.z - 0.10, 1)
        faceOffset = offset
        let toHead = offset.inverse
        // Natural head position: which way is up (gravity) in the head frame now, with the patient looking at the
        // screen at eye level.
        let headToWorldNow = face.transform * offset
        let upInHead = headToWorldNow.inverse * SIMD4<Float>(0, 1, 0, 0)
        gravityUp = simd_normalize(SIMD3(upInHead.x, upInHead.y, upInHead.z))
        holdExposure(true)
        Self.tone(1113)
        let l = toHead * face.leftEyeTransform.columns.3, r = toHead * face.rightEyeTransform.columns.3
        lidarEyes = (SIMD3(l.x, l.y, l.z), SIMD3(r.x, r.y, r.z))
        frontMirror = Self.mirrored(frame, face)
        phase = .scanning
        guideView.tintColor = UIColor(white: 1, alpha: 0.18)
        updateControls()
    }

    private func frontFrame(_ frame: ARFrame) {
        if scaleMode { scaleFrame(frame); return }
        guard let face = frame.anchors.lazy.compactMap({ $0 as? ARFaceAnchor }).first, face.isTracked else {
            steadySince = nil
            if countdownTimer != nil { cancelCountdown() }
            if phase == .ready, !scaleMode { setReady("Point the screen at the patient", "Level with their eyes, 25–35 cm away"); guideView.tintColor = UIColor(white: 1, alpha: 0.45); return }
            if phase == .scanning { say("Look back at the screen") } else {
                guideView.tintColor = UIColor(white: 1, alpha: 0.45)
                detail.text = "Point the screen at the patient’s face."
            }
            return
        }
        let cameraToAnchor = face.transform.inverse * frame.camera.transform
        // Face tracking alone is not a measured depth frame. Do not count in or
        // begin a volume until the actual sensor stream has arrived.
        guard frame.capturedDepthData != nil, frame.capturedDepthDataTimestamp > 0 else {
            steadySince = nil
            if countdownTimer != nil { cancelCountdown() }
            setReady("Waiting for Face ID depth", "Keep the face in view. No depth has been added yet.")
            return
        }
        if phase == .ready {
            guideView.tintColor = Self.gold.withAlphaComponent(0.8)
            let d = simd_length(SIMD3(cameraToAnchor.columns.3.x, cameraToAnchor.columns.3.y, cameraToAnchor.columns.3.z))
            considerAutoStart(face, frame: frame, cameraToAnchor: cameraToAnchor, distance: d)
            return
        }
        guard phase == .scanning, let offset = faceOffset, let volume, let tracker else { return }
        expressionIssue = expressionCheck(face)
        // The camera relative to the head, from Apple's face tracking, then fine-tuned on the face's shape.
        let guess = offset.inverse * cameraToAnchor
        let cameraToHead = tracker.correction * guess
        let cam = SIMD3(cameraToHead.columns.3.x, cameraToHead.columns.3.y, cameraToHead.columns.3.z)
        drawPoints(face.transform * offset * tracker.correction.inverse)
        let now = CACurrentMediaTime()
        var tooFast = false
        if let last = lastView, now - last.at > 0.05 {
            let turn = acosf(max(-1, min(1, simd_dot(simd_normalize(cam), simd_normalize(last.cam))))) * 180 / .pi
            lastTurnRate = turn / Float(now - last.at)
            tooFast = lastTurnRate > 40
            if tooFast, phase == .scanning, now - lastFastWarning > 1.2 {
                lastFastWarning = now
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
            }
            lastView = (cam, now)
        } else if lastView == nil { lastView = (cam, now) }
        guard let view = viewing(cam, slowDown: tooFast), expressionIssue == nil else { return }
        guard !fusing, let depthData = frame.capturedDepthData,
              capturePolicy.acceptDepth(imageTimestamp: frame.timestamp, depthTimestamp: frame.capturedDepthDataTimestamp) else { return }
        let converted = depthData.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
        let map = converted.depthDataMap
        let dw = Float(CVPixelBufferGetWidth(map)), dh = Float(CVPixelBufferGetHeight(map))
        var depthK = Self.depthIntrinsics(converted, camera: frame.camera, width: dw, height: dh)
        var imageK = frame.camera.intrinsics
        if frontMirror {
            depthK = Self.mirror(depthK, width: dw)
            imageK = Self.mirror(imageK, width: Float(frame.camera.imageResolution.width))
        }
        let item = FaceVolume.Frame(depth: map, image: frame.capturedImage, depthK: depthK, imageK: imageK,
                                    cameraToHead: cameraToHead, cameraInHead: cam, stride: 2, nearest: 0.15, farthest: 0.8)
        track(item, guess: guess, tracker: tracker, into: volume, view: view)
    }

    /// A photo from the accepted depth frame, using that frame's final corrected pose.
    private func keepFrontView(image buffer: CVPixelBuffer, intrinsics: simd_float3x3, cameraToHead: simd_float4x4,
                               at cam: SIMD3<Float>, turnRate: Float, run: UUID) {
        guard capturePolicy.pendingPhoto == nil, frontViews.count < 12, turnRate < 18,
              trackingIssue == nil, capturePolicy.isCurrent(run) else { return }
        let dir = simd_normalize(cam)
        guard frontViews.allSatisfy({ simd_dot(simd_normalize(SIMD3($0.cameraToHead.columns.3.x, $0.cameraToHead.columns.3.y, $0.cameraToHead.columns.3.z)), dir) < cosf(8 * .pi / 180) }) else { return }
        guard let picture = PixelCopy.copy(buffer), let ticket = capturePolicy.beginPhoto(run: run) else { return }
        let width = CVPixelBufferGetWidth(picture), height = CVPixelBufferGetHeight(picture)
        let image = CIImage(cvPixelBuffer: picture), context = photoContext
        DispatchQueue.global(qos: .userInitiated).async {
            let jpeg = context.jpegRepresentation(of: image, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.94])
            DispatchQueue.main.async {
                guard self.capturePolicy.finishPhoto(ticket, run: run), self.phase == .scanning else { return }
                if let jpeg {
                    self.frontViews.append(FrontView(jpeg: jpeg, width: width, height: height, K: intrinsics, cameraToHead: cameraToHead))
                }
                if self.finishAfterPhoto { self.build() }
            }
        }
    }

    private func expressionCheck(_ face: ARFaceAnchor) -> String? {
        let smile = ((face.blendShapes[.mouthSmileLeft]?.floatValue ?? 0) + (face.blendShapes[.mouthSmileRight]?.floatValue ?? 0)) / 2
        let open = face.blendShapes[.jawOpen]?.floatValue ?? 0
        switch capture.expression {
        case "rest": return smile > 0.35 || open > 0.25 ? "Relax the lips, lips together" : nil
        // A wide smile to start (the teeth showing); a little less is allowed once scanning, so it isn't fussy.
        case "smile":
            let scanning = phase == .scanning
            return smile < (scanning ? 0.22 : 0.35) ? (scanning ? "Keep the wide smile" : "A wide smile, showing the teeth") : nil
        default: return nil
        }
    }

    /// A camera described as its mirror image: the same points, the picture flipped left to right.
    static func mirror(_ k: simd_float3x3, width: Float) -> simd_float3x3 {
        var m = k
        m[0][0] = -k[0][0]
        m[2][0] = width - k[2][0]
        return m
    }

    /// Whether the front camera's raw image runs the other way to ARKit's camera, from a point on the face projected
    /// both by ARKit and by the pinhole maths.
    static func mirrored(_ frame: ARFrame, _ face: ARFaceAnchor) -> Bool {
        let size = frame.camera.imageResolution, w = Float(size.width)
        var votes = 0
        for x: Float in [-0.04, 0.04] {
            let p = face.transform * SIMD4<Float>(x, 0.03, 0.05, 1)
            let c = frame.camera.transform.inverse * p
            guard c.z < -0.05 else { continue }
            let k = frame.camera.intrinsics
            let u = k[0][0] * c.x / -c.z + k[2][0]
            let ar = Float(frame.camera.projectPoint(SIMD3(p.x, p.y, p.z), orientation: .landscapeRight, viewportSize: size).x)
            guard abs(u - w / 2) > 20 else { continue }
            votes += abs((w - u) - ar) < abs(u - ar) ? 1 : -1
        }
        return votes > 0
    }

    /// The depth map's intrinsics: from its own calibration when ARKit gives one, otherwise the camera image's,
    /// scaled to the depth map's width and centred.
    static func depthIntrinsics(_ depth: AVDepthData, camera: ARCamera, width dw: Float, height dh: Float) -> simd_float3x3 {
        if let calibration = depth.cameraCalibrationData {
            let ref = calibration.intrinsicMatrixReferenceDimensions
            var k = calibration.intrinsicMatrix
            let sx = dw / Float(ref.width), sy = dh / Float(ref.height)
            k[0][0] *= sx; k[2][0] *= sx; k[1][1] *= sy; k[2][1] *= sy
            if k[2][0] > 0, k[2][0] < dw, k[2][1] > 0, k[2][1] < dh { return k }
        }
        let iw = Float(camera.imageResolution.width), ih = Float(camera.imageResolution.height)
        let s = dw / iw
        var k = camera.intrinsics
        k[0][0] *= s; k[1][1] *= s; k[2][0] *= s
        k[2][1] = k[2][1] * s + (dh - ih * s) / 2
        return k
    }

    /// Store RGB/depth and the corrected pose from ONE accepted frame. Capturing a
    /// later high-resolution still with an old tracking correction misregistered
    /// photographs; falling back to latestDepth paired two different instants.
    private func maybeTakeShot(_ frame: FaceVolume.Frame, cameraToHead: simd_float4x4, turnRate: Float, run: UUID) {
        guard phase == .scanning, let shots, shotDirections.count < PhotoShots.maxShots,
              CACurrentMediaTime() - lastShotAt > 0.3, turnRate < 15, capturePolicy.isCurrent(run) else { return }
        let dir = simd_normalize(SIMD3(cameraToHead.columns.3.x, cameraToHead.columns.3.y, cameraToHead.columns.3.z))
        guard shotDirections.allSatisfy({ simd_dot($0, dir) < cosf(4 * .pi / 180) }) else { return }
        guard let ticket = capturePolicy.beginPhoto(run: run) else { return }
        lastShotAt = CACurrentMediaTime()
        shots.add(image: frame.image, depth: frame.depth, visionOrientation: visionOrientation,
                  maskMapping: maskMapping, cameraToHead: cameraToHead) { kept in
            guard self.capturePolicy.finishPhoto(ticket, run: run), self.phase == .scanning, self.shots === shots else { return }
            if kept {
                self.shotDirections.append(dir)
                self.sensorLabel.text = "Rear camera + LiDAR · \(self.shotDirections.count) sharp photos"
            }
            if self.finishAfterPhoto { self.build() }
        }
    }

    /// Which way Vision's person mask lines up with the camera's raw image, found by checking that the nose and the
    /// face round it are on the patient. Nil if neither fits (the cut-out is then left off).
    static func maskMapping(_ frame: ARFrame, nose: SIMD3<Float>, orientation: CGImagePropertyOrientation) -> CGImagePropertyOrientation? {
        let request = VNGeneratePersonSegmentationRequest()
        request.qualityLevel = .balanced
        request.outputPixelFormat = kCVPixelFormatType_OneComponent8
        let handler = VNImageRequestHandler(cvPixelBuffer: frame.capturedImage, orientation: orientation)
        guard (try? handler.perform([request])) != nil, let m = request.results?.first?.pixelBuffer else { return nil }
        let k = frame.camera.intrinsics, size = frame.camera.imageResolution
        func raw(_ p: SIMD3<Float>) -> (Float, Float)? {
            let c = frame.camera.transform.inverse * SIMD4<Float>(p, 1)
            guard c.z < -0.05 else { return nil }
            return ((k[0][0] * c.x / -c.z + k[2][0]) / Float(size.width), (k[1][1] * -c.y / -c.z + k[2][1]) / Float(size.height))
        }
        // The nose, and points 3 cm round it on the face (towards the camera's sides and up and down).
        let right = SIMD3(frame.camera.transform.columns.0.x, frame.camera.transform.columns.0.y, frame.camera.transform.columns.0.z)
        let probes = [nose, nose + right * 0.03, nose - right * 0.03, nose + SIMD3(0, 0.03, 0), nose - SIMD3(0, 0.03, 0)].compactMap(raw)
        guard probes.count == 5 else { return nil }
        for mapping in [orientation, .up] {
            let mask = FaceMask(buffer: m, orientation: mapping)
            let reader = mask.lock()
            let hits = probes.filter { reader.contains($0.0, $0.1) }.count
            mask.unlock()
            if hits == probes.count { return mapping }
        }
        return nil
    }

    // MARK: LiDAR helpers

    /// ARKit's camera intrinsics, for an image of another size with the same shape (the depth map).
    static func scaled(_ k: simd_float3x3, from: CGSize, to: CGSize) -> simd_float3x3 {
        var m = k
        let sx = Float(to.width / from.width), sy = Float(to.height / from.height)
        m[0][0] *= sx; m[2][0] *= sx; m[1][1] *= sy; m[2][1] *= sy
        return m
    }

    /// The nose tip: the nearest surface in the middle of the view, with high confidence, in world coordinates.
    static func findNose(_ depth: ARDepthData, depthK: simd_float3x3, camera: simd_float4x4) -> SIMD3<Float>? {
        let map = depth.depthMap
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        if let c = depth.confidenceMap { CVPixelBufferLockBaseAddress(c, .readOnly) }
        defer { if let c = depth.confidenceMap { CVPixelBufferUnlockBaseAddress(c, .readOnly) } }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return nil }
        let w = CVPixelBufferGetWidth(map), h = CVPixelBufferGetHeight(map), row = CVPixelBufferGetBytesPerRow(map) / 4
        let d = base.assumingMemoryBound(to: Float32.self)
        let conf = depth.confidenceMap.flatMap { CVPixelBufferGetBaseAddress($0) }?.assumingMemoryBound(to: UInt8.self)
        let confRow = depth.confidenceMap.map { CVPixelBufferGetBytesPerRow($0) } ?? 0
        var samples: [(Int, Int, Float)] = []
        for v in Int(Float(h) * 0.25)..<Int(Float(h) * 0.75) { for u in Int(Float(w) * 0.3)..<Int(Float(w) * 0.7) {
            let z = d[v * row + u]
            guard z > 0.18, z < 0.9 else { continue }
            if let conf, conf[v * confRow + u] < 2 { continue }
            samples.append((u, v, z))
        } }
        guard samples.count > 80 else { return nil }
        let sorted = samples.map(\.2).sorted()
        let near = sorted[sorted.count / 100]
        let tip = samples.filter { $0.2 < near + 0.008 }
        guard tip.count >= 4 else { return nil }
        let u = Float(tip.map(\.0).reduce(0, +)) / Float(tip.count), v = Float(tip.map(\.1).reduce(0, +)) / Float(tip.count)
        let z = tip.map(\.2).reduce(0, +) / Float(tip.count)
        let p = SIMD4<Float>((u - depthK[2][0]) / depthK[0][0] * z, -(v - depthK[2][1]) / depthK[1][1] * z, -z, 1)
        let world = camera * p
        return SIMD3(world.x, world.y, world.z)
    }

    /// The orientation of the rear camera's image for the screen's orientation.
    static func imageOrientation(_ o: UIInterfaceOrientation) -> CGImagePropertyOrientation {
        switch o {
        case .portraitUpsideDown: return .left
        case .landscapeRight: return .up
        case .landscapeLeft: return .down
        default: return .right
        }
    }

    /// The pupils, from on-device face landmarks, placed in the world with the depth map.
    static func pupils(_ frame: ARFrame, orientation: CGImagePropertyOrientation) -> (SIMD3<Float>, SIMD3<Float>)? {
        guard let depth = frame.smoothedSceneDepth ?? frame.sceneDepth else { return nil }
        let request = VNDetectFaceLandmarksRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: frame.capturedImage, orientation: orientation)
        guard (try? handler.perform([request])) != nil,
              let face = request.results?.max(by: { $0.boundingBox.width < $1.boundingBox.width }), let marks = face.landmarks,
              let l = marks.leftPupil?.pointsInImage(imageSize: CGSize(width: 1, height: 1)).first,
              let r = marks.rightPupil?.pointsInImage(imageSize: CGSize(width: 1, height: 1)).first else { return nil }
        // From the upright image (origin bottom left) back to the camera's own image (origin top left).
        func raw(_ p: CGPoint) -> CGPoint {
            let dx = p.x, dy = 1 - p.y
            switch orientation {
            case .right: return CGPoint(x: dy, y: 1 - dx)
            case .left: return CGPoint(x: 1 - dy, y: dx)
            case .down: return CGPoint(x: 1 - dx, y: 1 - dy)
            default: return CGPoint(x: dx, y: dy)
            }
        }
        let map = depth.depthMap
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return nil }
        let w = CVPixelBufferGetWidth(map), h = CVPixelBufferGetHeight(map), row = CVPixelBufferGetBytesPerRow(map) / 4
        let d = base.assumingMemoryBound(to: Float32.self)
        let k = scaled(frame.camera.intrinsics, from: frame.camera.imageResolution, to: CGSize(width: w, height: h))
        func world(_ p: CGPoint) -> SIMD3<Float>? {
            let q = raw(p), u = Int(q.x * CGFloat(w)), v = Int(q.y * CGFloat(h))
            var zs: [Float] = []
            for dv in -2...2 { for du in -2...2 {
                let uu = u + du, vv = v + dv
                guard uu >= 0, uu < w, vv >= 0, vv < h else { continue }
                let z = d[vv * row + uu]; if z > 0.15, z < 1 { zs.append(z) }
            } }
            guard zs.count >= 5 else { return nil }
            let z = zs.sorted()[zs.count / 2]
            let c = SIMD4<Float>((Float(u) - k[2][0]) / k[0][0] * z, -(Float(v) - k[2][1]) / k[1][1] * z, -z, 1)
            let wpt = frame.camera.transform * c
            return SIMD3(wpt.x, wpt.y, wpt.z)
        }
        guard let a = world(l), let b = world(r), simd_distance(a, b) > 0.04, simd_distance(a, b) < 0.09 else { return nil }
        return (a, b)
    }

    /// The head's frame: y straight up (true vertical), x along the eyes (towards the patient's left), z out
    /// through the face, origin 10 cm behind the nose tip. Without the eyes, x is square to the camera's view.
    static func headFrame(nose: SIMD3<Float>, camera: simd_float4x4, eyes: (SIMD3<Float>, SIMD3<Float>)?) -> simd_float4x4 {
        let up = SIMD3<Float>(0, 1, 0)
        let camPos = SIMD3(camera.columns.3.x, camera.columns.3.y, camera.columns.3.z)
        let camRight = SIMD3(camera.columns.0.x, camera.columns.0.y, camera.columns.0.z)
        // Square to the camera's view (the scan starts in front of the face)...
        var f = camPos - nose; f.y = 0
        let square = simd_normalize(simd_cross(up, simd_normalize(f)))
        var x: SIMD3<Float>? = square
        // ...turned to the eye line only when the eyes agree with that to within 20° (a misplaced eye can't swing it).
        if let (a, b) = eyes {
            var e = b - a
            if simd_dot(e, camRight) < 0 { e = -e }   // the patient's left eye is on the camera's right
            e.y = 0
            if simd_length(e) > 0.03, simd_dot(simd_normalize(e), square) > cosf(20 * .pi / 180) { x = simd_normalize(e) }
        }
        let z = simd_normalize(simd_cross(x!, up))
        let origin = nose - z * 0.10
        return simd_float4x4(columns: (SIMD4(x!, 0), SIMD4(up, 0), SIMD4(z, 0), SIMD4(origin, 1)))
    }

}

/// The ring round the face outline: a dash every 6°, gold once the phone has been round that way, with a dot
/// where it is now. The patient's right is on the left (the rear camera's picture isn't mirrored).
final class RingMeterView: UIView {
    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    var lit = Set<Int>() { didSet { setNeedsDisplay() } }
    /// Degrees round the orbit, and whether the phone is out far enough there to count.
    var current: (Float, Bool)? { didSet { setNeedsDisplay() } }
    /// Where to go next (degrees round the orbit), for the chevrons ahead of the moon.
    var heading: Float? { didSet { setNeedsDisplay() } }
    /// The front camera's picture is a mirror: the patient's left is then on the left.
    var mirrored = false { didSet { setNeedsDisplay() } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private func point(_ deg: CGFloat, _ c: CGPoint, _ rx: CGFloat, _ ry: CGFloat) -> CGPoint {
        let a = deg * .pi / 180
        return CGPoint(x: c.x + (mirrored ? -1 : 1) * cos(a) * rx, y: c.y - sin(a) * ry)
    }

    /// The orbit round the face: a faint dotted ellipse, solid gold where the phone has been round, and a moon where
    /// it is now with chevrons pointing on round. (0° is the patient's left, on the right of the picture; 90° above.)
    override func draw(_ rect: CGRect) {
        let c = CGPoint(x: bounds.midX, y: bounds.midY), rx = bounds.width / 2 - 14, ry = bounds.height / 2 - 14
        let n = FaceScanViewController.ticks, step = 360 / CGFloat(n)
        let dots = UIBezierPath(ovalIn: CGRect(x: c.x - rx, y: c.y - ry, width: rx * 2, height: ry * 2))
        dots.lineWidth = 3
        dots.lineCapStyle = .round
        dots.setLineDash([0.1, 11], count: 2, phase: 0)
        UIColor(white: 1, alpha: 0.4).setStroke()
        dots.stroke()
        // Lit runs as continuous gold arcs.
        Self.gold.setStroke()
        for k in 0..<n where lit.contains(k) {
            let arc = UIBezierPath()
            let from = CGFloat(k) * step - step / 2 - 0.5, to = CGFloat(k) * step + step / 2 + 0.5
            var first = true
            for d in stride(from: from, through: to, by: 1) { let p = point(d, c, rx, ry); if first { arc.move(to: p); first = false } else { arc.addLine(to: p) } }
            arc.lineWidth = 6
            arc.lineCapStyle = .round
            arc.stroke()
        }
        guard let (deg, out) = current else { return }
        let here = CGFloat(deg)
        if let heading {
            var d = CGFloat(heading) - here
            while d > 180 { d -= 360 }
            while d < -180 { d += 360 }
            let dir: CGFloat = d >= 0 ? 1 : -1
            for k in 1...3 {
                let at = here + dir * CGFloat(k) * 9, p = point(at, c, rx, ry), q = point(at + dir * 2, c, rx, ry)
                let angle = atan2(q.y - p.y, q.x - p.x)
                let chev = UIBezierPath()
                chev.move(to: CGPoint(x: -5, y: -7)); chev.addLine(to: CGPoint(x: 3, y: 0)); chev.addLine(to: CGPoint(x: -5, y: 7))
                chev.apply(CGAffineTransform(rotationAngle: angle).concatenating(CGAffineTransform(translationX: p.x, y: p.y)))
                chev.lineWidth = 3
                chev.lineCapStyle = .round
                chev.lineJoinStyle = .round
                UIColor(white: 1, alpha: 0.9 - CGFloat(k) * 0.22).setStroke()
                chev.stroke()
            }
        }
        let m = point(here, c, rx, ry)
        (out ? UIColor.white : UIColor(white: 1, alpha: 0.6)).setFill()
        UIBezierPath(ovalIn: CGRect(x: m.x - 11, y: m.y - 11, width: 22, height: 22)).fill()
        Self.gold.setStroke()
        let ring = UIBezierPath(ovalIn: CGRect(x: m.x - 11, y: m.y - 11, width: 22, height: 22)); ring.lineWidth = 3.5; ring.stroke()
    }
}

/// The case's face scans in 3D. View: one scan at a time, in the camera's colours or as the bare shape. Compare:
/// one scan laid over another (any two, from any visit), lined up automatically on the forehead, eyes, nose and
/// cheekbones, either see-through or as a colour map of how far apart the surfaces are. Drag to turn, pinch to zoom.
final class FaceScanViewerViewController: UIViewController {
    struct Entry {
        let title: String; let url: URL; var model: (obj: URL, texture: URL)? = nil
        /// Eye centres (left, right) in the mesh's millimetres, and whether the midline was found from symmetry.
        var eyes: (SIMD3<Float>, SIMD3<Float>)? = nil
        var oriented = false
        /// The midline plane (n · p = d) and its lean from true vertical, in degrees.
        var midlinePlane: SIMD4<Float>? = nil
        var midlineTilt: Float? = nil
    }
    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    private let entries: [Entry]
    private let onClose: () -> Void
    private let sceneView = SCNView()
    private let closeButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let mode = UISegmentedControl(items: ["View", "Compare"])
    private let baseButton = UIButton(type: .system)
    private let overButton = UIButton(type: .system)
    private let look = UISegmentedControl(items: ["Colour", "Shape", "Guides"])
    private let compareLook = UISegmentedControl(items: ["Overlay", "Difference"])
    private let opacity = UISlider()
    private let info = UILabel()
    private let legend = DifferenceLegendView()
    private let spinner = UIActivityIndicatorView(style: .large)
    private var meshes: [Int: FaceMesh] = [:]
    private var alignments: [String: FaceAlign.Result] = [:]
    private var base = 0, over = 1
    private var job = 0
    private let work = DispatchQueue(label: "uk.co.drvik.smilecompose.scanviewer", qos: .userInitiated)

    init(entries: [Entry], focus: Int = 0, compare: Bool = false, onClose: @escaping () -> Void) {
        self.entries = entries
        self.onClose = onClose
        super.init(nibName: nil, bundle: nil)
        base = min(max(0, focus), max(0, entries.count - 1))
        over = entries.count > 1 ? (base == 0 ? 1 : 0) : 0
        mode.selectedSegmentIndex = compare && entries.count > 1 ? 1 : 0
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.10, green: 0.09, blue: 0.08, alpha: 1)
        sceneView.backgroundColor = view.backgroundColor
        sceneView.allowsCameraControl = true
        sceneView.antialiasingMode = .multisampling4X
        sceneView.defaultCameraController.interactionMode = .orbitTurntable
        view.addSubview(sceneView)
        titleLabel.text = "3D face scan"
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center
        closeButton.setTitle("Done", for: .normal)
        closeButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        closeButton.tintColor = .white
        closeButton.addTarget(self, action: #selector(close), for: .touchUpInside)
        for control in [mode, look, compareLook] {
            control.selectedSegmentTintColor = Self.gold
            control.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .normal)
            control.setTitleTextAttributes([.foregroundColor: UIColor(white: 0.08, alpha: 1)], for: .selected)
            control.addTarget(self, action: #selector(changed), for: .valueChanged)
        }
        mode.isEnabled = entries.count > 1
        look.selectedSegmentIndex = 0
        compareLook.selectedSegmentIndex = 0
        for b in [baseButton, overButton] {
            var c = UIButton.Configuration.gray()
            c.baseForegroundColor = .white
            c.baseBackgroundColor = UIColor(white: 1, alpha: 0.1)
            c.cornerStyle = .capsule
            c.titleLineBreakMode = .byTruncatingTail
            c.image = UIImage(systemName: "chevron.up.chevron.down", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold))
            c.imagePlacement = .trailing
            c.imagePadding = 6
            b.configuration = c
            b.showsMenuAsPrimaryAction = true
        }
        opacity.minimumValue = 0.15
        opacity.maximumValue = 0.95
        opacity.value = 0.55
        opacity.minimumTrackTintColor = Self.gold
        opacity.addTarget(self, action: #selector(opacityChanged), for: .valueChanged)
        info.font = .systemFont(ofSize: 12.5)
        info.textColor = UIColor(white: 1, alpha: 0.75)
        info.textAlignment = .center
        info.numberOfLines = 2
        spinner.color = .white
        spinner.hidesWhenStopped = true
        [closeButton, titleLabel, mode, baseButton, overButton, look, compareLook, opacity, info, legend, spinner].forEach { view.addSubview($0) }
        refreshMenus()
        update()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaLayoutGuide.layoutFrame
        sceneView.frame = view.bounds
        closeButton.frame = CGRect(x: safe.minX + 12, y: safe.minY + 6, width: 70, height: 44)
        titleLabel.frame = CGRect(x: safe.minX + 90, y: safe.minY + 16, width: safe.width - 180, height: 24)
        let width = min(safe.width - 32, 440), left = safe.midX - width / 2
        mode.frame = CGRect(x: safe.midX - 100, y: safe.minY + 56, width: 200, height: 32)
        var y = safe.maxY - 44
        let comparing = mode.selectedSegmentIndex == 1
        (comparing ? compareLook : look).frame = CGRect(x: safe.midX - (comparing ? 110 : 150), y: y, width: comparing ? 220 : 300, height: 34)
        y -= 44
        if comparing {
            if compareLook.selectedSegmentIndex == 0 { opacity.frame = CGRect(x: left + 20, y: y, width: width - 40, height: 30) }
            else { legend.frame = CGRect(x: left + 10, y: y - 6, width: width - 20, height: 40) }
            y -= 46
            overButton.frame = CGRect(x: left, y: y, width: width, height: 38)
            y -= 46
        }
        baseButton.frame = CGRect(x: left, y: y, width: width, height: 38)
        info.frame = CGRect(x: left, y: y - 40, width: width, height: 34)
        spinner.center = CGPoint(x: safe.midX, y: safe.midY)
        view.keepClearOfCamera([closeButton])
    }

    private func refreshMenus() {
        let make = { (chosen: Int, prefix: String, pick: @escaping (Int) -> Void) -> UIMenu in
            UIMenu(children: self.entries.enumerated().map { i, e in
                UIAction(title: e.title, state: i == chosen ? .on : .off) { _ in pick(i) }
            })
        }
        baseButton.menu = make(base, "") { [weak self] i in self?.base = i; self?.refreshMenus(); self?.update() }
        overButton.menu = make(over, "") { [weak self] i in self?.over = i; self?.refreshMenus(); self?.update() }
        let comparing = mode.selectedSegmentIndex == 1
        var b = baseButton.configuration; b?.title = (comparing ? "Base: " : "") + (entries.indices.contains(base) ? entries[base].title : "")
        baseButton.configuration = b
        var o = overButton.configuration; o?.title = "Laid over it: " + (entries.indices.contains(over) ? entries[over].title : "")
        overButton.configuration = o
    }

    @objc private func changed() { refreshMenus(); update() }

    @objc private func opacityChanged() {
        sceneView.scene?.rootNode.childNode(withName: "over", recursively: false)?.geometry?.firstMaterial?.transparency = CGFloat(opacity.value)
    }

    private var textured: [Int: TexturedFace] = [:]
    private func loadTextured(_ i: Int) -> TexturedFace? {
        if let t = textured[i] { return t }
        guard entries.indices.contains(i), let m = entries[i].model, let t = TexturedFace.read(obj: m.obj, texture: m.texture) else { return nil }
        textured[i] = t
        return t
    }

    private func load(_ i: Int) -> FaceMesh? {
        if let m = meshes[i] { return m }
        guard entries.indices.contains(i), let m = FaceMesh.read(entries[i].url) else { return nil }
        meshes[i] = m
        return m
    }

    private func update() {
        let comparing = mode.selectedSegmentIndex == 1 && entries.count > 1
        look.isHidden = comparing
        [overButton, compareLook].forEach { $0.isHidden = !comparing }
        opacity.isHidden = !(comparing && compareLook.selectedSegmentIndex == 0)
        legend.isHidden = !(comparing && compareLook.selectedSegmentIndex == 1)
        view.setNeedsLayout()
        job += 1
        let ticket = job, base = self.base, over = self.over, shape = look.selectedSegmentIndex == 1, difference = compareLook.selectedSegmentIndex == 1
        let guides = !comparing && look.selectedSegmentIndex == 2
        let alpha = CGFloat(opacity.value)
        spinner.startAnimating()
        info.text = comparing ? "Lining the scans up…" : nil
        work.async {
            guard let a = self.load(base) else { DispatchQueue.main.async { self.spinner.stopAnimating(); self.info.text = "This scan couldn’t be opened." }; return }
            var nodes: [(String, SCNGeometry)] = []
            var text: String?
            if comparing, base != over, let b = self.load(over) {
                let key = "\(base)-\(over)"
                let result = self.alignments[key] ?? FaceAlign.align(base: a, moving: b)
                if let result {
                    self.alignments[key] = result
                    let moved = b.transformed(result.transform)
                    if difference {
                        nodes = [("base", a.geometry(coloured: false, override: FaceAlign.colours(FaceAlign.gaps(base: a, moving: moved))))]
                    } else {
                        nodes = [("base", a.geometry(coloured: true)), ("over", moved.geometry(coloured: false, tint: Self.gold, opacity: alpha))]
                    }
                    text = String(format: "Lined up on the forehead, eyes and nose · %.1f mm average gap there", result.rms)
                } else {
                    nodes = [("base", a.geometry(coloured: true))]
                    text = "These two scans couldn’t be lined up: they need the forehead and nose in both."
                }
            } else {
                // In colour, the face built from photographs (photographic skin) when there is one.
                nodes = [("base", !shape ? (self.loadTextured(base)?.geometry() ?? a.geometry(coloured: true)) : a.geometry(coloured: false))]
                if comparing { text = "Choose a different scan to lay over it." }
            }
            DispatchQueue.main.async {
                guard ticket == self.job else { return }
                self.spinner.stopAnimating()
                self.info.text = text
                self.show(nodes)
                self.showGuides(guides ? self.entries[base] : nil)
            }
        }
    }

    private func show(_ nodes: [(String, SCNGeometry)]) {
        if sceneView.scene == nil, let first = nodes.first {
            let scene = FaceMesh.scene(with: first.1)
            scene.rootNode.childNode(withName: "face", recursively: false)?.name = "base"
            sceneView.scene = scene
            let eye = scene.rootNode.childNode(withName: "camera", recursively: false)
            eye?.camera?.projectionDirection = .horizontal
            eye?.camera?.fieldOfView = 40
            sceneView.pointOfView = eye
            sceneView.defaultCameraController.target = SCNVector3(0, -5, 20)
        }
        guard let root = sceneView.scene?.rootNode else { return }
        for name in ["base", "over"] {
            let node = root.childNode(withName: name, recursively: false)
            if let geometry = nodes.first(where: { $0.0 == name })?.1 {
                if let node { node.geometry = geometry } else {
                    let n = SCNNode(geometry: geometry); n.name = name; n.renderingOrder = name == "over" ? 10 : 0; root.addChildNode(n)
                }
            } else { node?.removeFromParentNode() }
        }
    }

    /// The lab's reference lines over the face: the facial midline as measured (gold plane), true vertical (white
    /// line), the eye line (gold) against true horizontal (white), and the angles between them. The midline and true
    /// vertical are shown separately, never merged.
    private func showGuides(_ entry: Entry?) {
        guard let root = sceneView.scene?.rootNode else { return }
        root.childNode(withName: "guides", recursively: false)?.removeFromParentNode()
        guard let entry else { return }
        let node = SCNNode(); node.name = "guides"; node.renderingOrder = 20
        let gold = Self.gold, white = UIColor(white: 1, alpha: 0.85)
        func bar(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ colour: UIColor, radius: CGFloat) {
            let d = b - a, len = simd_length(d)
            guard len > 1 else { return }
            let cyl = SCNCylinder(radius: radius, height: CGFloat(len))
            let mat = SCNMaterial(); mat.diffuse.contents = colour; mat.lightingModel = .constant; mat.readsFromDepthBuffer = false
            cyl.materials = [mat]
            let n = SCNNode(geometry: cyl)
            n.simdPosition = (a + b) / 2
            n.simdOrientation = simd_quatf(from: SIMD3(0, 1, 0), to: d / len)
            node.addChildNode(n)
        }
        // The midline plane, standing on the face as measured.
        let planeEq = entry.midlinePlane ?? SIMD4(1, 0, 0, 0)
        let n = simd_normalize(SIMD3(planeEq.x, planeEq.y, planeEq.z))
        let up = simd_normalize(SIMD3<Float>(0, 1, 0) - n * n.y), across = simd_cross(up, n)
        let forward = SIMD3<Float>(0, 0, -30) - n * simd_dot(n, SIMD3<Float>(0, 0, -30))
        let centre = n * planeEq.w + forward + up * 20
        let quad = SCNPlane(width: 150, height: 240)
        let m = SCNMaterial(); m.diffuse.contents = gold.withAlphaComponent(0.22); m.isDoubleSided = true; m.lightingModel = .constant; m.writesToDepthBuffer = false
        quad.materials = [m]
        let plane = SCNNode(geometry: quad)
        plane.simdTransform = simd_float4x4(columns: (SIMD4(across, 0), SIMD4(up, 0), SIMD4(n, 0), SIMD4(centre, 1)))
        node.addChildNode(plane)
        // True vertical through subnasale (the origin), just in front of the face.
        bar(SIMD3(0, -95, 12), SIMD3(0, 115, 12), white, radius: 0.45)
        var parts = [entry.oriented ? "Gold plane: facial midline, from the face’s symmetry" : "Gold plane: centre line from the nose and eyes (symmetry not found)"]
        if let tilt = entry.midlineTilt { parts.append(String(format: "it leans %.1f° from true vertical (white)", abs(tilt))) }
        if let (l, r) = entry.eyes {
            let mid = (l + r) / 2, z = max(l.z, r.z) + 6
            let dir = simd_normalize(l - r)
            bar(SIMD3(mid.x, mid.y, z) - dir * 85, SIMD3(mid.x, mid.y, z) + dir * 85, gold, radius: 0.7)
            bar(SIMD3(mid.x - 85, mid.y, z), SIMD3(mid.x + 85, mid.y, z), white, radius: 0.45)
            parts.append(String(format: "eye line %.1f° from true horizontal", abs(atan2f(l.y - r.y, l.x - r.x) * 180 / .pi)))
        }
        root.addChildNode(node)
        info.text = parts.joined(separator: " · ")
    }

    @objc private func close() { dismiss(animated: true) { self.onClose() } }
}

/// The key to the difference map.
final class DifferenceLegendView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }
    override func draw(_ rect: CGRect) {
        let barRect = CGRect(x: 40, y: 4, width: bounds.width - 80, height: 10)
        let colours = [-2, -1, 0, 1, 2].map { g -> CGColor in
            let c = FaceAlign.colours([Float(g)])[0]
            return UIColor(red: CGFloat(powf(c.x, 1 / 2.2)), green: CGFloat(powf(c.y, 1 / 2.2)), blue: CGFloat(powf(c.z, 1 / 2.2)), alpha: 1).cgColor
        }
        if let ctx = UIGraphicsGetCurrentContext(), let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colours as CFArray, locations: [0, 0.25, 0.5, 0.75, 1]) {
            ctx.saveGState()
            UIBezierPath(roundedRect: barRect, cornerRadius: 5).addClip()
            ctx.drawLinearGradient(gradient, start: CGPoint(x: barRect.minX, y: 0), end: CGPoint(x: barRect.maxX, y: 0), options: [])
            ctx.restoreGState()
        }
        let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 11), .foregroundColor: UIColor(white: 1, alpha: 0.75)]
        ("−2 mm" as NSString).draw(at: CGPoint(x: 0, y: 1), withAttributes: attrs)
        ("+2 mm" as NSString).draw(at: CGPoint(x: bounds.width - 36, y: 1), withAttributes: attrs)
        let note = "Blue: the other scan sits behind · red: in front · grey: not in both" as NSString
        let size = note.size(withAttributes: attrs)
        note.draw(at: CGPoint(x: (bounds.width - size.width) / 2, y: 20), withAttributes: attrs)
    }
}

extension UIView {
    /// iPhone Duo inner display: a control under the front camera's reserved area moves beside it.
    func keepClearOfCamera(_ controls: [UIView]) {
        guard #available(iOS 27.1, *) else { return }
        let regions = reservedRegions(kind: .occlusion).filter(\.isActive).map(\.frame)
        guard !regions.isEmpty else { return }
        let free = bounds.inset(by: safeAreaInsets)
        for control in controls {
            let base = control.frame
            guard let region = regions.first(where: { $0.intersects(base) }) else { continue }
            if region.maxX + 8 + base.width <= free.maxX { control.frame.origin.x = region.maxX + 8 }
            else if region.minX - 8 - base.width >= free.minX { control.frame.origin.x = region.minX - 8 - base.width }
            else { control.frame.origin.y = region.maxY + 8 }
        }
    }
}



// MARK: - Intraoral scan alignment

final class DocumentPickerHandler: NSObject, UIDocumentPickerDelegate {
    private let done: (URL?) -> Void
    init(_ done: @escaping (URL?) -> Void) { self.done = done }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { done(urls.first) }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { done(nil) }
}

/// Reads an intraoral scan (or any mesh) in millimetres: STL (binary or text), PLY (binary little-endian or text)
/// and OBJ.
enum MeshImport {
    static func read(_ url: URL) -> FaceMesh? {
        guard let data = try? Data(contentsOf: url, options: .mappedIfSafe), data.count > 84 else { return nil }
        let ext = url.pathExtension.lowercased()
        let mesh: FaceMesh?
        switch ext {
        case "stl": mesh = stl(data)
        case "ply": mesh = ply(data)
        case "obj": mesh = obj(data)
        default: mesh = stl(data) ?? ply(data) ?? obj(data)
        }
        guard let mesh, mesh.positions.count >= 100, mesh.triangles.count >= 300 else { return nil }
        return mesh
    }

    private static func indexed(_ corners: [SIMD3<Float>]) -> FaceMesh {
        var index = [SIMD3<Int32>: UInt32](), positions: [SIMD3<Float>] = [], triangles: [UInt32] = []
        positions.reserveCapacity(corners.count / 5); triangles.reserveCapacity(corners.count)
        for p in corners {
            let key = SIMD3<Int32>(Int32((p.x * 1000).rounded()), Int32((p.y * 1000).rounded()), Int32((p.z * 1000).rounded()))
            if let i = index[key] { triangles.append(i) } else { let i = UInt32(positions.count); index[key] = i; positions.append(p); triangles.append(i) }
        }
        return FaceMesh(positions: positions, colours: Array(repeating: SIMD3(205, 200, 192), count: positions.count), triangles: triangles)
    }

    private static func stl(_ data: Data) -> FaceMesh? {
        let count = data.withUnsafeBytes { Int($0.loadUnaligned(fromByteOffset: 80, as: UInt32.self).littleEndian) }
        if count > 0, 84 + count * 50 == data.count {
            var corners: [SIMD3<Float>] = []
            corners.reserveCapacity(count * 3)
            data.withUnsafeBytes { raw in
                for f in 0..<count {
                    let o = 84 + f * 50 + 12
                    for v in 0..<3 {
                        let b = o + v * 12
                        corners.append(SIMD3(Float(bitPattern: raw.loadUnaligned(fromByteOffset: b, as: UInt32.self).littleEndian),
                                             Float(bitPattern: raw.loadUnaligned(fromByteOffset: b + 4, as: UInt32.self).littleEndian),
                                             Float(bitPattern: raw.loadUnaligned(fromByteOffset: b + 8, as: UInt32.self).littleEndian)))
                    }
                }
            }
            return indexed(corners)
        }
        guard let text = String(data: data, encoding: .ascii) ?? String(data: data, encoding: .utf8), text.contains("vertex") else { return nil }
        var corners: [SIMD3<Float>] = []
        for line in text.split(whereSeparator: \.isNewline) {
            let parts = line.split(separator: " ", omittingEmptySubsequences: true)
            if parts.count >= 4, parts[0] == "vertex", let x = Float(parts[1]), let y = Float(parts[2]), let z = Float(parts[3]) { corners.append(SIMD3(x, y, z)) }
        }
        return corners.count >= 3 ? indexed(Array(corners.prefix(corners.count / 3 * 3))) : nil
    }

    private static func obj(_ data: Data) -> FaceMesh? {
        guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .ascii) else { return nil }
        var positions: [SIMD3<Float>] = [], colours: [SIMD3<UInt8>] = [], triangles: [UInt32] = []
        for line in text.split(whereSeparator: \.isNewline) {
            let parts = line.split(separator: " ", omittingEmptySubsequences: true)
            guard let head = parts.first else { continue }
            if head == "v", parts.count >= 4, let x = Float(parts[1]), let y = Float(parts[2]), let z = Float(parts[3]) {
                positions.append(SIMD3(x, y, z))
                if parts.count >= 7, let r = Float(parts[4]), let g = Float(parts[5]), let b = Float(parts[6]) {
                    let k: Float = max(r, g, b) <= 1 ? 255 : 1
                    colours.append(SIMD3(UInt8(min(255, r * k)), UInt8(min(255, g * k)), UInt8(min(255, b * k))))
                } else { colours.append(SIMD3(205, 200, 192)) }
            } else if head == "f", parts.count >= 4 {
                let idx: [UInt32] = parts.dropFirst().compactMap { token in
                    guard let n = Int(token.split(separator: "/", omittingEmptySubsequences: false).first ?? "") else { return nil }
                    let i = n > 0 ? n - 1 : positions.count + n
                    return i >= 0 && i < positions.count ? UInt32(i) : nil
                }
                guard idx.count >= 3 else { continue }
                for k in 1..<(idx.count - 1) { triangles += [idx[0], idx[k], idx[k + 1]] }
            }
        }
        return positions.isEmpty ? nil : FaceMesh(positions: positions, colours: colours, triangles: triangles)
    }

    private static func ply(_ data: Data) -> FaceMesh? {
        guard let headerEnd = data.range(of: Data("end_header".utf8)) else { return nil }
        var bodyStart = headerEnd.upperBound
        while bodyStart < data.count, data[bodyStart] == 0x0D || data[bodyStart] == 0x0A { bodyStart += 1; if data[bodyStart - 1] == 0x0A { break } }
        guard let header = String(data: data[..<headerEnd.lowerBound], encoding: .ascii) else { return nil }
        var format = "", element = "", vertexCount = 0, faceCount = 0
        var vprops: [(name: String, type: String)] = [], faceList: (count: String, index: String)?
        for raw in header.split(whereSeparator: \.isNewline) {
            let p = raw.split(separator: " ").map(String.init)
            guard let k = p.first else { continue }
            if k == "format", p.count > 1 { format = p[1] }
            else if k == "element", p.count > 2 { element = p[1]; if element == "vertex" { vertexCount = Int(p[2]) ?? 0 } else if element == "face" { faceCount = Int(p[2]) ?? 0 } }
            else if k == "property" {
                if element == "vertex", p.count > 2 { vprops.append((p[p.count - 1], p[1])) }
                else if element == "face", p.count > 4, p[1] == "list" { faceList = (p[2], p[3]) }
            }
        }
        guard vertexCount > 0, let faceList else { return nil }
        let size: [String: Int] = ["char": 1, "uchar": 1, "int8": 1, "uint8": 1, "short": 2, "ushort": 2, "int16": 2, "uint16": 2,
                                   "int": 4, "uint": 4, "int32": 4, "uint32": 4, "float": 4, "float32": 4, "double": 8, "float64": 8]
        var positions = [SIMD3<Float>](repeating: .zero, count: vertexCount), colours = [SIMD3<UInt8>](repeating: SIMD3(205, 200, 192), count: vertexCount)
        var triangles: [UInt32] = []
        let ix = vprops.firstIndex { $0.name == "x" }, iy = vprops.firstIndex { $0.name == "y" }, iz = vprops.firstIndex { $0.name == "z" }
        let ir = vprops.firstIndex { $0.name == "red" }, ig = vprops.firstIndex { $0.name == "green" }, ib = vprops.firstIndex { $0.name == "blue" }
        guard let ix, let iy, let iz else { return nil }
        if format == "ascii" {
            guard let text = String(data: data[bodyStart...], encoding: .ascii) else { return nil }
            var lines = text.split(whereSeparator: \.isNewline).makeIterator()
            for v in 0..<vertexCount {
                guard let line = lines.next() else { return nil }
                let f = line.split(separator: " ").compactMap { Double($0) }
                guard f.count >= vprops.count else { return nil }
                positions[v] = SIMD3(Float(f[ix]), Float(f[iy]), Float(f[iz]))
                if let ir, let ig, let ib { colours[v] = SIMD3(UInt8(min(255, f[ir])), UInt8(min(255, f[ig])), UInt8(min(255, f[ib]))) }
            }
            for _ in 0..<faceCount {
                guard let line = lines.next() else { break }
                let f = line.split(separator: " ").compactMap { Int($0) }
                guard let n = f.first, n >= 3, f.count > n else { continue }
                for k in 2..<n { triangles += [UInt32(f[1]), UInt32(f[k]), UInt32(f[k + 1])] }
            }
        } else if format == "binary_little_endian" {
            var stride = 0, offsets: [Int] = []
            for p in vprops { guard let sz = size[p.type] else { return nil }; offsets.append(stride); stride += sz }
            guard let cs = size[faceList.count], let isz = size[faceList.index], bodyStart + vertexCount * stride <= data.count else { return nil }
            let ok: Bool = data.withUnsafeBytes { raw -> Bool in
                func value(_ o: Int, _ type: String) -> Double {
                    switch type {
                    case "float", "float32": return Double(Float(bitPattern: raw.loadUnaligned(fromByteOffset: o, as: UInt32.self).littleEndian))
                    case "double", "float64": return Double(bitPattern: raw.loadUnaligned(fromByteOffset: o, as: UInt64.self).littleEndian)
                    case "uchar", "uint8": return Double(raw[o])
                    case "char", "int8": return Double(Int8(bitPattern: raw[o]))
                    case "ushort", "uint16": return Double(raw.loadUnaligned(fromByteOffset: o, as: UInt16.self).littleEndian)
                    case "short", "int16": return Double(Int16(bitPattern: raw.loadUnaligned(fromByteOffset: o, as: UInt16.self).littleEndian))
                    case "uint", "uint32": return Double(raw.loadUnaligned(fromByteOffset: o, as: UInt32.self).littleEndian)
                    default: return Double(Int32(bitPattern: raw.loadUnaligned(fromByteOffset: o, as: UInt32.self).littleEndian))
                    }
                }
                var o = bodyStart
                for v in 0..<vertexCount {
                    positions[v] = SIMD3(Float(value(o + offsets[ix], vprops[ix].type)), Float(value(o + offsets[iy], vprops[iy].type)), Float(value(o + offsets[iz], vprops[iz].type)))
                    if let ir, let ig, let ib { colours[v] = SIMD3(UInt8(min(255, value(o + offsets[ir], vprops[ir].type))), UInt8(min(255, value(o + offsets[ig], vprops[ig].type))), UInt8(min(255, value(o + offsets[ib], vprops[ib].type)))) }
                    o += stride
                }
                for _ in 0..<faceCount {
                    guard o + cs <= raw.count else { return false }
                    let n = Int(value(o, faceList.count)); o += cs
                    guard n >= 3, o + n * isz <= raw.count else { return false }
                    let idx = (0..<n).map { UInt32(max(0, value(o + $0 * isz, faceList.index))) }
                    o += n * isz
                    for k in 1..<(n - 1) { triangles += [idx[0], idx[k], idx[k + 1]] }
                }
                return true
            }
            guard ok else { return nil }
        } else { return nil }
        let valid = triangles.allSatisfy { Int($0) < vertexCount }
        return valid ? FaceMesh(positions: positions, colours: colours, triangles: triangles) : nil
    }
}

/// The face lined up with the intraoral scan: the transform carrying the intraoral scan onto the face (export frame)
/// and how well the front teeth agree.
struct IntraoralOutcome {
    let faceFromIntraoral: simd_float4x4
    let fitMm: Float
    let pairs: Int
    let refined: Bool
}

enum IntraoralExport {
    /// The selected reference and only its registered shared-frame peers are saved in the intraoral frame.
    /// Legacy/independently oriented expressions are preserved, but need their own registration.
    static func save(_ o: IntraoralOutcome, fileName: String, folder: URL, referenceScanId: String? = nil) -> [String: Any]? {
        guard var info = CaseMediaStore.readInfo(folder), var captures = info["captures"] as? [[String: Any]],
              !captures.contains(where: { $0["building"] as? Bool == true }),
              let referenceId = FaceScanFrames.referenceId(captures, preferred: referenceScanId),
              let reference = captures.first(where: { $0["id"] as? String == referenceId }) else { return nil }
        let intraoralFromFace = o.faceFromIntraoral.inverse
        let exportVersion = UUID().uuidString.lowercased()
        var included: [String] = [], excluded: [String] = []
        for i in captures.indices {
            let id = captures[i]["id"] as? String ?? "scan\(i)", name = "\(id)-intraoral-\(exportVersion)-frame.ply"
            // Remove any previous derived-file reference before a new fit, including files exported by older builds
            // that applied one transform to independently oriented expressions. Original scans remain untouched.
            captures[i].removeValue(forKey: "intraoralMesh")
            guard FaceScanFrames.sharesFrame(captures[i], with: reference),
                  let url = CaseMediaStore.file(captures[i]["mesh"], in: folder), let mesh = FaceMesh.read(url) else { excluded.append(id); continue }
            let title = captures[i]["title"] as? String ?? id
            guard (try? CaseMediaStore.write(mesh.transformed(intraoralFromFace).ply(comment: "\(title), in the intraoral scan's frame (\(fileName)); registration requires independent verification"), to: folder.appendingPathComponent(name))) != nil else { excluded.append(id); continue }
            captures[i]["intraoralMesh"] = name
            included.append(id)
        }
        guard included.contains(referenceId) else { return nil }
        let matrix = (0..<4).flatMap { c in (0..<4).map { r in (Double(o.faceFromIntraoral[c][r]) * 100000).rounded() / 100000 } }
        let metric = o.refined ? "trimmed point-to-plane RMS residual (not independent accuracy)" : "point-pair RMS residual (surface refinement did not converge)"
        info["captures"] = captures
        info.removeValue(forKey: "intraoralStatus")
        info.removeValue(forKey: "intraoralInvalidatedByScanId")
        info["intraoral"] = ["file": fileName, "fitMm": (Double(o.fitMm) * 100).rounded() / 100, "pairs": o.pairs, "refined": o.refined,
                             "referenceScanId": referenceId, "fitMetric": metric, "includedScanIds": included, "excludedScanIds": excluded,
                             "at": CaseMediaStore.iso.string(from: Date())]
        let landmarksURL = folder.appendingPathComponent("landmarks.json")
        if let data = try? Data(contentsOf: landmarksURL), var file = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
            file.removeValue(forKey: "intraoralStatus")
            file.removeValue(forKey: "intraoralInvalidatedByScanId")
            file["intraoralRegistration"] = [
                "intraoralFile": fileName,
                "method": o.refined ? "\(o.pairs) point pairs on the front teeth (or bite fork), then ICP on the front teeth" : "\(o.pairs) point pairs",
                "frontTeethFitMm": (Double(o.fitMm) * 100).rounded() / 100,
                "fitMetric": metric,
                "referenceScanId": referenceId,
                "includedScanIds": included,
                "excludedScanIds": excluded,
                "faceFromIntraoral": matrix,
                "files": "*-intraoral-frame.ply include only the selected reference and its registered shared-frame peers; excluded expressions require separate registration"
            ]
            if let out = try? JSONSerialization.data(withJSONObject: file, options: [.prettyPrinted, .sortedKeys]) { try? CaseMediaStore.write(out, to: landmarksURL) }
        }
        guard (try? CaseMediaStore.writeInfo(info, to: folder)) != nil else { return nil }
        return info
    }
}

/// Two views, the intraoral scan above and the face below: tap the same points on both, in the same order (the tip of
/// the right canine, between the front teeth, the tip of the left canine — or three corners of a bite fork's flag),
/// then Line up: the points give a first fit, ICP on the front teeth refines it, and the gap is shown in colour.
final class IntraoralAlignViewController: UIViewController {
    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    private let face: FaceMesh, skin: TexturedFace?, intraoral: FaceMesh
    private let done: (IntraoralOutcome?) -> Void
    private let topView = SCNView(), bottomView = SCNView()
    private let instructions = UILabel(), result = UILabel()
    private let cancelButton = UIButton(type: .system), undoButton = UIButton(type: .system), alignButton = UIButton(type: .system), saveButton = UIButton(type: .system)
    private let titleText: String
    private var topPoints: [SIMD3<Float>] = [], bottomPoints: [SIMD3<Float>] = []
    private var outcome: IntraoralOutcome?

    init(face: FaceMesh, skin: TexturedFace?, intraoral: FaceMesh, title: String, done: @escaping (IntraoralOutcome?) -> Void) {
        self.face = face; self.skin = skin; self.intraoral = intraoral; self.titleText = title; self.done = done
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.10, green: 0.09, blue: 0.08, alpha: 1)
        for (v, geometry) in [(topView, intraoral.geometry(coloured: false)), (bottomView, skin?.geometry() ?? face.geometry(coloured: true))] {
            v.backgroundColor = view.backgroundColor
            v.allowsCameraControl = true
            v.autoenablesDefaultLighting = true
            v.antialiasingMode = .multisampling4X
            let scene = SCNScene()
            let node = SCNNode(geometry: geometry); node.name = "mesh"
            scene.rootNode.addChildNode(node)
            v.scene = scene
            v.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped(_:))))
            view.addSubview(v)
        }
        // The face view starts on the mouth.
        let camera = SCNNode(); camera.camera = SCNCamera(); camera.camera?.fieldOfView = 35
        camera.position = SCNVector3(0, -18, 190)
        bottomView.scene?.rootNode.addChildNode(camera)
        bottomView.pointOfView = camera
        bottomView.defaultCameraController.target = SCNVector3(0, -18, 0)
        instructions.numberOfLines = 0
        instructions.textColor = .white
        instructions.font = .systemFont(ofSize: 14)
        instructions.textAlignment = .center
        result.numberOfLines = 2
        result.textColor = Self.gold
        result.font = .systemFont(ofSize: 13, weight: .semibold)
        result.textAlignment = .center
        for (b, title, action) in [(cancelButton, "Cancel", #selector(cancel)), (undoButton, "Undo", #selector(undo)), (alignButton, "Line up", #selector(align)), (saveButton, "Save", #selector(save))] {
            b.setTitle(title, for: .normal)
            b.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
            b.tintColor = .white
            b.backgroundColor = UIColor(white: 0.18, alpha: 1)
            b.layer.cornerRadius = 20
            b.addTarget(self, action: action, for: .touchUpInside)
            view.addSubview(b)
        }
        saveButton.backgroundColor = Self.gold
        saveButton.tintColor = UIColor(white: 0.08, alpha: 1)
        [instructions, result].forEach { view.addSubview($0) }
        refresh()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaLayoutGuide.layoutFrame
        let controls: CGFloat = 150, half = (safe.height - controls) / 2
        topView.frame = CGRect(x: safe.minX, y: safe.minY, width: safe.width, height: half)
        bottomView.frame = CGRect(x: safe.minX, y: safe.minY + half, width: safe.width, height: half)
        instructions.frame = CGRect(x: safe.minX + 16, y: safe.maxY - controls + 4, width: safe.width - 32, height: 54)
        result.frame = CGRect(x: safe.minX + 16, y: safe.maxY - controls + 58, width: safe.width - 32, height: 34)
        let w = (min(safe.width, 520) - 16 * 5) / 4, left = safe.midX - min(safe.width, 520) / 2 + 16
        for (n, b) in [cancelButton, undoButton, alignButton, saveButton].enumerated() { b.frame = CGRect(x: left + CGFloat(n) * (w + 16), y: safe.maxY - 50, width: w, height: 40) }
    }

    private func refresh() {
        let needTop = topPoints.count <= bottomPoints.count
        let n = max(topPoints.count, bottomPoints.count)
        let next = ["the tip of the right canine", "the point between the two front teeth", "the tip of the left canine", "another clear point", "another clear point", "another clear point"][min(n, 5)]
        instructions.text = outcome != nil ? "Lined up. Save to keep it, or Undo to place the points again."
            : topPoints.count == bottomPoints.count && n >= 3 ? "Tap Line up, or add another pair of points."
            : "Tap \(next) on the \(needTop ? "intraoral scan (above)" : "\(titleText.lowercased()) face scan (below)"). With a bite fork, use three corners of its flag instead."
        undoButton.isEnabled = n > 0 || outcome != nil
        alignButton.isEnabled = topPoints.count >= 3 && topPoints.count == bottomPoints.count && outcome == nil
        saveButton.isEnabled = outcome != nil
        [undoButton, alignButton, saveButton].forEach { $0.alpha = $0.isEnabled ? 1 : 0.45 }
        for (v, pts) in [(topView, topPoints), (bottomView, bottomPoints)] {
            guard let root = v.scene?.rootNode else { continue }
            root.childNodes.filter { $0.name == "pin" }.forEach { $0.removeFromParentNode() }
            for (i, p) in pts.enumerated() {
                let ball = SCNSphere(radius: 0.9)
                ball.firstMaterial?.diffuse.contents = Self.gold
                ball.firstMaterial?.lightingModel = .constant
                ball.firstMaterial?.readsFromDepthBuffer = false
                let pin = SCNNode(geometry: ball); pin.name = "pin"; pin.simdPosition = p; pin.renderingOrder = 10 + i
                root.addChildNode(pin)
            }
        }
    }

    @objc private func tapped(_ g: UITapGestureRecognizer) {
        guard outcome == nil, let v = g.view as? SCNView else { return }
        let isTop = v === topView
        guard isTop ? topPoints.count <= bottomPoints.count : bottomPoints.count < topPoints.count else { return }
        guard let hit = v.hitTest(g.location(in: v), options: [.searchMode: SCNHitTestSearchMode.closest.rawValue]).first(where: { $0.node.name == "mesh" }) else { return }
        let p = SIMD3<Float>(hit.localCoordinates)
        if isTop { topPoints.append(p) } else { bottomPoints.append(p) }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        refresh()
    }

    @objc private func undo() {
        if outcome != nil {
            outcome = nil
            bottomView.scene?.rootNode.childNode(withName: "intraoral", recursively: false)?.removeFromParentNode()
            result.text = nil
        } else if topPoints.count > bottomPoints.count { topPoints.removeLast() } else if !bottomPoints.isEmpty { bottomPoints.removeLast() }
        refresh()
    }

    @objc private func align() {
        let top = topPoints, bottom = bottomPoints, face = self.face, intraoral = self.intraoral
        result.text = "Lining up…"
        alignButton.isEnabled = false
        DispatchQueue.global(qos: .userInitiated).async {
            let fit = Self.align(intraoral: intraoral, face: face, intraoralPoints: top, facePoints: bottom)
            let moved = intraoral.transformed(fit.transform)
            let colours = FaceAlign.colours(FaceAlign.gaps(base: moved, moving: face))
            let geometry = moved.geometry(coloured: false, override: colours, opacity: 0.85)
            DispatchQueue.main.async {
                self.outcome = IntraoralOutcome(faceFromIntraoral: fit.transform, fitMm: fit.rms, pairs: top.count, refined: fit.refined)
                let node = SCNNode(geometry: geometry); node.name = "intraoral"; node.renderingOrder = 5
                self.bottomView.scene?.rootNode.addChildNode(node)
                self.result.text = String(format: fit.refined ? "Lined up on the front teeth · %.2f mm average gap there" : "Lined up on the points only · %.2f mm between them (refining didn’t converge)", fit.rms)
                    + (fit.rms > 1 ? "\nCheck the points: over 1 mm is more than a phone scan should need." : "")
                self.refresh()
            }
        }
    }

    /// Point pairs give the first fit (Horn); ICP on the front teeth (within 14 mm of the picked points) refines it.
    static func align(intraoral: FaceMesh, face: FaceMesh, intraoralPoints: [SIMD3<Float>], facePoints: [SIMD3<Float>]) -> (transform: simd_float4x4, rms: Float, refined: Bool) {
        let (R, t) = FaceAlign.horn(intraoralPoints, facePoints)
        let start = simd_float4x4(columns: (SIMD4(R.columns.0, 0), SIMD4(R.columns.1, 0), SIMD4(R.columns.2, 0), SIMD4(t, 1)))
        let pairRms = (zip(intraoralPoints, facePoints).map { let q = start * SIMD4<Float>($0.0, 1); return simd_distance_squared(SIMD3(q.x, q.y, q.z), $0.1) }.reduce(0, +) / Float(max(1, facePoints.count))).squareRoot()
        let near = { (p: SIMD3<Float>, pts: [SIMD3<Float>], r: Float) in pts.contains { simd_distance($0, p) < r } }
        var source = intraoral.positions.filter { near($0, intraoralPoints, 14) }
        if source.count > 5000 { let step = source.count / 5000; source = Swift.stride(from: 0, to: source.count, by: step).map { source[$0] } }
        let normals = face.normals()
        let idx = face.positions.indices.filter { near(face.positions[$0], facePoints, 18) }
        let target = idx.map { face.positions[$0] }, targetNormals = idx.map { normals[$0] }
        guard let fit = FaceAlign.icp(source: source, target: target, targetNormals: targetNormals, initial: start, reach: 4), fit.overlap > 0.3 else {
            return (start, pairRms, false)
        }
        return (fit.transform, fit.rms, true)
    }

    @objc private func save() { guard let outcome else { return }; dismiss(animated: true) { self.done(outcome) } }
    @objc private func cancel() { dismiss(animated: true) { self.done(nil) } }
}


/// The ring of short ticks round the face window (Face ID scans): pale where the face hasn't been captured yet, gold
/// where it has, darker and longer where the head is now; all gold when the scan is done. Angles match the scanner's
/// ring (0° the patient's left, 90° above; mirrored on the front camera).
final class TickRingView: UIView {
    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    var faceWindow: CGRect = .zero { didSet { setNeedsDisplay() } }
    var lit = Set<Int>() { didSet { if lit != oldValue { setNeedsDisplay() } } }
    var current: (Float, Bool)? { didSet { setNeedsDisplay() } }
    var mirrored = true { didSet { setNeedsDisplay() } }
    var done = false { didSet { setNeedsDisplay() } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    /// A point on the face shape (θ = 0 at the top, clockwise), a little narrower towards the chin.
    static func eggPoint(_ r: CGRect, _ theta: CGFloat) -> CGPoint {
        let a = r.width / 2, b = r.height / 2
        let narrow = 1 - 0.17 * pow(max(0, -cos(theta)), 1.6)
        return CGPoint(x: r.midX + a * sin(theta) * narrow, y: r.midY - b * cos(theta))
    }
    static func egg(in r: CGRect) -> UIBezierPath {
        let path = UIBezierPath()
        for i in 0...120 { let p = eggPoint(r, CGFloat(i) / 120 * 2 * .pi); if i == 0 { path.move(to: p) } else { path.addLine(to: p) } }
        path.close()
        return path
    }

    override func draw(_ rect: CGRect) {
        guard faceWindow.width > 0 else { return }
        let n = 110, c = CGPoint(x: faceWindow.midX, y: faceWindow.midY)
        for i in 0..<n {
            let theta = CGFloat(i) / CGFloat(n) * 2 * .pi
            let p = Self.eggPoint(faceWindow, theta), q = Self.eggPoint(faceWindow, theta + 0.01), o = Self.eggPoint(faceWindow, theta - 0.01)
            var normal = CGPoint(x: q.y - o.y, y: -(q.x - o.x))
            let len = max(1e-6, hypot(normal.x, normal.y)); normal = CGPoint(x: normal.x / len, y: normal.y / len)
            if (p.x - c.x) * normal.x + (p.y - c.y) * normal.y < 0 { normal = CGPoint(x: -normal.x, y: -normal.y) }
            // This tick's angle on the scanner's ring.
            let screen = atan2(-(p.y - c.y), p.x - c.x) * 180 / .pi
            var ring = mirrored ? 180 - screen : screen
            ring = (ring.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
            let k = Int((ring / 6).rounded()) % 60
            let isLit = done || lit.contains(k)
            var here = false
            if let (deg, _) = current, !done {
                var d = abs(CGFloat(deg) - ring).truncatingRemainder(dividingBy: 360); if d > 180 { d = 360 - d }
                here = d < 8
            }
            let inner: CGFloat = 9, outer: CGFloat = here ? 26 : 19
            let path = UIBezierPath()
            path.move(to: CGPoint(x: p.x + normal.x * inner, y: p.y + normal.y * inner))
            path.addLine(to: CGPoint(x: p.x + normal.x * outer, y: p.y + normal.y * outer))
            path.lineWidth = here ? 3.2 : 2.4
            path.lineCapStyle = .round
            (here ? Self.gold.withAlphaComponent(1) : isLit ? Self.gold : UIColor(white: 1, alpha: 0.32)).setStroke()
            path.stroke()
        }
    }
}
