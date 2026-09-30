import SwiftUI
import WidgetKit

// SmileCompose widgets: shortcuts into the app and the clinician's own plan, never patient information
// (widgets show on the Home Screen and Lock Screen, where anyone can see them). Taps open the app through
// its URL scheme (uk.co.drvik.smilecompose://shortcut/<action>), handled like the Home Screen quick actions.
//
// Artwork (Assets.xcassets, rendered by scripts/render-widget-art.swift): the Home Screen app icon's
// mark (Light and Dark, as on the icon), a satin ground, and the app's own sample case before and as a
// concept — the app's artwork, not a patient.
//
// Every size shares one type scale (Type below), so text is the same size in every widget.

// MARK: - Shared with the app

/// Written by the app (ShortcutsPlugin in the app's SceneDelegate.swift). Needs the App Group capability
/// on both targets; until it is enabled the suite is empty and every widget shows its generic content.
/// Only the clinician's own details are stored: their preferred name, their generation allowance and
/// when their latest case was edited — never a patient's name, photo or treatment.
private let appGroup = "group.uk.co.drvik.smilecompose"

/// The allowance as the app last saw it: display only (the server decides access). The app writes the
/// wording, so the widget reads exactly as the app does.
private struct Allowance: Decodable {
    let remaining: Int
    /// "38 generations remaining"
    let summary: String
    /// "Renews 14 October", "Annual allowance renews 14 September 2027", "Trial ends 2 October"
    let renewal: String?
    /// "Pro Monthly", "Pro Annual", "Pro free trial", "Complimentary access"
    let plan: String?
    /// Of one period's allowance, 0...1 (a rolled-over monthly balance shows full).
    let fraction: Double
    /// ISO 8601. Once it has passed the figure is out of date until the app next opens.
    let periodEnd: String?

    func current(at date: Date) -> Allowance? {
        guard let periodEnd, let end = Self.parse(periodEnd) else { return self }
        return end > date ? self : nil
    }

    private static func parse(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso)
    }
}

private struct Shared {
    var name: String?
    var allowance: Allowance?
    var recentCaseAt: Date?

    static let none = Shared()

    static func read() -> Shared {
        let defaults = UserDefaults(suiteName: appGroup)
        let name = defaults?.string(forKey: "widget.displayName")?.trimmingCharacters(in: .whitespacesAndNewlines)
        let allowance = defaults?.string(forKey: "widget.allowance").flatMap { try? JSONDecoder().decode(Allowance.self, from: Data($0.utf8)) }
        let recent = defaults?.double(forKey: "widget.recentCaseAt") ?? 0
        return Shared(name: name?.isEmpty == false ? name : nil,
                      allowance: allowance,
                      recentCaseAt: recent > 0 ? Date(timeIntervalSince1970: recent / 1000) : nil)
    }
}

private enum Action: String {
    case new, cases, library, sample, plan, recent
    var url: URL { URL(string: "uk.co.drvik.smilecompose://shortcut/\(rawValue)")! }
}

/// "Good evening, Dr Vik." by local time, as on the app's Home screen; "Good evening." with no name.
private func greeting(_ name: String?, at date: Date) -> String {
    let hour = Calendar.current.component(.hour, from: date)
    let part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
    guard let name else { return "\(part)." }
    return "\(part), \(name.hasSuffix(".") ? name : name + ".")"
}

/// "Edited today", "Edited yesterday", "Edited 3 days ago", "Edited 12 Sep".
private func edited(_ at: Date, now: Date) -> String {
    let cal = Calendar.current
    let days = cal.dateComponents([.day], from: cal.startOfDay(for: at), to: cal.startOfDay(for: now)).day ?? 0
    switch days {
    case ...0: return "Edited today"
    case 1: return "Edited yesterday"
    case 2..<7: return "Edited \(days) days ago"
    default:
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.setLocalizedDateFormatFromTemplate("d MMM")
        return "Edited \(f.string(from: at))"
    }
}

// MARK: - Brand

private func rgb(_ hex: UInt32, _ opacity: Double = 1) -> Color {
    Color(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: opacity)
}

private struct Palette {
    let text: Color, secondary: Color, wordmark: Color
    let pill: Color, pillStroke: Color, pillText: Color
    let gold: [Color], goldStroke: Color, goldText: Color
    let card: Color, cardStroke: Color, divider: Color
    let track: Color, ring: [Color], icon: Color

    /// Tinted and clear Home Screens, StandBy at night and the iPad Lock Screen: the system draws every
    /// colour outside the accent group as white at that colour's opacity, so only opacity carries meaning.
    static let tinted = Palette(text: rgb(0xFFFFFF), secondary: rgb(0xFFFFFF, 0.64), wordmark: rgb(0xFFFFFF, 0.78),
                                pill: rgb(0xFFFFFF, 0.1), pillStroke: rgb(0xFFFFFF, 0.2), pillText: rgb(0xFFFFFF),
                                gold: [rgb(0xFFFFFF, 0.3), rgb(0xFFFFFF, 0.22)], goldStroke: rgb(0xFFFFFF, 0.35), goldText: rgb(0xFFFFFF),
                                card: rgb(0xFFFFFF, 0.1), cardStroke: rgb(0xFFFFFF, 0.18), divider: rgb(0xFFFFFF, 0.18),
                                track: rgb(0xFFFFFF, 0.22), ring: [rgb(0xFFFFFF), rgb(0xFFFFFF)], icon: rgb(0xFFFFFF))

