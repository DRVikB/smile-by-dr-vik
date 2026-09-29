// Renders the Home Screen widget artwork into the widget's asset catalog:
//
//   swift scripts/render-widget-art.swift
//
// Silk:         a soft satin ground (ivory for Light, charcoal with a champagne sheen for Dark),
//               drawn procedurally so it is crisp at every widget size. Folds are calmer on the
//               left, where the greeting sits.
// SmileMark:    the mark exactly as drawn on the Home Screen app icon, without its tile — Light from
//               public/brand/smilecompose-app-icon.svg (as placed in AppIcon-1024.png), Dark from
//               scripts/render-app-icons.swift — on a transparent ground.
// WidgetSmile:  the Home screen's hero photograph (public/smile-hero-dr-vik-v2.png — the app's own
//               artwork, not a patient), cropped to the smile. Light lifts the dark studio backdrop
//               towards ivory so the photo melts into the silk; Dark keeps the original.
import AppKit
import CoreGraphics
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let catalog = root.appendingPathComponent("ios/App/SmileComposeWidget/Assets.xcassets")

struct RGB { var r, g, b: Double }
func hex(_ v: UInt32) -> RGB { RGB(r: Double((v >> 16) & 0xFF) / 255, g: Double((v >> 8) & 0xFF) / 255, b: Double(v & 0xFF) / 255) }
func mix(_ a: RGB, _ b: RGB, _ t: Double) -> RGB { RGB(r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t) }
func clamp(_ v: Double) -> Double { min(1, max(0, v)) }
func smooth(_ a: Double, _ b: Double, _ x: Double) -> Double { let t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }

struct SilkPalette { let shadow: RGB, base: RGB, light: RGB, sheen: RGB, sheenStrength: Double }
let ivory = SilkPalette(shadow: hex(0xDDCEB7), base: hex(0xF3ECE1), light: hex(0xFFFDF9), sheen: hex(0xFFFFFF), sheenStrength: 0.6)
let charcoal = SilkPalette(shadow: hex(0x090807), base: hex(0x191512), light: hex(0x2C241C), sheen: hex(0xD2AE74), sheenStrength: 0.95)

/// Draped satin: a few long diagonal folds with slow wobble, lit from the top left.
func height(_ x: Double, _ y: Double, _ calm: Double) -> Double {
    let a = -0.62
    let u = x * cos(a) - y * sin(a), v = x * sin(a) + y * cos(a)
    var h = 0.0
    h += 1.00 * sin(2 * .pi * (1.25 * u + 0.20 * sin(2 * .pi * 0.55 * v + 0.4)))
    h += 0.50 * sin(2 * .pi * (2.5 * u + 0.28 * sin(2 * .pi * 0.9 * v + 1.7)) + 1.2)
    h += 0.20 * sin(2 * .pi * (4.9 * u + 0.36 * sin(2 * .pi * 1.6 * v + 0.3)) + 2.1)
    return h * calm
}

