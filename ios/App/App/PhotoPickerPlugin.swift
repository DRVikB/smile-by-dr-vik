import Foundation
import AVFoundation
import AVKit
import AudioToolbox
import CoreMotion
import Vision
import Capacitor
import PhotosUI
import UniformTypeIdentifiers

/// "Choose from Photos" using Apple's system photo picker (PHPicker), and
/// "Take Photo" using the iPhone camera itself (SmileCameraViewController below).
///
/// The picker runs outside the app and returns only the photo the clinician
/// selects, so SmileCompose never asks for Photo Library access. HEIC photos
/// are delivered as JPEG. The copy handed to the web layer lives in the app's
/// temporary folder and is deleted by `releasePhoto` once it has been read.
@objc(PhotoPickerPlugin)
public class PhotoPickerPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "PhotoPickerPlugin"
    public let jsName = "SmilePhotoPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releasePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePhotoSet", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var cameraOpen = false
    private let folder = FileManager.default.temporaryDirectory.appendingPathComponent("picked-photos", isDirectory: true)

    @objc func pickPhoto(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil, let presenter = self.bridge?.viewController else {
                call.reject("The photo picker is already open.")
                return
            }
            // No PHPhotoLibrary argument: the picker returns no asset identifiers
            // and requires no permission.
            var configuration = PHPickerConfiguration()
            configuration.filter = .images
            configuration.selectionLimit = 1
            configuration.preferredAssetRepresentationMode = .compatible
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            self.pendingCall = call
            presenter.present(picker, animated: true)
        }
    }

    /// A full-resolution photograph from the camera, with Apple's photo processing and colour,
    /// framed with the same smile guide the app uses. Nothing is saved to the Photo Library.
    @objc func takePhoto(_ call: CAPPluginCall) {
        let g = call.getObject("guide") ?? [:]
        let guide = CGRect(x: g["x"] as? Double ?? 0.3, y: g["y"] as? Double ?? 0.54,
                           width: g["width"] as? Double ?? 0.4, height: g["height"] as? Double ?? 0.15)
        let front = call.getString("camera") == "front"
        let head = call.getString("head").flatMap { Data(base64Encoded: $0) }.flatMap { UIImage(data: $0) }
        let headSpread = CGFloat(call.getDouble("headSpread") ?? 1)
        DispatchQueue.main.async {
            guard !self.cameraOpen, self.pendingCall == nil, let presenter = self.bridge?.viewController else {
                call.reject("The camera is already open.")
                return
            }
            self.cameraOpen = true
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    guard granted else {
                        self.cameraOpen = false
                        call.reject("Camera access is turned off. Turn it on in Settings › SmileCompose › Camera.", "camera_denied")
                        return
                    }
                    // Strong capture, like the enclosing closures: the plugin lives as long as the bridge, the
                    // camera holds this only until it finishes, and the call must always be answered.
                    let camera = SmileCameraViewController(guide: guide, front: front, head: head, headSpread: headSpread) { result in
                        self.cameraOpen = false
                        switch result {
                        case .cancelled:
                            call.resolve(["cancelled": true])
                        case .failed(let message):
                            call.reject(message)
                        case .captured(let data, let used, let closeUp):
                            do {
                                var result = try self.store(data, png: false)
                                // The guide actually shown (it differs in landscape), so the photo's framing is accurate.
                                result["guide"] = ["x": used.minX, "y": used.minY, "width": used.width, "height": used.height]
                                // Taken as a smile close-up: kept in its own shape and set as a close-up.
                                result["closeUp"] = closeUp
                                call.resolve(result)
                            } catch { call.reject("The photo couldn’t be saved.") }
                        }
                    }
                    camera.modalPresentationStyle = .fullScreen
                    presenter.present(camera, animated: true)
                }
            }
        }
    }

    /// The guided photo set: the camera view after view, each with its own see-through guide.
    @objc func takePhotoSet(_ call: CAPPluginCall) {
        let raw = call.getArray("views") as? [[String: Any]] ?? []
        let image = { (b64: Any?) -> UIImage? in (b64 as? String).flatMap { Data(base64Encoded: $0) }.flatMap { UIImage(data: $0) } }
        let views = raw.compactMap { v -> PhotoSetCameraViewController.SetView? in
            guard let id = v["id"] as? String else { return nil }
            return .init(id: id, title: v["title"] as? String ?? "", hint: v["hint"] as? String ?? "", step: v["step"] as? String ?? "",
                         guide: image(v["guide"]), lower: image(v["guideLower"]), motion: v["motion"] as? String ?? "top",
                         midlines: v["midlines"] as? Bool ?? false, mirror: v["mirror"] as? Bool ?? false,
                         light: v["light"] as? Bool ?? false, zoom: CGFloat(v["zoom"] as? Double ?? 1))
        }
        guard !views.isEmpty else { call.reject("No views to take."); return }
        DispatchQueue.main.async {
            guard !self.cameraOpen, self.pendingCall == nil, let presenter = self.bridge?.viewController else {
                call.reject("The camera is already open.")
                return
            }
            self.cameraOpen = true
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    guard granted else {
                        self.cameraOpen = false
                        call.reject("Camera access is turned off. Turn it on in Settings › SmileCompose › Camera.", "camera_denied")
                        return
                    }
                    let camera = PhotoSetCameraViewController(views: views) { photos, cancelled in
                        self.cameraOpen = false
                        var out: [[String: Any]] = []
                        for (id, data) in photos { if var stored = try? self.store(data, png: false) { stored["id"] = id; out.append(stored) } }
                        call.resolve(["cancelled": cancelled, "photos": out])
                    }
                    camera.modalPresentationStyle = .fullScreen
                    presenter.present(camera, animated: true)
                }
            }
        }
    }

    /// A private copy in the temporary folder, handed to the web layer and deleted by `releasePhoto`.
    private func store(_ data: Data, png: Bool) throws -> [String: Any] {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appendingPathComponent(UUID().uuidString).appendingPathExtension(png ? "png" : "jpg")
        try data.write(to: destination, options: .completeFileProtection)
        return [
            "cancelled": false,
            "path": destination.absoluteString,
            "webPath": bridge?.portablePath(fromLocalURL: destination)?.absoluteString ?? "",
            "mimeType": png ? "image/png" : "image/jpeg"
        ]
    }

    @objc func releasePhoto(_ call: CAPPluginCall) {
        if let path = call.getString("path"), let url = URL(string: path), url.path.hasPrefix(folder.path) {
            try? FileManager.default.removeItem(at: url)
        }
        call.resolve()
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pendingCall else { return }
        pendingCall = nil
        guard let provider = results.first?.itemProvider else {
            call.resolve(["cancelled": true])
            return
        }
        let type: UTType = provider.hasItemConformingToTypeIdentifier(UTType.png.identifier) ? .png : .jpeg
        provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, error in
            guard let url = url, error == nil else {
                call.reject("The photo couldn’t be opened.")
                return
            }
            // The provided file is deleted when this handler returns, so keep a private copy.
            let destination = self.folder
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(type == .png ? "png" : "jpg")
            do {
                try FileManager.default.createDirectory(at: self.folder, withIntermediateDirectories: true)
                try FileManager.default.copyItem(at: url, to: destination)
            } catch {
                call.reject("The photo couldn’t be opened.")
                return
            }
            call.resolve([
                "cancelled": false,
                "path": destination.absoluteString,
                "webPath": self.bridge?.portablePath(fromLocalURL: destination)?.absoluteString ?? "",
                "mimeType": type == .png ? "image/png" : "image/jpeg"
            ])
        }
    }
}


// MARK: - Camera

/// Live alignment checks for the capture guide, computed from on-device face
/// landmarks (Vision) and the device's gravity vector (Core Motion). Pure
/// rules and geometry, so the camera only draws what they decide. Nothing
/// leaves the device.
struct CaptureGuidance {
    struct Face {
        /// All in the photo frame's normalised coordinates, origin top-left.
        var centreX: CGFloat
        var mouth: CGRect
        /// Inner-lip opening height / mouth width.
        var opening: CGFloat
        var rollDegrees: CGFloat
        var yawDegrees: CGFloat
        /// Forward/back head tilt as Vision reports it (its sign is learnt, see PitchDirection).
        var pitchDegrees: CGFloat
        /// Nose base to eye line, as a share of mouth to eye line: grows when the chin drops.
        var noseRatio: CGFloat
    }
    enum Step: Equatable { case noFace, centre, closer, further, raise, lower, levelDevice, uprightDevice, headStraight, chinUp, chinDown, chinLevel, lookAhead, smile, ready }
    static let maxPitch: CGFloat = 8
    static let maxLean: Double = 18

    /// The face oval and the smile box for this frame shape, in normalised
    /// coordinates. In portrait the box is the app's own guide and the oval is
    /// sized so a face filling it puts the mouth in the box. A landscape frame
    /// is too short for that box, so the oval fits the height and the box
    /// follows the oval (and is returned with the photo as its framing).
    static func layout(guide: CGRect, aspect: CGFloat) -> (oval: CGRect, guide: CGRect) {
        let headRatio: CGFloat = 1.32, mouthWidthShare: CGFloat = 0.54, mouthDepth: CGFloat = 0.26
        if aspect <= 1 {
            let w = guide.width / mouthWidthShare
            let h = w * headRatio * aspect
            let cy = guide.midY - mouthDepth * h
            return (CGRect(x: 0.5 - w / 2, y: cy - h / 2, width: w, height: h), guide)
        }
        let h: CGFloat = 0.86
        let w = h / headRatio / aspect
        let cy: CGFloat = 0.04 + h / 2
        let boxW = w * mouthWidthShare, boxH = boxW * aspect / 2
        let mouthY = cy + mouthDepth * h
        return (CGRect(x: 0.5 - w / 2, y: cy - h / 2, width: w, height: h),
                CGRect(x: 0.5 - boxW / 2, y: mouthY - boxH / 2, width: boxW, height: boxH))
    }

    /// The device is upright and level: its own tilt from the nearest upright
    /// orientation, and how far it leans towards or away from the patient.
    static func deviceLevel(gravity g: (x: Double, y: Double, z: Double)) -> (sideDegrees: Double, leanDegrees: Double) {
        let angle = atan2(g.x, g.y) * 180 / .pi
        let quarter = (angle / 90).rounded() * 90
        let lean = asin(max(-1, min(1, g.z))) * 180 / .pi
        return (angle - quarter, lean)
    }

    /// `chinDown`: how far the chin is dropped (positive) or lifted (negative), in degrees;
    /// `known` is false until the direction has been learnt on this device.
    static func step(face: Face?, guide: CGRect, gravity: (x: Double, y: Double, z: Double)?, chinDown: CGFloat, known: Bool) -> Step {
        guard let f = face else { return .noFace }
        if abs(f.centreX - 0.5) > 0.06 { return .centre }
        let ratio = f.mouth.width / guide.width
        if ratio < 0.6 { return .closer }
        if ratio > 1.05 { return .further }
        if f.mouth.midY < guide.minY { return .lower }
        if f.mouth.midY > guide.maxY { return .raise }
        if let g = gravity {
            let level = deviceLevel(gravity: g)
            if abs(level.sideDegrees) > 3 { return .levelDevice }
            if abs(level.leanDegrees) > maxLean { return .uprightDevice }
        }
        if abs(f.rollDegrees) > 5 { return .headStraight }
        if abs(chinDown) > maxPitch { return known ? (chinDown > 0 ? .chinUp : .chinDown) : .chinLevel }
        if abs(f.yawDegrees) > 12 { return .lookAhead }
        if f.opening < 0.1 { return .smile }
        return .ready
    }

    /// The four checks the camera shows as chips, in order: angle (the device level and upright, and the head straight,
    /// chin level and looking ahead for a face), position, size and the smile. All four met is the same as `.ready`.
    static func checks(face: Face?, guide: CGRect, gravity: (x: Double, y: Double, z: Double)?, chinDown: CGFloat, closeUp: Bool) -> [Bool] {
        var level = true
        if let g = gravity {
            let l = deviceLevel(gravity: g)
            level = abs(l.sideDegrees) <= 3 && abs(l.leanDegrees) <= maxLean
        }
        guard let f = face else { return [level, false, false, false] }
        let ratio = f.mouth.width / guide.width
        if closeUp {
            let centred = abs(f.mouth.midX - guide.midX) <= guide.width * 0.12
                && f.mouth.midY >= guide.minY + guide.height * 0.2 && f.mouth.midY <= guide.maxY - guide.height * 0.2
            return [level && abs(f.rollDegrees) <= 5, centred, ratio >= 0.55 && ratio <= 1.08, f.opening >= 0.1]
        }
        let centred = abs(f.centreX - 0.5) <= 0.06 && f.mouth.midY >= guide.minY && f.mouth.midY <= guide.maxY
        let head = abs(f.rollDegrees) <= 5 && abs(chinDown) <= maxPitch && abs(f.yawDegrees) <= 12
        return [level && head, centred, ratio >= 0.6 && ratio <= 1.05, f.opening >= 0.1]
    }

    /// The lens buttons, as multiples of 1× (the wide lens). No ultra-wide: it distorts faces and smiles.
    /// 2× is the main sensor's full-quality crop; a telephoto adds its own stop (3× or 5×). The selfie camera
    /// offers 1×, 1.5× and 2×.
    static func lensStops(front: Bool, base: CGFloat, switchOvers: [CGFloat], maxZoom: CGFloat) -> [CGFloat] {
        var stops: [CGFloat] = front ? [1, 1.5, 2] : [1, 2]
        if !front, switchOvers.count >= 2, base > 0 {
            let tele = (switchOvers[1] / base).rounded()
            if tele >= 2.5 { stops.append(tele) }
        }
        return stops.filter { $0 * base <= maxZoom + 0.01 }
    }

    /// What the camera is taking: the whole face, or a smile close-up.
    enum Shot { case face, smile }

    /// The smile box for a close-up: the smile fills most of a sideways 4:3 frame, or a band across an upright one.
    static func closeUpBox(aspect: CGFloat) -> CGRect {
        aspect > 1 ? CGRect(x: 0.12, y: 0.24, width: 0.76, height: 0.52) : CGRect(x: 0.08, y: 0.34, width: 0.84, height: 0.32)
    }

    /// What one live frame suggests, from the face Vision finds (Vision coordinates, origin bottom-left), or nil when
    /// it can't tell. The same rule as the app's check on a finished photo: the whole face in frame with a mouth well
    /// under half its width is a face; a face running off the frame or a mouth across much of it is a close-up.
    /// No face at all says nothing (nobody may be in front of the camera yet).
    static func shot(box: CGRect, eyes: [CGPoint], mouthWidth: CGFloat?) -> Shot? {
        let eyesIn = !eyes.isEmpty && eyes.allSatisfy { $0.x >= 0 && $0.x <= 1 && $0.y >= 0 && $0.y <= 1 }
        if box.width > 0.7 || box.maxY > 1.02 || (!eyes.isEmpty && !eyesIn) || (mouthWidth ?? 0) > 0.42 { return .smile }
        if box.minX >= 0, box.maxX <= 1, box.minY >= 0, box.maxY <= 1, box.width < 0.6, eyesIn, let m = mouthWidth, m < 0.32 { return .face }
        return nil
    }