    static func of(_ scheme: ColorScheme) -> Palette {
        scheme == .dark
            ? Palette(text: rgb(0xF4EFE7), secondary: rgb(0xBDB2A3), wordmark: rgb(0xD5C19B),
                      pill: rgb(0xFFFFFF, 0.08), pillStroke: rgb(0xFFFFFF, 0.16), pillText: rgb(0xF4EFE7),
                      gold: [rgb(0xBF9A60), rgb(0x7E6038)], goldStroke: rgb(0xE8CF9C, 0.65), goldText: rgb(0xFFF8EC),
                      card: rgb(0xFFFFFF, 0.07), cardStroke: rgb(0xFFFFFF, 0.13), divider: rgb(0xFFFFFF, 0.12),
                      track: rgb(0xFFFFFF, 0.12), ring: [rgb(0xE8CB93), rgb(0xA9834B)], icon: rgb(0xE8CF9C))
            : Palette(text: rgb(0x2A2521), secondary: rgb(0x7A6F63), wordmark: rgb(0x5E564B),
                      pill: rgb(0xFFFFFF, 0.66), pillStroke: rgb(0xFFFFFF, 0.95), pillText: rgb(0x2A2521),
                      gold: [rgb(0xEFDBB4), rgb(0xD3B27C)], goldStroke: rgb(0xFFFFFF, 0.75), goldText: rgb(0x2A2521),
                      card: rgb(0xFFFFFF, 0.62), cardStroke: rgb(0xFFFFFF, 0.95), divider: rgb(0x2A2521, 0.09),
                      track: rgb(0x2A2521, 0.08), ring: [rgb(0xDDBF88), rgb(0xB08A50)], icon: rgb(0x5E4A30))
    }
}

/// One type scale for every widget. `k` is 1 on iPhone and only shrinks (evenly, for all text) to fit
/// the smaller iPad widgets.
private struct Type {
    let k: CGFloat
    var greeting: CGFloat { 22 * k }
    var emphasis: CGFloat { 15 * k }
    var label: CGFloat { 13 * k }
    var caption: CGFloat { 10.5 * k }
    var wordmark: CGFloat { 8 * k }
    var brand: CGFloat { 12 * k }
    var number: CGFloat { 28 * k }
    var pill: CGFloat { 32 * k }
    var gap: CGFloat { 7 * k }
    var compactMark: CGFloat { 20 * k }
    var lockupMark: CGFloat { 32 * k }
    var radius: CGFloat { 16 * k }
}

/// The mark from the Home Screen app icon (Light: the charcoal glass arc; Dark: the champagne arc).
/// `large` uses the icon's own hairline guides; the default artwork thickens them for small sizes.
private struct AppMark: View {
    var large = false
    var body: some View {
        let image = Image(large ? "SmileMarkLarge" : "SmileMark").resizable()
        if #available(iOSApplicationExtension 18.0, *) {
            image.widgetAccentedRenderingMode(.accentedDesaturated).scaledToFit()
        } else {
            image.scaledToFit()
        }
    }
}

/// The same mark as vector lines, for the monochrome Lock Screen (geometry from the app icon, in the
/// mark's square: arc, facial midline and incisal plane).
private struct LineMark: View {
    var body: some View {
        GeometryReader { geo in
            let w = min(geo.size.width, geo.size.height)
            let o = CGPoint(x: (geo.size.width - w) / 2, y: (geo.size.height - w) / 2)
            let at = { (x: CGFloat, y: CGFloat) in CGPoint(x: o.x + x * w, y: o.y + y * w) }
            ZStack {
                Path { p in
                    p.move(to: at(0.5, 0.083)); p.addLine(to: at(0.5, 0.917))
                    p.move(to: at(0.12, 0.402)); p.addLine(to: at(0.88, 0.402))
                }
                .stroke(.secondary, lineWidth: max(1, w * 0.03))
                Path { p in
                    p.move(to: at(0.091, 0.352))
                    p.addCurve(to: at(0.909, 0.352), control1: at(0.238, 0.820), control2: at(0.762, 0.820))
                }
                .stroke(.primary, style: StrokeStyle(lineWidth: w * 0.11, lineCap: .round))
                .widgetAccentable()
            }
        }
    }
}