/// `calm(fx, fy)` (0–1 across the image) sets how deep the folds are, so text areas stay quiet.
func silk(width: Int, height hgt: Int, palette: SilkPalette, calm calmAt: (Double, Double) -> Double) -> CGImage {
    var pixels = [UInt8](repeating: 255, count: width * hgt * 4)
    let scale = 1092.0 // the same fold size on every widget
    let light = { () -> (Double, Double, Double) in let l = (-0.45, -0.55, 0.70); let n = sqrt(l.0 * l.0 + l.1 * l.1 + l.2 * l.2); return (l.0 / n, l.1 / n, l.2 / n) }()
    var rng = SystemRandomNumberGenerator()
    for py in 0..<hgt {
        for px in 0..<width {
            let x = Double(px) / scale, y = Double(py) / scale
            let fx = Double(px) / Double(width)
            let calm = calmAt(fx, Double(py) / Double(hgt))
            let e = 1.0 / scale
            let dx = (height(x + e, y, calm) - height(x - e, y, calm)) / (2 * e)
            let dy = (height(x, y + e, calm) - height(x, y - e, calm)) / (2 * e)
            let k = 0.045
            var n = (-dx * k, -dy * k, 1.0)
            let nl = sqrt(n.0 * n.0 + n.1 * n.1 + n.2 * n.2); n = (n.0 / nl, n.1 / nl, n.2 / nl)
            let diffuse = max(0, n.0 * light.0 + n.1 * light.1 + n.2 * light.2)
            // Satin: a narrow highlight where the fold faces the light.
            let hv = (light.0, light.1, light.2 + 1); let hl = sqrt(hv.0 * hv.0 + hv.1 * hv.1 + hv.2 * hv.2)
            let spec = pow(max(0, (n.0 * hv.0 + n.1 * hv.1 + n.2 * hv.2) / hl), 70)
            // A gentle overall light from the top right.
            let glow = 1 - 0.35 * smooth(0, 1.3, hypot(1 - fx, Double(py) / Double(hgt)))
            let lum = clamp((diffuse - 0.55) * 2.4 + 0.5) * glow
            var c = lum < 0.5 ? mix(palette.shadow, palette.base, lum * 2) : mix(palette.base, palette.light, (lum - 0.5) * 2)
            c = mix(c, palette.sheen, clamp(spec * palette.sheenStrength * glow))
            let dither = Double.random(in: -0.5...0.5, using: &rng) / 255
            let i = (py * width + px) * 4
            pixels[i] = UInt8(clamp(c.r + dither) * 255)
            pixels[i + 1] = UInt8(clamp(c.g + dither) * 255)
            pixels[i + 2] = UInt8(clamp(c.b + dither) * 255)
        }
    }
    let ctx = CGContext(data: &pixels, width: width, height: hgt, bitsPerComponent: 8, bytesPerRow: width * 4,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    return ctx.makeImage()!
}

/// The smile, cropped from the hero photograph; `lift` melts the dark backdrop and hair towards ivory.
func smile(lift: Bool) -> CGImage {
    let source = NSImage(contentsOf: root.appendingPathComponent("public/smile-hero-dr-vik-v2.png"))!
    var rect = CGRect(origin: .zero, size: source.size)
    let hero = source.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
    let crop = hero.cropping(to: CGRect(x: 0, y: 215, width: 1122, height: 950))!
    let w = 708, h = 600
    var pixels = [UInt8](repeating: 255, count: w * h * 4)
    let ctx = CGContext(data: &pixels, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.interpolationQuality = .high
    ctx.draw(crop, in: CGRect(x: 0, y: 0, width: w, height: h))
    if lift {
        let target = hex(0xF1E9DD)
        for py in 0..<h {
            for px in 0..<w {
                let i = (py * w + px) * 4
                var c = RGB(r: Double(pixels[i]) / 255, g: Double(pixels[i + 1]) / 255, b: Double(pixels[i + 2]) / 255)
                let lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
                let side = 1 - smooth(0.30, 0.62, Double(px) / Double(w))
                let t = clamp(pow(1 - lum, 1.6) * (0.35 + 0.65 * side))
                c = mix(c, target, t)
                pixels[i] = UInt8(clamp(c.r) * 255); pixels[i + 1] = UInt8(clamp(c.g) * 255); pixels[i + 2] = UInt8(clamp(c.b) * 255)
            }
        }
    }
    return CGContext(data: &pixels, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                     space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!.makeImage()!
}

func writeJPEG(_ image: CGImage, _ url: URL, quality: Double = 0.86) {
    let data = NSBitmapImageRep(cgImage: image).representation(using: .jpeg, properties: [.compressionFactor: quality])!
    try! data.write(to: url)
    print("Wrote \(url.path.replacingOccurrences(of: root.path + "/", with: ""))")
}

/// One image set with a Light (any) and a Dark appearance.
func imageSet(_ name: String, light: CGImage, dark: CGImage) {
    let dir = catalog.appendingPathComponent("\(name).imageset")
    try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    writeJPEG(light, dir.appendingPathComponent("\(name)-light.jpg"))
    writeJPEG(dark, dir.appendingPathComponent("\(name)-dark.jpg"))
    let contents = """
    {
      "images" : [
        { "filename" : "\(name)-light.jpg", "idiom" : "universal" },
        { "appearances" : [ { "appearance" : "luminosity", "value" : "dark" } ], "filename" : "\(name)-dark.jpg", "idiom" : "universal" }
      ],
      "info" : { "author" : "xcode", "version" : 1 }
    }
    """
    try! contents.write(to: dir.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
}

try! FileManager.default.createDirectory(at: catalog, withIntermediateDirectories: true)
try! """
{
  "info" : { "author" : "xcode", "version" : 1 }
}
""".write(to: catalog.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)

// 3× the largest iPhone widget sizes (medium 364 × 170 pt, small 170 × 170 pt).
// Wide: quiet on the left, under the greeting. Square: quiet everywhere but the top-right corner.
let wideCalm = { (fx: Double, _: Double) in 0.30 + 0.70 * smooth(0.05, 0.85, fx) }
let squareCalm = { (fx: Double, fy: Double) in 0.22 + 0.78 * smooth(0.35, 1.05, 0.65 * fx + 0.55 * (1 - fy)) }
imageSet("SilkWide", light: silk(width: 1092, height: 510, palette: ivory, calm: wideCalm), dark: silk(width: 1092, height: 510, palette: charcoal, calm: wideCalm))
imageSet("SilkSquare", light: silk(width: 510, height: 510, palette: ivory, calm: squareCalm), dark: silk(width: 510, height: 510, palette: charcoal, calm: squareCalm))
imageSet("WidgetSmile", light: smile(lift: true), dark: smile(lift: false))

// MARK: - The app icon's mark

/// Icon space (1024) → the mark's square crop (x 150–874, y 176–900), drawn at `size` px.
/// `guides` thickens the reference lines for small sizes (optical sizing): at widget size the icon's hairlines
/// would disappear, as they nearly do on the Home Screen icon itself.
func markImage(size: Int, dark: Bool, guides g: CGFloat = 1) -> CGImage {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let s = CGFloat(size) / 724
    ctx.translateBy(x: 0, y: CGFloat(size)); ctx.scaleBy(x: 1, y: -1) // top-left origin, like the artwork
    ctx.scaleBy(x: s, y: s); ctx.translateBy(x: -150, y: -176)
    ctx.setLineCap(.round)
    func cg(_ v: UInt32, _ a: CGFloat = 1) -> CGColor { let c = hex(v); return CGColor(srgbRed: c.r, green: c.g, blue: c.b, alpha: a) }
    func arc(dy: CGFloat = 0) -> CGPath {
        let p = CGMutablePath()
        if dark { p.move(to: CGPoint(x: 215, y: 431.5 + dy)); p.addCurve(to: CGPoint(x: 809, y: 431.5 + dy), control1: CGPoint(x: 336.5, y: 769 + dy), control2: CGPoint(x: 687.5, y: 769 + dy)) }
        else { p.move(to: CGPoint(x: 216, y: 431 + dy)); p.addCurve(to: CGPoint(x: 808, y: 431 + dy), control1: CGPoint(x: 322, y: 770 + dy), control2: CGPoint(x: 702, y: 770 + dy)) }
        return p
    }
    func gradientStroke(_ path: CGPath, width: CGFloat, colours: [CGColor], locations: [CGFloat], from: CGPoint, to: CGPoint) {
        ctx.saveGState()
        ctx.addPath(path); ctx.setLineWidth(width); ctx.replacePathWithStrokedPath(); ctx.clip()
        let g = CGGradient(colorsSpace: space, colors: colours as CFArray, locations: locations)!
        ctx.drawLinearGradient(g, start: from, end: to, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        ctx.restoreGState()
    }
    if dark {
        // Dark icon: quiet reference lines, a soft shadow, the champagne arc.
        ctx.setStrokeColor(cg(0x8C7F71, 0.5)); ctx.setLineWidth(7 * g)
        ctx.move(to: CGPoint(x: 512, y: 251.5)); ctx.addLine(to: CGPoint(x: 512, y: 856.5))
        ctx.move(to: CGPoint(x: 270, y: 481.5)); ctx.addLine(to: CGPoint(x: 755, y: 481.5)); ctx.strokePath()
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: 18 * s), blur: 36 * s, color: cg(0x000000, 0.45))
        ctx.addPath(arc()); ctx.setLineWidth(82); ctx.setStrokeColor(cg(0xB48E58)); ctx.strokePath()
        ctx.restoreGState()
        gradientStroke(arc(), width: 82, colours: [cg(0xEBD7B4), cg(0xB48E58)], locations: [0, 1], from: CGPoint(x: 215, y: 380), to: CGPoint(x: 810, y: 700))
        // The rim line, as on the Dark icon: a fine charcoal line inside the arc's upper edge.
        gradientStroke(arc(dy: -36), width: 2.5, colours: [cg(0x1A1714, 0.85), cg(0x1A1714, 0.55), cg(0x1A1714, 0.8)], locations: [0, 0.48, 1],
                       from: CGPoint(x: 288, y: 426), to: CGPoint(x: 720, y: 716))
    } else {
        // Light icon: highlighted reference lines, a soft shadow, the charcoal glass arc and its rim light.
        ctx.setLineWidth(10 * g); ctx.setStrokeColor(cg(0xFFFFFF, 0.72))
        ctx.move(to: CGPoint(x: 512, y: 239)); ctx.addLine(to: CGPoint(x: 512, y: 843))
        ctx.move(to: CGPoint(x: 190, y: 470)); ctx.addLine(to: CGPoint(x: 834, y: 470)); ctx.strokePath()
        ctx.setLineWidth(8 * g); ctx.setStrokeColor(cg(0xA1947F, 0.6))
        ctx.move(to: CGPoint(x: 512, y: 236)); ctx.addLine(to: CGPoint(x: 512, y: 840))
        ctx.move(to: CGPoint(x: 190, y: 467)); ctx.addLine(to: CGPoint(x: 834, y: 467)); ctx.strokePath()
        // Only the blur: the stroke is drawn far off the canvas and its shadow cast back into place.
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: 4000 * s), blur: 40 * s, color: cg(0x625747, 0.26))
        ctx.addPath(arc(dy: 22 + 4000)); ctx.setLineWidth(84); ctx.setStrokeColor(cg(0x625747)); ctx.strokePath()
        ctx.restoreGState()
        gradientStroke(arc(), width: 80, colours: [cg(0x736C61), cg(0x494941), cg(0x282C29), cg(0x626259)], locations: [0, 0.32, 0.68, 1],
                       from: CGPoint(x: 310, y: 402), to: CGPoint(x: 652, y: 736))
        gradientStroke(arc(dy: -35), width: 2, colours: [cg(0xFFFFFF, 0.88), cg(0xFFFFFF, 0.12), cg(0xD3C4AC, 0.6)], locations: [0, 0.48, 1],
                       from: CGPoint(x: 288, y: 426), to: CGPoint(x: 720, y: 716))
    }
    return ctx.makeImage()!
}

func writePNG(_ image: CGImage, _ url: URL) {
    try! NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])!.write(to: url)
    print("Wrote \(url.path.replacingOccurrences(of: root.path + "/", with: ""))")
}

// SmileMark: small sizes (thickened guides). SmileMarkLarge: the symbol widget, where the mark is
// nearly the widget's size, with the icon's own line weight.
for (name, size, guides) in [("SmileMark", 360, CGFloat(2.4)), ("SmileMarkLarge", 480, CGFloat(1))] {
    let dir = catalog.appendingPathComponent("\(name).imageset")
    try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    writePNG(markImage(size: size, dark: false, guides: guides), dir.appendingPathComponent("\(name)-light.png"))
    writePNG(markImage(size: size, dark: true, guides: guides), dir.appendingPathComponent("\(name)-dark.png"))
    try! """
    {
      "images" : [
        { "filename" : "\(name)-light.png", "idiom" : "universal" },
        { "appearances" : [ { "appearance" : "luminosity", "value" : "dark" } ], "filename" : "\(name)-dark.png", "idiom" : "universal" }
      ],
      "info" : { "author" : "xcode", "version" : 1 }
    }
    """.write(to: dir.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
}