    /// A smile close-up: the device level and upright, and — when the mouth can be found (Vision often finds no
    /// face this close) — the smile centred in the box and about its width. Without a face the device checks still
    /// apply and the hint simply asks to fit the smile in the box.
    static func closeUpStep(face: Face?, box: CGRect, gravity: (x: Double, y: Double, z: Double)?) -> Step {
        if let g = gravity {
            let level = deviceLevel(gravity: g)
            if abs(level.sideDegrees) > 3 { return .levelDevice }
            if abs(level.leanDegrees) > maxLean { return .uprightDevice }
        }
        guard let f = face else { return .noFace }
        if abs(f.mouth.midX - box.midX) > box.width * 0.12 { return .centre }
        let ratio = f.mouth.width / box.width
        if ratio < 0.55 { return .closer }
        if ratio > 1.08 { return .further }
        if f.mouth.midY < box.minY + box.height * 0.2 { return .lower }
        if f.mouth.midY > box.maxY - box.height * 0.2 { return .raise }
        if abs(f.rollDegrees) > 5 { return .headStraight }
        if f.opening < 0.1 { return .smile }
        return .ready
    }

    static func closeUpMessage(_ step: Step) -> String {
        switch step {
        case .noFace: return "Fit the smile in the box"
        case .centre: return "Centre the smile in the box"
        case .closer: return "Move a little closer"
        case .further: return "Move a little further away"
        case .lower, .raise: return "Centre the smile in the box"
        default: return message(step)
        }
    }

    static func message(_ step: Step) -> String {
        switch step {
        case .noFace: return "Bring the face into the oval"
        case .centre: return "Centre the face in the oval"
        case .closer: return "Move a little closer"
        case .further: return "Move a little further away"
        case .raise: return "Move the camera down a little"
        case .lower: return "Move the camera up a little"
        case .levelDevice: return "Level the device"
        case .uprightDevice: return "Hold the device upright"
        case .headStraight: return "Keep the head straight"
        case .chinUp: return "Lift the chin slightly"
        case .chinDown: return "Lower the chin slightly"
        case .chinLevel: return "Keep the chin level — look straight at the camera"
        case .lookAhead: return "Look straight at the camera"
        case .smile: return "Smile and show the teeth"
        case .ready: return "Hold still"
        }
    }
}

/// Which sign of Vision's pitch means "chin down" on this device, learnt from
/// the face itself: as the chin drops, the nose base moves towards the mouth
/// on screen. Once pitch and that ratio clearly move together, the direction
/// is kept (on this device only) so prompts can say which way to move.
final class PitchDirection {
    private static let key = "smile.camera.pitchChinDownSign"
    private var samples: [(pitch: Double, ratio: Double)] = []
    private(set) var sign: CGFloat? = {
        let stored = UserDefaults.standard.integer(forKey: PitchDirection.key)
        return stored == 0 ? nil : CGFloat(stored)
    }()

    func observe(_ face: CaptureGuidance.Face) {
        guard sign == nil else { return }
        samples.append((Double(face.pitchDegrees), Double(face.noseRatio)))
        if samples.count > 60 { samples.removeFirst() }
        guard samples.count >= 20 else { return }
        let n = Double(samples.count)
        let mp = samples.map(\.pitch).reduce(0, +) / n, mr = samples.map(\.ratio).reduce(0, +) / n
        var cov = 0.0, vp = 0.0, vr = 0.0
        for s in samples { cov += (s.pitch - mp) * (s.ratio - mr); vp += pow(s.pitch - mp, 2); vr += pow(s.ratio - mr, 2) }
        guard vp / n > 9, vr > 0 else { return } // needs a few degrees of real head movement
        let correlation = cov / sqrt(vp * vr)
        guard abs(correlation) > 0.5 else { return }
        let learnt: CGFloat = correlation > 0 ? 1 : -1
        sign = learnt
        UserDefaults.standard.set(Int(learnt), forKey: Self.key)
    }
}

/// The SmileCompose camera: a 3:4 live view (4:3 held sideways) showing exactly the photo's frame. Face or smile
/// close-up, from a switch that also follows the picture; one instruction at the top of the picture; the four checks
/// as chips that turn gold when met, and a ring round the shutter that fills with them; lens buttons; focus and
/// exposure on the mouth (drag up or down to brighten or darken); the back camera's light for close-ups; the volume
/// buttons and Camera Control as a shutter; optional auto capture; and a quick check of the photo before it is used.
/// It captures a full-quality still (AVCapturePhotoOutput, quality prioritised) rather than a frame of video.
final class SmileCameraViewController: UIViewController, AVCapturePhotoCaptureDelegate, AVCaptureVideoDataOutputSampleBufferDelegate {
    enum Result { case cancelled, failed(String), captured(Data, CGRect, closeUp: Bool) }

    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    private static let ink = UIColor(red: 26 / 255, green: 22 / 255, blue: 18 / 255, alpha: 1)
    private static let warning = UIColor(red: 0.89, green: 0.33, blue: 0.36, alpha: 1)
    private static let quiet = UIColor(white: 1, alpha: 0.55)
    private static let autoKey = "smile.camera.autoCapture"

