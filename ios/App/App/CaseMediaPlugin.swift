import Foundation
import UIKit
import AVFoundation
import ARKit
import SceneKit
import Metal
import Vision
import Capacitor

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
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeCase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeAll", returnType: CAPPluginReturnPromise)
    ]

    private var open = false
    private let work = DispatchQueue(label: "uk.co.drvik.smilecompose.casemedia", qos: .userInitiated)

    /// The record as the web layer reads it: its info, plus its folder's URL through the bridge.
    private func publish(_ folder: URL, _ info: [String: Any]) -> [String: Any] {
        var out = info
        out["base"] = bridge?.portablePath(fromLocalURL: folder)?.absoluteString ?? ""
        return out
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
        guard LidarScanner.available else { call.reject("This needs the LiDAR scanner.", "unsupported"); return }
        guard let caseId = call.getString("caseId"), CaseMediaStore.caseFolder(caseId) != nil else { call.reject("No case was given."); return }
        let captures = (call.getArray("captures") as? [[String: Any]] ?? []).compactMap(FaceCaptureSpec.init(json:))
        guard !captures.isEmpty else { call.reject("No scans were given."); return }
        DispatchQueue.main.async {
            guard !self.open, let presenter = self.bridge?.viewController else { call.reject("The camera is already open."); return }
            self.open = true
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    guard granted else { self.open = false; call.reject("Camera access is turned off.", "camera_denied"); return }
                    let scanner = FaceScanViewController(captures: captures) { scans in
                        guard !scans.isEmpty else { self.open = false; call.resolve(["cancelled": true]); return }
                        self.work.async {
                            let saved = try? FaceScanStore.save(scans, caseId: caseId)
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
        call.resolve(["available": LidarScanner.available])
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
                        add(capture["preview"], "face-scan-\(label).jpg")
                    }
                    add(info["landmarks"], "landmarks.json")
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
                    entries.append(.init(title: "\(when) · \(capture["title"] as? String ?? "Scan")", url: url))
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

    @objc func remove(_ call: CAPPluginCall) {
        if let caseId = call.getString("caseId"), let id = call.getString("id"), let folder = CaseMediaStore.recordFolder(caseId, id) {
            try? FileManager.default.removeItem(at: folder)
        }
        call.resolve()
    }

    @objc func removeCase(_ call: CAPPluginCall) {
        if let caseId = call.getString("caseId"), let folder = CaseMediaStore.caseFolder(caseId) { try? FileManager.default.removeItem(at: folder) }
        call.resolve()
    }

    @objc func removeAll(_ call: CAPPluginCall) {
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
        return items.compactMap { url in readInfo(url).map { (url, $0) } }
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

/// Scans are always made with the rear LiDAR scanner, which measures distance directly, point by point.
enum LidarScanner {
    static var available: Bool { ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) }
}

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
    let mesh: FaceMesh
    let preview: UIImage?
    /// The centre of each eye, in the mesh's millimetres.
    let eyes: (left: SIMD3<Float>, right: SIMD3<Float>)?
    /// How far round each side (the patient's right, then left) and how far above and below were seen, in degrees.
    let turned: (right: Float, left: Float)
    let tilted: (up: Float, down: Float)
    /// The share of the face seen closely enough, 0–1.
    let coverage: Float
}

enum FaceScanStore {
    static func save(_ scans: [FaceScanResult], caseId: String) throws -> (URL, [String: Any]) {
        let (id, folder) = try CaseMediaStore.newRecord(caseId, kind: "scan")
        do {
            var captures: [[String: Any]] = [], landmarks: [String: Any] = [:]
            for scan in scans {
                let mesh = "\(scan.id).ply", preview = "\(scan.id).jpg"
                try CaseMediaStore.write(scan.mesh.ply(comment: "\(scan.title), LiDAR scanner"), to: folder.appendingPathComponent(mesh))
                var hasPreview = false
                if let data = scan.preview?.jpegData(compressionQuality: 0.88) {
                    try CaseMediaStore.write(data, to: folder.appendingPathComponent(preview))
                    hasPreview = true
                }
                captures.append([
                    "id": scan.id, "title": scan.title, "mesh": mesh, "preview": hasPreview ? preview : "",
                    "vertices": scan.mesh.positions.count, "triangles": scan.mesh.triangles.count / 3,
                    "turned": [Double(scan.turned.right), Double(scan.turned.left)],
                    "tilted": [Double(scan.tilted.up), Double(scan.tilted.down)],
                    "coverage": (Double(scan.coverage) * 100).rounded() / 100,
                    "sensor": "lidar"
                ])
                var entry: [String: Any] = [
                    "title": scan.title, "sensor": "lidar", "faceCoverage": (Double(scan.coverage) * 100).rounded() / 100,
                    "seenDegrees": ["patientRight": Double(scan.turned.right.rounded()), "patientLeft": Double(scan.turned.left.rounded()),
                                    "above": Double(scan.tilted.up.rounded()), "below": Double(scan.tilted.down.rounded())]
                ]
                if let eyes = scan.eyes { entry["eyeCentres"] = ["left": mm(eyes.left), "right": mm(eyes.right)] }
                landmarks[scan.id] = entry
            }
            let file: [String: Any] = [
                "units": "mm",
                "axes": "origin at the centre of the head; x towards the patient's left, y up (true vertical), z out through the face",
                "facialMidline": "the plane x = 0",
                "scans": landmarks
            ]
            try CaseMediaStore.write(try JSONSerialization.data(withJSONObject: file, options: [.prettyPrinted, .sortedKeys]), to: folder.appendingPathComponent("landmarks.json"))
            let info: [String: Any] = [
                "kind": "scan", "id": id, "createdAt": CaseMediaStore.iso.string(from: Date()),
                "poster": captures.first(where: { ($0["preview"] as? String ?? "") != "" })?["preview"] as? String ?? "",
                "captures": captures, "landmarks": "landmarks.json"
            ]
            try CaseMediaStore.writeInfo(info, to: folder)
            return (folder, info)
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
    }

    private static func mm(_ p: SIMD3<Float>) -> [Double] { [p.x, p.y, p.z].map { (Double($0) * 10).rounded() / 10 } }
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
    static let voxel: Float = 0.0016
    static let lo = SIMD3<Float>(-0.14, -0.18, -0.15), hi = SIMD3<Float>(0.14, 0.16, 0.17)
    static let trunc: Float = 0.0055
    let nx = Int(((FaceVolume.hi.x - FaceVolume.lo.x) / FaceVolume.voxel).rounded())
    let ny = Int(((FaceVolume.hi.y - FaceVolume.lo.y) / FaceVolume.voxel).rounded())
    let nz = Int(((FaceVolume.hi.z - FaceVolume.lo.z) / FaceVolume.voxel).rounded())
    private let dist, weight: UnsafeMutablePointer<Float16>
    private let rgb: UnsafeMutablePointer<UInt8>
    private(set) var frames = 0

    struct Frame {
        /// Depth in metres (DepthFloat32), and for LiDAR its confidence (0 low, 1 medium, 2 high).
        let depth: CVPixelBuffer
        var confidence: CVPixelBuffer? = nil
        /// The camera image (420f), for colour.
        let image: CVPixelBuffer
        let depthK, imageK: simd_float3x3
        let cameraToHead: simd_float4x4
        let cameraInHead: SIMD3<Float>
        /// Every nth depth pixel.
        var stride = 1
        var nearest: Float = 0.15, farthest: Float = 0.9
    }

    init() {
        let n = nx * ny * nz
        dist = .allocate(capacity: n); dist.initialize(repeating: 1, count: n)
        weight = .allocate(capacity: n); weight.initialize(repeating: 0, count: n)
        rgb = .allocate(capacity: n * 3); rgb.initialize(repeating: 0, count: n * 3)
    }
    deinit { dist.deallocate(); weight.deallocate(); rgb.deallocate() }

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
        guard fx > 0, fy > 0, dw > 4, dh > 4 else { return }
        let m = f.cameraToHead
        let c0 = SIMD3(m.columns.0.x, m.columns.0.y, m.columns.0.z), c1 = SIMD3(m.columns.1.x, m.columns.1.y, m.columns.1.z)
        let c2 = SIMD3(m.columns.2.x, m.columns.2.y, m.columns.2.z), c3 = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
        let cam = f.cameraInHead
        let sx = ifx / fx, sy = ify / fy, ox = icx - cx * sx, oy = icy - cy * sy
        let lo = Self.lo, v = Self.voxel, inv = 1 / Self.voxel, trunc = Self.trunc, steps = Int((trunc / v).rounded(.up))
        let nx = self.nx, ny = self.ny, nz = self.nz, plane = nx * ny
        let st = max(1, f.stride), edge = 0.012 as Float
        var vv = st
        while vv < dh - st {
            let row = vv * dStride
            var uu = st
            while uu < dw - st {
                defer { uu += st }
                let z = d[row + uu]
                guard z > f.nearest, z < f.farthest else { continue }
                // Points on an edge (between the face and what's behind it) are unreliable.
                guard abs(d[row + uu - st] - z) < edge, abs(d[row + uu + st] - z) < edge,
                      abs(d[row - st * dStride + uu] - z) < edge, abs(d[row + st * dStride + uu] - z) < edge else { continue }
                var w: Float = 1
                if let conf { let k = conf[vv * confRow + uu]; if k == 0 { continue }; w = k >= 2 ? 1 : 0.4 }
                let xn = (Float(uu) - cx) / fx, yn = (Float(vv) - cy) / fy
                let p = c0 * (xn * z) - c1 * (yn * z) - c2 * z + c3
                guard p.x > lo.x, p.x < Self.hi.x, p.y > lo.y, p.y < Self.hi.y, p.z > lo.z, p.z < Self.hi.z else { continue }
                let ray = simd_normalize(p - cam)
                // Colour from the camera image at the same point.
                let iu = Int(Float(uu) * sx + ox), iv = Int(Float(vv) * sy + oy)
                guard iu >= 0, iu < iw, iv >= 0, iv < ih else { continue }
                let luma = Float(yp[iv * yRow + iu]), chroma = (iv / 2) * cRow + (iu / 2) * 2
                let cb = Float(cp[chroma]) - 128, cr = Float(cp[chroma + 1]) - 128
                let colour = SIMD3<Float>(luma + 1.402 * cr, luma - 0.344136 * cb - 0.714136 * cr, luma + 1.772 * cb)
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
                    weight[idx] = Float16(min(nw, 200))
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
            let p = (Self.lo + (SIMD3<Float>(Float(i), Float(j), Float(l)) + local) * Self.voxel) * 1000
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
/// round to the left, brow to chin), each counted once a view has faced it within 35°. The scan isn't finished
/// until nearly all of them have been seen, as well as the four directions.
struct FaceCoverage {
    static let azimuths = Array(stride(from: -80, through: 80, by: 10)).map(Float.init)
    static let elevations = Array(stride(from: -30, through: 40, by: 10)).map(Float.init)
    private(set) var seen = Set<Int>()
    static var total: Int { azimuths.count * elevations.count }

    /// `azimuth` and `elevation` of the camera as seen from the head, in degrees.
    mutating func add(azimuth: Float, elevation: Float) {
        let view = Self.direction(azimuth, elevation)
        for (a, az) in Self.azimuths.enumerated() { for (e, el) in Self.elevations.enumerated() {
            if simd_dot(view, Self.direction(az, el)) > cosf(35 * .pi / 180) { seen.insert(e * Self.azimuths.count + a) }
        } }
    }
    var fraction: Float { Float(seen.count) / Float(Self.total) }
    /// Seen share of one side: negative azimuths are the patient's right.
    func fraction(right: Bool) -> Float {
        let cols = Self.azimuths.indices.filter { right ? Self.azimuths[$0] < 0 : Self.azimuths[$0] > 0 }
        let all = cols.count * Self.elevations.count
        let got = seen.filter { cols.contains($0 % Self.azimuths.count) }.count
        return Float(got) / Float(max(1, all))
    }
    static func direction(_ az: Float, _ el: Float) -> SIMD3<Float> {
        let a = az * .pi / 180, e = el * .pi / 180
        return SIMD3(sinf(a) * cosf(e), sinf(e), cosf(a) * cosf(e))
    }
}

/// Lines one scan up on another (rigid only): iterative closest points on the forehead, eyes, nose and cheekbones,
/// which change little with expression, then measures how far apart the surfaces are.
enum FaceAlign {
    struct Result { let transform: simd_float4x4; let rms: Float; let overlap: Float }

    private static func stable(_ m: FaceMesh, limit: Int) -> [Int] {
        let idx = m.positions.indices.filter { let p = m.positions[$0]; return p.y > -15 && p.y < 95 && p.z > 20 && abs(p.x) < 70 }
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

    static func align(base: FaceMesh, moving: FaceMesh) -> Result? {
        let ti = stable(base, limit: 14000), baseNormals = base.normals()
        let target = ti.map { base.positions[$0] }, targetNormals = ti.map { baseNormals[$0] }
        let source = stable(moving, limit: 5000).map { moving.positions[$0] }
        guard target.count > 400, source.count > 400 else { return nil }
        let grid = Grid(target, cell: 12)
        // Point-to-plane: each step solves for the small turn and shift that bring the moving points onto the
        // base's surface (not just its nearest points), so it doesn't slide along smooth areas.
        var M = matrix_identity_float4x4
        var last: [Float] = []
        for it in 0..<40 {
            let maxD: Float = it < 15 ? 12 - Float(it) * 0.6 : 3
            var rows: [(SIMD3<Float>, SIMD3<Float>, SIMD3<Float>, Float)] = []
            rows.reserveCapacity(source.count)
            for s in source {
                let p4 = M * SIMD4<Float>(s, 1), p = SIMD3(p4.x, p4.y, p4.z)
                guard let (j, _) = grid.nearest(p, within: maxD) else { continue }
                let n = targetNormals[j]
                rows.append((p, target[j], n, simd_dot(p - target[j], n)))
            }
            guard rows.count > 200 else { return nil }
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
    private static func solve(_ A0: [[Double]], _ b0: [Double]) -> [Double]? {
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

/// The face scan, always with the rear LiDAR scanner: the patient keeps still and the clinician moves the phone
/// round them, to the patient's right, to their left, above and below. A cross under the face fills as each
/// direction is reached, and "Face mapped" counts the share of the face seen closely enough; the scan finishes
/// only when both are complete. Prompts are spoken for when the screen is out of view. Closing keeps the scans
/// already made.
final class FaceScanViewController: UIViewController, ARSessionDelegate {
    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    /// The share of the face that must be seen before a scan can finish by itself.
    static let mappedTarget: Float = 0.92
    private let captures: [FaceCaptureSpec]
    private let completion: ([FaceScanResult]) -> Void
    private var index = 0
    private var results: [FaceScanResult] = []

    private enum Phase { case ready, locking, scanning, building }
    private enum Goal { case right, left, up, down, centre }
    private var phase = Phase.ready
    private var finished = false
    private var volume: FaceVolume?
    private let fuseQueue = DispatchQueue(label: "uk.co.drvik.smilecompose.facescan", qos: .userInitiated)
    private var fusing = false
    /// 5° steps reached round the sides (negative: the patient's right) and above and below (positive: above).
    private var yawBins = Set<Int>(), pitchBins = Set<Int>()
    private var reach = (right: Float(0), left: Float(0), up: Float(0), down: Float(0))
    private var coverage = FaceCoverage()
    /// The head's frame in the world, fixed when the scan starts, and the eyes found then (head frame, metres).
    private var headToWorld: simd_float4x4?
    private var lidarEyes: (left: SIMD3<Float>, right: SIMD3<Float>)?
    private var noseTip: SIMD3<Float>?
    private var voiceOn = true
    private let voice = AVSpeechSynthesizer()
    private var lastSpoken: (text: String, at: CFTimeInterval) = ("", 0)

    private let sceneView = ARSCNView()
    private let closeButton = UIButton(type: .system)
    private let voiceButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let stepLabel = UILabel()
    private let sensorLabel = UILabel()
    private let dots = UIStackView()
    private let meter = CrossMeterView()
    private let mapped = UILabel()
    private let reticle = UIView()
    private let bar = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    private let prompt = UILabel()
    private let detail = UILabel()
    private let startButton = UIButton(type: .system)
    private let finishButton = UIButton(type: .system)
    private let skipButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .large)
    private let topFade = CAGradientLayer(), bottomFade = CAGradientLayer()

    init(captures: [FaceCaptureSpec], completion: @escaping ([FaceScanResult]) -> Void) {
        self.captures = captures
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }
    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        sceneView.session.delegate = self
        sceneView.automaticallyUpdatesLighting = false
        sceneView.scene = SCNScene()
        view.addSubview(sceneView)
        for (fade, top) in [(topFade, true), (bottomFade, false)] {
            fade.colors = top ? [UIColor(white: 0, alpha: 0.55).cgColor, UIColor.clear.cgColor] : [UIColor.clear.cgColor, UIColor(white: 0, alpha: 0.65).cgColor]
            view.layer.addSublayer(fade)
        }
        reticle.layer.borderColor = Self.gold.cgColor
        reticle.layer.borderWidth = 2.5
        reticle.isUserInteractionEnabled = false
        reticle.isHidden = true
        view.addSubview(reticle)

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
        mapped.backgroundColor = UIColor(white: 0.08, alpha: 0.55)
        mapped.layer.cornerRadius = 13
        mapped.clipsToBounds = true
        [titleLabel, stepLabel, sensorLabel, dots, meter, mapped].forEach { view.addSubview($0) }

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
        [prompt, detail].forEach { bar.contentView.addSubview($0) }
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
        round(voiceButton, "speaker.wave.2.fill", "Spoken prompts on")
        closeButton.addTarget(self, action: #selector(close), for: .touchUpInside)
        voiceButton.addTarget(self, action: #selector(toggleVoice), for: .touchUpInside)

        startButton.setTitle("Start scan", for: .normal)
        startButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        startButton.setTitleColor(UIColor(white: 0.08, alpha: 1), for: .normal)
        startButton.backgroundColor = Self.gold
        startButton.layer.cornerRadius = 27
        startButton.addTarget(self, action: #selector(start), for: .touchUpInside)
        finishButton.setTitle("Finish", for: .normal)
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
        show(0)
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        runSession()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
    }

    private func runSession() {
        let c = ARWorldTrackingConfiguration()
        c.worldAlignment = .gravity
        c.isLightEstimationEnabled = false
        c.frameSemantics = ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) ? [.smoothedSceneDepth] : [.sceneDepth]
        sceneView.session.run(c, options: [.resetTracking, .removeExistingAnchors])
        sensorLabel.text = "LiDAR scanner · rear camera"
        reticle.isHidden = true
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
        voiceButton.frame = CGRect(x: safe.maxX - 60, y: safe.minY + 8, width: 44, height: 44)
        titleLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 8, width: safe.width - 190, height: 24)
        titleLabel.center.x = safe.midX
        stepLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 32, width: safe.width - 140, height: 16)
        let dotsWidth = min(CGFloat(captures.count) * 22, safe.width - 140)
        dots.frame = CGRect(x: safe.midX - dotsWidth / 2, y: safe.minY + 54, width: dotsWidth, height: 3)
        sensorLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 62, width: safe.width - 140, height: 15)
        startButton.frame = CGRect(x: safe.midX - 110, y: safe.maxY - 74, width: 220, height: 54)
        finishButton.frame = CGRect(x: safe.maxX - 124, y: safe.maxY - 69, width: 104, height: 44)
        skipButton.frame = CGRect(x: safe.minX + 20, y: safe.maxY - 69, width: 70, height: 44)
        spinner.center = CGPoint(x: safe.midX, y: safe.maxY - 47)
        let barWidth = min(safe.width - 32, 520)
        bar.frame = CGRect(x: safe.midX - barWidth / 2, y: safe.maxY - 170, width: barWidth, height: 82)
        prompt.frame = CGRect(x: 16, y: 12, width: barWidth - 32, height: 28)
        detail.frame = CGRect(x: 16, y: 40, width: barWidth - 32, height: 34)
        meter.frame = CGRect(x: safe.midX - 110, y: bar.frame.minY - 150, width: 220, height: 136)
        mapped.frame = CGRect(x: safe.midX - 75, y: meter.frame.minY - 34, width: 150, height: 26)
        view.keepClearOfCamera([closeButton, voiceButton, startButton, finishButton, skipButton])
    }

    // MARK: Steps

    private var capture: FaceCaptureSpec { captures[index] }

    private func resetCapture() {
        volume = nil
        yawBins = []; pitchBins = []
        reach = (0, 0, 0, 0)
        coverage = FaceCoverage()
        headToWorld = nil
        lidarEyes = nil
        lastSpoken = ("", 0)
    }

    private func show(_ i: Int) {
        index = i
        phase = .ready
        resetCapture()
        stepLabel.text = "\(capture.title) · \(i + 1) of \(captures.count)"
        for (n, d) in dots.arrangedSubviews.enumerated() { d.backgroundColor = n < i ? Self.gold : n == i ? .white : UIColor(white: 1, alpha: 0.25) }
        meter.turn = capture.turn
        meter.tilt = capture.tilt
        meter.yawBins = []; meter.pitchBins = []; meter.current = (0, 0)
        prompt.text = capture.hint
        detail.text = readyDetail
        updateControls()
    }

    private let readyDetail = "The patient keeps still. Hold the phone 30–50 cm away, level with the face, then move round them as prompted."


    private func updateControls() {
        startButton.isHidden = phase != .ready
        finishButton.isHidden = phase != .scanning
        skipButton.isHidden = phase == .building || phase == .locking
        if phase == .building || phase == .locking { spinner.startAnimating() } else { spinner.stopAnimating() }
        finishButton.isEnabled = reach.right >= 20 && reach.left >= 20
        finishButton.alpha = finishButton.isEnabled ? 1 : 0.5
        mapped.text = "Face mapped \(Int((coverage.fraction * 100).rounded()))%"
        mapped.textColor = coverage.fraction >= Self.mappedTarget ? Self.gold : .white
        mapped.isHidden = phase == .ready
    }

    @objc private func start() {
        resetCapture()
        volume = FaceVolume()
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
        fuseQueue.async {
            let eyes = Self.pupils(frame, orientation: orientation)
            let head = Self.headFrame(nose: nose, camera: frame.camera.transform, eyes: eyes)
            DispatchQueue.main.async {
                guard !self.finished, self.phase == .locking else { return }
                self.headToWorld = head
                if let eyes {
                    let inv = head.inverse
                    let a = inv * SIMD4<Float>(eyes.0, 1), b = inv * SIMD4<Float>(eyes.1, 1)
                    let pa = SIMD3(a.x, a.y, a.z), pb = SIMD3(b.x, b.y, b.z)
                    self.lidarEyes = pa.x > pb.x ? (pa, pb) : (pb, pa)
                }
                self.phase = .scanning
                self.reticle.isHidden = true
                self.updateControls()
            }
        }
    }

    @objc private func finishTapped() { build() }
    @objc private func skip() { advance() }
    @objc private func close() { finish() }

    @objc private func toggleVoice() {
        voiceOn.toggle()
        if !voiceOn { voice.stopSpeaking(at: .immediate) }
        voiceButton.setImage(UIImage(systemName: voiceOn ? "speaker.wave.2.fill" : "speaker.slash.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)), for: .normal)
        voiceButton.accessibilityLabel = voiceOn ? "Spoken prompts on" : "Spoken prompts off"
    }

    private func advance() {
        if index + 1 < captures.count { show(index + 1) } else { finish() }
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        voice.stopSpeaking(at: .immediate)
        sceneView.session.pause()
        let scans = results
        dismiss(animated: true) { self.completion(scans) }
    }

    /// The finished capture becomes a mesh and its preview, then the next.
    private func build() {
        guard phase == .scanning, let volume else { return }
        phase = .building
        updateControls()
        say("Done. You can relax", force: true)
        detail.text = "Building the 3D face…"
        let capture = self.capture, reach = self.reach, coverage = self.coverage.fraction
        let eyes = lidarEyes.map { (left: $0.left * 1000, right: $0.right * 1000) }
        let waitForFusion = fuseQueue
        waitForFusion.async {
            let mesh = volume.mesh()
            DispatchQueue.main.async {
                guard !self.finished else { return }
                self.volume = nil
                guard let mesh else {
                    self.phase = .ready
                    self.updateControls()
                    self.prompt.text = "That scan didn’t work"
                    self.detail.text = "Try again, moving a little more slowly."
                    return
                }
                self.results.append(FaceScanResult(id: capture.id, title: capture.title, mesh: mesh, preview: mesh.preview(), eyes: eyes,
                                                   turned: (reach.right, reach.left), tilted: (reach.up, reach.down), coverage: coverage))
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                self.advance()
            }
        }
    }

    private func say(_ text: String, force: Bool = false) {
        if prompt.text != text { UIView.transition(with: prompt, duration: 0.18, options: .transitionCrossDissolve) { self.prompt.text = text } }
        let now = CACurrentMediaTime()
        guard voiceOn, force || ((text != lastSpoken.text || now - lastSpoken.at > 6) && now - lastSpoken.at > 1.6) else { return }
        lastSpoken = (text, now)
        voice.stopSpeaking(at: .word)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-GB")
        voice.speak(utterance)
    }

    // MARK: Tracking

    func session(_ session: ARSession, didFailWithError error: Error) {
        DispatchQueue.main.async {
            self.prompt.text = "The camera stopped"
            self.detail.text = (error as? ARError)?.code == .cameraUnauthorized ? "Camera access is turned off. Turn it on in Settings › SmileCompose." : "Close the scan and try again."
        }
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard !finished, phase != .building, phase != .locking else { return }
        lidarFrame(frame)
    }

    private func lidarFrame(_ frame: ARFrame) {
        guard let depth = frame.smoothedSceneDepth ?? frame.sceneDepth else { return }
        if case .normal = frame.camera.trackingState {} else {
            if phase == .scanning { say("Move the phone more slowly") } else { detail.text = "Move the phone gently so it can find its place." }
            return
        }
        let depthK = Self.scaled(frame.camera.intrinsics, from: frame.camera.imageResolution, to: CGSize(width: CVPixelBufferGetWidth(depth.depthMap), height: CVPixelBufferGetHeight(depth.depthMap)))
        if phase == .ready {
            noseTip = Self.findNose(depth, depthK: depthK, camera: frame.camera.transform)
            if let nose = noseTip {
                let p = sceneView.projectPoint(SCNVector3(nose.x, nose.y, nose.z))
                reticle.isHidden = false
                let size: CGFloat = 96
                reticle.frame = CGRect(x: CGFloat(p.x) - size / 2, y: CGFloat(p.y) - size / 2, width: size, height: size)
                reticle.layer.cornerRadius = size / 2
                let d = simd_distance(nose, SIMD3(frame.camera.transform.columns.3.x, frame.camera.transform.columns.3.y, frame.camera.transform.columns.3.z))
                detail.text = d > 0.65 ? "Come a little closer: 30–50 cm from the face." : d < 0.25 ? "Move back a little: 30–50 cm from the face." : readyDetail
            } else {
                reticle.isHidden = true
                detail.text = "Point the phone at the patient’s face, 30–50 cm away."
            }
            return
        }
        guard phase == .scanning, let headToWorld, let volume else { return }
        let cameraToHead = headToWorld.inverse * frame.camera.transform
        let cam = SIMD3(cameraToHead.columns.3.x, cameraToHead.columns.3.y, cameraToHead.columns.3.z)
        guard let view = viewing(cam) else { return }
        guard !fusing else { return }
        let item = FaceVolume.Frame(depth: depth.depthMap, confidence: depth.confidenceMap, image: frame.capturedImage, depthK: depthK,
                                    imageK: frame.camera.intrinsics, cameraToHead: cameraToHead, cameraInHead: cam, stride: 1, nearest: 0.2, farthest: 1.0)
        integrate(item, into: volume, view: view)
    }

    private struct Viewing { let azimuth, elevation: Float }

    /// Where the camera is seen from the head; prompts for distance and the next direction. Nil while something
    /// needs putting right (then nothing is added to the scan).
    private func viewing(_ cam: SIMD3<Float>) -> Viewing? {
        let azimuth = atan2f(cam.x, cam.z) * 180 / .pi
        let elevation = atan2f(cam.y, (cam.x * cam.x + cam.z * cam.z).squareRoot()) * 180 / .pi
        let distance = simd_length(cam)
        meter.current = (azimuth, elevation)
        var problem: String?
        if distance > 0.75 { problem = "Bring the phone closer" }
        else if distance < 0.22 { problem = "Move the phone back a little" }
        else if abs(azimuth) > capture.turn + 18 { problem = "That’s far enough: come back a little" }
        else if elevation > capture.tilt + 15 { problem = "Lower the phone a little" }
        else if elevation < -capture.tilt - 15 { problem = "Raise the phone a little" }
        guard phase == .scanning else {
            detail.text = problem ?? readyDetail
            return nil
        }
        say(problem ?? promptText(goal(azimuth, elevation)))
        if problem == nil, goal(azimuth, elevation) == .centre { detail.text = "Nearly there." }
        else if problem == nil { detail.text = "Move slowly; the patient keeps still and holds the expression." }
        return problem == nil ? Viewing(azimuth: azimuth, elevation: elevation) : nil
    }

    private func integrate(_ item: FaceVolume.Frame, into volume: FaceVolume, view: Viewing) {
        fusing = true
        fuseQueue.async {
            volume.integrate(item)
            DispatchQueue.main.async {
                self.fusing = false
                guard self.volume === volume, self.phase == .scanning else { return }
                self.record(view)
            }
        }
    }

    /// What this view adds to the cross and to the face mapped.
    private func record(_ v: Viewing) {
        if abs(v.elevation) < 15 { yawBins.insert(Int((v.azimuth / 5).rounded(.down))) }
        if abs(v.azimuth) < 15 { pitchBins.insert(Int((v.elevation / 5).rounded(.down))) }
        if abs(v.elevation) < 20 { if v.azimuth < 0 { reach.right = max(reach.right, -v.azimuth) } else { reach.left = max(reach.left, v.azimuth) } }
        if abs(v.azimuth) < 20 { if v.elevation > 0 { reach.up = max(reach.up, v.elevation) } else { reach.down = max(reach.down, -v.elevation) } }
        coverage.add(azimuth: v.azimuth, elevation: v.elevation)
        meter.yawBins = yawBins
        meter.pitchBins = pitchBins
        updateControls()
        if goal(v.azimuth, v.elevation) == .centre, coverage.fraction >= Self.mappedTarget, abs(v.azimuth) < 10, abs(v.elevation) < 10 { build() }
    }

    private func sideDone(right: Bool) -> Bool {
        let steps = max(1, Int(capture.turn / 5))
        let bins = right ? Array((-steps)...(-1)) : Array(0...(steps - 1))
        let seen = bins.filter { yawBins.contains($0) }.count
        return (right ? reach.right : reach.left) >= capture.turn - 5 && Float(seen) >= Float(bins.count) * 0.85
    }

    private func tiltDone(up: Bool) -> Bool {
        let steps = max(1, Int(capture.tilt / 5))
        let bins = up ? Array(0...(steps - 1)) : Array((-steps)...(-1))
        let seen = bins.filter { pitchBins.contains($0) }.count
        return (up ? reach.up : reach.down) >= capture.tilt - 4 && Float(seen) >= Float(bins.count) * 0.8
    }

    private func goal(_ azimuth: Float, _ elevation: Float) -> Goal {
        if !sideDone(right: true) { return .right }
        if !sideDone(right: false) { return .left }
        if !tiltDone(up: true) { return .up }
        if !tiltDone(up: false) { return .down }
        // Any part of the face still missing: back round to the side with the most left to see.
        if coverage.fraction < Self.mappedTarget { return coverage.fraction(right: true) < coverage.fraction(right: false) ? .right : .left }
        return .centre
    }

    private func promptText(_ g: Goal) -> String {
        switch g {
        case .right: return "Move round to the patient’s right"
        case .left: return "Now round to the patient’s left"
        case .up: return "Raise the phone, looking down at the face"
        case .down: return "Now lower it, looking up under the chin"
        case .centre: return "Back to the front of the face"
        }
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
        var x: SIMD3<Float>?
        if let (a, b) = eyes {
            var e = b - a
            if simd_dot(e, camRight) < 0 { e = -e }   // the patient's left eye is on the camera's right
            e.y = 0
            if simd_length(e) > 0.03 { x = simd_normalize(e) }
        }
        if x == nil {
            var f = camPos - nose; f.y = 0
            x = simd_normalize(simd_cross(up, simd_normalize(f)))
        }
        let z = simd_normalize(simd_cross(x!, up))
        let origin = nose - z * 0.10
        return simd_float4x4(columns: (SIMD4(x!, 0), SIMD4(up, 0), SIMD4(z, 0), SIMD4(origin, 1)))
    }

}

/// The cross under the face: segments round the sides (the patient's right on the left) and above and below,
/// gold once reached, with a dot where the camera is now.
final class CrossMeterView: UIView {
    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    var turn: Float = 60 { didSet { setNeedsDisplay() } }
    var tilt: Float = 20 { didSet { setNeedsDisplay() } }
    var yawBins = Set<Int>() { didSet { setNeedsDisplay() } }
    var pitchBins = Set<Int>() { didSet { setNeedsDisplay() } }
    var current: (Float, Float) = (0, 0) { didSet { if abs(current.0 - oldValue.0) + abs(current.1 - oldValue.1) > 0.5 { setNeedsDisplay() } } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func draw(_ rect: CGRect) {
        let mid = CGPoint(x: bounds.midX, y: bounds.midY), thick: CGFloat = 6, gap: CGFloat = 2.5
        let ys = max(1, Int(turn / 5)), ps = max(1, Int(tilt / 5))
        let halfW = bounds.width / 2 - 8, halfH = bounds.height / 2 - 8
        let sw = (halfW - gap * CGFloat(ys)) / CGFloat(ys), sh = (halfH - gap * CGFloat(ps)) / CGFloat(ps)
        for k in -ys..<ys {
            let x = k < 0 ? mid.x + CGFloat(k) * (sw + gap) : mid.x + gap / 2 + CGFloat(k) * (sw + gap)
            (yawBins.contains(k) ? Self.gold : UIColor(white: 1, alpha: 0.3)).setFill()
            UIBezierPath(roundedRect: CGRect(x: x, y: mid.y - thick / 2, width: sw, height: thick), cornerRadius: thick / 2).fill()
        }
        for k in -ps..<ps {
            // Positive bins (above) are drawn upwards.
            let y = k >= 0 ? mid.y - gap / 2 - CGFloat(k + 1) * (sh + gap) + gap : mid.y + gap / 2 + CGFloat(-k - 1) * (sh + gap)
            (pitchBins.contains(k) ? Self.gold : UIColor(white: 1, alpha: 0.3)).setFill()
            UIBezierPath(roundedRect: CGRect(x: mid.x - thick / 2, y: y, width: thick, height: sh), cornerRadius: thick / 2).fill()
        }
        let x = mid.x + CGFloat(max(-turn, min(turn, current.0)) / turn) * halfW
        let y = mid.y - CGFloat(max(-tilt, min(tilt, current.1)) / tilt) * halfH
        UIColor.white.setFill()
        UIBezierPath(ovalIn: CGRect(x: x - 7, y: y - 7, width: 14, height: 14)).fill()
        Self.gold.setStroke()
        let ring = UIBezierPath(ovalIn: CGRect(x: x - 7, y: y - 7, width: 14, height: 14)); ring.lineWidth = 2; ring.stroke()
    }
}

/// The case's face scans in 3D. View: one scan at a time, in the camera's colours or as the bare shape. Compare:
/// one scan laid over another (any two, from any visit), lined up automatically on the forehead, eyes, nose and
/// cheekbones, either see-through or as a colour map of how far apart the surfaces are. Drag to turn, pinch to zoom.
final class FaceScanViewerViewController: UIViewController {
    struct Entry { let title: String; let url: URL }
    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    private let entries: [Entry]
    private let onClose: () -> Void
    private let sceneView = SCNView()
    private let closeButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let mode = UISegmentedControl(items: ["View", "Compare"])
    private let baseButton = UIButton(type: .system)
    private let overButton = UIButton(type: .system)
    private let look = UISegmentedControl(items: ["Colour", "Shape"])
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
        (comparing ? compareLook : look).frame = CGRect(x: safe.midX - 110, y: y, width: 220, height: 34)
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
                nodes = [("base", a.geometry(coloured: !shape))]
                if comparing { text = "Choose a different scan to lay over it." }
            }
            DispatchQueue.main.async {
                guard ticket == self.job else { return }
                self.spinner.stopAnimating()
                self.info.text = text
                self.show(nodes)
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