/// The app's tooth symbol (src/components/icons/SmileIcons.tsx, on its 24 pt grid).
private struct ToothShape: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24
        let o = CGPoint(x: rect.midX - 12 * s, y: rect.midY - 12 * s)
        let at = { (x: CGFloat, y: CGFloat) in CGPoint(x: o.x + x * s, y: o.y + y * s) }
        var p = Path()
        p.move(to: at(7.5, 3.5))
        p.addCurve(to: at(12, 4.4), control1: at(9.1, 3.5), control2: at(10.3, 4.4))
        p.addCurve(to: at(16.5, 3.5), control1: at(13.7, 4.4), control2: at(14.9, 3.5))
        p.addCurve(to: at(20, 8.1), control1: at(18.8, 3.5), control2: at(20, 5.5))
        p.addCurve(to: at(18.4, 14.7), control1: at(20, 10.7), control2: at(19.1, 12.5))
        p.addCurve(to: at(16, 20.5), control1: at(17.8, 16.7), control2: at(17.5, 19.5))
        p.addCurve(to: at(13.6, 17.5), control1: at(14.7, 21.4), control2: at(14, 19.3))
        p.addCurve(to: at(12, 15.1), control1: at(13.3, 16.2), control2: at(12.8, 15.1))
        p.addCurve(to: at(10.4, 17.5), control1: at(11.2, 15.1), control2: at(10.7, 16.2))
        p.addCurve(to: at(8, 20.5), control1: at(10, 19.3), control2: at(9.3, 21.4))
        p.addCurve(to: at(5.6, 14.7), control1: at(6.5, 19.5), control2: at(6.2, 16.7))
        p.addCurve(to: at(4, 8.1), control1: at(4.9, 12.5), control2: at(4, 10.7))
        p.addCurve(to: at(7.5, 3.5), control1: at(4, 5.5), control2: at(5.2, 3.5))
        p.closeSubpath()
        return p
    }
}