    private let guide: CGRect
    private var activeGuide: CGRect
    private var oval = CGRect.zero
    private var front: Bool
    private let completion: (Result) -> Void
    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "uk.co.drvik.smilecompose.camera")
    private let analysisQueue = DispatchQueue(label: "uk.co.drvik.smilecompose.camera.analysis")
    private let photoOutput = AVCapturePhotoOutput()
    private let videoOutput = AVCaptureVideoDataOutput()
    private let motion = CMMotionManager()
    private let pitchDirection = PitchDirection()
    private var device: AVCaptureDevice?
    private var rotationCoordinator: AnyObject?
    /// iPhone Duo: which way each camera faces right now (AVCaptureDeviceDirectionCoordinator, iOS 27.1).
    private var directionCoordinator: AnyObject?
    /// A specific camera chosen after the Duo opened or closed; nil means the usual front or back camera.
    private var chosenCameraID: String?
    /// The physical camera the system's virtual front camera streams from, so a switch between displays shows.
    private var constituentWatch: NSKeyValueObservation?
    /// How far each control is moved to keep clear of the inner camera while it's in use.
    private var regionShifts: [ObjectIdentifier: CGVector] = [:]
    private let switchNote = UILabel()
    /// The zoom factor that reads as 1× (the wide lens), and the most we allow.
    private var zoomBase: CGFloat = 1
    private var zoomMax: CGFloat = 5
    private var pinchStart: CGFloat = 1
    /// The lens buttons, as multiples of 1×.
    private var lensStops: [CGFloat] = []
    private var finished = false
    private var lastAnalysis = Date.distantPast
    private var latestFace: CaptureGuidance.Face?
    private var readySince: Date?
    private var wasReady = false
    /// The live smile frame, eased towards the mouth Vision finds (normalised, top-left origin).
    private var smoothedMouth: CGRect?
    private var lastMeterPoint: CGPoint?
    private var lastMeterTime = Date.distantPast
    private var exposureBias: Float = 0
    private var torchOn = false
    private var autoCapture = UserDefaults.standard.bool(forKey: SmileCameraViewController.autoKey)
    private var countdown: (left: Int, timer: Timer)?
    private var levelAtCapture: Double = 0
    private var pendingPhoto: Data?
    private var reviewing = false
    #if targetEnvironment(simulator)
    fileprivate var simSource: CGImage?
    fileprivate var simTimer: Timer?
    fileprivate let simLayer = CALayer()
    fileprivate var simFrame: CGImage?
    fileprivate var simulatedCloseUp: Bool { closeUp }
    fileprivate var simulatedSize: CGSize? { previewHost.bounds.size }
    fileprivate func showSimulatedLenses() { lensStops = [1, 2, 3]; buildLenses() }
    fileprivate func installSimulatedLayer() { previewHost.layer.insertSublayer(simLayer, above: previewLayer) }
    fileprivate func chooseSimulatedSmile() { chosenShot = .smile; view.setNeedsLayout() }
    fileprivate func cancelSimulated() { finish(.failed("The camera couldn’t be started.")) }
    /// The simulator's face landmarks are unreliable, so the stand-in face's own measurements are used: its mouth
    /// (corner to corner 392–588, lips 538–628, teeth 555–598 in the 900×1200 photo) and eyes (about y 375).
    fileprivate func simulatedAnalysis(crop: CGRect, scale: CGFloat) {
        guard !reviewing else { return }
        func n(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: (x * scale - crop.minX) / crop.width, y: (y * scale - crop.minY) / crop.height) }
        let a = n(392, 538), b = n(588, 628), eye = n(495, 375)
        let face = CaptureGuidance.Face(centreX: n(495, 0).x, mouth: CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y),
                                        opening: 43 / 196, rollDegrees: 0, yawDegrees: 0, pitchDegrees: 0, noseRatio: 0.5)
        let evidence: CaptureGuidance.Shot = eye.y >= 0 && b.x - a.x < 0.32 ? .face : .smile
        DispatchQueue.main.async {
            guard !self.reviewing else { return }
            self.latestFace = face
            self.observe(evidence)
            self.updateGuidance()
        }
    }
    #endif

    private let previewLayer = AVCaptureVideoPreviewLayer()
    private let previewHost = UIView()
    private let ovalLayer = CAShapeLayer()
    private let headArc = CAShapeLayer()
    /// The At rest head (with ears) from the photo set, in place of the oval; `headSpread` is its width over the head's.
    private let headView = UIImageView()
    private let headImage: UIImage?
    private let headSpread: CGFloat
    private var playedIntro = false
    /// Corner marks round the smile: hugging the patient's own smile in a face photo, the target box in a close-up.
    private let smileFrame = CornerFrameView()
    private let exposureMark = UIView()
    private let exposureSun = UIImageView()
    private let exposureTrack = UIView()
    /// Short midline marks at the picture's top and bottom edges, and a level line that tilts with the device.
    private let tickTop = UIView()
    private let tickBottom = UIView()
    private let horizon = UIView()
    private let horizonLeft = UIView()
    private let horizonRight = UIView()
    private let horizonCentre = UIView()
    private let instruction = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    private let instructionGold = UIView()
    private let hint = UILabel()
    private let chips = UIStackView()
    private var chipViews: [CheckChip] = []
    private let lensBack = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    private let lensBar = UIStackView()
    private var lensButtons: [UIButton] = []
    private let closeButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let torchButton = UIButton(type: .system)
    private let autoButton = UIButton(type: .system)
    private let shutter = UIButton(type: .custom)
    private let shutterHost = UIView()
    private let shutterTrack = CAShapeLayer()
    private let shutterRing = CAShapeLayer()
    private let shutterLabel = UILabel()
    private let review = PhotoReviewView()
    private let haptic = UIImpactFeedbackGenerator(style: .light)

    init(guide: CGRect, front: Bool, head: UIImage? = nil, headSpread: CGFloat = 1, completion: @escaping (Result) -> Void) {
        self.headImage = head?.withRenderingMode(.alwaysTemplate)
        self.headSpread = headSpread
        self.guide = guide
        self.activeGuide = guide
        self.front = front
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var prefersStatusBarHidden: Bool { true }

    /// A phone-sized display held sideways: on a phone that usually means a smile close-up. iPad and the open
    /// iPhone Duo are large enough to be held sideways for a full face.
    private var sideways: Bool {
        UIDevice.current.userInterfaceIdiom == .phone && view.bounds.width > view.bounds.height && min(view.bounds.width, view.bounds.height) < 600
    }
    /// Face or smile close-up: the clinician's choice in the switch, else what the live picture has shown, else the
    /// way the device is held (a phone turned sideways is taking a close-up). Turning the device starts afresh.
    private var chosenShot: CaptureGuidance.Shot?
    private var seenShot: CaptureGuidance.Shot?
    private var shotEvidence: (shot: CaptureGuidance.Shot, since: Date, last: Date)?
    private var layoutWasSideways: Bool?
    private var shot: CaptureGuidance.Shot { chosenShot ?? seenShot ?? (sideways ? .smile : .face) }
    private var closeUp: Bool { shot == .smile }
    private let shotSwitch = UISegmentedControl(items: ["Face", "Smile"])

    // MARK: Views

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        previewLayer.session = session
        previewLayer.videoGravity = .resizeAspectFill
        previewHost.layer.addSublayer(previewLayer)
        previewHost.clipsToBounds = true
        previewHost.backgroundColor = UIColor(white: 0.07, alpha: 1)
        previewHost.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:))))
        let pan = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
        pan.maximumNumberOfTouches = 1
        previewHost.addGestureRecognizer(pan)
        view.addSubview(previewHost)

        for shape in [ovalLayer, headArc] {
            shape.fillColor = nil
            shape.lineCap = .round
            previewHost.layer.addSublayer(shape)
        }
        ovalLayer.lineWidth = 3
        ovalLayer.strokeColor = UIColor(white: 1, alpha: 0.9).cgColor
        if let headImage {
            headView.image = headImage
            headView.contentMode = .scaleToFill
            headView.tintColor = UIColor(white: 1, alpha: 0.88)
            headView.isUserInteractionEnabled = false
            previewHost.addSubview(headView)
            ovalLayer.isHidden = true
        }
        headArc.lineWidth = 2.5
        headArc.strokeColor = Self.warning.cgColor
        headArc.isHidden = true

        for tick in [tickTop, tickBottom] {
            tick.backgroundColor = Self.quiet
            tick.layer.cornerRadius = 1
            tick.isUserInteractionEnabled = false
            previewHost.addSubview(tick)
        }
        horizon.isUserInteractionEnabled = false
        for line in [horizonLeft, horizonRight] {
            line.backgroundColor = .white
            line.layer.cornerRadius = 1
            horizon.addSubview(line)
        }
        horizonCentre.backgroundColor = UIColor(white: 1, alpha: 0.35)
        horizonCentre.isUserInteractionEnabled = false
        previewHost.addSubview(horizonCentre)
        previewHost.addSubview(horizon)
        previewHost.addSubview(smileFrame)

        // Exposure: a sun on a short track beside the smile frame; drag up or down on the picture to move it.
        exposureMark.isUserInteractionEnabled = false
        exposureTrack.backgroundColor = Self.gold
        exposureMark.addSubview(exposureTrack)
        exposureSun.image = UIImage(systemName: "sun.max", withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold))
        exposureSun.tintColor = Self.gold
        exposureSun.contentMode = .center
        exposureMark.addSubview(exposureSun)
        previewHost.addSubview(exposureMark)

        // The one instruction, frosted at the top of the picture (gold once lined up).
        instruction.clipsToBounds = true
        instruction.isUserInteractionEnabled = false
        instructionGold.backgroundColor = Self.gold
        instructionGold.alpha = 0
        instruction.contentView.addSubview(instructionGold)
        hint.text = CaptureGuidance.message(.noFace)
        hint.textColor = .white
        hint.font = .systemFont(ofSize: 16, weight: .semibold)
        hint.textAlignment = .center
        hint.adjustsFontSizeToFitWidth = true
        hint.minimumScaleFactor = 0.8
        hint.accessibilityTraits = .updatesFrequently
        instruction.contentView.addSubview(hint)
        view.addSubview(instruction)

        chips.spacing = 6
        chips.alignment = .center
        chips.isUserInteractionEnabled = false
        for _ in 0..<4 { let chip = CheckChip(); chipViews.append(chip); chips.addArrangedSubview(chip) }
        view.addSubview(chips)
        applyShotTitles()

        lensBack.clipsToBounds = true
        lensBar.spacing = 4
        lensBar.distribution = .fillEqually
        lensBar.alignment = .fill
        lensBack.contentView.addSubview(lensBar)
        view.addSubview(lensBack)

        let symbols = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
        closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: symbols), for: .normal)
        closeButton.accessibilityLabel = "Cancel"
        flipButton.setImage(UIImage(systemName: "arrow.triangle.2.circlepath.camera", withConfiguration: symbols), for: .normal)
        flipButton.accessibilityLabel = "Switch camera"
        torchButton.setImage(UIImage(systemName: "flashlight.off.fill", withConfiguration: symbols), for: .normal)
        torchButton.accessibilityLabel = "Light"
        autoButton.setImage(UIImage(systemName: "timer", withConfiguration: symbols), for: .normal)
        autoButton.accessibilityLabel = "Auto capture"
        for button in [closeButton, flipButton, torchButton, autoButton] {
            button.tintColor = .white
            button.backgroundColor = UIColor(white: 1, alpha: 0.14)
            button.layer.cornerRadius = 22
            view.addSubview(button)
        }
        closeButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        flipButton.addTarget(self, action: #selector(flip), for: .touchUpInside)
        torchButton.addTarget(self, action: #selector(toggleTorch), for: .touchUpInside)
        autoButton.addTarget(self, action: #selector(toggleAuto), for: .touchUpInside)
        updateAutoButton()

        // The shutter, with a ring that fills as the checks are met.
        shutterHost.isUserInteractionEnabled = false
        for ring in [shutterTrack, shutterRing] {
            ring.fillColor = nil
            ring.lineCap = .round
            shutterHost.layer.addSublayer(ring)
        }
        shutterTrack.strokeColor = UIColor(white: 1, alpha: 0.35).cgColor
        shutterTrack.lineWidth = 3
        shutterRing.strokeColor = Self.gold.cgColor
        shutterRing.lineWidth = 3.5
        shutterRing.strokeEnd = 0
        view.addSubview(shutterHost)
        shutter.backgroundColor = .white
        shutter.layer.cornerRadius = 31
        shutter.accessibilityLabel = "Take photo"
        shutter.addTarget(self, action: #selector(capture), for: .touchUpInside)
        view.addSubview(shutter)
        shutterLabel.font = .systemFont(ofSize: 12, weight: .bold)
        shutterLabel.textColor = Self.ink
        shutterLabel.textAlignment = .center
        shutterLabel.isUserInteractionEnabled = false
        shutter.addSubview(shutterLabel)

        // Face or smile close-up, on every device; it also follows the picture by itself until it is tapped.
        shotSwitch.accessibilityLabel = "Photo type"
        shotSwitch.backgroundColor = UIColor(white: 1, alpha: 0.14)
        shotSwitch.selectedSegmentTintColor = Self.gold
        shotSwitch.setTitleTextAttributes([.foregroundColor: UIColor.white, .font: UIFont.systemFont(ofSize: 14, weight: .semibold)], for: .normal)
        shotSwitch.setTitleTextAttributes([.foregroundColor: Self.ink, .font: UIFont.systemFont(ofSize: 14, weight: .semibold)], for: .selected)
        shotSwitch.addTarget(self, action: #selector(shotChosen), for: .valueChanged)
        view.addSubview(shotSwitch)

        // iPadOS pauses the camera when it treats the app as multitasking (Stage
        // Manager, Split View): say so instead of showing a silent black preview.
        let centre = NotificationCenter.default
        centre.addObserver(self, selector: #selector(sessionInterrupted(_:)), name: AVCaptureSession.wasInterruptedNotification, object: session)
        centre.addObserver(self, selector: #selector(sessionResumed), name: AVCaptureSession.interruptionEndedNotification, object: session)
        centre.addObserver(self, selector: #selector(sessionFailed), name: AVCaptureSession.runtimeErrorNotification, object: session)

        if motion.isDeviceMotionAvailable {
            motion.deviceMotionUpdateInterval = 1.0 / 15
            motion.startDeviceMotionUpdates()
        }
        haptic.prepare()
        switchNote.font = .systemFont(ofSize: 14, weight: .semibold)
        switchNote.textColor = .black
        switchNote.backgroundColor = UIColor(white: 1, alpha: 0.92)
        switchNote.textAlignment = .center
        switchNote.layer.cornerRadius = 17
        switchNote.layer.masksToBounds = true
        switchNote.alpha = 0
        switchNote.isUserInteractionEnabled = false
        view.addSubview(switchNote)

        // The volume buttons and Camera Control take the photo too, so a hand can stay on the patient or a retractor.
        let buttons = AVCaptureEventInteraction { [weak self] event in
            guard event.phase == .began else { return }
            self?.hardwareShutter()
        }
        view.addInteraction(buttons)

        review.isHidden = true
        review.onRetake = { [weak self] in self?.retake() }
        review.onUse = { [weak self] in self?.usePhoto() }
        view.addSubview(review)

        // The inner camera's reserved area becomes active once the camera runs: lay out again to keep clear of it.
        centre.addObserver(self, selector: #selector(sessionStarted), name: AVCaptureSession.didStartRunningNotification, object: session)
        configureSession()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        motion.stopDeviceMotionUpdates()
        countdown?.timer.invalidate()
    }

    /// As the camera opens, once: the head draws on from the top and the smile frame widens from the centre,
    /// as the photo set's guides do. With Reduce Motion they simply appear.
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !playedIntro, !UIAccessibility.isReduceMotionEnabled else { return }
        playedIntro = true
        if headImage != nil, !closeUp {
            let mask = CALayer()
            mask.backgroundColor = UIColor.black.cgColor
            mask.anchorPoint = CGPoint(x: 0.5, y: 0)
            mask.bounds = headView.bounds
            mask.position = CGPoint(x: headView.bounds.midX, y: 0)
            headView.layer.mask = mask
            let grow = CABasicAnimation(keyPath: "transform.scale.y")
            grow.fromValue = 0.001; grow.toValue = 1; grow.duration = 0.9
            grow.timingFunction = CAMediaTimingFunction(controlPoints: 0.45, 0, 0.2, 1)
            mask.add(grow, forKey: "reveal")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.95) { [weak self] in self?.headView.layer.mask = nil }
        }
        smileFrame.transform = CGAffineTransform(scaleX: 0.15, y: 1)
        UIView.animate(withDuration: 0.7, delay: 0.45, usingSpringWithDamping: 0.75, initialSpringVelocity: 0, options: []) {
            self.smileFrame.transform = .identity
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaLayoutGuide.layoutFrame
        let portrait = view.bounds.height >= view.bounds.width
        let side = sideways
        // Turning the device is a fresh start: it sets the shot again (sideways on a phone is a close-up).
        if layoutWasSideways != nil && layoutWasSideways != side { chosenShot = nil; seenShot = nil; shotEvidence = nil; smoothedMouth = nil }
        layoutWasSideways = side
        let close = closeUp
        // The live view has the photo's own shape, so it shows the whole photo and the guides map exactly.
        let aspect: CGFloat = portrait ? 3.0 / 4.0 : 4.0 / 3.0
        // A narrower column where the display is narrow (the closed iPhone Duo on its side, beside the system's own bar).
        let column: CGFloat = safe.width < 700 ? 116 : 140, margin: CGFloat = 60
        var size: CGSize
        var origin: CGPoint
        if portrait {
            // Upright: a slim row of buttons, the picture as wide as the screen, then the checks and the shutter.
            let top = safe.minY + 52
            let maxHeight = safe.maxY - 140 - top
            size = CGSize(width: view.bounds.width, height: view.bounds.width / aspect)
            if size.height > maxHeight { size = CGSize(width: maxHeight * aspect, height: maxHeight) }
            origin = CGPoint(x: view.bounds.midX - size.width / 2, y: top)
        } else {
            // Sideways (any device): the picture takes the full height, with the controls in a column on the right.
            let area = CGRect(x: safe.minX + margin, y: safe.minY + 8, width: safe.width - margin - column, height: safe.height - 16)
            size = CGSize(width: area.height * aspect, height: area.height)
            if size.width > area.width { size = CGSize(width: area.width, height: area.width / aspect) }
            origin = CGPoint(x: area.midX - size.width / 2, y: area.midY - size.height / 2)
        }
        previewHost.frame = CGRect(origin: origin, size: size)
        previewHost.layer.cornerRadius = size.width >= view.bounds.width - 1 ? 0 : 16
        CATransaction.begin(); CATransaction.setDisableActions(true)
        previewLayer.frame = previewHost.bounds
        let layout = CaptureGuidance.layout(guide: guide, aspect: aspect)
        oval = layout.oval
        activeGuide = close ? CaptureGuidance.closeUpBox(aspect: aspect) : layout.guide
        // A close-up has no head in frame: just the corner marks with the midline and the level line.
        ovalLayer.isHidden = close || headImage != nil
        headView.isHidden = close || headImage == nil
        if close { headArc.isHidden = true }
        let ovalPx = CGRect(x: oval.minX * size.width, y: oval.minY * size.height, width: oval.width * size.width, height: oval.height * size.height)
        ovalLayer.path = UIBezierPath(ovalIn: ovalPx).cgPath
        if headImage != nil {
            let w = ovalPx.width * headSpread
            headView.frame = CGRect(x: ovalPx.midX - w / 2, y: ovalPx.minY, width: w, height: ovalPx.height)
        }
        CATransaction.commit()
        tickTop.frame = CGRect(x: size.width / 2 - 1, y: 0, width: 2, height: 14)
        tickBottom.frame = CGRect(x: size.width / 2 - 1, y: size.height - 14, width: 2, height: 14)
        let levelY = (close ? activeGuide.midY : oval.minY + oval.height * 0.36) * size.height
        let levelLength = close ? activeGuide.width * size.width * 0.9 : min(size.width * 0.5, 220)
        horizon.transform = .identity
        horizon.frame = CGRect(x: size.width / 2 - levelLength / 2, y: levelY - 1, width: levelLength, height: 2)
        horizonLeft.frame = CGRect(x: 0, y: 0, width: levelLength * 0.38, height: 2)
        horizonRight.frame = CGRect(x: levelLength * 0.62, y: 0, width: levelLength * 0.38, height: 2)
        horizonCentre.frame = CGRect(x: size.width / 2 - levelLength * 0.12, y: levelY - 1, width: levelLength * 0.24, height: 2)
        shotSwitch.selectedSegmentIndex = close ? 1 : 0
        applyShotTitles()
        placeSmileFrame(animated: false)
        drawHeadArc()
        applyRotation()

        let pic = previewHost.frame
        let d: CGFloat = 44
        if portrait {
            closeButton.frame = CGRect(x: safe.minX + 16, y: safe.minY + 4, width: d, height: d)
            autoButton.frame = CGRect(x: safe.maxX - 16 - d, y: safe.minY + 4, width: d, height: d)
            shotSwitch.frame = CGRect(x: safe.midX - 66, y: safe.minY + 10, width: 132, height: 32)
            layoutLenses(vertical: false)
            lensBack.frame.origin = CGPoint(x: pic.midX - lensBack.frame.width / 2, y: pic.maxY - 12 - lensBack.frame.height)
            chips.axis = .horizontal
            let chipsSize = chips.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
            chips.frame = CGRect(x: pic.midX - chipsSize.width / 2, y: pic.maxY + 12, width: chipsSize.width, height: 26)
            let cy = min(safe.maxY - 48, max(chips.frame.maxY + 50, (chips.frame.maxY + safe.maxY) / 2))
            shutter.frame = CGRect(x: safe.midX - 31, y: cy - 31, width: 62, height: 62)
            flipButton.frame = CGRect(x: safe.maxX - 32 - d, y: cy - d / 2, width: d, height: d)
            torchButton.frame = CGRect(x: safe.minX + 32, y: cy - d / 2, width: d, height: d)
        } else {
            let col = safe.maxX - column / 2
            let tall = safe.height >= 560
            closeButton.frame = CGRect(x: safe.minX + 8, y: safe.minY + 10, width: d, height: d)
            autoButton.frame = CGRect(x: safe.minX + 8, y: safe.maxY - 10 - d, width: d, height: d)
            torchButton.frame = CGRect(x: safe.minX + 8, y: autoButton.frame.minY - 12 - d, width: d, height: d)
            let switchWidth = min(112, column - 12)
            shotSwitch.frame = CGRect(x: col - switchWidth / 2, y: safe.minY + 12, width: switchWidth, height: 32)
            // Tall displays (iPad, the open Duo) keep the shutter mid-height with the checks at the foot of the column;
            // a phone on its side stacks from the foot, with the checks along the bottom of the picture.
            let cy = tall ? safe.midY + 20 : safe.maxY - 12 - d - 12 - 31
            shutter.frame = CGRect(x: col - 31, y: cy - 31, width: 62, height: 62)
            flipButton.frame = CGRect(x: col - d / 2, y: cy + 39 + 12, width: d, height: d)
            layoutLenses(vertical: true)
            lensBack.frame.origin = CGPoint(x: col - lensBack.frame.width / 2, y: cy - 39 - 14 - lensBack.frame.height)
            if tall {
                chips.axis = .vertical
                chips.alignment = .fill
                let chipsSize = chips.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
                chips.frame = CGRect(x: col - max(chipsSize.width, 96) / 2, y: safe.maxY - 12 - chipsSize.height, width: max(chipsSize.width, 96), height: chipsSize.height)
            } else {
                chips.axis = .horizontal
                chips.alignment = .center
                let chipsSize = chips.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
                chips.frame = CGRect(x: pic.midX - chipsSize.width / 2, y: pic.maxY - 12 - 26, width: chipsSize.width, height: 26)
            }
        }
        shutterHost.frame = shutter.frame.insetBy(dx: -8, dy: -8)
        let ring = UIBezierPath(arcCenter: CGPoint(x: shutterHost.bounds.midX, y: shutterHost.bounds.midY), radius: shutterHost.bounds.width / 2 - 2,
                                startAngle: -.pi / 2, endAngle: 1.5 * .pi, clockwise: true).cgPath
        shutterTrack.path = ring
        shutterRing.path = ring
        shutterLabel.frame = shutter.bounds
        updateTorchButton()
        layoutInstruction()
        let noteWidth = min((switchNote.text as NSString?)?.size(withAttributes: [.font: switchNote.font as Any]).width ?? 0, pic.width - 40) + 32
        switchNote.frame = CGRect(x: pic.midX - noteWidth / 2, y: pic.minY + 66, width: noteWidth, height: 34)
        review.frame = view.bounds
        review.layout(picture: pic, safe: safe)
        avoidCameraRegions()
    }

    /// The instruction pill, as wide as its words (within the picture), at the top of the picture.
    private func layoutInstruction() {
        let pic = previewHost.frame
        let words = (hint.text as NSString?)?.size(withAttributes: [.font: hint.font as Any]).width ?? 0
        let width = min(words + 40, pic.width - 32)
        instruction.frame = CGRect(x: pic.midX - width / 2, y: pic.minY + 14, width: width, height: 40)
        instruction.layer.cornerRadius = 20
        instructionGold.frame = instruction.bounds
        hint.frame = instruction.bounds.insetBy(dx: 16, dy: 0)
    }

    private func applyShotTitles() {
        let titles = closeUp ? ["Level", "Centred", "Size", "Teeth showing"] : ["Level", "Centred", "Distance", "Smile"]
        for (chip, title) in zip(chipViews, titles) where chip.title != title { chip.title = title }
    }

    // MARK: iPhone Duo

    /// On the inner display the front camera sits behind the screen and only shows while it's in use. Any
    /// control under its reserved area slides aside (from where it's drawn now, so the move is smooth).
    private func avoidCameraRegions() {
        guard #available(iOS 27.1, *) else { return }
        let regions = view.reservedRegions(kind: .occlusion).filter(\.isActive).map(\.frame)
        let free = view.bounds.inset(by: view.safeAreaInsets)
        var changed = false
        var targets: [(UIView, CGRect)] = []
        for control in [closeButton, flipButton, torchButton, autoButton, lensBack, shutter, instruction, shotSwitch, chips] as [UIView] {
            let base = control.frame
            var shift = CGVector.zero
            if let region = regions.first(where: { $0.intersects(base) }) {
                if region.maxX + 8 + base.width <= free.maxX { shift.dx = region.maxX + 8 - base.minX }
                else if region.minX - 8 - base.width >= free.minX { shift.dx = region.minX - 8 - base.maxX }
                else { shift.dy = region.maxY + 8 - base.minY }
            }
            if regionShifts[ObjectIdentifier(control)] != shift { changed = true }
            regionShifts[ObjectIdentifier(control)] = shift
            targets.append((control, base.offsetBy(dx: shift.dx, dy: shift.dy)))
        }
        let apply = {
            targets.forEach { $0.0.frame = $0.1 }
            self.shutterHost.frame = self.shutter.frame.insetBy(dx: -8, dy: -8)
        }
        if changed && view.window != nil {
            UIView.animate(withDuration: 0.32, delay: 0, options: [.beginFromCurrentState, .curveEaseOut], animations: apply)
        } else { apply() }
    }

    @objc private func sessionStarted() {
        DispatchQueue.main.async { self.view.setNeedsLayout() }
    }

    /// Fades the preview while the camera changes, so frames from the old camera don't flash, and says which one is in use.
    private func maskPreview(note: String?) {
        UIView.animate(withDuration: 0.16, delay: 0, options: [.beginFromCurrentState, .curveEaseOut]) { self.previewHost.alpha = 0.25 }
        UIView.animate(withDuration: 0.3, delay: 0.42, options: [.beginFromCurrentState, .curveEaseInOut]) { self.previewHost.alpha = 1 }
        guard let note else { return }
        showNote(note)
    }

    private func showNote(_ note: String) {
        switchNote.text = note
        view.setNeedsLayout(); view.layoutIfNeeded()
        switchNote.transform = CGAffineTransform(translationX: 0, y: -6)
        UIView.animate(withDuration: 0.28, delay: 0.1, options: [.beginFromCurrentState, .curveEaseOut]) {
            self.switchNote.alpha = 1; self.switchNote.transform = .identity
        } completion: { _ in
            UIView.animate(withDuration: 0.35, delay: 1.6, options: [.curveEaseIn]) { self.switchNote.alpha = 0 }
        }
    }

    /// iPhone Duo: opening or closing it moves the app to the other display, and a camera can then face the
    /// other way. The front camera is the system's virtual front camera, which follows the app by itself; a
    /// camera chosen to face the patient that now faces the person holding the phone is swapped for one that
    /// faces away. Every other iPhone reports each camera once, facing the way it always does.
    private func watchCameraDirections() {
        guard #available(iOS 27.1, *), directionCoordinator == nil else { return }
        let types: [AVCaptureDevice.DeviceType] = [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera, .builtInOuterUltraWideCamera, .builtInInnerUltraWideCamera]
        directionCoordinator = AVCaptureDeviceDirectionCoordinator(view: previewHost, deviceTypes: types) { [weak self] map in
            self?.cameraDirectionsChanged(map)
        }
    }

    @available(iOS 27.1, *)
    private func cameraDirectionsChanged(_ map: AVCaptureDeviceDirectionMap) {
        guard !front, let device else { return }
        let away = map.backwardFacingDeviceDescriptors
        guard !away.isEmpty, !away.contains(where: { $0.uniqueID == device.uniqueID }) else { return }
        let preference: [AVCaptureDevice.DeviceType] = [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera, .builtInOuterUltraWideCamera, .builtInInnerUltraWideCamera]
        guard let pick = away.min(by: { (preference.firstIndex(of: $0.deviceType) ?? 99) < (preference.firstIndex(of: $1.deviceType) ?? 99) }) else { return }
        chosenCameraID = pick.uniqueID
        latestFace = nil
        maskPreview(note: "Now using the camera facing away from you")
        configureSession()
    }

    /// The virtual front camera switches between the outer and inner cameras as the Duo opens and closes:
    /// the same short fade and a note, so the change doesn't look like a glitch.
    private func watchFrontCamera(_ device: AVCaptureDevice) {
        constituentWatch = nil
        guard device.isVirtualDevice, device.position == .front else { return }
        var last = device.activePrimaryConstituent?.uniqueID
        constituentWatch = device.observe(\.activePrimaryConstituent, options: [.new]) { [weak self] device, _ in
            let now = device.activePrimaryConstituent
            guard let id = now?.uniqueID, id != last else { return }
            let first = last == nil
            last = id
            if first { return }
            var note: String?
            if #available(iOS 27.1, *) {
                note = now?.deviceType == .builtInInnerUltraWideCamera ? "Now using the inner camera" : now?.deviceType == .builtInOuterUltraWideCamera ? "Now using the outer camera" : nil
            }
            DispatchQueue.main.async { self?.maskPreview(note: note) }
        }
    }

    // MARK: Orientation

    private func currentOrientation() -> AVCaptureVideoOrientation {
        switch view.window?.windowScene?.interfaceOrientation {
        case .landscapeLeft: return .landscapeLeft
        case .landscapeRight: return .landscapeRight
        case .portraitUpsideDown: return .portraitUpsideDown
        default: return .portrait
        }
    }

    /// Preview and analysis frames upright for the current orientation.
    private func applyRotation() {
        if let coordinator = rotationCoordinator as? AVCaptureDevice.RotationCoordinator {
            let previewAngle = coordinator.videoRotationAngleForHorizonLevelPreview
            let captureAngle = coordinator.videoRotationAngleForHorizonLevelCapture
            if let c = previewLayer.connection, c.isVideoRotationAngleSupported(previewAngle) { c.videoRotationAngle = previewAngle }
            sessionQueue.async {
                if let c = self.videoOutput.connection(with: .video), c.isVideoRotationAngleSupported(captureAngle) { c.videoRotationAngle = captureAngle }
            }
        }
    }

    // MARK: Session

    private static func camera(front: Bool) -> AVCaptureDevice? {
        if front { return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) }
        // A multi-lens virtual camera switches lenses as you zoom, like the Camera app.
        for type in [AVCaptureDevice.DeviceType.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera] {
            if let device = AVCaptureDevice.default(type, for: .video, position: .back) { return device }
        }
        return nil
    }

    private func configureSession() {
        let front = self.front
        if torchOn { torchOn = false; updateTorchButton() }
        sessionQueue.async {
            self.session.beginConfiguration()
            self.session.sessionPreset = .photo
            if self.session.isMultitaskingCameraAccessSupported {
                self.session.isMultitaskingCameraAccessEnabled = true
            }
            self.session.inputs.forEach { self.session.removeInput($0) }
            let chosen = self.chosenCameraID.flatMap { AVCaptureDevice(uniqueID: $0) }
            guard let device = chosen ?? Self.camera(front: front), let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else {
                self.session.commitConfiguration()
                #if targetEnvironment(simulator)
                DispatchQueue.main.async { self.startSimulatedCamera() }
                #else
                DispatchQueue.main.async { self.finish(.failed("The camera couldn’t be started.")) }
                #endif
                return
            }
            self.session.addInput(input)
            if !self.session.outputs.contains(self.photoOutput), self.session.canAddOutput(self.photoOutput) {
                self.session.addOutput(self.photoOutput)
            }
            if !self.session.outputs.contains(self.videoOutput), self.session.canAddOutput(self.videoOutput) {
                self.videoOutput.alwaysDiscardsLateVideoFrames = true
                self.videoOutput.setSampleBufferDelegate(self, queue: self.analysisQueue)
                self.session.addOutput(self.videoOutput)
            }
            // Analysis frames mirror the front preview, so landmarks map onto what is shown.
            if let c = self.videoOutput.connection(with: .video), c.isVideoMirroringSupported {
                c.automaticallyAdjustsVideoMirroring = false
                c.isVideoMirrored = front
            }
            self.photoOutput.maxPhotoQualityPrioritization = .quality
            self.session.commitConfiguration()

            // With an ultra-wide lens, 1× (the wide lens) is the first switch-over point.
            let switchOvers = device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat($0.doubleValue) }
            let hasUltraWide = device.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }
            let base = hasUltraWide ? (switchOvers.first ?? 1) : 1
            // Opening zoom: 2× on an iPhone's back camera (less perspective distortion than
            // the wide lens, full quality from the main sensor); 1× on iPad; 1.5× on the selfie camera.
            let phone = UIDevice.current.userInterfaceIdiom == .phone
            let start = front ? base * 1.5 : (phone ? base * 2 : base)
            self.device = device
            self.zoomBase = base
            self.zoomMax = min(device.maxAvailableVideoZoomFactor, max(base * 5, start))
            let stops = CaptureGuidance.lensStops(front: front, base: base, switchOvers: switchOvers, maxZoom: self.zoomMax)
            if (try? device.lockForConfiguration()) != nil {
                // Close up, a Pro iPhone would hop to its ultra-wide lens for macro, which distorts a smile: the
                // lens only changes when the zoom does.
                if device.isVirtualDevice, !device.constituentDevices.isEmpty {
                    device.setPrimaryConstituentDeviceSwitchingBehavior(.restricted, restrictedSwitchingBehaviorConditions: [.videoZoomChanged])
                }
                let bias = max(device.minExposureTargetBias, min(device.maxExposureTargetBias, self.exposureBias))
                device.setExposureTargetBias(bias, completionHandler: nil)
                device.unlockForConfiguration()
            }
            self.setZoom(start)
            DispatchQueue.main.async {
                self.lensStops = stops
                self.buildLenses()
                self.lastMeterPoint = nil
                self.rotationCoordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: self.previewLayer)
                // Mirror what faces the person holding the phone, whichever camera that is (not where it sits).
                if let c = self.previewLayer.connection, c.isVideoMirroringSupported {
                    c.automaticallyAdjustsVideoMirroring = false
                    c.isVideoMirrored = front
                }
                self.applyRotation()
                self.updateTorchButton()
                self.view.setNeedsLayout()
                self.watchCameraDirections()
                self.watchFrontCamera(device)
            }
            if !self.session.isRunning { self.session.startRunning() }
        }
    }

    @objc private func sessionInterrupted(_ note: Notification) {
        var message = "The camera is paused. Return to SmileCompose full screen to continue."
        if let raw = note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int,
           let reason = AVCaptureSession.InterruptionReason(rawValue: raw) {
            switch reason {
            case .videoDeviceNotAvailableWithMultipleForegroundApps:
                message = "The camera pauses while other apps share the screen. Show SmileCompose full screen."
            case .videoDeviceInUseByAnotherClient:
                message = "Another app is using the camera. Close it to continue."
            default: break
            }
        }
        DispatchQueue.main.async { self.setHint(message, ready: false) }
    }

    @objc private func sessionResumed() {
        DispatchQueue.main.async { self.setHint(CaptureGuidance.message(.noFace), ready: false) }
    }

    @objc private func sessionFailed() {
        sessionQueue.async { if !self.session.isRunning { self.session.startRunning() } }
    }

    // MARK: Guidance

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        // About eight checks a second is enough to guide, and light on the battery.
        let now = Date()
        guard now.timeIntervalSince(lastAnalysis) > 0.12, let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastAnalysis = now
        let request = VNDetectFaceLandmarksRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up)
        try? handler.perform([request])
        analysed(request.results)
    }

    /// Vision's faces for one frame, handed to the guidance on the main queue.
    private func analysed(_ results: [VNFaceObservation]?) {
        let largest = (results ?? []).max { $0.boundingBox.width < $1.boundingBox.width }
        let face = largest.flatMap(Self.describe)
        let evidence = largest.flatMap(Self.shotEvidence)
        DispatchQueue.main.async {
            guard !self.reviewing else { return }
            self.latestFace = face
            if let face { self.pitchDirection.observe(face) }
            self.observe(evidence)
            self.updateGuidance()
        }
    }

    /// Face or close-up, as this frame shows it (see CaptureGuidance.shot).
    private static func shotEvidence(_ observation: VNFaceObservation) -> CaptureGuidance.Shot? {
        let box = observation.boundingBox
        func points(_ region: VNFaceLandmarkRegion2D?) -> [CGPoint] {
            (region?.normalizedPoints ?? []).map { CGPoint(x: box.minX + $0.x * box.width, y: box.minY + $0.y * box.height) }
        }
        let lips = points(observation.landmarks?.outerLips)
        let eyes = points(observation.landmarks?.leftEye) + points(observation.landmarks?.rightEye)
        // A garbled reading (it happens) says nothing.
        guard (lips + eyes).allSatisfy({ $0.x.isFinite && $0.y.isFinite && abs($0.x) < 3 && abs($0.y) < 3 }) else { return nil }
        let mouth = lips.isEmpty ? nil : (lips.map(\.x).max()! - lips.map(\.x).min()!)
        return CaptureGuidance.shot(box: box, eyes: eyes, mouthWidth: mouth)
    }

    /// The shot follows the picture once it has shown the other kind for most of a second (never after a tap).
    private func observe(_ evidence: CaptureGuidance.Shot?) {
        guard chosenShot == nil, let evidence else { return }
        let now = Date()
        if evidence == shot { shotEvidence = nil; return }
        if let e = shotEvidence, e.shot == evidence, now.timeIntervalSince(e.last) < 0.5 {
            shotEvidence = (evidence, e.since, now)
            if now.timeIntervalSince(e.since) >= 0.8 {
                seenShot = evidence
                shotEvidence = nil
                shotChanged(note: evidence == .smile ? "Smile close-up" : "Full face")
            }
        } else {
            shotEvidence = (evidence, now, now)
        }
    }

    @objc private func shotChosen() {
        chosenShot = shotSwitch.selectedSegmentIndex == 1 ? .smile : .face
        seenShot = nil
        shotEvidence = nil
        shotChanged(note: nil)
    }

    /// The guide eases from the head to the close-up corners (or back) and the guidance starts over.
    private func shotChanged(note: String?) {
        UISelectionFeedbackGenerator().selectionChanged()
        readySince = nil
        wasReady = false
        smoothedMouth = nil
        lastMeterPoint = nil
        cancelCountdown()
        if !closeUp, torchOn { setTorch(false) }
        if let note { showNote(note) }
        UIView.animate(withDuration: 0.3, delay: 0, options: [.beginFromCurrentState, .curveEaseInOut]) {
            self.view.setNeedsLayout(); self.view.layoutIfNeeded()
        }
        updateGuidance()
    }

    /// Vision coordinates (normalised, origin bottom-left) to the photo frame's, origin top-left.
    private static func describe(_ observation: VNFaceObservation) -> CaptureGuidance.Face? {
        guard let landmarks = observation.landmarks, let outer = landmarks.outerLips, let inner = landmarks.innerLips,
              let leftEye = landmarks.leftEye, let rightEye = landmarks.rightEye, let nose = landmarks.nose else { return nil }
        let box = observation.boundingBox
        func points(_ region: VNFaceLandmarkRegion2D) -> [CGPoint] {
            region.normalizedPoints.map { CGPoint(x: box.minX + $0.x * box.width, y: 1 - (box.minY + $0.y * box.height)) }
        }
        let lips = points(outer), opening = points(inner), eyes = points(leftEye) + points(rightEye)
        guard (lips + opening + eyes).allSatisfy({ $0.x.isFinite && $0.y.isFinite && abs($0.x) < 3 && abs($0.y) < 3 }) else { return nil }
        guard let minX = lips.map(\.x).min(), let maxX = lips.map(\.x).max(), let minY = lips.map(\.y).min(), let maxY = lips.map(\.y).max(),
              let innerTop = opening.map(\.y).min(), let innerBottom = opening.map(\.y).max(), let noseBase = points(nose).map(\.y).max(),
              maxX > minX, !eyes.isEmpty else { return nil }
        let eyeY = eyes.map(\.y).reduce(0, +) / CGFloat(eyes.count)
        let mouthY = (minY + maxY) / 2
        let degrees: (NSNumber?) -> CGFloat = { CGFloat(($0?.doubleValue ?? 0) * 180 / .pi) }
        return CaptureGuidance.Face(
            centreX: box.midX,
            mouth: CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY),
            opening: (innerBottom - innerTop) / (maxX - minX),
            rollDegrees: degrees(observation.roll),
            yawDegrees: degrees(observation.yaw),
            pitchDegrees: degrees(observation.pitch),
            noseRatio: mouthY > eyeY ? (noseBase - eyeY) / (mouthY - eyeY) : 0)
    }

    /// Chin drop in degrees: positive when the chin is down. Until the direction
    /// is learnt, Vision's sign is assumed (and prompts stay neutral).
    private var chinDown: CGFloat { (latestFace?.pitchDegrees ?? 0) * (pitchDirection.sign ?? 1) }

    private func updateGuidance() {
        guard !reviewing else { return }
        let gravity = motion.deviceMotion.map { ($0.gravity.x, $0.gravity.y, $0.gravity.z) }
        let close = closeUp
        let box = activeGuide
        let step = close ? CaptureGuidance.closeUpStep(face: latestFace, box: box, gravity: gravity)
            : CaptureGuidance.step(face: latestFace, guide: box, gravity: gravity, chinDown: chinDown, known: pitchDirection.sign != nil)
        let checks = CaptureGuidance.checks(face: latestFace, guide: box, gravity: gravity, chinDown: chinDown, closeUp: close)
        let ready = step == .ready
        readySince = ready ? (readySince ?? Date()) : nil
        let steady = ready && Date().timeIntervalSince(readySince!) > 0.6
        if !ready { cancelCountdown() }
        if autoCapture, steady, countdown == nil, shutter.isEnabled { startCountdown() }
        if countdown == nil {
            let text = steady ? (autoCapture ? "Hold still" : "Lined up — take the photo") : close ? CaptureGuidance.closeUpMessage(step) : CaptureGuidance.message(step)
            setHint(text, ready: ready)
        }
        if steady && !wasReady { haptic.impactOccurred() }
        wasReady = steady

        for (chip, met) in zip(chipViews, checks) { chip.done = met }
        let progress = CGFloat(checks.filter { $0 }.count) / CGFloat(max(1, checks.count))
        shutterRing.strokeEnd = progress
        shutter.backgroundColor = steady ? Self.gold : .white
        tickTop.backgroundColor = checks.count > 1 && checks[1] ? Self.gold : Self.quiet
        tickBottom.backgroundColor = tickTop.backgroundColor
        let roll = gravity.map { CaptureGuidance.deviceLevel(gravity: $0).sideDegrees } ?? 0
        let level = abs(roll) <= 3
        UIView.animate(withDuration: 0.12, delay: 0, options: [.beginFromCurrentState, .curveLinear]) {
            self.horizon.transform = CGAffineTransform(rotationAngle: CGFloat(max(-15, min(15, roll))) * .pi / 180)
        }
        horizonLeft.backgroundColor = level ? Self.gold : .white
        horizonRight.backgroundColor = horizonLeft.backgroundColor
        horizonCentre.isHidden = level
        placeSmileFrame(animated: true)

        // Focus and exposure follow the mouth (or the close-up box until the mouth is found).
        if let f = latestFace { meter(at: CGPoint(x: f.mouth.midX, y: f.mouth.midY), near: close) }
        else if close { meter(at: CGPoint(x: box.midX, y: box.midY), near: true) }
        drawHeadArc()
    }

    /// The smile frame: in a face photo it hugs the patient's own smile (eased so it doesn't jitter), or marks where
    /// the smile should sit until one is found; in a close-up it marks the target box. Gold once lined up.
    private func placeSmileFrame(animated: Bool) {
        let size = previewHost.bounds.size
        guard size.width > 0 else { return }
        var target: CGRect
        var faint = false
        if !closeUp, let m = latestFace?.mouth {
            let hug = CGRect(x: m.minX - m.width * 0.12, y: m.minY - m.height * 0.18, width: m.width * 1.24, height: m.height * 1.36)
            if let s = smoothedMouth {
                let k: CGFloat = 0.45
                smoothedMouth = CGRect(x: s.minX + (hug.minX - s.minX) * k, y: s.minY + (hug.minY - s.minY) * k,
                                       width: s.width + (hug.width - s.width) * k, height: s.height + (hug.height - s.height) * k)
            } else { smoothedMouth = hug }
            target = smoothedMouth!
        } else {
            if !closeUp { smoothedMouth = nil; faint = true }
            target = activeGuide
        }
        let frame = CGRect(x: target.minX * size.width, y: target.minY * size.height, width: target.width * size.width, height: target.height * size.height)
        let ready = shutter.backgroundColor == Self.gold || readySince != nil
        smileFrame.length = closeUp ? 28 : 18
        smileFrame.color = ready ? Self.gold : .white
        let apply = {
            self.smileFrame.frame = frame
            self.smileFrame.alpha = faint ? 0.5 : 1
            // The exposure sun sits beside the frame, on whichever side has room.
            let right = frame.maxX + 34 <= size.width
            let x = right ? frame.maxX + 6 : frame.minX - 26
            self.exposureMark.frame = CGRect(x: x, y: frame.midY - 26, width: 20, height: 52)
            self.layoutExposureMark()
            self.exposureMark.alpha = faint ? 0 : 1
        }
        if animated { UIView.animate(withDuration: 0.14, delay: 0, options: [.beginFromCurrentState, .curveLinear], animations: apply) } else { apply() }
    }

    private func layoutExposureMark() {
        let h = exposureMark.bounds.height
        let t = CGFloat((exposureBias + 1.5) / 3) // 0 darkest … 1 brightest
        let sunY = (h - 18) * (1 - t)
        exposureSun.frame = CGRect(x: 1, y: sunY, width: 18, height: 18)
        exposureTrack.frame = CGRect(x: 9.25, y: 0, width: 1.5, height: h)
        exposureTrack.alpha = 0.7
    }

    /// Focus and exposure on a point of the picture (normalised, top-left origin); a smile close-up also tells the
    /// lens to search near distances first. Only moved when the point moves, so the picture doesn't pulse.
    private func meter(at point: CGPoint, near: Bool) {
        let size = previewHost.bounds.size
        guard size.width > 0 else { return }
        if let last = lastMeterPoint, hypot(last.x - point.x, last.y - point.y) < 0.04, Date().timeIntervalSince(lastMeterTime) < 3 { return }
        lastMeterPoint = point
        lastMeterTime = Date()
        let devicePoint = previewLayer.captureDevicePointConverted(fromLayerPoint: CGPoint(x: point.x * size.width, y: point.y * size.height))
        sessionQueue.async {
            guard let d = self.device, (try? d.lockForConfiguration()) != nil else { return }
            if d.isFocusPointOfInterestSupported, d.isFocusModeSupported(.continuousAutoFocus) {
                d.focusPointOfInterest = devicePoint
                d.focusMode = .continuousAutoFocus
            }
            if d.isExposurePointOfInterestSupported, d.isExposureModeSupported(.continuousAutoExposure) {
                d.exposurePointOfInterest = devicePoint
                d.exposureMode = .continuousAutoExposure
            }
            if d.isAutoFocusRangeRestrictionSupported { d.autoFocusRangeRestriction = near ? .near : .none }
            d.unlockForConfiguration()
        }
    }

    /// Drag up to brighten, down to darken (within ±1.5 stops), as in the Camera app.
    @objc private func panned(_ gesture: UIPanGestureRecognizer) {
        let dy = gesture.translation(in: previewHost).y
        gesture.setTranslation(.zero, in: previewHost)
        exposureBias = max(-1.5, min(1.5, exposureBias - Float(dy / 140)))
        let bias = exposureBias
        layoutExposureMark()
        sessionQueue.async {
            guard let d = self.device, (try? d.lockForConfiguration()) != nil else { return }
            d.setExposureTargetBias(max(d.minExposureTargetBias, min(d.maxExposureTargetBias, bias)), completionHandler: nil)
            d.unlockForConfiguration()
        }
    }

    /// The head's eye-level "equator", pinned to the oval's sides at the centre
    /// line. It curves down as the chin drops and up as it lifts (the front of a
    /// ring around the head, seen from the camera), and disappears once level.
    private func drawHeadArc() {
        if closeUp { headArc.isHidden = true; return }
        let size = previewHost.bounds.size
        guard latestFace != nil, abs(chinDown) > CaptureGuidance.maxPitch, size.width > 0 else { headArc.isHidden = true; return }
        let x0 = oval.minX * size.width, x1 = oval.maxX * size.width, y = oval.midY * size.height
        let depth = (x1 - x0) / 2 * sin(min(35, abs(chinDown)) * .pi / 180) * 1.8 * (chinDown > 0 ? 1 : -1)
        let path = UIBezierPath()
        path.move(to: CGPoint(x: x0, y: y))
        path.addCurve(to: CGPoint(x: x1, y: y),
                      controlPoint1: CGPoint(x: x0, y: y + depth * 1.33),
                      controlPoint2: CGPoint(x: x1, y: y + depth * 1.33))
        CATransaction.begin(); CATransaction.setDisableActions(true)
        headArc.path = path.cgPath
        headArc.isHidden = false
        CATransaction.commit()
    }

    private func setHint(_ text: String, ready: Bool) {
        let changed = hint.text != text
        hint.text = text
        hint.textColor = ready ? Self.ink : .white
        UIView.animate(withDuration: 0.2) { self.instructionGold.alpha = ready ? 1 : 0 }
        ovalLayer.strokeColor = (ready ? Self.gold : UIColor(white: 1, alpha: 0.9)).cgColor
        headView.tintColor = ready ? Self.gold : UIColor(white: 1, alpha: 0.88)
        if changed {
            UIView.animate(withDuration: 0.18, delay: 0, options: [.beginFromCurrentState, .curveEaseOut]) { self.layoutInstruction() }
        }
    }

    // MARK: Lenses

    private func buildLenses() {
        lensButtons.forEach { $0.removeFromSuperview() }
        lensButtons = lensStops.enumerated().map { i, stop in
            let b = UIButton(type: .custom)
            b.tag = i
            b.layer.cornerRadius = 19
            b.addTarget(self, action: #selector(lensTapped(_:)), for: .touchUpInside)
            b.accessibilityLabel = "Zoom \(Self.format(stop))×"
            lensBar.addArrangedSubview(b)
            return b
        }
        lensBack.isHidden = lensStops.count < 2
        updateLensTitles()
        view.setNeedsLayout()
    }

    private func layoutLenses(vertical: Bool) {
        lensBar.axis = vertical ? .vertical : .horizontal
        let n = CGFloat(lensButtons.count), d: CGFloat = 38
        let long = n * d + max(0, n - 1) * 4 + 8
        lensBack.frame.size = vertical ? CGSize(width: d + 8, height: long) : CGSize(width: long, height: d + 8)
        lensBack.layer.cornerRadius = (d + 8) / 2
        lensBar.frame = lensBack.bounds.insetBy(dx: 4, dy: 4)
    }

    private static func format(_ v: CGFloat) -> String {
        abs(v - v.rounded()) < 0.05 ? String(Int(v.rounded())) : String(format: "%.1f", v)
    }

    /// The chosen lens reads in gold with "×"; between stops, the nearest shows the exact zoom.
    private func updateLensTitles() {
        let current = currentZoom / zoomBase
        let nearest = lensStops.enumerated().min { abs($0.element - current) < abs($1.element - current) }?.offset
        for (i, b) in lensButtons.enumerated() {
            let selected = i == nearest
            let stop = lensStops[i]
            let title = selected ? "\(Self.format(abs(stop - current) < 0.06 ? stop : current))×" : Self.format(stop)
            b.setTitle(title, for: .normal)
            b.setTitleColor(selected ? Self.gold : .white, for: .normal)
            b.titleLabel?.font = .systemFont(ofSize: selected ? 13 : 12, weight: selected ? .bold : .semibold)
            b.backgroundColor = selected ? UIColor(white: 1, alpha: 0.16) : .clear
            b.accessibilityTraits = selected ? [.button, .selected] : .button
        }
    }

    @objc private func lensTapped(_ sender: UIButton) {
        guard lensStops.indices.contains(sender.tag) else { return }
        let target = lensStops[sender.tag] * zoomBase
        UISelectionFeedbackGenerator().selectionChanged()
        sessionQueue.async {
            guard let d = self.device, (try? d.lockForConfiguration()) != nil else { return }
            d.ramp(toVideoZoomFactor: min(max(target, self.zoomBase), self.zoomMax), withRate: 12)
            d.unlockForConfiguration()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { self.updateLensTitles() }
        }
    }

    // MARK: Zoom, light, auto capture, flip

    private func setZoom(_ factor: CGFloat) {
        guard let device = device else { return }
        let clamped = min(max(factor, zoomBase), zoomMax)
        if (try? device.lockForConfiguration()) != nil {
            device.videoZoomFactor = clamped
            device.unlockForConfiguration()
        }
        DispatchQueue.main.async { self.updateLensTitles() }
    }

    private var currentZoom: CGFloat { device?.videoZoomFactor ?? zoomBase }

    @objc private func pinched(_ gesture: UIPinchGestureRecognizer) {
        if gesture.state == .began { pinchStart = currentZoom }
        let target = pinchStart * gesture.scale
        sessionQueue.async { self.setZoom(target) }
    }

    /// The back camera's light, for close-ups (it would flatten a face photo, so it shows only for a smile).
    private var torchAvailable: Bool { closeUp && !front && (device?.hasTorch ?? false) }

    private func updateTorchButton() {
        torchButton.isHidden = !torchAvailable
        let symbols = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
        torchButton.setImage(UIImage(systemName: torchOn ? "flashlight.on.fill" : "flashlight.off.fill", withConfiguration: symbols), for: .normal)
        torchButton.tintColor = torchOn ? Self.ink : .white
        torchButton.backgroundColor = torchOn ? Self.gold : UIColor(white: 1, alpha: 0.14)
        torchButton.accessibilityValue = torchOn ? "On" : "Off"
    }

    @objc private func toggleTorch() { setTorch(!torchOn) }

    private func setTorch(_ on: Bool) {
        torchOn = on && torchAvailable
        updateTorchButton()
        let wanted = torchOn
        sessionQueue.async {
            guard let d = self.device, d.hasTorch, (try? d.lockForConfiguration()) != nil else { return }
            if wanted, d.isTorchAvailable { try? d.setTorchModeOn(level: 0.5) } else { d.torchMode = .off }
            d.unlockForConfiguration()
        }
    }

    private func updateAutoButton() {
        autoButton.tintColor = autoCapture ? Self.ink : .white
        autoButton.backgroundColor = autoCapture ? Self.gold : UIColor(white: 1, alpha: 0.14)
        autoButton.accessibilityValue = autoCapture ? "On" : "Off"
        shutterLabel.text = autoCapture ? "AUTO" : nil
    }

    /// Auto capture: once lined up and held still, two ticks and the photo is taken (no voice).
    @objc private func toggleAuto() {
        autoCapture.toggle()
        UserDefaults.standard.set(autoCapture, forKey: Self.autoKey)
        UISelectionFeedbackGenerator().selectionChanged()
        updateAutoButton()
        showNote(autoCapture ? "Auto capture on" : "Auto capture off")
        if !autoCapture { cancelCountdown() }
        updateGuidance()
    }

    private func startCountdown() {
        let tick = { (left: Int) in
            AudioServicesPlaySystemSound(1103)
            self.setHint("Taking in \(left)…", ready: true)
        }
        tick(2)
        let timer = Timer.scheduledTimer(withTimeInterval: 0.6, repeats: true) { [weak self] timer in
            guard let self, let c = self.countdown else { timer.invalidate(); return }
            let left = c.left - 1
            if left <= 0 {
                self.cancelCountdown()
                self.capture()
            } else {
                self.countdown = (left, timer)
                tick(left)
            }
        }
        countdown = (2, timer)
    }

    private func cancelCountdown() {
        countdown?.timer.invalidate()
        countdown = nil
    }

    private func hardwareShutter() {
        if reviewing { return }
        capture()
    }

    @objc private func flip() {
        front.toggle()
        chosenCameraID = nil
        latestFace = nil
        smoothedMouth = nil
        configureSession()
    }

    @objc private func cancel() { finish(.cancelled) }

    // MARK: Capture and the quick check

    private var guideAtCapture = CGRect.zero
    private var closeUpAtCapture = false

    @objc private func capture() {
        guard shutter.isEnabled, !reviewing else { return }
        cancelCountdown()
        shutter.isEnabled = false
        // The smile as found (in a face photo) or the box (otherwise), returned as the photo's framing.
        let unit = CGRect(x: 0, y: 0, width: 1, height: 1)
        guideAtCapture = (!closeUp ? smoothedMouth?.intersection(unit) : nil).flatMap { $0.isNull || $0.width < 0.02 ? nil : $0 } ?? activeGuide
        closeUpAtCapture = closeUp
        levelAtCapture = motion.deviceMotion.map { CaptureGuidance.deviceLevel(gravity: ($0.gravity.x, $0.gravity.y, $0.gravity.z)).sideDegrees } ?? 0
        let captureAngle = (rotationCoordinator as? AVCaptureDevice.RotationCoordinator)?.videoRotationAngleForHorizonLevelCapture
        let mirrored = front
        #if targetEnvironment(simulator)
        if let frame = simFrame, let data = UIImage(cgImage: frame).jpegData(compressionQuality: 0.9) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.showReview(data) }
            return
        }
        #endif
        sessionQueue.async {
            let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            settings.photoQualityPrioritization = .quality
            if let connection = self.photoOutput.connection(with: .video) {
                if let angle = captureAngle, connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
                // The front camera's photo matches its mirrored live view, as the web capture does.
                if connection.isVideoMirroringSupported {
                    connection.automaticallyAdjustsVideoMirroring = false
                    connection.isVideoMirrored = mirrored
                }
            }
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
        UIView.animate(withDuration: 0.08, animations: { self.previewHost.alpha = 0.2 }) { _ in
            UIView.animate(withDuration: 0.2) { self.previewHost.alpha = 1 }
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else {
            DispatchQueue.main.async {
                self.shutter.isEnabled = true
                self.setHint("That photo didn’t work. Please try again.", ready: false)
            }
            return
        }
        DispatchQueue.main.async { self.showReview(data) }
    }

    /// The photo with a quick check — sharp on the teeth, teeth not too bright, eyes open, level — then
    /// Retake or Use photo. The check runs on the device and only advises; it never blocks the photo.
    private func showReview(_ data: Data) {
        pendingPhoto = data
        reviewing = true
        if torchOn { setTorch(false) }
        let closeUp = closeUpAtCapture, box = closeUpAtCapture ? activeGuide : guideAtCapture, level = levelAtCapture
        review.show(image: nil, rows: nil)
        review.isHidden = false
        review.alpha = 0
        UIView.animate(withDuration: 0.2) { self.review.alpha = 1 }
        DispatchQueue.global(qos: .userInitiated).async {
            let image = PhotoCheck.uprightImage(data, maxSide: 1600)
            let rows = image.map { PhotoCheck.review($0, closeUp: closeUp, fallback: box, levelDegrees: level) } ?? []
            DispatchQueue.main.async {
                guard self.reviewing else { return }
                self.review.show(image: image.map { UIImage(cgImage: $0) }, rows: rows)
                UIAccessibility.post(notification: .screenChanged, argument: self.review)
            }
        }
    }

    private func retake() {
        pendingPhoto = nil
        reviewing = false
        readySince = nil
        wasReady = false
        UIView.animate(withDuration: 0.18, animations: { self.review.alpha = 0 }) { _ in self.review.isHidden = true }
        shutter.isEnabled = true
        updateGuidance()
    }

    private func usePhoto() {
        guard let data = pendingPhoto else { return }
        finish(.captured(data, guideAtCapture, closeUp: closeUpAtCapture))
    }

    private func finish(_ result: Result) {
        guard !finished else { return }
        finished = true
        cancelCountdown()
        #if targetEnvironment(simulator)
        simTimer?.invalidate()
        #endif
        motion.stopDeviceMotionUpdates()
        sessionQueue.async {
            if let d = self.device, d.hasTorch, d.torchMode != .off, (try? d.lockForConfiguration()) != nil { d.torchMode = .off; d.unlockForConfiguration() }
            if self.session.isRunning { self.session.stopRunning() }
        }
        dismiss(animated: true) { self.completion(result) }
    }
}

