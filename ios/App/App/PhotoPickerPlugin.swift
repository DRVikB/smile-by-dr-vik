import Foundation
import AVFoundation
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
        CAPPluginMethod(name: "releasePhoto", returnType: CAPPluginReturnPromise)
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
                    let camera = SmileCameraViewController(guide: guide, front: front) { result in
                        self.cameraOpen = false
                        switch result {
                        case .cancelled:
                            call.resolve(["cancelled": true])
                        case .failed(let message):
                            call.reject(message)
                        case .captured(let data, let used):
                            do {
                                var result = try self.store(data, png: false)
                                // The guide actually shown (it differs in landscape), so the photo's framing is accurate.
                                result["guide"] = ["x": used.minX, "y": used.minY, "width": used.width, "height": used.height]
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

/// The SmileCompose camera: a 3:4 live view (4:3 in landscape) showing exactly the photo's frame,
/// a face oval with a centre crosshair and a head-level arc, the smile box, live alignment guidance
/// (oval, box and instruction turn gold when face, device and smile line up), pinch or −/+ zoom
/// across the lenses, and a flip between cameras. It captures a full-quality still
/// (AVCapturePhotoOutput, quality prioritised) rather than a frame of video.
final class SmileCameraViewController: UIViewController, AVCapturePhotoCaptureDelegate, AVCaptureVideoDataOutputSampleBufferDelegate {
    enum Result { case cancelled, failed(String), captured(Data, CGRect) }

    private static let gold = UIColor(red: 208 / 255, green: 164 / 255, blue: 102 / 255, alpha: 1)
    private static let warning = UIColor(red: 0.89, green: 0.33, blue: 0.36, alpha: 1)
    private static let quiet = UIColor(white: 1, alpha: 0.4)

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
    /// The zoom factor that reads as 1× (the wide lens), and the most we allow.
    private var zoomBase: CGFloat = 1
    private var zoomMax: CGFloat = 5
    private var pinchStart: CGFloat = 1
    private var finished = false
    private var lastAnalysis = Date.distantPast
    private var latestFace: CaptureGuidance.Face?
    private var readySince: Date?
    private var wasReady = false

    private let previewLayer = AVCaptureVideoPreviewLayer()
    private let previewHost = UIView()
    private let ovalLayer = CAShapeLayer()
    private let headArc = CAShapeLayer()
    private let guideView = UIView()
    private let crossV = UIView()
    private let crossH = UIView()
    private let hint = UILabel()
    private let hintBar = UIView()
    private let closeButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let shutter = UIButton(type: .custom)
    private let zoomLabel = UILabel()
    private let zoomOut = UIButton(type: .system)
    private let zoomIn = UIButton(type: .system)
    private let zoomBar = UIView()
    private let haptic = UIImpactFeedbackGenerator(style: .light)

    init(guide: CGRect, front: Bool, completion: @escaping (Result) -> Void) {
        self.guide = guide
        self.activeGuide = guide
        self.front = front
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        previewLayer.session = session
        previewLayer.videoGravity = .resizeAspectFill
        previewHost.layer.addSublayer(previewLayer)
        previewHost.clipsToBounds = true
        previewHost.layer.cornerRadius = 18
        previewHost.backgroundColor = UIColor(white: 0.07, alpha: 1)
        previewHost.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(pinched(_:))))
        view.addSubview(previewHost)

        for line in [crossV, crossH] {
            line.backgroundColor = Self.quiet
            line.isUserInteractionEnabled = false
            previewHost.addSubview(line)
        }
        for shape in [ovalLayer, headArc] {
            shape.fillColor = nil
            shape.lineCap = .round
            previewHost.layer.addSublayer(shape)
        }
        ovalLayer.lineWidth = 3
        ovalLayer.strokeColor = UIColor(white: 1, alpha: 0.9).cgColor
        headArc.lineWidth = 2.5
        headArc.strokeColor = Self.warning.cgColor
        headArc.isHidden = true
        guideView.layer.borderColor = UIColor(white: 1, alpha: 0.6).cgColor
        guideView.layer.borderWidth = 1.5
        guideView.layer.cornerRadius = 10
        guideView.isUserInteractionEnabled = false
        previewHost.addSubview(guideView)

        hintBar.backgroundColor = UIColor(white: 1, alpha: 0.12)
        hintBar.layer.cornerRadius = 14
        hintBar.isUserInteractionEnabled = false
        view.addSubview(hintBar)
        hint.text = CaptureGuidance.message(.noFace)
        hint.textColor = .white
        hint.font = .systemFont(ofSize: 16, weight: .semibold)
        hint.textAlignment = .center
        hint.adjustsFontSizeToFitWidth = true
        hint.minimumScaleFactor = 0.8
        hint.accessibilityTraits = .updatesFrequently
        hintBar.addSubview(hint)

        let symbols = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
        closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: symbols), for: .normal)
        closeButton.accessibilityLabel = "Cancel"
        flipButton.setImage(UIImage(systemName: "arrow.triangle.2.circlepath.camera", withConfiguration: symbols), for: .normal)
        flipButton.accessibilityLabel = "Switch camera"
        for button in [closeButton, flipButton] {
            button.tintColor = .white
            button.backgroundColor = UIColor(white: 1, alpha: 0.14)
            button.layer.cornerRadius = 22
            view.addSubview(button)
        }
        closeButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        flipButton.addTarget(self, action: #selector(flip), for: .touchUpInside)

        shutter.backgroundColor = .white
        shutter.layer.cornerRadius = 32
        shutter.accessibilityLabel = "Take photo"
        shutter.addTarget(self, action: #selector(capture), for: .touchUpInside)
        view.addSubview(shutter)
        let ring = UIView()
        ring.isUserInteractionEnabled = false
        ring.layer.borderColor = UIColor.white.cgColor
        ring.layer.borderWidth = 3
        ring.tag = 42
        view.addSubview(ring)

        zoomBar.backgroundColor = UIColor(white: 1, alpha: 0.14)
        zoomBar.layer.cornerRadius = 20
        view.addSubview(zoomBar)
        zoomOut.setImage(UIImage(systemName: "minus", withConfiguration: symbols), for: .normal)
        zoomIn.setImage(UIImage(systemName: "plus", withConfiguration: symbols), for: .normal)
        zoomOut.accessibilityLabel = "Zoom out"
        zoomIn.accessibilityLabel = "Zoom in"
        for button in [zoomOut, zoomIn] { button.tintColor = .white; zoomBar.addSubview(button) }
        zoomOut.addTarget(self, action: #selector(stepZoomOut), for: .touchUpInside)
        zoomIn.addTarget(self, action: #selector(stepZoomIn), for: .touchUpInside)
        zoomLabel.textColor = .white
        zoomLabel.font = .monospacedDigitSystemFont(ofSize: 15, weight: .semibold)
        zoomLabel.textAlignment = .center
        zoomBar.addSubview(zoomLabel)

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
        configureSession()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        motion.stopDeviceMotionUpdates()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let safe = view.safeAreaLayoutGuide.layoutFrame
        let portrait = view.bounds.height >= view.bounds.width
        let top: CGFloat = 62, bottom: CGFloat = portrait ? 222 : 168
        let area = CGRect(x: safe.minX + 12, y: safe.minY + top, width: safe.width - 24, height: safe.height - top - bottom)
        // The live view has the photo's own shape, so it shows the whole photo and the guide maps exactly.
        let aspect: CGFloat = portrait ? 3.0 / 4.0 : 4.0 / 3.0
        var size = CGSize(width: area.width, height: area.width / aspect)
        if size.height > area.height { size = CGSize(width: area.height * aspect, height: area.height) }
        previewHost.frame = CGRect(x: area.midX - size.width / 2, y: area.midY - size.height / 2, width: size.width, height: size.height)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        previewLayer.frame = previewHost.bounds
        let layout = CaptureGuidance.layout(guide: guide, aspect: aspect)
        oval = layout.oval
        activeGuide = layout.guide
        let ovalPx = CGRect(x: oval.minX * size.width, y: oval.minY * size.height, width: oval.width * size.width, height: oval.height * size.height)
        ovalLayer.path = UIBezierPath(ovalIn: ovalPx).cgPath
        CATransaction.commit()
        guideView.frame = CGRect(x: activeGuide.minX * size.width, y: activeGuide.minY * size.height,
                                 width: activeGuide.width * size.width, height: activeGuide.height * size.height)
        crossV.frame = CGRect(x: size.width / 2 - 0.5, y: 0, width: 1, height: size.height)
        crossH.frame = CGRect(x: 0, y: ovalPx.midY - 0.5, width: size.width, height: 1)
        drawHeadArc()
        applyRotation()

        closeButton.frame = CGRect(x: safe.minX + 16, y: safe.minY + 9, width: 44, height: 44)
        // Portrait: the instruction sits just below the photo; landscape: over its lower edge.
        let barWidth = min(size.width - 24, 520)
        hintBar.frame = portrait
            ? CGRect(x: previewHost.frame.midX - size.width / 2, y: previewHost.frame.maxY + 10, width: size.width, height: 46)
            : CGRect(x: previewHost.frame.midX - barWidth / 2, y: previewHost.frame.maxY - 58, width: barWidth, height: 46)
        hint.frame = hintBar.bounds.insetBy(dx: 14, dy: 0)
        zoomBar.frame = CGRect(x: safe.midX - 80, y: safe.maxY - 152, width: 160, height: 40)
        zoomOut.frame = CGRect(x: 0, y: 0, width: 48, height: 40)
        zoomIn.frame = CGRect(x: 112, y: 0, width: 48, height: 40)
        zoomLabel.frame = CGRect(x: 48, y: 0, width: 64, height: 40)
        shutter.frame = CGRect(x: safe.midX - 32, y: safe.maxY - 92, width: 64, height: 64)
        view.viewWithTag(42)?.frame = shutter.frame.insetBy(dx: -7, dy: -7)
        view.viewWithTag(42)?.layer.cornerRadius = (shutter.frame.width + 14) / 2
        flipButton.frame = CGRect(x: safe.maxX - 76, y: safe.maxY - 82, width: 44, height: 44)
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

    /// Preview and analysis frames upright for the current orientation (rotation
    /// angles on iOS 17+, where the older orientation property is deprecated).
    private func applyRotation() {
        if #available(iOS 17.0, *), let coordinator = rotationCoordinator as? AVCaptureDevice.RotationCoordinator {
            let previewAngle = coordinator.videoRotationAngleForHorizonLevelPreview
            let captureAngle = coordinator.videoRotationAngleForHorizonLevelCapture
            if let c = previewLayer.connection, c.isVideoRotationAngleSupported(previewAngle) { c.videoRotationAngle = previewAngle }
            sessionQueue.async {
                if let c = self.videoOutput.connection(with: .video), c.isVideoRotationAngleSupported(captureAngle) { c.videoRotationAngle = captureAngle }
            }
        } else {
            let orientation = currentOrientation()
            if let c = previewLayer.connection, c.isVideoOrientationSupported { c.videoOrientation = orientation }
            sessionQueue.async {
                if let c = self.videoOutput.connection(with: .video), c.isVideoOrientationSupported { c.videoOrientation = orientation }
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
        sessionQueue.async {
            self.session.beginConfiguration()
            self.session.sessionPreset = .photo
            if #available(iOS 16.0, *), self.session.isMultitaskingCameraAccessSupported {
                self.session.isMultitaskingCameraAccessEnabled = true
            }
            self.session.inputs.forEach { self.session.removeInput($0) }
            guard let device = Self.camera(front: front), let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else {
                self.session.commitConfiguration()
                DispatchQueue.main.async { self.finish(.failed("The camera couldn’t be started.")) }
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
            self.setZoom(start)
            DispatchQueue.main.async {
                if #available(iOS 17.0, *) {
                    self.rotationCoordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: self.previewLayer)
                }
                self.applyRotation()
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
        let face = (request.results ?? []).max { $0.boundingBox.width < $1.boundingBox.width }.flatMap(Self.describe)
        DispatchQueue.main.async {
            self.latestFace = face
            if let face { self.pitchDirection.observe(face) }
            self.updateGuidance()
        }
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
        guard let minX = lips.map(\.x).min(), let maxX = lips.map(\.x).max(), let minY = lips.map(\.y).min(), let maxY = lips.map(\.y).max(),
              let innerTop = opening.map(\.y).min(), let innerBottom = opening.map(\.y).max(), let noseBase = points(nose).map(\.y).max(),
              maxX > minX, !eyes.isEmpty else { return nil }
        let eyeY = eyes.map(\.y).reduce(0, +) / CGFloat(eyes.count)
        let mouthY = (minY + maxY) / 2
        let degrees: (NSNumber?) -> CGFloat = { CGFloat(($0?.doubleValue ?? 0) * 180 / .pi) }
        var pitch: CGFloat = 0
        if #available(iOS 15.0, *) { pitch = degrees(observation.pitch) }
        return CaptureGuidance.Face(
            centreX: box.midX,
            mouth: CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY),
            opening: (innerBottom - innerTop) / (maxX - minX),
            rollDegrees: degrees(observation.roll),
            yawDegrees: degrees(observation.yaw),
            pitchDegrees: pitch,
            noseRatio: mouthY > eyeY ? (noseBase - eyeY) / (mouthY - eyeY) : 0)
    }

    /// Chin drop in degrees: positive when the chin is down. Until the direction
    /// is learnt, Vision's sign is assumed (and prompts stay neutral).
    private var chinDown: CGFloat { (latestFace?.pitchDegrees ?? 0) * (pitchDirection.sign ?? 1) }

    private func updateGuidance() {
        let gravity = motion.deviceMotion.map { ($0.gravity.x, $0.gravity.y, $0.gravity.z) }
        let step = CaptureGuidance.step(face: latestFace, guide: activeGuide, gravity: gravity, chinDown: chinDown, known: pitchDirection.sign != nil)
        let ready = step == .ready
        readySince = ready ? (readySince ?? Date()) : nil
        let steady = ready && Date().timeIntervalSince(readySince!) > 0.6
        setHint(steady ? "Lined up — take the photo" : CaptureGuidance.message(step), ready: ready)
        if steady && !wasReady { haptic.impactOccurred() }
        wasReady = steady

        let centred = latestFace.map { abs($0.centreX - 0.5) <= 0.06 } ?? false
        let deviceLevel = gravity.map { abs(CaptureGuidance.deviceLevel(gravity: $0).sideDegrees) <= 3 } ?? true
        let headLevel = latestFace != nil && abs(chinDown) <= CaptureGuidance.maxPitch
        crossV.backgroundColor = centred ? Self.gold : Self.quiet
        crossH.backgroundColor = headLevel && deviceLevel ? Self.gold : Self.quiet
        drawHeadArc()
    }

    /// The head's eye-level "equator", pinned to the oval's sides at the centre
    /// line. It curves down as the chin drops and up as it lifts (the front of a
    /// ring around the head, seen from the camera), and disappears once level.
    private func drawHeadArc() {
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
        hint.text = text
        hint.textColor = ready ? .black : .white
        hintBar.backgroundColor = ready ? Self.gold : UIColor(white: 0.1, alpha: 0.82)
        ovalLayer.strokeColor = (ready ? Self.gold : UIColor(white: 1, alpha: 0.9)).cgColor
        guideView.layer.borderColor = (ready ? Self.gold : UIColor(white: 1, alpha: 0.6)).cgColor
        view.viewWithTag(42)?.layer.borderColor = (ready ? Self.gold : UIColor.white).cgColor
    }

    // MARK: Zoom, flip, capture

    private func setZoom(_ factor: CGFloat) {
        guard let device = device else { return }
        let clamped = min(max(factor, zoomBase), zoomMax)
        if (try? device.lockForConfiguration()) != nil {
            device.videoZoomFactor = clamped
            device.unlockForConfiguration()
        }
        let shown = clamped / zoomBase
        DispatchQueue.main.async {
            self.zoomLabel.text = String(format: "%.1f×", shown)
            self.zoomOut.isEnabled = clamped > self.zoomBase + 0.01
            self.zoomIn.isEnabled = clamped < self.zoomMax - 0.01
        }
    }

    private var currentZoom: CGFloat { device?.videoZoomFactor ?? zoomBase }

    @objc private func pinched(_ gesture: UIPinchGestureRecognizer) {
        if gesture.state == .began { pinchStart = currentZoom }
        let target = pinchStart * gesture.scale
        sessionQueue.async { self.setZoom(target) }
    }

    @objc private func stepZoomIn() { let z = currentZoom; sessionQueue.async { self.setZoom(z + self.zoomBase * 0.5) } }
    @objc private func stepZoomOut() { let z = currentZoom; sessionQueue.async { self.setZoom(z - self.zoomBase * 0.5) } }

    @objc private func flip() {
        front.toggle()
        latestFace = nil
        configureSession()
    }

    @objc private func cancel() { finish(.cancelled) }

    private var guideAtCapture = CGRect.zero

    @objc private func capture() {
        shutter.isEnabled = false
        guideAtCapture = activeGuide
        let orientation = currentOrientation()
        var captureAngle: CGFloat?
        if #available(iOS 17.0, *), let coordinator = rotationCoordinator as? AVCaptureDevice.RotationCoordinator {
            captureAngle = coordinator.videoRotationAngleForHorizonLevelCapture
        }
        let mirrored = front
        sessionQueue.async {
            let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            settings.photoQualityPrioritization = .quality
            if let connection = self.photoOutput.connection(with: .video) {
                if #available(iOS 17.0, *), let angle = captureAngle {
                    if connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
                } else if connection.isVideoOrientationSupported {
                    connection.videoOrientation = orientation
                }
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
        DispatchQueue.main.async { self.finish(.captured(data, self.guideAtCapture)) }
    }

    private func finish(_ result: Result) {
        guard !finished else { return }
        finished = true
        motion.stopDeviceMotionUpdates()
        sessionQueue.async { if self.session.isRunning { self.session.stopRunning() } }
        dismiss(animated: true) { self.completion(result) }
    }
}
