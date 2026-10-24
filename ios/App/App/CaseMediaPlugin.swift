import Foundation
import UIKit
import AVFoundation
import ARKit
import SceneKit
import Metal
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
        guard ARFaceTrackingConfiguration.isSupported else { call.reject("This needs the TrueDepth camera.", "unsupported"); return }
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
        call.resolve(["available": ARFaceTrackingConfiguration.isSupported])
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

    @objc func openScan(_ call: CAPPluginCall) {
        guard let caseId = call.getString("caseId"), let id = call.getString("id"), let folder = CaseMediaStore.recordFolder(caseId, id),
              let info = CaseMediaStore.readInfo(folder) else { call.reject("That scan isn’t on this device."); return }
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else { call.reject("The scan couldn’t be opened."); return }
            let viewer = FaceScanViewerViewController(folder: folder, info: info) { call.resolve() }
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

struct FaceCaptureSpec {
    let id, title, hint, expression: String
    let turn: Float
    init?(json: [String: Any]) {
        guard let id = json["id"] as? String else { return nil }
        self.id = id
        title = json["title"] as? String ?? id
        hint = json["hint"] as? String ?? ""
        expression = json["expression"] as? String ?? "any"
        turn = Float(max(15, min(80, json["turn"] as? Double ?? 45)))
    }
}

struct FaceScanResult {
    let id, title: String
    let mesh: FaceMesh
    let preview: UIImage?
    /// The centre of each eye, in the mesh's millimetres.
    let eyes: (left: SIMD3<Float>, right: SIMD3<Float>)?
    /// How far the head turned each way, in degrees.
    let turned: (left: Float, right: Float)
}

enum FaceScanStore {
    static func save(_ scans: [FaceScanResult], caseId: String) throws -> (URL, [String: Any]) {
        let (id, folder) = try CaseMediaStore.newRecord(caseId, kind: "scan")
        do {
            var captures: [[String: Any]] = [], landmarks: [String: Any] = [:]
            for scan in scans {
                let mesh = "\(scan.id).ply", preview = "\(scan.id).jpg"
                try CaseMediaStore.write(scan.mesh.ply(comment: scan.title), to: folder.appendingPathComponent(mesh))
                var hasPreview = false
                if let data = scan.preview?.jpegData(compressionQuality: 0.88) {
                    try CaseMediaStore.write(data, to: folder.appendingPathComponent(preview))
                    hasPreview = true
                }
                captures.append([
                    "id": scan.id, "title": scan.title, "mesh": mesh, "preview": hasPreview ? preview : "",
                    "vertices": scan.mesh.positions.count, "triangles": scan.mesh.triangles.count / 3,
                    "turned": [Double(scan.turned.left), Double(scan.turned.right)]
                ])
                var entry: [String: Any] = ["title": scan.title, "turnedDegrees": ["left": Double(scan.turned.left.rounded()), "right": Double(scan.turned.right.rounded())]]
                if let eyes = scan.eyes { entry["eyeCentres"] = ["left": mm(eyes.left), "right": mm(eyes.right)] }
                landmarks[scan.id] = entry
            }
            let file: [String: Any] = [
                "units": "mm",
                "axes": "origin at the centre of the head as the iPhone tracked it; x towards the patient's left, y up, z out through the face",
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

    /// For SceneKit: the camera's colours (unlit), or the bare shape under light.
    func geometry(coloured: Bool) -> SCNGeometry {
        let count = positions.count, stride = MemoryLayout<SIMD3<Float>>.stride
        let vertexData = positions.withUnsafeBufferPointer { Data(buffer: $0) }
        let normalData = normals().withUnsafeBufferPointer { Data(buffer: $0) }
        var sources = [
            SCNGeometrySource(data: vertexData, semantic: .vertex, vectorCount: count, usesFloatComponents: true, componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: stride),
            SCNGeometrySource(data: normalData, semantic: .normal, vectorCount: count, usesFloatComponents: true, componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: stride)
        ]
        if coloured {
            // SceneKit works in linear colour; the camera's colours are sRGB.
            var rgb = [Float]()
            rgb.reserveCapacity(count * 3)
            for c in colours { rgb.append(powf(Float(c.x) / 255, 2.2)); rgb.append(powf(Float(c.y) / 255, 2.2)); rgb.append(powf(Float(c.z) / 255, 2.2)) }
            sources.append(SCNGeometrySource(data: rgb.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .color, vectorCount: count, usesFloatComponents: true,
                                             componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12))
        }
        let geometry = SCNGeometry(sources: sources, elements: [SCNGeometryElement(indices: triangles, primitiveType: .triangles)])
        let material = SCNMaterial()
        if coloured {
            material.lightingModel = .constant
        } else {
            material.lightingModel = .blinn
            material.diffuse.contents = UIColor(red: 0.93, green: 0.89, blue: 0.83, alpha: 1)
            material.specular.contents = UIColor(white: 0.2, alpha: 1)
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

/// Builds the face from TrueDepth frames as the head turns. Each depth point is moved into the face's own frame
/// (from ARKit's face anchor), then kept on a cylinder around the head: half-degree columns by 1 mm rows, each
/// averaging the points that land on it, weighted to views that face the surface and with outliers set aside.
/// The finished grid is the mesh: neighbouring points joined into triangles, small holes filled.
final class FaceFusion {
    static let axisZ: Float = -0.025
    static let thetaMin: Float = -120 * .pi / 180, thetaMax: Float = 120 * .pi / 180, dTheta: Float = 0.5 * .pi / 180
    static let yMin: Float = -0.17, yMax: Float = 0.15, dY: Float = 0.001
    let cols = Int((FaceFusion.thetaMax - FaceFusion.thetaMin) / FaceFusion.dTheta)
    let rows = Int((FaceFusion.yMax - FaceFusion.yMin) / FaceFusion.dY)
    private let weight, radius, red, green, blue: UnsafeMutablePointer<Float>
    private(set) var frames = 0

    struct Frame {
        /// Depth in metres (DepthFloat32).
        let depth: CVPixelBuffer
        /// The camera image (420f), for colour.
        let image: CVPixelBuffer
        let depthK, imageK: simd_float3x3
        let cameraToFace: simd_float4x4
        let cameraInFace: SIMD3<Float>
        /// The depth map's axes against ARKit's camera, from `FaceScanViewController.imageAxes` (normally both false).
        var flipX = false, flipY = false
    }

    init() {
        let n = cols * rows
        let make = { () -> UnsafeMutablePointer<Float> in let p = UnsafeMutablePointer<Float>.allocate(capacity: n); p.initialize(repeating: 0, count: n); return p }
        weight = make(); radius = make(); red = make(); green = make(); blue = make()
    }
    deinit { [weight, radius, red, green, blue].forEach { $0.deallocate() } }

    func integrate(_ f: Frame) {
        let depth = f.depth, image = f.image
        CVPixelBufferLockBaseAddress(depth, .readOnly)
        CVPixelBufferLockBaseAddress(image, .readOnly)
        defer {
            CVPixelBufferUnlockBaseAddress(depth, .readOnly)
            CVPixelBufferUnlockBaseAddress(image, .readOnly)
        }
        guard CVPixelBufferGetPixelFormatType(depth) == kCVPixelFormatType_DepthFloat32, CVPixelBufferGetPlaneCount(image) >= 2,
              let dBase = CVPixelBufferGetBaseAddress(depth), let yBase = CVPixelBufferGetBaseAddressOfPlane(image, 0),
              let cBase = CVPixelBufferGetBaseAddressOfPlane(image, 1) else { return }
        let dw = CVPixelBufferGetWidth(depth), dh = CVPixelBufferGetHeight(depth), dStride = CVPixelBufferGetBytesPerRow(depth) / 4
        let d = dBase.assumingMemoryBound(to: Float32.self)
        let iw = CVPixelBufferGetWidthOfPlane(image, 0), ih = CVPixelBufferGetHeightOfPlane(image, 0)
        let yRow = CVPixelBufferGetBytesPerRowOfPlane(image, 0), cRow = CVPixelBufferGetBytesPerRowOfPlane(image, 1)
        let yp = yBase.assumingMemoryBound(to: UInt8.self), cp = cBase.assumingMemoryBound(to: UInt8.self)
        let fx = f.depthK[0][0], fy = f.depthK[1][1], cx = f.depthK[2][0], cy = f.depthK[2][1]
        let ifx = f.imageK[0][0], ify = f.imageK[1][1], icx = f.imageK[2][0], icy = f.imageK[2][1]
        guard fx > 0, fy > 0, dw > 2, dh > 2 else { return }

        // Only the pixels round the head: the box about the face, projected into the depth map.
        let faceToCamera = f.cameraToFace.inverse
        var u0 = dw, u1 = 0, v0 = dh, v1 = 0
        for x: Float in [-0.13, 0.13] { for y in [Self.yMin, Self.yMax] { for z: Float in [-0.1, 0.16] {
            let p = faceToCamera * SIMD4<Float>(x, y, z, 1)
            guard p.z < -0.05 else { continue }
            var u = Int(fx * p.x / -p.z + cx), v = Int(fy * -p.y / -p.z + cy)
            if f.flipX { u = dw - 1 - u }
            if f.flipY { v = dh - 1 - v }
            u0 = min(u0, u); u1 = max(u1, u); v0 = min(v0, v); v1 = max(v1, v)
        } } }
        u0 = max(u0, 1); v0 = max(v0, 1); u1 = min(u1, dw - 2); v1 = min(v1, dh - 2)
        guard u1 > u0, v1 > v0 else { return }

        let m = f.cameraToFace
        let c0 = SIMD3(m.columns.0.x, m.columns.0.y, m.columns.0.z), c1 = SIMD3(m.columns.1.x, m.columns.1.y, m.columns.1.z)
        let c2 = SIMD3(m.columns.2.x, m.columns.2.y, m.columns.2.z), c3 = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
        let cam = f.cameraInFace
        let invDT = 1 / Self.dTheta, invDY = 1 / Self.dY
        let sx = ifx / fx, sy = ify / fy, ox = icx - cx * sx, oy = icy - cy * sy
        let cols = self.cols, rows = self.rows
        for v in v0...v1 {
            let row = v * dStride
            for u in u0...u1 {
                let z = d[row + u]
                guard z > 0.15, z < 0.9 else { continue }
                // Points on an edge (between the face and what's behind it) are unreliable.
                guard abs(d[row + u - 1] - z) < 0.01, abs(d[row + u + 1] - z) < 0.01, abs(d[row - dStride + u] - z) < 0.01, abs(d[row + dStride + u] - z) < 0.01 else { continue }
                let xn = ((f.flipX ? Float(dw - 1 - u) : Float(u)) - cx) / fx, yn = ((f.flipY ? Float(dh - 1 - v) : Float(v)) - cy) / fy
                let p = c0 * (xn * z) - c1 * (yn * z) - c2 * z + c3
                guard p.y > Self.yMin, p.y < Self.yMax else { continue }
                let px = p.x, pz = p.z - Self.axisZ
                let r = (px * px + pz * pz).squareRoot()
                guard r > 0.03, r < 0.16 else { continue }
                let ci = Int((atan2f(px, pz) - Self.thetaMin) * invDT), cj = Int((p.y - Self.yMin) * invDY)
                guard ci >= 0, ci < cols, cj >= 0, cj < rows else { continue }
                // Surfaces seen face-on count most; at a glancing angle the depth is noisy.
                let toCam = simd_normalize(cam - p)
                let facing = (px * toCam.x + pz * toCam.z) / r
                guard facing > 0.25 else { continue }
                var w = facing * facing
                let i = cj * cols + ci
                if weight[i] > 1.5, abs(r - radius[i] / weight[i]) > 0.006 { w *= 0.05 }
                let iu = Int(Float(u) * sx + ox), iv = Int(Float(v) * sy + oy)
                guard iu >= 0, iu < iw, iv >= 0, iv < ih else { continue }
                let luma = Float(yp[iv * yRow + iu]), chroma = (iv / 2) * cRow + (iu / 2) * 2
                let cb = Float(cp[chroma]) - 128, cr = Float(cp[chroma + 1]) - 128
                weight[i] += w
                radius[i] += w * r
                red[i] += w * (luma + 1.402 * cr)
                green[i] += w * (luma - 0.344136 * cb - 0.714136 * cr)
                blue[i] += w * (luma + 1.772 * cb)
            }
        }
        frames += 1
    }

    func mesh() -> FaceMesh? {
        let n = cols * rows, cols = self.cols, rows = self.rows
        var valid = [Bool](repeating: false, count: n), r = [Float](repeating: 0, count: n), col = [SIMD3<Float>](repeating: .zero, count: n)
        for i in 0..<n where weight[i] >= 0.8 {
            valid[i] = true
            r[i] = radius[i] / weight[i]
            col[i] = SIMD3(red[i], green[i], blue[i]) / weight[i]
        }
        let around = [-cols - 1, -cols, -cols + 1, -1, 1, cols - 1, cols, cols + 1]
        // Lone points are noise.
        for _ in 0..<2 {
            var keep = valid
            for j in 1..<rows - 1 { for c in 1..<cols - 1 {
                let i = j * cols + c
                guard valid[i] else { continue }
                var k = 0
                for o in around where valid[i + o] { k += 1 }
                if k < 4 { keep[i] = false }
            } }
            valid = keep
        }
        // Small holes are filled from the points around them.
        for _ in 0..<3 {
            var nv = valid, nr = r, nc = col
            for j in 1..<rows - 1 { for c in 1..<cols - 1 {
                let i = j * cols + c
                guard !valid[i] else { continue }
                var k = 0, sr: Float = 0, sc = SIMD3<Float>.zero
                for o in around where valid[i + o] { k += 1; sr += r[i + o]; sc += col[i + o] }
                if k >= 5 { nv[i] = true; nr[i] = sr / Float(k); nc[i] = sc / Float(k) }
            } }
            valid = nv; r = nr; col = nc
        }
        // A light smoothing of the depth noise.
        var smooth = r
        let kernel: [(Int, Float)] = [(-cols - 1, 1), (-cols, 2), (-cols + 1, 1), (-1, 2), (0, 4), (1, 2), (cols - 1, 1), (cols, 2), (cols + 1, 1)]
        for j in 1..<rows - 1 { for c in 1..<cols - 1 {
            let i = j * cols + c
            guard valid[i] else { continue }
            var s: Float = 0, w: Float = 0
            for (o, k) in kernel where valid[i + o] { s += k * r[i + o]; w += k }
            smooth[i] = s / w
        } }
        // Neighbouring points joined into triangles, except across a step in depth.
        var index = [Int32](repeating: -1, count: n)
        var positions = [SIMD3<Float>](), colours = [SIMD3<UInt8>](), triangles = [UInt32]()
        func vertex(_ i: Int) -> UInt32 {
            if index[i] < 0 {
                index[i] = Int32(positions.count)
                let theta = Self.thetaMin + (Float(i % cols) + 0.5) * Self.dTheta, y = Self.yMin + (Float(i / cols) + 0.5) * Self.dY
                positions.append(SIMD3(smooth[i] * sinf(theta), y, smooth[i] * cosf(theta) + Self.axisZ) * 1000)
                let k = col[i]
                colours.append(SIMD3(UInt8(clamping: Int(k.x.rounded())), UInt8(clamping: Int(k.y.rounded())), UInt8(clamping: Int(k.z.rounded()))))
            }
            return UInt32(index[i])
        }
        for j in 0..<rows - 1 { for c in 0..<cols - 1 {
            let a = j * cols + c, b = a + 1, d = a + cols, e = d + 1
            guard valid[a], valid[b], valid[d], valid[e] else { continue }
            let lo = min(min(smooth[a], smooth[b]), min(smooth[d], smooth[e])), hi = max(max(smooth[a], smooth[b]), max(smooth[d], smooth[e]))
            guard hi - lo < 0.012 else { continue }
            let va = vertex(a), vb = vertex(b), vd = vertex(d), ve = vertex(e)
            triangles.append(contentsOf: [va, vb, ve, va, ve, vd])
        } }
        return triangles.count >= 6000 ? FaceMesh(positions: positions, colours: colours, triangles: triangles) : nil
    }
}

/// The face scan: the TrueDepth camera with ARKit's face tracking. Per scan, the patient holds the expression and
/// turns the head slowly left, then right, then back; a bar under the face fills as each angle is seen, and the
/// prompts are spoken for when the screen is out of view. Closing keeps the scans already made.
final class FaceScanViewController: UIViewController, ARSCNViewDelegate, ARSessionDelegate {
    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    private let captures: [FaceCaptureSpec]
    private let completion: ([FaceScanResult]) -> Void
    private var index = 0
    private var results: [FaceScanResult] = []

    private enum Phase { case ready, scanning, building }
    private var phase = Phase.ready
    private var finished = false
    private var fusion: FaceFusion?
    private let fuseQueue = DispatchQueue(label: "uk.co.drvik.smilecompose.facescan", qos: .userInitiated)
    private var fusing = false
    /// 5° steps of the turn seen so far: -1 is just left of centre, 0 just right.
    private var covered = Set<Int>()
    private var turned: (left: Float, right: Float) = (0, 0)
    private var eyeSum: (left: SIMD3<Float>, right: SIMD3<Float>, count: Int) = (.zero, .zero, 0)
    private var voiceOn = true
    private let voice = AVSpeechSynthesizer()
    private var lastSpoken: (text: String, at: CFTimeInterval) = ("", 0)
    /// Votes on whether the camera image runs the other way to ARKit's camera (see `imageAxes`).
    private var axisVotes = (x: 0, y: 0, frames: 0)

    private let sceneView = ARSCNView()
    private let closeButton = UIButton(type: .system)
    private let voiceButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let stepLabel = UILabel()
    private let dots = UIStackView()
    private let meter = TurnMeterView()
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
        sceneView.delegate = self
        sceneView.session.delegate = self
        sceneView.automaticallyUpdatesLighting = false
        sceneView.scene = SCNScene()
        sceneView.scene.background.contents = UIColor.black
        view.addSubview(sceneView)
        // Soft shade at the top and bottom, so the words read over a bright room.
        for (fade, top) in [(topFade, true), (bottomFade, false)] {
            fade.colors = top ? [UIColor(white: 0, alpha: 0.55).cgColor, UIColor.clear.cgColor] : [UIColor.clear.cgColor, UIColor(white: 0, alpha: 0.6).cgColor]
            view.layer.addSublayer(fade)
        }

        titleLabel.text = "3D face scan"
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center
        stepLabel.font = .systemFont(ofSize: 12)
        stepLabel.textColor = UIColor(white: 1, alpha: 0.75)
        stepLabel.textAlignment = .center
        dots.axis = .horizontal
        dots.spacing = 4
        dots.distribution = .fillEqually
        for _ in captures { let d = UIView(); d.layer.cornerRadius = 1.5; dots.addArrangedSubview(d) }
        [titleLabel, stepLabel, dots, meter].forEach { view.addSubview($0) }

        bar.layer.cornerRadius = 18
        bar.clipsToBounds = true
        prompt.font = .systemFont(ofSize: 21, weight: .semibold)
        prompt.textColor = .white
        prompt.textAlignment = .center
        prompt.adjustsFontSizeToFitWidth = true
        prompt.minimumScaleFactor = 0.75
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
        let configuration = ARFaceTrackingConfiguration()
        configuration.isLightEstimationEnabled = false
        configuration.maximumNumberOfTrackedFaces = 1
        sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaLayoutGuide.layoutFrame
        sceneView.frame = view.bounds
        CATransaction.begin(); CATransaction.setDisableActions(true)
        topFade.frame = CGRect(x: 0, y: 0, width: view.bounds.width, height: safe.minY + 120)
        bottomFade.frame = CGRect(x: 0, y: safe.maxY - 260, width: view.bounds.width, height: view.bounds.height - safe.maxY + 260)
        CATransaction.commit()
        closeButton.frame = CGRect(x: safe.minX + 16, y: safe.minY + 8, width: 44, height: 44)
        voiceButton.frame = CGRect(x: safe.maxX - 60, y: safe.minY + 8, width: 44, height: 44)
        titleLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 8, width: safe.width - 140, height: 24)
        stepLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 32, width: safe.width - 140, height: 16)
        let dotsWidth = min(CGFloat(captures.count) * 22, safe.width - 140)
        dots.frame = CGRect(x: safe.midX - dotsWidth / 2, y: safe.minY + 56, width: dotsWidth, height: 3)
        startButton.frame = CGRect(x: safe.midX - 110, y: safe.maxY - 74, width: 220, height: 54)
        finishButton.frame = CGRect(x: safe.maxX - 124, y: safe.maxY - 69, width: 104, height: 44)
        skipButton.frame = CGRect(x: safe.minX + 20, y: safe.maxY - 69, width: 70, height: 44)
        spinner.center = CGPoint(x: safe.midX, y: safe.maxY - 47)
        let barWidth = min(safe.width - 32, 520)
        bar.frame = CGRect(x: safe.midX - barWidth / 2, y: safe.maxY - 170, width: barWidth, height: 82)
        prompt.frame = CGRect(x: 16, y: 12, width: barWidth - 32, height: 28)
        detail.frame = CGRect(x: 16, y: 40, width: barWidth - 32, height: 34)
        let meterWidth = min(safe.width - 64, 420)
        meter.frame = CGRect(x: safe.midX - meterWidth / 2, y: bar.frame.minY - 48, width: meterWidth, height: 36)
        view.keepClearOfCamera([closeButton, voiceButton, startButton, finishButton, skipButton])
    }

    // MARK: Steps

    private var capture: FaceCaptureSpec { captures[index] }

    private func show(_ i: Int) {
        index = i
        phase = .ready
        fusion = nil
        covered = []
        turned = (0, 0)
        eyeSum = (.zero, .zero, 0)
        stepLabel.text = "\(capture.title) · \(i + 1) of \(captures.count)"
        for (n, d) in dots.arrangedSubviews.enumerated() { d.backgroundColor = n < i ? Self.gold : n == i ? .white : UIColor(white: 1, alpha: 0.25) }
        meter.turn = capture.turn
        meter.covered = []
        prompt.text = capture.hint
        detail.text = "Hold the phone at arm’s length, level with the face. The head turns slowly left, then right."
        lastSpoken = ("", 0)
        updateControls()
    }

    private func updateControls() {
        startButton.isHidden = phase != .ready
        finishButton.isHidden = phase != .scanning
        skipButton.isHidden = phase == .building
        if phase == .building { spinner.startAnimating() } else { spinner.stopAnimating() }
        finishButton.isEnabled = turned.left >= 20 && turned.right >= 20
        finishButton.alpha = finishButton.isEnabled ? 1 : 0.5
    }

    @objc private func start() {
        fusion = FaceFusion()
        covered = []
        turned = (0, 0)
        eyeSum = (.zero, .zero, 0)
        phase = .scanning
        lastSpoken = ("", 0)
        updateControls()
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
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

    /// The finished turn becomes a mesh and its preview, then the next scan.
    private func build() {
        guard phase == .scanning, let fusion else { return }
        phase = .building
        updateControls()
        say("Done. You can relax", force: true)
        detail.text = "Building the 3D face…"
        let capture = self.capture, turned = self.turned
        let eyes: (left: SIMD3<Float>, right: SIMD3<Float>)? = eyeSum.count > 0 ? (left: eyeSum.left / Float(eyeSum.count) * 1000, right: eyeSum.right / Float(eyeSum.count) * 1000) : nil
        fuseQueue.async {
            let mesh = fusion.mesh()
            DispatchQueue.main.async {
                guard !self.finished else { return }
                self.fusion = nil
                guard let mesh else {
                    self.phase = .ready
                    self.updateControls()
                    self.prompt.text = "That scan didn’t work"
                    self.detail.text = "Try again, turning a little more slowly."
                    return
                }
                self.results.append(FaceScanResult(id: capture.id, title: capture.title, mesh: mesh, preview: mesh.preview(), eyes: eyes, turned: turned))
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

    func renderer(_ renderer: SCNSceneRenderer, nodeFor anchor: ARAnchor) -> SCNNode? {
        guard anchor is ARFaceAnchor, let device = renderer.device, let geometry = ARSCNFaceGeometry(device: device) else { return nil }
        geometry.firstMaterial?.fillMode = .lines
        geometry.firstMaterial?.lightingModel = .constant
        geometry.firstMaterial?.diffuse.contents = Self.gold.withAlphaComponent(0.4)
        return SCNNode(geometry: geometry)
    }

    func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
        guard let face = anchor as? ARFaceAnchor, let geometry = node.geometry as? ARSCNFaceGeometry else { return }
        geometry.update(from: face.geometry)
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        DispatchQueue.main.async {
            self.prompt.text = "The camera stopped"
            self.detail.text = (error as? ARError)?.code == .cameraUnauthorized ? "Camera access is turned off. Turn it on in Settings › SmileCompose." : "Close the scan and try again."
        }
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard !finished, phase != .building else { return }
        guard let face = frame.anchors.lazy.compactMap({ $0 as? ARFaceAnchor }).first, face.isTracked else {
            if phase == .scanning { say("Keep the face in view") } else { detail.text = "Point the screen at the face." }
            return
        }
        let cameraToFace = face.transform.inverse * frame.camera.transform
        let c = cameraToFace.columns.3
        let cam = SIMD3<Float>(c.x, c.y, c.z)
        let forward = cam.z - FaceFusion.axisZ
        // Where the camera sees the face from: negative when the head has turned to the patient's left.
        let angle = atan2f(cam.x, forward) * 180 / .pi
        let elevation = atan2f(cam.y, (cam.x * cam.x + forward * forward).squareRoot()) * 180 / .pi
        let distance = simd_length(cam)
        meter.current = angle

        var problem: String?
        if distance > 0.7 { problem = "Bring the phone closer" }
        else if distance < 0.22 { problem = "Move the phone back a little" }
        else if abs(elevation) > 25 { problem = elevation > 0 ? "Lower the phone to face level" : "Raise the phone to face level" }
        else { problem = expressionIssue(face) }

        guard phase == .scanning else {
            detail.text = problem ?? "Hold the phone at arm’s length, level with the face. The head turns slowly left, then right."
            return
        }
        say(problem ?? nextPrompt(angle))
        guard problem == nil else { return }

        if abs(angle) < 15 {
            let l = face.leftEyeTransform.columns.3, r = face.rightEyeTransform.columns.3
            eyeSum.left += SIMD3(l.x, l.y, l.z)
            eyeSum.right += SIMD3(r.x, r.y, r.z)
            eyeSum.count += 1
        }
        guard !fusing, let fusion, let depthData = frame.capturedDepthData, abs(frame.capturedDepthDataTimestamp - frame.timestamp) < 0.05 else { return }
        let converted = depthData.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
        let map = converted.depthDataMap
        var item = FaceFusion.Frame(depth: map, image: frame.capturedImage,
                                    depthK: Self.depthIntrinsics(converted, camera: frame.camera, width: Float(CVPixelBufferGetWidth(map)), height: Float(CVPixelBufferGetHeight(map))),
                                    imageK: frame.camera.intrinsics, cameraToFace: cameraToFace, cameraInFace: cam)
        let axes = imageAxes(frame, face)
        item.flipX = axes.x
        item.flipY = axes.y
        let step = Int((angle / 5).rounded(.down))
        fusing = true
        fuseQueue.async {
            fusion.integrate(item)
            DispatchQueue.main.async {
                self.fusing = false
                guard self.fusion === fusion, self.phase == .scanning else { return }
                self.covered.insert(step)
                if angle < 0 { self.turned.left = max(self.turned.left, -angle) } else { self.turned.right = max(self.turned.right, angle) }
                self.meter.covered = self.covered
                self.updateControls()
                if self.sideDone(left: true), self.sideDone(left: false), abs(angle) < 10 { self.build() }
            }
        }
    }

    /// Checks the pinhole maths against ARKit's own projection of a point on the face, so a camera image that runs
    /// the other way (a mirrored front camera) can't turn the scan inside out. Decided over the first frames.
    private func imageAxes(_ frame: ARFrame, _ face: ARFaceAnchor) -> (x: Bool, y: Bool) {
        if axisVotes.frames < 12 {
            let size = frame.camera.imageResolution, w = Float(size.width), h = Float(size.height)
            let p = face.transform * SIMD4<Float>(0.03, 0.04, 0.05, 1)
            let c = frame.camera.transform.inverse * p
            if c.z < -0.05 {
                let k = frame.camera.intrinsics
                let u = k[0][0] * c.x / -c.z + k[2][0], v = k[1][1] * -c.y / -c.z + k[2][1]
                let ar = frame.camera.projectPoint(SIMD3(p.x, p.y, p.z), orientation: .landscapeRight, viewportSize: size)
                // Only a point away from the middle tells the two ways apart.
                if abs(u - w / 2) > 25 { axisVotes.x += abs((w - u) - Float(ar.x)) < abs(u - Float(ar.x)) ? 1 : -1 }
                if abs(v - h / 2) > 25 { axisVotes.y += abs((h - v) - Float(ar.y)) < abs(v - Float(ar.y)) ? 1 : -1 }
                axisVotes.frames += 1
            }
        }
        return (axisVotes.x > 0, axisVotes.y > 0)
    }

    /// A side is done once the turn reached the full angle and nearly every step on the way was seen.
    private func sideDone(left: Bool) -> Bool {
        let steps = max(1, Int(capture.turn / 5))
        let bins = left ? Array((-steps)...(-1)) : Array(0...(steps - 1))
        let seen = bins.filter { covered.contains($0) }.count
        return (left ? turned.left : turned.right) >= capture.turn - 5 && Float(seen) >= Float(bins.count) * 0.85
    }

    private func nextPrompt(_ angle: Float) -> String {
        if !sideDone(left: true) { return "Turn slowly to your left" }
        if !sideDone(left: false) { return "Now slowly to your right" }
        return "Back to the centre"
    }

    private func expressionIssue(_ face: ARFaceAnchor) -> String? {
        let smile = ((face.blendShapes[.mouthSmileLeft]?.floatValue ?? 0) + (face.blendShapes[.mouthSmileRight]?.floatValue ?? 0)) / 2
        let open = face.blendShapes[.jawOpen]?.floatValue ?? 0
        switch capture.expression {
        case "rest": return smile > 0.35 || open > 0.25 ? "Relax the lips, lips together" : nil
        case "smile": return smile < 0.25 ? "Keep smiling" : nil
        default: return nil
        }
    }

    /// The depth map's intrinsics: from its own calibration when ARKit gives one, otherwise the camera image's,
    /// scaled to the depth map's width and centred.
    private static func depthIntrinsics(_ depth: AVDepthData, camera: ARCamera, width dw: Float, height dh: Float) -> simd_float3x3 {
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
}

/// The bar under the face: one segment per 5° of the turn, gold once seen, with a dot where the camera is now.
/// The left half is the head turned to the patient's left (on the left of the mirrored preview).
final class TurnMeterView: UIView {
    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    var turn: Float = 45 { didSet { setNeedsDisplay() } }
    var covered = Set<Int>() { didSet { setNeedsDisplay() } }
    var current: Float = 0 { didSet { if abs(current - oldValue) > 0.5 { setNeedsDisplay() } } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = false
        isUserInteractionEnabled = false
        isAccessibilityElement = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func draw(_ rect: CGRect) {
        let steps = max(1, Int(turn / 5)), count = steps * 2
        let gap: CGFloat = 3, height: CGFloat = 6, y = bounds.height - height - 2
        let width = (bounds.width - gap * CGFloat(count - 1)) / CGFloat(count)
        for n in 0..<count {
            let segment = CGRect(x: CGFloat(n) * (width + gap), y: y, width: width, height: height)
            (covered.contains(n - steps) ? Self.gold : UIColor(white: 1, alpha: 0.3)).setFill()
            UIBezierPath(roundedRect: segment, cornerRadius: height / 2).fill()
        }
        let x = bounds.width / 2 + CGFloat(max(-turn, min(turn, current)) / turn) * bounds.width / 2
        UIColor.white.setFill()
        UIBezierPath(ovalIn: CGRect(x: x - 6, y: y - 17, width: 12, height: 12)).fill()
    }
}

/// A finished face scan in 3D: drag to turn it, pinch to zoom; each scan in turn, in the camera's colours or as
/// the bare shape (which shows the surface the lab will work with).
final class FaceScanViewerViewController: UIViewController {
    private let folder: URL
    private let info: [String: Any]
    private let onClose: () -> Void
    private let sceneView = SCNView()
    private let closeButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let scans = UISegmentedControl()
    private let look = UISegmentedControl(items: ["Colour", "Shape"])
    private let message = UILabel()
    private let spinner = UIActivityIndicatorView(style: .large)
    private var meshes: [(title: String, mesh: FaceMesh)] = []

    init(folder: URL, info: [String: Any], onClose: @escaping () -> Void) {
        self.folder = folder
        self.info = info
        self.onClose = onClose
        super.init(nibName: nil, bundle: nil)
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
        view.addSubview(titleLabel)
        closeButton.setTitle("Done", for: .normal)
        closeButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        closeButton.tintColor = .white
        closeButton.addTarget(self, action: #selector(close), for: .touchUpInside)
        view.addSubview(closeButton)
        for control in [scans, look] {
            control.selectedSegmentTintColor = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
            control.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .normal)
            control.setTitleTextAttributes([.foregroundColor: UIColor(white: 0.08, alpha: 1)], for: .selected)
            control.addTarget(self, action: #selector(changed), for: .valueChanged)
            control.isHidden = true
            view.addSubview(control)
        }
        look.selectedSegmentIndex = 0
        message.textColor = UIColor(white: 1, alpha: 0.75)
        message.textAlignment = .center
        message.numberOfLines = 0
        view.addSubview(message)
        spinner.color = .white
        view.addSubview(spinner)
        spinner.startAnimating()

        let folder = self.folder
        let entries = (info["captures"] as? [[String: Any]] ?? []).compactMap { c -> (String, URL)? in
            CaseMediaStore.file(c["mesh"], in: folder).map { (c["title"] as? String ?? "Scan", $0) }
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let loaded = entries.compactMap { entry in FaceMesh.read(entry.1).map { (title: entry.0, mesh: $0) } }
            DispatchQueue.main.async {
                self.spinner.stopAnimating()
                self.meshes = loaded
                guard !loaded.isEmpty else { self.message.text = "This scan couldn’t be opened."; return }
                for (n, m) in loaded.enumerated() { self.scans.insertSegment(withTitle: m.title, at: n, animated: false) }
                self.scans.selectedSegmentIndex = 0
                self.scans.isHidden = loaded.count < 2
                self.look.isHidden = false
                self.showScan()
            }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaLayoutGuide.layoutFrame
        sceneView.frame = view.bounds
        closeButton.frame = CGRect(x: safe.minX + 12, y: safe.minY + 6, width: 70, height: 44)
        titleLabel.frame = CGRect(x: safe.minX + 90, y: safe.minY + 16, width: safe.width - 180, height: 24)
        let width = min(safe.width - 32, 420)
        scans.frame = CGRect(x: safe.midX - width / 2, y: safe.maxY - 92, width: width, height: 34)
        look.frame = CGRect(x: safe.midX - 100, y: safe.maxY - 46, width: 200, height: 34)
        message.frame = CGRect(x: safe.minX + 32, y: safe.midY - 40, width: safe.width - 64, height: 80)
        spinner.center = CGPoint(x: safe.midX, y: safe.midY)
        view.keepClearOfCamera([closeButton])
    }

    @objc private func changed() { showScan() }

    private func showScan() {
        let i = max(0, scans.selectedSegmentIndex)
        guard meshes.indices.contains(i) else { return }
        let mesh = meshes[i].mesh
        let geometry = mesh.geometry(coloured: look.selectedSegmentIndex == 0)
        if let face = sceneView.scene?.rootNode.childNode(withName: "face", recursively: false) {
            face.geometry = geometry
        } else {
            let scene = FaceMesh.scene(with: geometry)
            sceneView.scene = scene
            // The whole head in view on any screen, turning about its own centre.
            let eye = scene.rootNode.childNode(withName: "camera", recursively: false)
            eye?.camera?.projectionDirection = .horizontal
            eye?.camera?.fieldOfView = 40
            sceneView.pointOfView = eye
            sceneView.defaultCameraController.target = SCNVector3(0, -5, 20)
        }
    }

    @objc private func close() { dismiss(animated: true) { self.onClose() } }
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