#if targetEnvironment(simulator)
/// Simulator only (there is no camera): the sample face bundled with the app stands in for the live picture, cropped
/// to the current shape (the mouth for a close-up) and run through the same Vision guidance, so layouts and the
/// photo check can be tried. Launch a Debug build with `-SmileCameraPreview face` (or `smile`) to open it directly.
extension SmileCameraViewController {
    func startSimulatedCamera() {
        guard simSource == nil, let url = Bundle.main.url(forResource: "p-sofia-before", withExtension: "webp", subdirectory: "public/onboarding/intro"),
              let image = UIImage(contentsOfFile: url.path)?.cgImage else { cancelSimulated(); return }
        simSource = image
        simLayer.contentsGravity = .resizeAspectFill
        installSimulatedLayer()
        showSimulatedLenses()
        if UserDefaults.standard.string(forKey: "SmileCameraPreview") == "smile" { chooseSimulatedSmile() }
        simTimer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in self?.simulatedFrame() }
    }

    private func simulatedFrame() {
        guard let source = simSource, let size = simulatedSize, size.width > 0 else { return }
        let aspect = size.width / size.height
        let W = CGFloat(source.width), H = CGFloat(source.height)
        var crop: CGRect
        if simulatedCloseUp {
            let w = (196 / 900 * W) / 0.62, h = w / aspect
            crop = CGRect(x: 490 / 900 * W - w / 2, y: 583 / 1200 * H - h / 2, width: w, height: h)
        } else {
            var w = W, h = W / aspect
            if h > H { h = H; w = H * aspect }
            crop = CGRect(x: (W - w) / 2, y: max(0, min(H - h, 0.42 * H - h / 2)), width: w, height: h)
        }
        guard let frame = source.cropping(to: crop.integral) else { return }
        simFrame = frame
        CATransaction.begin(); CATransaction.setDisableActions(true)
        simLayer.frame = CGRect(origin: .zero, size: size)
        simLayer.contents = frame
        CATransaction.commit()
        simulatedAnalysis(crop: crop.integral, scale: W / 900)
    }
}
#endif