/// The mark and the letter-spaced wordmark. Compact for small and medium widgets.
private struct Lockup: View {
    let t: Type, p: Palette
    var compact = false
    var body: some View {
        HStack(spacing: (compact ? 7 : 10) * t.k) {
            AppMark().frame(width: compact ? t.compactMark : t.lockupMark, height: compact ? t.compactMark : t.lockupMark)
            Text("SMILECOMPOSE")
                .font(.system(size: compact ? t.wordmark : t.brand, weight: .semibold))
                .tracking((compact ? t.wordmark : t.brand) * 0.32)
                .foregroundStyle(compact ? p.wordmark : p.text)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
    }
}

private struct CardBackground: View {
    let t: Type, p: Palette
    var body: some View {
        RoundedRectangle(cornerRadius: t.radius, style: .continuous).fill(p.card)
            .overlay(RoundedRectangle(cornerRadius: t.radius, style: .continuous).strokeBorder(p.cardStroke, lineWidth: 0.8))
    }
}

/// Progress around a centre: the share of this period's generations still to use. No fraction (nothing
/// shared yet) draws the track alone.
private struct Ring<Centre: View>: View {
    let fraction: Double?, width: CGFloat, p: Palette
    @ViewBuilder let centre: () -> Centre
    var body: some View {
        ZStack {
            Circle().stroke(p.track, lineWidth: width)
            if let fraction, fraction > 0 {
                Circle().trim(from: 0, to: min(1, fraction))
                    .stroke(LinearGradient(colors: p.ring, startPoint: .top, endPoint: .bottom), style: StrokeStyle(lineWidth: width, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .widgetAccentable()
            }
            centre()
        }
        .padding(width / 2)
    }
}

/// "38 generations remaining · Renews 14 October", opening Subscription in the app.
private struct AllowanceCard: View {
    let allowance: Allowance?, t: Type, p: Palette
    var ring: CGFloat = 44
    /// A narrow column: no chevron (the whole card opens Subscription), and the renewal may wrap.
    var compact = false
    var body: some View {
        Link(destination: Action.plan.url) {
            HStack(spacing: 11 * t.k) {
                Ring(fraction: allowance?.fraction, width: max(2.5, ring * 0.075), p: p) {
                    ToothShape().stroke(p.text, style: StrokeStyle(lineWidth: 1.4 * t.k, lineJoin: .round))
                        .frame(width: ring * 0.42, height: ring * 0.42)
                }
                .frame(width: ring, height: ring)
                VStack(alignment: .leading, spacing: 2 * t.k) {
                    Text(allowance?.summary ?? "Your plan")
                        .font(.system(size: t.emphasis, weight: .semibold)).foregroundStyle(p.text)
                        .lineLimit(2).minimumScaleFactor(0.85).fixedSize(horizontal: false, vertical: true)
                    Text(allowance?.renewal ?? "Generations and renewal")
                        .font(.system(size: t.caption)).foregroundStyle(p.secondary).lineLimit(compact ? 2 : 1).minimumScaleFactor(0.85)
                }
                Spacer(minLength: 0)
                if !compact {
                    Image(systemName: "chevron.right").font(.system(size: t.label, weight: .medium)).foregroundStyle(p.secondary)
                }
            }
            .padding(.horizontal, (compact ? 10 : 12) * t.k).padding(.vertical, 9 * t.k)
            .background(CardBackground(t: t, p: p))
        }
    }
}

private struct GoldCapsule: View {
    let p: Palette
    var body: some View {
        Capsule().fill(LinearGradient(colors: p.gold, startPoint: .top, endPoint: .bottom))
            .overlay(Capsule().strokeBorder(p.goldStroke, lineWidth: 0.8))
    }
}

/// A full-width capsule action: icon and title.
private struct Pill: View {
    let title: String, symbol: String, action: Action, primary: Bool, t: Type, p: Palette
    var body: some View {
        Link(destination: action.url) {
            HStack(spacing: 7 * t.k) {
                Image(systemName: symbol).font(.system(size: t.label, weight: .regular)).frame(width: 16 * t.k)
                Text(title).font(.system(size: t.label, weight: .medium)).lineLimit(1).minimumScaleFactor(0.85)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12 * t.k)
            .frame(maxWidth: .infinity, minHeight: t.pill, maxHeight: t.pill)
            .foregroundStyle(primary ? p.goldText : p.pillText)
            .background {
                if primary { GoldCapsule(p: p) } else {
                    Capsule().fill(p.pill).overlay(Capsule().strokeBorder(p.pillStroke, lineWidth: 0.8))
                }
            }
        }
    }
}

/// Extra large: three actions side by side, each a rounded tile with its icon and a title that may wrap.
private struct ActionButton: View {
    let title: String, symbol: String, action: Action, primary: Bool, t: Type, p: Palette
    /// Sized to its title rather than sharing the row equally.
    var hugs = false
    var body: some View {
        Link(destination: action.url) {
            HStack(spacing: 8 * t.k) {
                Image(systemName: symbol).font(.system(size: t.emphasis, weight: .regular)).frame(width: 18 * t.k)
                Text(title).font(.system(size: t.label, weight: .medium)).lineLimit(hugs ? 1 : 2).minimumScaleFactor(0.85)
                    .multilineTextAlignment(.leading)
                if !hugs { Spacer(minLength: 0) }
            }
            .padding(.horizontal, 12 * t.k)
            .frame(maxWidth: hugs ? nil : .infinity, minHeight: 44 * t.k, maxHeight: 44 * t.k)
            .fixedSize(horizontal: hugs, vertical: false)
            .foregroundStyle(primary ? p.goldText : p.text)
            .background {
                if primary {
                    RoundedRectangle(cornerRadius: t.radius, style: .continuous).fill(LinearGradient(colors: p.gold, startPoint: .top, endPoint: .bottom))
                        .overlay(RoundedRectangle(cornerRadius: t.radius, style: .continuous).strokeBorder(p.goldStroke, lineWidth: 0.8))
                } else {
                    CardBackground(t: t, p: p)
                }
            }
        }
    }
}

/// Medium: an icon tile over its title.
private struct ActionTile: View {
    let title: String, symbol: String, action: Action, primary: Bool, t: Type, p: Palette
    var body: some View {
        Link(destination: action.url) {
            VStack(spacing: 7 * t.k) {
                Image(systemName: symbol)
                    .font(.system(size: 17 * t.k, weight: .regular))
                    .foregroundStyle(primary ? p.goldText : p.text)
                    .frame(width: 42 * t.k, height: 42 * t.k)
                    .background {
                        if primary {
                            RoundedRectangle(cornerRadius: 13 * t.k, style: .continuous).fill(LinearGradient(colors: p.gold, startPoint: .top, endPoint: .bottom))
                        } else {
                            RoundedRectangle(cornerRadius: 13 * t.k, style: .continuous).fill(p.card)
                                .overlay(RoundedRectangle(cornerRadius: 13 * t.k, style: .continuous).strokeBorder(p.cardStroke, lineWidth: 0.8))
                        }
                    }
                Text(title).font(.system(size: t.label, weight: .medium)).foregroundStyle(p.text)
                    .lineLimit(1).minimumScaleFactor(0.75)
            }
            .padding(.horizontal, 4 * t.k)
            .frame(maxWidth: .infinity)
        }
    }
}

/// The latest case, by when it was edited only — never its name, photo or treatment. With no case
/// shared (or none yet), the sample case instead.
private struct RecentRow: View {
    let recentAt: Date?, now: Date, t: Type, p: Palette
    var body: some View {
        Link(destination: (recentAt == nil ? Action.sample : .recent).url) {
            HStack(spacing: 11 * t.k) {
                Image(systemName: recentAt == nil ? "play.fill" : "clock.arrow.circlepath")
                    .font(.system(size: t.emphasis, weight: .regular)).foregroundStyle(p.icon)
                    .frame(width: 40 * t.k, height: 40 * t.k)
                    .background(RoundedRectangle(cornerRadius: 11 * t.k, style: .continuous).fill(LinearGradient(colors: p.gold.map { $0.opacity(0.35) }, startPoint: .top, endPoint: .bottom)))
                VStack(alignment: .leading, spacing: 2 * t.k) {
                    Text(recentAt == nil ? "Explore a sample case" : "Latest case")
                        .font(.system(size: t.label, weight: .semibold)).foregroundStyle(p.text).lineLimit(1)
                    Text(recentAt.map { edited($0, now: now) } ?? "No patient photo, no AI credits")
                        .font(.system(size: t.caption)).foregroundStyle(p.secondary).lineLimit(1).minimumScaleFactor(0.85)
                }
                Spacer(minLength: 0)
                HStack(spacing: 4 * t.k) {
                    Text("Open").font(.system(size: t.label, weight: .medium))
                    Image(systemName: "chevron.right").font(.system(size: t.caption, weight: .semibold))
                }
                .foregroundStyle(p.goldText)
                .padding(.horizontal, 12 * t.k).frame(height: 30 * t.k)
                .background(GoldCapsule(p: p))
            }
            .padding(.horizontal, 8 * t.k).padding(.vertical, 7 * t.k)
            .background(CardBackground(t: t, p: p))
        }
    }
}

/// The sample case, before and as a concept, split down the middle like the reveal in the app.
private struct BeforeAfter: View {
    let t: Type
    /// Below the smile, on the chin, as in the app's reveal, so the handle never covers the teeth.
    var handleAt: CGFloat = 0.74
    var leadingInset: CGFloat = 16
    var tagsAtBottom = false
    /// Tags either side of the divider instead of at the panel's edges (narrow panels).
    var tagsAtDivider = false
    var showsTags = true
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                Photo(name: "SampleBefore").frame(width: w, height: h).clipped()
                Photo(name: "SampleAfter").frame(width: w, height: h).clipped()
                    .mask(HStack(spacing: 0) { Color.clear; Color.black })
                Rectangle().fill(Color.white.opacity(0.92)).frame(width: 1.5, height: h).position(x: w / 2, y: h / 2)
                Circle().fill(rgb(0xFBF8F2)).frame(width: 24 * t.k, height: 24 * t.k)
                    .overlay(Circle().fill(rgb(0xC9A46A)).padding(8 * t.k).widgetAccentable())
                    .shadow(color: .black.opacity(0.28), radius: 6, y: 2)
                    .position(x: w / 2, y: h * handleAt)
            }
            .overlay(alignment: tagsAtDivider ? (tagsAtBottom ? .bottom : .top) : (tagsAtBottom ? .bottomLeading : .topLeading)) {
                Tag(text: "Before", t: t).opacity(showsTags ? 1 : 0)
                    .alignmentGuide(HorizontalAlignment.center) { $0[.trailing] + 6 * t.k }
                    .padding(.leading, tagsAtDivider ? 0 : leadingInset).padding(tagsAtBottom ? .bottom : .top, 16 * t.k)
            }
            .overlay(alignment: tagsAtDivider ? (tagsAtBottom ? .bottom : .top) : (tagsAtBottom ? .bottomTrailing : .topTrailing)) {
                Tag(text: "Concept", t: t).opacity(showsTags ? 1 : 0)
                    .alignmentGuide(HorizontalAlignment.center) { $0[.leading] - 6 * t.k }
                    .padding(.trailing, tagsAtDivider ? 0 : 16 * t.k).padding(tagsAtBottom ? .bottom : .top, 16 * t.k)
            }
        }
    }
}