/// Four corner marks round a rectangle, with rounded corners; the path eases with the frame when animated.
final class CornerFrameView: UIView {
    override class var layerClass: AnyClass { CAShapeLayer.self }
    private var shape: CAShapeLayer { layer as! CAShapeLayer }
    var color: UIColor = .white { didSet { shape.strokeColor = color.cgColor } }
    var length: CGFloat = 20 { didSet { if oldValue != length { setNeedsLayout() } } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        shape.fillColor = nil
        shape.lineWidth = 3
        shape.lineCap = .round
        shape.lineJoin = .round
        shape.strokeColor = UIColor.white.cgColor
        isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let r = bounds.insetBy(dx: 1.5, dy: 1.5)
        guard r.width > 4, r.height > 4 else { shape.path = nil; return }
        let l = min(length, r.width / 3, r.height / 3), c = min(10, l / 2)
        let p = UIBezierPath()
        p.move(to: CGPoint(x: r.minX, y: r.minY + l)); p.addLine(to: CGPoint(x: r.minX, y: r.minY + c))
        p.addQuadCurve(to: CGPoint(x: r.minX + c, y: r.minY), controlPoint: CGPoint(x: r.minX, y: r.minY)); p.addLine(to: CGPoint(x: r.minX + l, y: r.minY))
        p.move(to: CGPoint(x: r.maxX - l, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX - c, y: r.minY))
        p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + c), controlPoint: CGPoint(x: r.maxX, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.minY + l))
        p.move(to: CGPoint(x: r.maxX, y: r.maxY - l)); p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - c))
        p.addQuadCurve(to: CGPoint(x: r.maxX - c, y: r.maxY), controlPoint: CGPoint(x: r.maxX, y: r.maxY)); p.addLine(to: CGPoint(x: r.maxX - l, y: r.maxY))
        p.move(to: CGPoint(x: r.minX + l, y: r.maxY)); p.addLine(to: CGPoint(x: r.minX + c, y: r.maxY))
        p.addQuadCurve(to: CGPoint(x: r.minX, y: r.maxY - c), controlPoint: CGPoint(x: r.minX, y: r.maxY)); p.addLine(to: CGPoint(x: r.minX, y: r.maxY - l))
        let duration = UIView.inheritedAnimationDuration
        if duration > 0, let from = shape.presentation()?.path ?? shape.path {
            let ease = CABasicAnimation(keyPath: "path")
            ease.fromValue = from
            ease.duration = duration
            shape.add(ease, forKey: "path")
        }
        shape.path = p.cgPath
    }
}