private struct Tag: View {
    let text: String, t: Type
    var body: some View {
        Text(text).font(.system(size: t.caption, weight: .semibold)).foregroundStyle(.white)
            .padding(.horizontal, 10 * t.k).padding(.vertical, 5 * t.k)
            .background(Capsule().fill(Color.black.opacity(0.4)))
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.28), lineWidth: 0.7))
    }
}

/// A photograph filling its frame. Tinted and clear Home Screens draw an image as a flat silhouette unless
/// told otherwise, so a photograph would become a solid block; there it is shown in greyscale instead.
private struct Photo: View {
    let name: String
    var body: some View {
        let image = Image(name).resizable()
        if #available(iOSApplicationExtension 18.0, *) {
            image.widgetAccentedRenderingMode(.desaturated).scaledToFill()
        } else {
            image.scaledToFill()
        }
    }
}

// MARK: - Backgrounds (full bleed, behind the content margins)

private struct Silk: View {
    let name: String
    var body: some View {
        GeometryReader { geo in
            Image(name).resizable().scaledToFill().frame(width: geo.size.width, height: geo.size.height).clipped()
        }
    }
}

/// Satin, with the sample before/after filling the right-hand share and fading into the satin on its left.
private struct ShowcaseBackground: View {
    var share: CGFloat = 0.5
    var tagsAtDivider = false
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 330))
            let panel = geo.size.width * share
            ZStack(alignment: .trailing) {
                Silk(name: "SilkWide")
                BeforeAfter(t: t, handleAt: 0.7, leadingInset: panel * 0.2 + 6, tagsAtBottom: true, tagsAtDivider: tagsAtDivider)
                    .frame(width: panel, height: geo.size.height)
                    .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black.opacity(0.85), location: 0.14), .init(color: .black, location: 0.24)],
                                         startPoint: .leading, endPoint: .trailing))
            }
        }
    }
}

private extension View {
    /// iOS 17+ widgets declare their background (the system removes it in tinted and StandBy modes);
    /// iOS 16 draws it and applies the standard margin itself.
    @ViewBuilder func widgetBackground<B: View>(@ViewBuilder _ background: () -> B) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget, content: background)
        } else {
            padding(16).background(background())
        }
    }
}

// MARK: - Timeline

private struct Entry: TimelineEntry {
    let date: Date
    let shared: Shared
    var allowance: Allowance? { shared.allowance?.current(at: date) }
}

/// The shared details, redrawn at midnight, noon and 6 pm so the greeting and "Edited today" stay true.
/// The app asks WidgetKit to reload whenever it changes what it shares.
private struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: .now, shared: .none) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: .now, shared: Shared.read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let now = Date.now, shared = Shared.read()
        let cal = Calendar.current, today = cal.startOfDay(for: now)
        let changes = (0...2).flatMap { day in [0, 12, 18].compactMap { cal.date(byAdding: DateComponents(day: day, hour: $0), to: today) } }
            .filter { $0 > now }
        completion(Timeline(entries: [Entry(date: now, shared: shared)] + changes.map { Entry(date: $0, shared: shared) }, policy: .atEnd))
    }
}

// MARK: - Views
// Designed for the iPhone content areas (inside the margins): small and medium 126 pt tall, large
// 306 pt wide. Smaller iPad widgets scale everything by the same factor.

/// Small: an invitation and New design (the whole widget starts one).
private struct SmallView: View {
    let p: Palette
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 126))
            VStack(alignment: .leading, spacing: 0) {
                Lockup(t: t, p: p, compact: true)
                Spacer(minLength: 4)
                Text("Create your\nnext smile.")
                    .font(.system(size: t.greeting, weight: .regular, design: .serif)).foregroundStyle(p.text)
                    .lineLimit(2).minimumScaleFactor(0.8).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 6)
                HStack(spacing: 7 * t.k) {
                    Image(systemName: "plus").font(.system(size: t.label, weight: .regular))
                    Text("New design").font(.system(size: t.label, weight: .medium)).lineLimit(1)
                }
                .foregroundStyle(p.goldText)
                .frame(maxWidth: .infinity, minHeight: t.pill, maxHeight: t.pill)
                .background(GoldCapsule(p: p))
            }
        }
        .widgetURL(Action.new.url)
    }
}

/// Medium: four quick actions.
private struct QuickActionsView: View {
    let p: Palette
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 126))
            VStack(alignment: .leading, spacing: 0) {
                Lockup(t: t, p: p, compact: true)
                Spacer(minLength: 6)
                HStack(spacing: 0) {
                    ActionTile(title: "New design", symbol: "plus", action: .new, primary: true, t: t, p: p)
                    Divider().overlay(p.divider).frame(height: 44 * t.k)
                    ActionTile(title: "Cases", symbol: "folder", action: .cases, primary: false, t: t, p: p)
                    Divider().overlay(p.divider).frame(height: 44 * t.k)
                    ActionTile(title: "Case Library", symbol: "books.vertical", action: .library, primary: false, t: t, p: p)
                    Divider().overlay(p.divider).frame(height: 44 * t.k)
                    ActionTile(title: "Sample case", symbol: "play", action: .sample, primary: false, t: t, p: p)
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(Action.new.url)
    }
}

/// Where the system has removed the background (tinted, clear, StandBy), the sample before/after sits in
/// the content instead, as a rounded panel on the right.
private struct PhotoPanel: View {
    let t: Type, tinted: Bool
    var body: some View {
        BeforeAfter(t: t, handleAt: 0.7, leadingInset: 12 * t.k, tagsAtBottom: true, tagsAtDivider: true, showsTags: !tinted)
            .clipShape(RoundedRectangle(cornerRadius: 18 * t.k, style: .continuous))
    }
}

/// Large: the brand line, the allowance and three actions on the left; the sample before/after on the right.
private struct LargeView: View {
    let p: Palette, allowance: Allowance?
    /// The background has been removed (tinted, clear, StandBy): the photo moves into the content.
    var bare = false, tinted = false
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.width / 306))
            VStack(alignment: .leading, spacing: 0) {
                Lockup(t: t, p: p, compact: true)
                Spacer(minLength: 6)
                Text("Smile design,\nvisualised.")
                    .font(.system(size: t.greeting, weight: .regular, design: .serif)).foregroundStyle(p.text)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                Text("Design, preview and present.")
                    .font(.system(size: t.caption)).foregroundStyle(p.secondary).lineLimit(2)
                    .padding(.top, 4 * t.k)
                Spacer(minLength: 8)
                AllowanceCard(allowance: allowance, t: t, p: p, ring: 30 * t.k, compact: true)
                Spacer(minLength: 8)
                VStack(spacing: t.gap) {
                    Pill(title: "New design", symbol: "plus", action: .new, primary: true, t: t, p: p)
                    Pill(title: "Cases", symbol: "folder", action: .cases, primary: false, t: t, p: p)
                    Pill(title: "Sample case", symbol: "play", action: .sample, primary: false, t: t, p: p)
                }
            }
            .frame(width: geo.size.width * 0.56, alignment: .leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .overlay(alignment: .trailing) {
                if bare { PhotoPanel(t: t, tinted: tinted).frame(width: geo.size.width * 0.4) }
            }
        }
        .widgetURL(Action.new.url)
    }
}