/// One of the camera's checks: a small pill that turns gold, with a tick, once it is met.
final class CheckChip: UILabel {
    var title = "" { didSet { refresh() } }
    var done = false { didSet { if oldValue != done { refresh() } } }

    init() {
        super.init(frame: .zero)
        font = .systemFont(ofSize: 12.5, weight: .semibold)
        textAlignment = .center
        layer.cornerRadius = 13
        layer.masksToBounds = true
        refresh()
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var intrinsicContentSize: CGSize {
        let s = super.intrinsicContentSize
        return CGSize(width: s.width + 20, height: 26)
    }

    private func refresh() {
        let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
        let text = NSMutableAttributedString()
        if done, let tick = UIImage(systemName: "checkmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 10, weight: .bold))?.withTintColor(gold, renderingMode: .alwaysOriginal) {
            text.append(NSAttributedString(attachment: NSTextAttachment(image: tick)))
            text.append(NSAttributedString(string: " "))
        }
        text.append(NSAttributedString(string: title))
        attributedText = text
        textColor = done ? gold : UIColor(white: 1, alpha: 0.8)
        backgroundColor = done ? UIColor(red: 0.16, green: 0.125, blue: 0.086, alpha: 0.82) : UIColor(white: 0.08, alpha: 0.62)
        accessibilityLabel = "\(title): \(done ? "done" : "not yet")"
        invalidateIntrinsicContentSize()
    }
}

/// The photo just taken, with the quick check and Retake / Use photo.
final class PhotoReviewView: UIView {
    var onRetake: (() -> Void)?
    var onUse: (() -> Void)?
    private let imageView = UIImageView()
    private let heading = UILabel()
    private let card = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterialDark))
    private let rowsStack = UIStackView()
    private let checking = UILabel()
    private let retakeButton = UIButton(type: .system)
    private let useButton = UIButton(type: .system)
    private var picture = CGRect.zero
    private var safe = CGRect.zero

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(red: 14 / 255, green: 13 / 255, blue: 12 / 255, alpha: 1)
        imageView.contentMode = .scaleAspectFit
        imageView.clipsToBounds = true
        addSubview(imageView)
        heading.text = "Check the photo"
        heading.textColor = UIColor(red: 246 / 255, green: 241 / 255, blue: 232 / 255, alpha: 1)
        heading.font = .systemFont(ofSize: 17, weight: .semibold)
        heading.textAlignment = .center
        heading.accessibilityTraits = .header
        addSubview(heading)
        card.clipsToBounds = true
        card.layer.cornerRadius = 22
        addSubview(card)
        rowsStack.axis = .vertical
        rowsStack.spacing = 8
        card.contentView.addSubview(rowsStack)
        checking.text = "Checking the photo…"
        checking.textColor = UIColor(white: 1, alpha: 0.75)
        checking.font = .systemFont(ofSize: 14, weight: .medium)
        card.contentView.addSubview(checking)
        let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
        for (button, title) in [(retakeButton, "Retake"), (useButton, "Use photo")] {
            button.setTitle(title, for: .normal)
            button.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
            button.layer.cornerRadius = 23
            card.contentView.addSubview(button)
        }
        retakeButton.backgroundColor = UIColor(white: 1, alpha: 0.12)
        retakeButton.setTitleColor(.white, for: .normal)
        useButton.backgroundColor = gold
        useButton.setTitleColor(UIColor(red: 26 / 255, green: 22 / 255, blue: 18 / 255, alpha: 1), for: .normal)
        retakeButton.addTarget(self, action: #selector(retakeTapped), for: .touchUpInside)
        useButton.addTarget(self, action: #selector(useTapped), for: .touchUpInside)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    @objc private func retakeTapped() { onRetake?() }
    @objc private func useTapped() { onUse?() }

    /// `rows` nil while the check runs; each row is what was found and whether it is fine.
    func show(image: UIImage?, rows: [(String, Bool)]?) {
        if let image { imageView.image = image } else if rows == nil { imageView.image = nil }
        rowsStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        checking.isHidden = rows != nil
        useButton.isEnabled = rows != nil
        useButton.alpha = rows != nil ? 1 : 0.5
        let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
        let amber = UIColor(red: 1, green: 0.72, blue: 0.35, alpha: 1)
        for (text, fine) in rows ?? [] {
            let label = UILabel()
            let line = NSMutableAttributedString()
            let symbol = UIImage(systemName: fine ? "checkmark" : "exclamationmark.triangle.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .bold))?
                .withTintColor(fine ? gold : amber, renderingMode: .alwaysOriginal)
            if let symbol { line.append(NSAttributedString(attachment: NSTextAttachment(image: symbol))) }
            line.append(NSAttributedString(string: "  " + text))
            label.attributedText = line
            label.textColor = UIColor(red: 246 / 255, green: 241 / 255, blue: 232 / 255, alpha: 1)
            label.font = .systemFont(ofSize: 14.5, weight: fine ? .medium : .semibold)
            label.numberOfLines = 0
            label.accessibilityLabel = fine ? text : "Check: \(text)"
            rowsStack.addArrangedSubview(label)
        }
        setNeedsLayout()
    }

    func layout(picture: CGRect, safe: CGRect) {
        self.picture = picture
        self.safe = safe
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard picture.width > 0 else { return }
        let portrait = bounds.height >= bounds.width
        if !portrait {
            layoutSideways()
            return
        }
        imageView.frame = picture
        imageView.layer.cornerRadius = picture.width >= bounds.width - 1 ? 0 : 16
        heading.textAlignment = .center
        heading.frame = CGRect(x: safe.minX, y: safe.minY + 10, width: safe.width, height: 30)
        let width = min(safe.width - 32, 420)
        let inner = width - 36
        let rowsHeight = rowsStack.arrangedSubviews.isEmpty ? 20 : rowsStack.systemLayoutSizeFitting(CGSize(width: inner, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        let height = 18 + rowsHeight + 16 + 46 + 18
        let y = portrait ? safe.maxY - 12 - height : min(picture.maxY - 24, safe.maxY - 12) - height
        card.frame = CGRect(x: (portrait ? safe.midX : picture.midX) - width / 2, y: max(safe.minY + 8, y), width: width, height: height)
        rowsStack.frame = CGRect(x: 18, y: 18, width: inner, height: rowsHeight)
        checking.frame = rowsStack.frame
        let bw = (inner - 12) / 2
        retakeButton.frame = CGRect(x: 18, y: height - 18 - 46, width: bw, height: 46)
        useButton.frame = CGRect(x: 18 + bw + 12, y: height - 18 - 46, width: bw, height: 46)
    }

    /// Sideways the check sits in a column beside the photo (it would otherwise cover the smile): the heading,
    /// the findings, then Use photo over Retake. The photo takes the rest of the width at its own shape.
    private func layoutSideways() {
        let cardWidth = min(340, max(272, safe.width * 0.36))
        let inner = cardWidth - 36
        let area = CGRect(x: safe.minX + 12, y: safe.minY + 8, width: safe.width - cardWidth - 36, height: safe.height - 16)
        let size = imageView.image?.size ?? picture.size
        let aspect = size.height > 0 ? size.width / size.height : 4.0 / 3.0
        var fit = CGSize(width: area.height * aspect, height: area.height)
        if fit.width > area.width { fit = CGSize(width: area.width, height: area.width / aspect) }
        imageView.frame = CGRect(x: area.midX - fit.width / 2, y: area.midY - fit.height / 2, width: fit.width, height: fit.height)
        imageView.layer.cornerRadius = 16
        let rowsHeight = rowsStack.arrangedSubviews.isEmpty ? 20 : rowsStack.systemLayoutSizeFitting(CGSize(width: inner, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        let height = min(safe.height - 16, 18 + 26 + 12 + rowsHeight + 18 + 46 + 10 + 46 + 18)
        card.frame = CGRect(x: safe.maxX - 12 - cardWidth, y: safe.midY - height / 2, width: cardWidth, height: height)
        heading.textAlignment = .left
        heading.frame = CGRect(x: card.frame.minX + 18, y: card.frame.minY + 16, width: inner, height: 26)
        bringSubviewToFront(heading)
        rowsStack.frame = CGRect(x: 18, y: 18 + 26 + 12, width: inner, height: rowsHeight)
        checking.frame = rowsStack.frame
        useButton.frame = CGRect(x: 18, y: height - 18 - 46 - 10 - 46, width: inner, height: 46)
        retakeButton.frame = CGRect(x: 18, y: height - 18 - 46, width: inner, height: 46)
    }
}

/// The quick check of a photo just taken, on the device: sharpness and over-bright pixels on the smile, eyes open
/// (face photos), teeth showing (close-ups) and how level the device was. Advice only.
enum PhotoCheck {
    /// The photo upright, no larger than `maxSide` pixels.
    static func uprightImage(_ data: Data, maxSide: Int) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
                                        kCGImageSourceThumbnailMaxPixelSize: maxSide]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }

    /// A region (normalised, top-left origin) as grey pixels about `width` wide.
    static func grey(_ image: CGImage, region: CGRect, width: Int) -> (pixels: [UInt8], w: Int, h: Int)? {
        let r = region.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        guard !r.isNull, r.width > 0.01, r.height > 0.01 else { return nil }
        let crop = CGRect(x: r.minX * CGFloat(image.width), y: r.minY * CGFloat(image.height),
                          width: r.width * CGFloat(image.width), height: r.height * CGFloat(image.height)).integral
        guard let cropped = image.cropping(to: crop), cropped.width > 4, cropped.height > 4 else { return nil }
        let w = min(width, cropped.width), h = max(8, Int(CGFloat(w) * CGFloat(cropped.height) / CGFloat(cropped.width)))
        var pixels = [UInt8](repeating: 0, count: w * h)
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                          space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            context.interpolationQuality = .high
            context.draw(cropped, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return drawn ? (pixels, w, h) : nil
    }

    /// Variance of the Laplacian: high on crisp edges (tooth outlines), low when blurred.
    static func sharpness(_ p: [UInt8], w: Int, h: Int) -> Double {
        guard w > 2, h > 2, p.count >= w * h else { return 0 }
        var sum = 0.0, squares = 0.0, n = 0.0
        for y in 1..<(h - 1) {
            for x in 1..<(w - 1) {
                let i = y * w + x
                let v = 4 * Double(p[i]) - Double(p[i - 1]) - Double(p[i + 1]) - Double(p[i - w]) - Double(p[i + w])
                sum += v; squares += v * v; n += 1
            }
        }
        let mean = sum / n
        return squares / n - mean * mean
    }

    /// Share of pixels that are pure white (detail lost).
    static func clipped(_ p: [UInt8]) -> Double {
        guard !p.isEmpty else { return 0 }
        var count = 0
        for v in p where v >= 250 { count += 1 }
        return Double(count) / Double(p.count)
    }

    static let softBelow = 40.0
    static let brightAbove = 0.06

    static func review(_ image: CGImage, closeUp: Bool, fallback: CGRect, levelDegrees: Double) -> [(String, Bool)] {
        let request = VNDetectFaceLandmarksRequest()
        // If face detection itself fails, the face rows are left out rather than reporting "no face".
        let detected = (try? VNImageRequestHandler(cgImage: image, orientation: .up).perform([request])) != nil
        let face = (request.results ?? []).max { $0.boundingBox.width < $1.boundingBox.width }
        let W = CGFloat(image.width), H = CGFloat(image.height)
        func pixels(_ region: VNFaceLandmarkRegion2D?, in box: CGRect) -> [CGPoint] {
            (region?.normalizedPoints ?? []).map { CGPoint(x: (box.minX + $0.x * box.width) * W, y: (1 - (box.minY + $0.y * box.height)) * H) }
        }
        var smile = fallback
        var opening: CGFloat?
        var eyesOpen: Bool?
        if let face {
            let box = face.boundingBox
            let lips = pixels(face.landmarks?.outerLips, in: box)
            if let minX = lips.map(\.x).min(), let maxX = lips.map(\.x).max(), let minY = lips.map(\.y).min(), let maxY = lips.map(\.y).max(), maxX > minX {
                let w = maxX - minX, h = maxY - minY
                smile = CGRect(x: (minX - w * 0.1) / W, y: (minY - h * 0.1) / H, width: w * 1.2 / W, height: h * 1.2 / H)
                let inner = pixels(face.landmarks?.innerLips, in: box)
                if let top = inner.map(\.y).min(), let bottom = inner.map(\.y).max() { opening = (bottom - top) / w }
            }
            let ratios = [face.landmarks?.leftEye, face.landmarks?.rightEye].compactMap { region -> CGFloat? in
                let pts = pixels(region, in: box)
                guard pts.count >= 4, let minX = pts.map(\.x).min(), let maxX = pts.map(\.x).max(), let minY = pts.map(\.y).min(), let maxY = pts.map(\.y).max(), maxX > minX else { return nil }
                return (maxY - minY) / (maxX - minX)
            }
            if !ratios.isEmpty { eyesOpen = ratios.reduce(0, +) / CGFloat(ratios.count) >= 0.15 }
        }
        var rows: [(String, Bool)] = []
        if let g = grey(image, region: smile, width: 400) {
            let sharp = sharpness(g.pixels, w: g.w, h: g.h) >= softBelow
            rows.append(sharp ? ("Sharp on the teeth", true) : ("The teeth may be blurred", false))
            let bright = clipped(g.pixels) <= brightAbove
            rows.append(bright ? ("Teeth not too bright", true) : ("The teeth look too bright", false))
        }
        if closeUp {
            if let opening { rows.append(opening >= 0.1 ? ("Teeth showing", true) : ("The teeth aren’t showing", false)) }
        } else if face == nil {
            if detected { rows.append(("No face found — check the framing", false)) }
        } else if let eyesOpen {
            rows.append(eyesOpen ? ("Eyes open", true) : ("The eyes may be closed", false))
        }
        let tilt = abs(levelDegrees)
        rows.append(tilt <= 3 ? (String(format: "Level (%.1f°)", tilt), true) : (String(format: "Tilted %.1f°", tilt), false))
        return rows
    }
}


// MARK: - Guided photo set camera

/// The guided photo set (Profile, At rest, Smiling, Smile close-up, the three retracted views and both arches):
/// one view after another, each with its drawing as a see-through guide that plays its motion once as the view
/// opens, midlines where they help, Skip, Mirror (photos taken in a dental mirror are flipped back), the light,
/// and zoom. The photos are returned together; cancelling keeps the ones already taken.
final class PhotoSetCameraViewController: UIViewController, AVCapturePhotoCaptureDelegate {
    struct SetView { let id, title, hint, step: String; let guide, lower: UIImage?; let motion: String; let midlines, mirror, light: Bool; let zoom: CGFloat }

    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    private let views: [SetView]
    private let completion: ([(String, Data)], Bool) -> Void
    private var index = 0
    private var taken: [(String, Data)] = []
    private var finished = false

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "uk.co.drvik.smilecompose.photoset")
    private let photoOutput = AVCapturePhotoOutput()
    private var device: AVCaptureDevice?
    private var rotationCoordinator: AnyObject?
    private var front = false
    private var mirrorOn = false
    private var lightOn = false
    private var zoomBase: CGFloat = 1

    private let previewLayer = AVCaptureVideoPreviewLayer()
    private let previewHost = UIView()
    private let guideBox = UIView()
    private let guideView = UIImageView()
    private let lowerView = UIImageView()
    private let midlines = CAShapeLayer()
    private let chip = UILabel()
    private let titleLabel = UILabel()
    private let stepLabel = UILabel()
    private let dots = UIStackView()
    private let hintBar = UIView()
    private let hint = UILabel()
    private let closeButton = UIButton(type: .system)
    private let lightButton = UIButton(type: .system)
    private let skipButton = UIButton(type: .system)
    private let shutter = UIButton(type: .custom)
    private let ring = UIView()
    private let sideButton = UIButton(type: .system)
    private let sideLabel = UILabel()
    private let zoomBar = UIView()
    private let zoomOut = UIButton(type: .system)
    private let zoomIn = UIButton(type: .system)
    private let zoomLabel = UILabel()

    init(views: [SetView], completion: @escaping ([(String, Data)], Bool) -> Void) {
        self.views = views
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
        midlines.strokeColor = UIColor(white: 1, alpha: 0.35).cgColor
        midlines.lineWidth = 1.5
        midlines.lineDashPattern = [6, 6]
        midlines.fillColor = nil
        previewHost.layer.addSublayer(midlines)
        guideBox.alpha = 0.35
        guideBox.isUserInteractionEnabled = false
        for v in [guideView, lowerView] { v.contentMode = .scaleAspectFit; guideBox.addSubview(v) }
        previewHost.addSubview(guideBox)
        chip.font = .systemFont(ofSize: 12, weight: .semibold)
        chip.textColor = .white
        chip.textAlignment = .center
        chip.backgroundColor = UIColor(white: 0.08, alpha: 0.6)
        chip.layer.cornerRadius = 13
        chip.clipsToBounds = true
        previewHost.addSubview(chip)

        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center
        stepLabel.font = .systemFont(ofSize: 12)
        stepLabel.textColor = UIColor(white: 1, alpha: 0.7)
        stepLabel.textAlignment = .center
        dots.axis = .horizontal
        dots.spacing = 4
        dots.distribution = .fillEqually
        for _ in views { let d = UIView(); d.layer.cornerRadius = 1.5; dots.addArrangedSubview(d) }
        [titleLabel, stepLabel, dots].forEach { view.addSubview($0) }

        hintBar.backgroundColor = UIColor(white: 1, alpha: 0.12)
        hintBar.layer.cornerRadius = 14
        hint.font = .systemFont(ofSize: 15, weight: .medium)
        hint.textColor = .white
        hint.textAlignment = .center
        hint.adjustsFontSizeToFitWidth = true
        hint.minimumScaleFactor = 0.8
        hintBar.addSubview(hint)
        view.addSubview(hintBar)

        let round = { (b: UIButton, symbol: String, label: String) in
            b.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)), for: .normal)
            b.tintColor = .white
            b.backgroundColor = UIColor(white: 1, alpha: 0.14)
            b.layer.cornerRadius = 22
            b.accessibilityLabel = label
            self.view.addSubview(b)
        }
        round(closeButton, "xmark", "Close")
        round(lightButton, "bolt.fill", "Light")
        round(sideButton, "arrow.triangle.2.circlepath", "Switch camera")
        closeButton.addTarget(self, action: #selector(close), for: .touchUpInside)
        lightButton.addTarget(self, action: #selector(toggleLight), for: .touchUpInside)
        sideButton.addTarget(self, action: #selector(sideTapped), for: .touchUpInside)
        sideLabel.font = .systemFont(ofSize: 10, weight: .semibold)
        sideLabel.textColor = UIColor(white: 1, alpha: 0.85)
        sideLabel.textAlignment = .center
        view.addSubview(sideLabel)
        skipButton.setTitle("Skip", for: .normal)
        skipButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        skipButton.tintColor = UIColor(white: 1, alpha: 0.9)
        skipButton.addTarget(self, action: #selector(skip), for: .touchUpInside)
        view.addSubview(skipButton)
        shutter.backgroundColor = .white
        shutter.layer.cornerRadius = 32
        shutter.accessibilityLabel = "Take photo"
        shutter.addTarget(self, action: #selector(capture), for: .touchUpInside)
        ring.layer.borderColor = UIColor.white.cgColor
        ring.layer.borderWidth = 3
        ring.isUserInteractionEnabled = false
        view.addSubview(ring)
        view.addSubview(shutter)

        zoomBar.backgroundColor = UIColor(white: 1, alpha: 0.14)
        zoomBar.layer.cornerRadius = 20
        zoomOut.setTitle("−", for: .normal); zoomIn.setTitle("+", for: .normal)
        for b in [zoomOut, zoomIn] { b.tintColor = .white; b.titleLabel?.font = .systemFont(ofSize: 20, weight: .medium); zoomBar.addSubview(b) }
        zoomOut.accessibilityLabel = "Zoom out"; zoomIn.accessibilityLabel = "Zoom in"
        zoomOut.addTarget(self, action: #selector(stepZoomOut), for: .touchUpInside)
        zoomIn.addTarget(self, action: #selector(stepZoomIn), for: .touchUpInside)
        zoomLabel.textColor = .white
        zoomLabel.font = .monospacedDigitSystemFont(ofSize: 15, weight: .medium)
        zoomLabel.textAlignment = .center
        zoomBar.addSubview(zoomLabel)
        view.addSubview(zoomBar)
        previewHost.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:))))

        configureSession { [weak self] in self?.show(0) }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaLayoutGuide.layoutFrame
        let portrait = view.bounds.height >= view.bounds.width
        closeButton.frame = CGRect(x: safe.minX + 16, y: safe.minY + 8, width: 44, height: 44)
        lightButton.frame = CGRect(x: safe.maxX - 60, y: safe.minY + 8, width: 44, height: 44)
        titleLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 8, width: safe.width - 140, height: 24)
        stepLabel.frame = CGRect(x: safe.minX + 70, y: safe.minY + 32, width: safe.width - 140, height: 16)
        let dotsWidth = min(CGFloat(views.count) * 22, safe.width - 140)
        dots.frame = CGRect(x: safe.midX - dotsWidth / 2, y: safe.minY + 56, width: dotsWidth, height: 3)
        let top: CGFloat = 70, bottom: CGFloat = portrait ? 210 : 160
        let area = CGRect(x: safe.minX + 12, y: safe.minY + top, width: safe.width - 24, height: safe.height - top - bottom)
        let aspect: CGFloat = portrait ? 3.0 / 4.0 : 4.0 / 3.0
        var size = CGSize(width: area.width, height: area.width / aspect)
        if size.height > area.height { size = CGSize(width: area.height * aspect, height: area.height) }
        previewHost.frame = CGRect(x: area.midX - size.width / 2, y: area.midY - size.height / 2, width: size.width, height: size.height)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        previewLayer.frame = previewHost.bounds
        midlines.frame = previewHost.bounds
        let path = UIBezierPath()
        path.move(to: CGPoint(x: size.width / 2, y: 6)); path.addLine(to: CGPoint(x: size.width / 2, y: size.height - 6))
        path.move(to: CGPoint(x: 6, y: size.height / 2)); path.addLine(to: CGPoint(x: size.width - 6, y: size.height / 2))
        midlines.path = path.cgPath
        CATransaction.commit()
        guideBox.frame = previewHost.bounds
        guideView.frame = guideBox.bounds
        lowerView.frame = guideBox.bounds
        let chipWidth = min((chip.text as NSString?)?.size(withAttributes: [.font: chip.font as Any]).width ?? 0, size.width - 40) + 24
        chip.frame = CGRect(x: size.width / 2 - chipWidth / 2, y: 10, width: chipWidth, height: 26)
        hintBar.frame = CGRect(x: previewHost.frame.minX, y: previewHost.frame.maxY + 10, width: previewHost.frame.width, height: 44)
        hint.frame = hintBar.bounds.insetBy(dx: 14, dy: 0)
        zoomBar.frame = CGRect(x: safe.midX - 80, y: hintBar.frame.maxY + 12, width: 160, height: 40)
        zoomOut.frame = CGRect(x: 0, y: 0, width: 48, height: 40)
        zoomLabel.frame = CGRect(x: 48, y: 0, width: 64, height: 40)
        zoomIn.frame = CGRect(x: 112, y: 0, width: 48, height: 40)
        shutter.frame = CGRect(x: safe.midX - 32, y: safe.maxY - 84, width: 64, height: 64)
        ring.frame = shutter.frame.insetBy(dx: -7, dy: -7)
        ring.layer.cornerRadius = ring.frame.width / 2
        skipButton.frame = CGRect(x: safe.minX + 24, y: shutter.frame.midY - 22, width: 70, height: 44)
        sideButton.frame = CGRect(x: safe.maxX - 72, y: shutter.frame.midY - 26, width: 44, height: 44)
        sideLabel.frame = CGRect(x: sideButton.frame.midX - 40, y: sideButton.frame.maxY + 3, width: 80, height: 13)
        applyRotation()
    }

    // MARK: Views

    private var current: SetView { views[index] }
    /// Retracted and arch views: the light helps and the side button is Mirror; face views keep Switch camera.
    private var intraoral: Bool { current.light || current.mirror }

    private func show(_ i: Int) {
        index = i
        let v = current
        UIView.transition(with: view, duration: 0.2, options: .transitionCrossDissolve) {
            self.titleLabel.text = v.title
            self.stepLabel.text = v.step
            self.hint.text = v.hint
        }
        for (n, d) in dots.arrangedSubviews.enumerated() {
            d.backgroundColor = n < i ? Self.gold : n == i ? .white : UIColor(white: 1, alpha: 0.25)
        }
        guideView.image = v.guide
        lowerView.image = v.lower
        lowerView.isHidden = v.lower == nil
        midlines.isHidden = !v.midlines
        mirrorOn = v.mirror
        lightOn = v.light && !front
        chip.text = mirrorOn ? "Mirror on · flipped back" : v.id.hasPrefix("retracted") ? "Retractors in" : nil
        chip.isHidden = chip.text == nil
        updateSide()
        applyMirror()
        applyLight()
        sessionQueue.async { self.setZoom(self.zoomBase * v.zoom) }
        view.setNeedsLayout(); view.layoutIfNeeded()
        playGuide()
    }

    private func updateSide() {
        if intraoral {
            sideButton.setImage(UIImage(systemName: "circle.lefthalf.filled", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)), for: .normal)
            sideButton.backgroundColor = mirrorOn ? Self.gold : UIColor(white: 1, alpha: 0.14)
            sideButton.tintColor = mirrorOn ? .black : .white
            sideButton.accessibilityLabel = mirrorOn ? "Mirror on" : "Mirror off"
            sideLabel.text = "MIRROR"
        } else {
            sideButton.setImage(UIImage(systemName: "arrow.triangle.2.circlepath", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)), for: .normal)
            sideButton.backgroundColor = UIColor(white: 1, alpha: 0.14)
            sideButton.tintColor = .white
            sideButton.accessibilityLabel = "Switch camera"
            sideLabel.text = nil
        }
        lightButton.tintColor = lightOn ? Self.gold : .white
        lightButton.accessibilityValue = lightOn ? "On" : "Off"
    }

    /// The view's motion, once, as it opens: the face draws on from the top, the smile and arches fill out from
    /// the centre, the jaws close together. With Reduce Motion the guide simply appears.
    private func playGuide() {
        guideBox.layer.removeAllAnimations()
        guideBox.layer.mask = nil
        guideView.transform = .identity
        lowerView.transform = .identity
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        let bounds = guideBox.bounds
        switch current.motion {
        case "jaws":
            let h = bounds.height
            guideView.transform = CGAffineTransform(translationX: 0, y: -h * 0.035)
            lowerView.transform = CGAffineTransform(translationX: 0, y: h * 0.045)
            UIView.animate(withDuration: 0.8, delay: 0.12, usingSpringWithDamping: 0.62, initialSpringVelocity: 0, options: [.beginFromCurrentState]) {
                self.guideView.transform = .identity
                self.lowerView.transform = .identity
            }
        default:
            let mask = CALayer()
            mask.backgroundColor = UIColor.black.cgColor
            let fromTop = current.motion == "top"
            mask.anchorPoint = fromTop ? CGPoint(x: 0.5, y: 0) : CGPoint(x: 0.5, y: 0.5)
            mask.bounds = bounds
            mask.position = fromTop ? CGPoint(x: bounds.midX, y: 0) : CGPoint(x: bounds.midX, y: bounds.midY)
            guideBox.layer.mask = mask
            let grow = CABasicAnimation(keyPath: fromTop ? "transform.scale.y" : "transform.scale.x")
            grow.fromValue = 0.001
            grow.toValue = 1
            grow.duration = fromTop ? 0.9 : 0.95
            grow.timingFunction = CAMediaTimingFunction(controlPoints: 0.45, 0, 0.2, 1)
            mask.add(grow, forKey: "reveal")
            DispatchQueue.main.asyncAfter(deadline: .now() + grow.duration + 0.05) { [weak self] in
                if self?.guideBox.layer.mask === mask { self?.guideBox.layer.mask = nil }
            }
        }
    }

    private func advance() {
        if index + 1 < views.count { show(index + 1) } else { finish(cancelled: false) }
    }

    @objc private func skip() { advance() }
    @objc private func close() { finish(cancelled: true) }

    @objc private func sideTapped() {
        if intraoral {
            mirrorOn.toggle()
            chip.text = mirrorOn ? "Mirror on · flipped back" : current.id.hasPrefix("retracted") ? "Retractors in" : nil
            chip.isHidden = chip.text == nil
            updateSide(); applyMirror(); view.setNeedsLayout()
        } else {
            front.toggle()
            lightOn = false
            configureSession {}
        }
    }

    @objc private func toggleLight() { lightOn.toggle(); applyLight(); updateSide() }

    private func applyMirror() {
        CATransaction.begin(); CATransaction.setDisableActions(true)
        previewLayer.setAffineTransform(mirrorOn ? CGAffineTransform(scaleX: -1, y: 1) : .identity)
        CATransaction.commit()
    }

    private func applyLight() {
        let on = lightOn && !front
        sessionQueue.async {
            guard let d = self.device, d.hasTorch, d.isTorchAvailable, (try? d.lockForConfiguration()) != nil else { return }
            if on { try? d.setTorchModeOn(level: 0.6) } else { d.torchMode = .off }
            d.unlockForConfiguration()
        }
    }

    // MARK: Session

    private static func camera(front: Bool) -> AVCaptureDevice? {
        if front { return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) }
        for type in [AVCaptureDevice.DeviceType.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera] {
            if let d = AVCaptureDevice.default(type, for: .video, position: .back) { return d }
        }
        return nil
    }

    private func configureSession(_ then: @escaping () -> Void) {
        let front = self.front
        sessionQueue.async {
            self.session.beginConfiguration()
            self.session.sessionPreset = .photo
            self.session.inputs.forEach { self.session.removeInput($0) }
            guard let device = Self.camera(front: front), let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else {
                self.session.commitConfiguration()
                DispatchQueue.main.async { self.hint.text = "The camera couldn’t be started." }
                return
            }
            self.session.addInput(input)
            if !self.session.outputs.contains(self.photoOutput), self.session.canAddOutput(self.photoOutput) { self.session.addOutput(self.photoOutput) }
            self.photoOutput.maxPhotoQualityPrioritization = .quality
            self.session.commitConfiguration()
            let switchOvers = device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat($0.doubleValue) }
            let hasUltraWide = device.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }
            self.zoomBase = hasUltraWide ? (switchOvers.first ?? 1) : 1
            self.device = device
            if !self.session.isRunning { self.session.startRunning() }
            DispatchQueue.main.async {
                if #available(iOS 17.0, *) { self.rotationCoordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: self.previewLayer) }
                if let c = self.previewLayer.connection, c.isVideoMirroringSupported {
                    c.automaticallyAdjustsVideoMirroring = false
                    c.isVideoMirrored = front
                }
                self.applyRotation()
                self.applyLight()
                self.sessionQueue.async { self.setZoom(self.zoomBase * (self.views.indices.contains(self.index) ? self.current.zoom : 1)) }
                then()
            }
        }
    }

    private func applyRotation() {
        if #available(iOS 17.0, *), let coordinator = rotationCoordinator as? AVCaptureDevice.RotationCoordinator {
            let angle = coordinator.videoRotationAngleForHorizonLevelPreview
            if let c = previewLayer.connection, c.isVideoRotationAngleSupported(angle) { c.videoRotationAngle = angle }
        }
    }

    // MARK: Zoom

    private var currentZoom: CGFloat { device?.videoZoomFactor ?? zoomBase }
    private func setZoom(_ factor: CGFloat) {
        guard let d = device else { return }
        let maxZoom = min(d.maxAvailableVideoZoomFactor, zoomBase * 6)
        let z = min(max(factor, zoomBase), maxZoom)
        if (try? d.lockForConfiguration()) != nil { d.videoZoomFactor = z; d.unlockForConfiguration() }
        let shown = z / zoomBase
        DispatchQueue.main.async {
            self.zoomLabel.text = String(format: "%.1f×", shown)
            self.zoomOut.isEnabled = z > self.zoomBase + 0.01
            self.zoomIn.isEnabled = z < maxZoom - 0.01
        }
    }
    private var pinchStart: CGFloat = 1
    @objc private func pinched(_ g: UIPinchGestureRecognizer) {
        if g.state == .began { pinchStart = currentZoom }
        let target = pinchStart * g.scale
        sessionQueue.async { self.setZoom(target) }
    }
    @objc private func stepZoomIn() { let z = currentZoom; sessionQueue.async { self.setZoom(z + self.zoomBase * 0.5) } }
    @objc private func stepZoomOut() { let z = currentZoom; sessionQueue.async { self.setZoom(z - self.zoomBase * 0.5) } }

    // MARK: Capture

    @objc private func capture() {
        shutter.isEnabled = false
        var angle: CGFloat?
        if #available(iOS 17.0, *), let coordinator = rotationCoordinator as? AVCaptureDevice.RotationCoordinator {
            angle = coordinator.videoRotationAngleForHorizonLevelCapture
        }
        let mirrored = front
        sessionQueue.async {
            let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            settings.photoQualityPrioritization = .quality
            if let c = self.photoOutput.connection(with: .video) {
                if let angle, c.isVideoRotationAngleSupported(angle) { c.videoRotationAngle = angle }
                if c.isVideoMirroringSupported { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = mirrored }
            }
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
        UIView.animate(withDuration: 0.08, animations: { self.previewHost.alpha = 0.2 }) { _ in
            UIView.animate(withDuration: 0.2) { self.previewHost.alpha = 1 }
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let flip = mirrorOn
        guard error == nil, var data = photo.fileDataRepresentation() else {
            DispatchQueue.main.async { self.shutter.isEnabled = true; self.hint.text = "That photo didn’t work. Please try again." }
            return
        }
        // Taken in a dental mirror: flipped back so the arch reads the right way round.
        if flip, let image = UIImage(data: data) {
            let format = UIGraphicsImageRendererFormat(); format.scale = 1
            let flipped = UIGraphicsImageRenderer(size: image.size, format: format).image { ctx in
                ctx.cgContext.translateBy(x: image.size.width, y: 0)
                ctx.cgContext.scaleBy(x: -1, y: 1)
                image.draw(in: CGRect(origin: .zero, size: image.size))
            }
            if let out = flipped.jpegData(compressionQuality: 0.92) { data = out }
        }
        DispatchQueue.main.async {
            self.taken.append((self.current.id, data))
            self.shutter.isEnabled = true
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            self.advance()
        }
    }

    private func finish(cancelled: Bool) {
        guard !finished else { return }
        finished = true
        let photos = taken
        sessionQueue.async {
            if let d = self.device, d.hasTorch, (try? d.lockForConfiguration()) != nil { d.torchMode = .off; d.unlockForConfiguration() }
            if self.session.isRunning { self.session.stopRunning() }
        }
        dismiss(animated: true) { self.completion(photos, cancelled) }
    }
}