/// Extra large (iPad): a working Home screen. Greeting, the allowance, three actions and the latest
/// case on the left; the sample before/after on the right.
private struct ExtraLargeView: View {
    let p: Palette, entry: Entry
    var bare = false, tinted = false
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 310))
            VStack(alignment: .leading, spacing: 0) {
                Lockup(t: t, p: p)
                Spacer(minLength: 8)
                Text(greeting(entry.shared.name, at: entry.date))
                    .font(.system(size: t.greeting, weight: .regular, design: .serif)).foregroundStyle(p.text)
                    .lineLimit(2).minimumScaleFactor(0.8).fixedSize(horizontal: false, vertical: true)
                Text("Your smile design workspace is ready.")
                    .font(.system(size: t.label)).foregroundStyle(p.secondary).lineLimit(1).minimumScaleFactor(0.85)
                    .padding(.top, 3 * t.k)
                Spacer(minLength: 10)
                AllowanceCard(allowance: entry.allowance, t: t, p: p, ring: 44 * t.k)
                Spacer(minLength: 8)
                HStack(spacing: 8 * t.k) {
                    ActionButton(title: "New design", symbol: "plus", action: .new, primary: true, t: t, p: p, hugs: true)
                    ActionButton(title: "Cases", symbol: "folder", action: .cases, primary: false, t: t, p: p)
                    ActionButton(title: "Case Library", symbol: "books.vertical", action: .library, primary: false, t: t, p: p)
                }
                Spacer(minLength: 10)
                Rectangle().fill(p.divider).frame(height: 1)
                HStack {
                    Text(entry.shared.recentCaseAt == nil ? "New to SmileCompose?" : "Recent case")
                        .font(.system(size: t.caption, weight: .medium)).foregroundStyle(p.secondary)
                    Spacer(minLength: 0)
                    if entry.shared.recentCaseAt != nil {
                        Link(destination: Action.cases.url) {
                            HStack(spacing: 3 * t.k) {
                                Text("See all")
                                Image(systemName: "chevron.right").font(.system(size: t.caption * 0.85, weight: .semibold))
                            }
                            .font(.system(size: t.caption, weight: .medium)).foregroundStyle(p.secondary)
                        }
                    }
                }
                .padding(.top, 8 * t.k).padding(.bottom, 6 * t.k)
                RecentRow(recentAt: entry.shared.recentCaseAt, now: entry.date, t: t, p: p)
            }
            .frame(width: geo.size.width * 0.49, alignment: .leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .overlay(alignment: .trailing) {
                if bare { PhotoPanel(t: t, tinted: tinted).frame(width: geo.size.width * 0.47) }
            }
        }
        .widgetURL(Action.new.url)
    }
}

/// Generations, small: the balance in a ring and when it renews. Opens Subscription.
private struct GenerationsSmallView: View {
    let p: Palette, allowance: Allowance?
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 126))
            VStack(spacing: 0) {
                Lockup(t: t, p: p, compact: true).frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 4)
                Ring(fraction: allowance?.fraction, width: 5 * t.k, p: p) {
                    if let allowance {
                        VStack(spacing: 0) {
                            Text("\(allowance.remaining)").font(.system(size: t.number, weight: .medium)).foregroundStyle(p.text)
                                .lineLimit(1).minimumScaleFactor(0.6)
                            Text("remaining").font(.system(size: t.caption)).foregroundStyle(p.secondary)
                        }
                        .offset(y: -1 * t.k)
                    } else {
                        ToothShape().stroke(p.text, style: StrokeStyle(lineWidth: 1.5 * t.k, lineJoin: .round)).frame(width: 26 * t.k, height: 26 * t.k)
                    }
                }
                .frame(width: 82 * t.k, height: 82 * t.k)
                Spacer(minLength: 4)
                Text(allowance?.renewal ?? "See your generations")
                    .font(.system(size: t.caption)).foregroundStyle(p.secondary).lineLimit(1).minimumScaleFactor(0.8)
            }
        }
        .widgetURL(Action.plan.url)
    }
}

/// Generations, medium: the balance in a ring, the plan and renewal, and the latest case.
private struct GenerationsMediumView: View {
    let p: Palette, entry: Entry
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 126))
            let allowance = entry.allowance
            HStack(spacing: 16 * t.k) {
                Ring(fraction: allowance?.fraction, width: 6 * t.k, p: p) {
                    if let allowance {
                        VStack(spacing: 1 * t.k) {
                            Text("\(allowance.remaining)").font(.system(size: t.number, weight: .medium)).foregroundStyle(p.text)
                                .lineLimit(1).minimumScaleFactor(0.6)
                            Text("generations\nremaining").font(.system(size: t.caption)).foregroundStyle(p.secondary)
                                .multilineTextAlignment(.center).lineLimit(2)
                        }
                    } else {
                        ToothShape().stroke(p.text, style: StrokeStyle(lineWidth: 1.6 * t.k, lineJoin: .round)).frame(width: 32 * t.k, height: 32 * t.k)
                    }
                }
                .frame(width: 112 * t.k, height: 112 * t.k)
                VStack(alignment: .leading, spacing: 0) {
                    Lockup(t: t, p: p, compact: true)
                    Spacer(minLength: 4)
                    Link(destination: Action.plan.url) {
                        HStack(spacing: 6 * t.k) {
                            VStack(alignment: .leading, spacing: 2 * t.k) {
                                Text(allowance?.plan ?? "Your plan").font(.system(size: t.emphasis, weight: .semibold)).foregroundStyle(p.text).lineLimit(1)
                                Text(allowance?.renewal ?? "Generations and renewal").font(.system(size: t.caption)).foregroundStyle(p.secondary)
                                    .lineLimit(1).minimumScaleFactor(0.85)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.system(size: t.label, weight: .medium)).foregroundStyle(p.secondary)
                        }
                    }
                    Spacer(minLength: 4)
                    Rectangle().fill(p.divider).frame(height: 1)
                    Link(destination: (entry.shared.recentCaseAt == nil ? Action.sample : .recent).url) {
                        HStack(spacing: 8 * t.k) {
                            Image(systemName: entry.shared.recentCaseAt == nil ? "play.fill" : "clock.arrow.circlepath")
                                .font(.system(size: t.label)).foregroundStyle(p.icon).frame(width: 18 * t.k)
                            VStack(alignment: .leading, spacing: 1 * t.k) {
                                Text(entry.shared.recentCaseAt == nil ? "Sample case" : "Recent case")
                                    .font(.system(size: t.caption)).foregroundStyle(p.secondary)
                                Text(entry.shared.recentCaseAt.map { edited($0, now: entry.date) } ?? "No AI credits used")
                                    .font(.system(size: t.label, weight: .medium)).foregroundStyle(p.text).lineLimit(1).minimumScaleFactor(0.85)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.system(size: t.label, weight: .medium)).foregroundStyle(p.secondary)
                        }
                        .padding(.top, 7 * t.k)
                    }
                }
            }
            .frame(maxHeight: .infinity)
        }
        .widgetURL(Action.plan.url)
    }
}

/// The mark alone, on satin, as large as the widget allows: it reaches past the content margins so the
/// arc sits about 13 pt from the edges (the artwork's own padding keeps it clear of the corners).
private struct MarkView: View {
    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height) * 1.12
            AppMark(large: true).frame(width: side, height: side)
                .frame(width: geo.size.width, height: geo.size.height)
        }
        .widgetURL(Action.new.url)
    }
}

/// How the widget is being drawn. `tinted`: tinted or clear Home Screen, StandBy at night, the Lock Screen
/// (colours flattened to the tint). `bare`: the system has removed the container background (those modes,
/// and StandBy by day, which draws the content on black).
private struct Look {
    let tinted: Bool, bare: Bool
    func palette(_ scheme: ColorScheme) -> Palette { tinted ? .tinted : bare ? .of(.dark) : .of(scheme) }
}

private struct LookReader<Content: View>: View {
    @ViewBuilder let content: (Look) -> Content
    @Environment(\.widgetRenderingMode) private var mode
    var body: some View {
        if #available(iOSApplicationExtension 17.0, *) {
            BackgroundAware(tinted: mode != .fullColor, content: content)
        } else {
            content(Look(tinted: mode != .fullColor, bare: mode != .fullColor))
        }
    }
}

@available(iOSApplicationExtension 17.0, *)
private struct BackgroundAware<Content: View>: View {
    let tinted: Bool
    @ViewBuilder let content: (Look) -> Content
    @Environment(\.showsWidgetContainerBackground) private var showsBackground
    var body: some View { content(Look(tinted: tinted, bare: tinted || !showsBackground)) }
}

private struct WidgetView: View {
    let entry: Entry
    var body: some View { LookReader { look in FamilyView(entry: entry, look: look) } }
}

private struct FamilyView: View {
    let entry: Entry, look: Look
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let p = look.palette(scheme)
        let name = entry.shared.name
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                LineMark().padding(10)
            }
            .widgetURL(Action.new.url)
            .widgetBackground { Color.clear }
        case .accessoryRectangular:
            HStack(spacing: 8) {
                LineMark().frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name.map { "Welcome, \($0)" } ?? "SmileCompose").font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text("New smile design").font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .widgetURL(Action.new.url)
            .widgetBackground { Color.clear }
        case .accessoryInline:
            Label(name.map { "Welcome, \($0)" } ?? "New smile design", systemImage: "plus.circle")
                .widgetURL(Action.new.url)
                .widgetBackground { Color.clear }
        case .systemMedium:
            QuickActionsView(p: p).widgetBackground { Silk(name: "SilkWide") }
        case .systemLarge:
            LargeView(p: p, allowance: entry.allowance, bare: look.bare, tinted: look.tinted)
                .widgetBackground { ShowcaseBackground(share: 0.5, tagsAtDivider: true) }
        case .systemExtraLarge:
            ExtraLargeView(p: p, entry: entry, bare: look.bare, tinted: look.tinted)
                .widgetBackground { ShowcaseBackground(share: 0.52) }
        default:
            SmallView(p: p).widgetBackground { Silk(name: "SilkSquare") }
        }
    }
}

private struct GenerationsView: View {
    let entry: Entry
    var body: some View { LookReader { look in GenerationsFamilyView(entry: entry, look: look) } }
}

private struct GenerationsFamilyView: View {
    let entry: Entry, look: Look
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let p = look.palette(scheme)
        switch family {
        case .systemMedium:
            GenerationsMediumView(p: p, entry: entry).widgetBackground { Silk(name: "SilkWide") }
        default:
            GenerationsSmallView(p: p, allowance: entry.allowance).widgetBackground { Silk(name: "SilkSquare") }
        }
    }
}

// MARK: - Widgets

struct SmileComposeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SmileComposeWidget", provider: Provider()) { entry in WidgetView(entry: entry) }
            .configurationDisplayName("SmileCompose")
            .description("Start a new smile design, open your cases, your Case Library or the sample case.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge,
                                .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct SmileComposeGenerationsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SmileComposeGenerations", provider: Provider()) { entry in GenerationsView(entry: entry) }
            .configurationDisplayName("SmileCompose Generations")
            .description("Generations remaining, when your plan renews and your latest case. Never shows patient details.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct SmileComposeMarkWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SmileComposeMark", provider: Provider()) { _ in
            MarkView().widgetBackground { Silk(name: "SilkSquare") }
        }
        .configurationDisplayName("SmileCompose Symbol")
        .description("The SmileCompose symbol. Tap to start a new smile design.")
        .supportedFamilies([.systemSmall])
    }
}

@main
struct SmileComposeWidgets: WidgetBundle {
    var body: some Widget {
        SmileComposeWidget()
        SmileComposeGenerationsWidget()
        SmileComposeMarkWidget()
    }
}
