import SwiftUI
import WidgetKit

// SmileCompose widgets: shortcuts into the app and the clinician's own plan, never patient information
// (widgets show on the Home Screen and Lock Screen, where anyone can see them). Taps open the app through
// its URL scheme (uk.co.drvik.smilecompose://shortcut/<action>), handled like the Home Screen quick actions.
//
// Styled for the iOS 26/27 Home Screen: deep, warm gradients drawn in code (no photographs or mockups),
// glass tiles that follow the widget's own corner (ContainerRelativeShape) and one champagne accent,
// which tinted and clear Home Screens take over. The only artwork is the app icon's mark.
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
    let text: Color, secondary: Color, tertiary: Color
    let tile: Color, tileStroke: Color, tileShine: Color
    let accent: [Color], accentText: Color, accentStroke: Color
    let track: Color, ring: [Color], icon: Color, iconWell: Color
    let ground: [Color], glow: Color

    /// Tinted and clear Home Screens, StandBy at night and the Lock Screen: the system draws every colour
    /// outside the accent group as white at that colour's opacity, so only opacity carries meaning.
    static let tinted = Palette(text: rgb(0xFFFFFF), secondary: rgb(0xFFFFFF, 0.66), tertiary: rgb(0xFFFFFF, 0.45),
                                tile: rgb(0xFFFFFF, 0.1), tileStroke: rgb(0xFFFFFF, 0.22), tileShine: rgb(0xFFFFFF, 0),
                                accent: [rgb(0xFFFFFF, 0.32), rgb(0xFFFFFF, 0.24)], accentText: rgb(0xFFFFFF), accentStroke: rgb(0xFFFFFF, 0.4),
                                track: rgb(0xFFFFFF, 0.2), ring: [rgb(0xFFFFFF), rgb(0xFFFFFF)], icon: rgb(0xFFFFFF), iconWell: rgb(0xFFFFFF, 0.14),
                                ground: [.clear, .clear], glow: .clear)

    static func of(_ scheme: ColorScheme) -> Palette {
        scheme == .dark
            ? Palette(text: rgb(0xF6F0E7), secondary: rgb(0xF6F0E7, 0.62), tertiary: rgb(0xF6F0E7, 0.4),
                      tile: rgb(0xFFFFFF, 0.075), tileStroke: rgb(0xFFFFFF, 0.13), tileShine: rgb(0xFFFFFF, 0.06),
                      accent: [rgb(0xEBD3A4), rgb(0xBE965C)], accentText: rgb(0x1E1813), accentStroke: rgb(0xFFF1D6, 0.55),
                      track: rgb(0xFFFFFF, 0.12), ring: [rgb(0xEBD3A4), rgb(0xBE965C)], icon: rgb(0xEBD3A4), iconWell: rgb(0xEBD3A4, 0.14),
                      ground: [rgb(0x2B2520), rgb(0x15120F)], glow: rgb(0xD9B77E, 0.2))
            : Palette(text: rgb(0x241F1A), secondary: rgb(0x241F1A, 0.6), tertiary: rgb(0x241F1A, 0.4),
                      tile: rgb(0xFFFFFF, 0.72), tileStroke: rgb(0xFFFFFF, 1), tileShine: rgb(0xFFFFFF, 0.5),
                      accent: [rgb(0xE8CC97), rgb(0xC69C5F)], accentText: rgb(0x1E1813), accentStroke: rgb(0xFFFFFF, 0.8),
                      track: rgb(0x241F1A, 0.08), ring: [rgb(0xD9B77E), rgb(0xB08A50)], icon: rgb(0x8A6634), iconWell: rgb(0xC69C5F, 0.16),
                      ground: [rgb(0xFBF8F3), rgb(0xEEE5D7)], glow: rgb(0xFFFFFF, 0.9))
    }
}

/// One type scale for every widget. `k` is 1 on iPhone and only shrinks (evenly, for all text) to fit
/// the smaller iPad widgets.
private struct Type {
    let k: CGFloat
    var title: CGFloat { 21 * k }
    var emphasis: CGFloat { 15 * k }
    var label: CGFloat { 13 * k }
    var caption: CGFloat { 11 * k }
    var wordmark: CGFloat { 8.5 * k }
    var number: CGFloat { 30 * k }
    var gap: CGFloat { 8 * k }
    var mark: CGFloat { 18 * k }
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

/// The mark and the letter-spaced wordmark, small, at the top of each widget.
private struct Header: View {
    let t: Type, p: Palette
    var body: some View {
        HStack(spacing: 6 * t.k) {
            AppMark().frame(width: t.mark, height: t.mark)
            Text("SMILECOMPOSE")
                .font(.system(size: t.wordmark, weight: .semibold)).tracking(t.wordmark * 0.34)
                .foregroundStyle(p.secondary).lineLimit(1).minimumScaleFactor(0.8)
        }
    }
}

/// A glass tile that follows the widget's own corner, inset by its margin (concentric, as iOS draws them).
private struct Glass: View {
    let p: Palette
    var accent = false
    var body: some View {
        ZStack {
            if accent {
                ContainerRelativeShape().fill(LinearGradient(colors: p.accent, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .widgetAccentable()
                ContainerRelativeShape().strokeBorder(p.accentStroke, lineWidth: 0.8)
            } else {
                ContainerRelativeShape().fill(p.tile)
                ContainerRelativeShape().fill(LinearGradient(colors: [p.tileShine, .clear], startPoint: .top, endPoint: .center))
                ContainerRelativeShape().strokeBorder(p.tileStroke, lineWidth: 0.7)
            }
        }
    }
}

/// An SF Symbol in a soft round well.
private struct IconWell: View {
    let symbol: String, size: CGFloat, p: Palette
    var accent = false
    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.44, weight: .semibold))
            .foregroundStyle(accent ? p.accentText : p.icon)
            .frame(width: size, height: size)
            .background(Circle().fill(accent ? p.accentText.opacity(0.1) : p.iconWell))
    }
}

/// A grid action: icon well top-left, title and detail bottom-left.
private struct ActionTile: View {
    let title: String, detail: String?, symbol: String, action: Action, t: Type, p: Palette
    var accent = false
    var body: some View {
        Link(destination: action.url) {
            VStack(alignment: .leading, spacing: 0) {
                IconWell(symbol: symbol, size: 28 * t.k, p: p, accent: accent)
                Spacer(minLength: 4 * t.k)
                Text(title).font(.system(size: t.label, weight: .semibold))
                    .foregroundStyle(accent ? p.accentText : p.text).lineLimit(1).minimumScaleFactor(0.8)
                if let detail {
                    Text(detail).font(.system(size: t.caption))
                        .foregroundStyle(accent ? p.accentText.opacity(0.7) : p.secondary).lineLimit(1).minimumScaleFactor(0.8)
                }
            }
            .padding(10 * t.k)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(Glass(p: p, accent: accent))
        }
    }
}

/// The main action, full width: start a new smile design.
private struct HeroAction: View {
    let t: Type, p: Palette
    var subtitle = "Photo to smile concept in a minute"
    var body: some View {
        Link(destination: Action.new.url) {
            HStack(spacing: 12 * t.k) {
                IconWell(symbol: "camera.fill", size: 38 * t.k, p: p, accent: true)
                VStack(alignment: .leading, spacing: 2 * t.k) {
                    Text("New smile design").font(.system(size: t.emphasis, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.85)
                    Text(subtitle).font(.system(size: t.caption)).opacity(0.72).lineLimit(1).minimumScaleFactor(0.8)
                }
                .foregroundStyle(p.accentText)
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right").font(.system(size: t.label, weight: .semibold)).foregroundStyle(p.accentText.opacity(0.7))
            }
            .padding(.horizontal, 12 * t.k)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Glass(p: p, accent: true))
        }
    }
}

/// The latest case (when it was edited only, never its name, photo or treatment), or the sample case.
private struct RecentTile: View {
    let recentAt: Date?, now: Date, t: Type, p: Palette
    var body: some View {
        ActionTile(title: recentAt == nil ? "Sample case" : "Latest case",
                   detail: recentAt.map { edited($0, now: now) } ?? "No credits used",
                   symbol: recentAt == nil ? "play.fill" : "clock.arrow.circlepath",
                   action: recentAt == nil ? .sample : .recent, t: t, p: p)
    }
}

/// "38 generations remaining · Renews 14 October" over a slim bar. Opens Subscription.
private struct AllowanceStrip: View {
    let allowance: Allowance?, t: Type, p: Palette
    var body: some View {
        Link(destination: Action.plan.url) {
            VStack(alignment: .leading, spacing: 6 * t.k) {
                HStack(spacing: 6 * t.k) {
                    Text(allowance?.summary ?? "Your plan").font(.system(size: t.label, weight: .semibold)).foregroundStyle(p.text).lineLimit(1)
                    Spacer(minLength: 0)
                    Text(allowance?.renewal ?? "Generations and renewal").font(.system(size: t.caption)).foregroundStyle(p.secondary)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(p.track)
                        if let f = allowance?.fraction, f > 0 {
                            Capsule().fill(LinearGradient(colors: p.ring, startPoint: .leading, endPoint: .trailing))
                                .frame(width: max(6 * t.k, geo.size.width * min(1, f))).widgetAccentable()
                        }
                    }
                }
                .frame(height: 5 * t.k)
            }
        }
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

/// Full-bleed ground: a deep warm gradient with a soft glow in the top corner. Removed by the system in
/// tinted, clear and StandBy modes, where the glass Home Screen shows through.
private struct Ground: View {
    let p: Palette
    var body: some View {
        ZStack {
            LinearGradient(colors: p.ground, startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [p.glow, .clear], center: .topTrailing, startRadius: 0, endRadius: 260)
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

/// Small: start a new design. The whole widget is the button.
private struct SmallView: View {
    let p: Palette, entry: Entry
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 126))
            VStack(alignment: .leading, spacing: 0) {
                Header(t: t, p: p)
                Spacer(minLength: 4)
                Text("New smile\ndesign").font(.system(size: t.title, weight: .regular, design: .serif))
                    .foregroundStyle(p.text).lineLimit(2).minimumScaleFactor(0.8)
                Spacer(minLength: 6)
                HStack(spacing: 6 * t.k) {
                    Image(systemName: "camera.fill").font(.system(size: t.caption, weight: .semibold))
                    Text("Start").font(.system(size: t.label, weight: .semibold))
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.up.right").font(.system(size: t.caption, weight: .semibold)).opacity(0.7)
                }
                .foregroundStyle(p.accentText)
                .padding(.horizontal, 12 * t.k).frame(height: 34 * t.k)
                .background(Glass(p: p, accent: true))
            }
        }
        .widgetURL(Action.new.url)
    }
}

/// Medium: greeting and the four everyday actions.
private struct MediumView: View {
    let p: Palette, entry: Entry
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 126))
            HStack(spacing: t.gap) {
                VStack(alignment: .leading, spacing: 0) {
                    Header(t: t, p: p)
                    Spacer(minLength: 4)
                    Text(greeting(entry.shared.name, at: entry.date)).font(.system(size: t.title * 0.9, weight: .regular, design: .serif))
                        .foregroundStyle(p.text).lineLimit(3).minimumScaleFactor(0.75)
                    Spacer(minLength: 4)
                    Text(entry.allowance?.summary ?? "Ready when you are").font(.system(size: t.caption)).foregroundStyle(p.secondary)
                        .lineLimit(2).minimumScaleFactor(0.85)
                }
                .frame(width: geo.size.width * 0.36, alignment: .leading)
                Grid(horizontalSpacing: t.gap * 0.75, verticalSpacing: t.gap * 0.75) {
                    GridRow {
                        ActionTile(title: "New design", detail: nil, symbol: "camera.fill", action: .new, t: t, p: p, accent: true)
                        ActionTile(title: "Cases", detail: nil, symbol: "folder.fill", action: .cases, t: t, p: p)
                    }
                    GridRow {
                        ActionTile(title: "Library", detail: nil, symbol: "books.vertical.fill", action: .library, t: t, p: p)
                        RecentTile(recentAt: entry.shared.recentCaseAt, now: entry.date, t: t, p: p)
                    }
                }
            }
        }
        .widgetURL(Action.new.url)
    }
}

/// Large: greeting, the main action, four actions and the allowance.
private struct LargeView: View {
    let p: Palette, entry: Entry
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.width / 306))
            VStack(alignment: .leading, spacing: t.gap) {
                Header(t: t, p: p)
                Text(greeting(entry.shared.name, at: entry.date)).font(.system(size: t.title, weight: .regular, design: .serif))
                    .foregroundStyle(p.text).lineLimit(2).minimumScaleFactor(0.8)
                HeroAction(t: t, p: p).frame(height: 62 * t.k)
                Grid(horizontalSpacing: t.gap, verticalSpacing: t.gap) {
                    GridRow {
                        ActionTile(title: "Cases", detail: "Every patient", symbol: "folder.fill", action: .cases, t: t, p: p)
                        ActionTile(title: "Case Library", detail: "Your style references", symbol: "books.vertical.fill", action: .library, t: t, p: p)
                    }
                    GridRow {
                        RecentTile(recentAt: entry.shared.recentCaseAt, now: entry.date, t: t, p: p)
                        ActionTile(title: "Your plan", detail: entry.allowance?.plan ?? "Generations", symbol: "sparkles", action: .plan, t: t, p: p)
                    }
                }
                AllowanceStrip(allowance: entry.allowance, t: t, p: p)
            }
        }
        .widgetURL(Action.new.url)
    }
}

/// Extra large (iPad): a working Home screen in two columns.
private struct ExtraLargeView: View {
    let p: Palette, entry: Entry
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 310))
            HStack(alignment: .top, spacing: t.gap * 2) {
                VStack(alignment: .leading, spacing: t.gap) {
                    Header(t: t, p: p)
                    Spacer(minLength: 2)
                    Text(greeting(entry.shared.name, at: entry.date)).font(.system(size: t.title * 1.25, weight: .regular, design: .serif))
                        .foregroundStyle(p.text).lineLimit(2).minimumScaleFactor(0.8)
                    Text("Let’s plan your next smile.").font(.system(size: t.label)).foregroundStyle(p.secondary).lineLimit(1)
                    Spacer(minLength: 4)
                    HeroAction(t: t, p: p, subtitle: "Take or choose the patient’s photo").frame(height: 66 * t.k)
                    AllowanceStrip(allowance: entry.allowance, t: t, p: p).padding(.top, 4 * t.k)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                Grid(horizontalSpacing: t.gap, verticalSpacing: t.gap) {
                    GridRow {
                        ActionTile(title: "Cases", detail: "Every patient", symbol: "folder.fill", action: .cases, t: t, p: p)
                        ActionTile(title: "Case Library", detail: "Style references", symbol: "books.vertical.fill", action: .library, t: t, p: p)
                    }
                    GridRow {
                        RecentTile(recentAt: entry.shared.recentCaseAt, now: entry.date, t: t, p: p)
                        ActionTile(title: "Sample case", detail: "Try it without a patient", symbol: "play.fill", action: .sample, t: t, p: p)
                    }
                }
                .frame(width: geo.size.width * 0.46)
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
                Header(t: t, p: p).frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 4)
                Ring(fraction: allowance?.fraction, width: 6 * t.k, p: p) {
                    if let allowance {
                        VStack(spacing: 0) {
                            Text("\(allowance.remaining)").font(.system(size: t.number, weight: .semibold, design: .rounded)).foregroundStyle(p.text)
                                .lineLimit(1).minimumScaleFactor(0.6).contentTransition(.numericText())
                            Text("left").font(.system(size: t.caption)).foregroundStyle(p.secondary)
                        }
                    } else {
                        ToothShape().stroke(p.text, style: StrokeStyle(lineWidth: 1.5 * t.k, lineJoin: .round)).frame(width: 26 * t.k, height: 26 * t.k)
                    }
                }
                .frame(width: 80 * t.k, height: 80 * t.k)
                Spacer(minLength: 4)
                Text(allowance?.renewal ?? "Your generations").font(.system(size: t.caption)).foregroundStyle(p.secondary)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
        }
        .widgetURL(Action.plan.url)
    }
}

/// Generations, medium: the balance, the plan and renewal, and a new design.
private struct GenerationsMediumView: View {
    let p: Palette, entry: Entry
    var body: some View {
        GeometryReader { geo in
            let t = Type(k: min(1, geo.size.height / 126))
            let allowance = entry.allowance
            HStack(spacing: 14 * t.k) {
                Ring(fraction: allowance?.fraction, width: 7 * t.k, p: p) {
                    if let allowance {
                        VStack(spacing: 0) {
                            Text("\(allowance.remaining)").font(.system(size: t.number, weight: .semibold, design: .rounded)).foregroundStyle(p.text)
                                .lineLimit(1).minimumScaleFactor(0.6)
                            Text("generations").font(.system(size: t.caption)).foregroundStyle(p.secondary)
                        }
                    } else {
                        ToothShape().stroke(p.text, style: StrokeStyle(lineWidth: 1.6 * t.k, lineJoin: .round)).frame(width: 30 * t.k, height: 30 * t.k)
                    }
                }
                .frame(width: 108 * t.k, height: 108 * t.k)
                VStack(alignment: .leading, spacing: 0) {
                    Header(t: t, p: p)
                    Spacer(minLength: 4)
                    Text(allowance?.plan ?? "Your plan").font(.system(size: t.emphasis, weight: .semibold)).foregroundStyle(p.text).lineLimit(1)
                    Text(allowance?.renewal ?? "Generations and renewal").font(.system(size: t.caption)).foregroundStyle(p.secondary)
                        .lineLimit(1).minimumScaleFactor(0.85)
                    Spacer(minLength: 6)
                    Link(destination: Action.new.url) {
                        HStack(spacing: 6 * t.k) {
                            Image(systemName: "camera.fill").font(.system(size: t.caption, weight: .semibold))
                            Text("New design").font(.system(size: t.label, weight: .semibold))
                            Spacer(minLength: 0)
                            Image(systemName: "arrow.up.right").font(.system(size: t.caption, weight: .semibold)).opacity(0.7)
                        }
                        .foregroundStyle(p.accentText).padding(.horizontal, 12 * t.k).frame(height: 32 * t.k)
                        .background(Glass(p: p, accent: true))
                    }
                }
            }
            .frame(maxHeight: .infinity)
        }
        .widgetURL(Action.plan.url)
    }
}

/// The mark alone, as large as the widget allows.
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
        let ground = Look(tinted: false, bare: false).palette(scheme)
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
                    Text(entry.allowance.map { "\($0.remaining) generations left" } ?? "New smile design").font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .widgetURL(Action.new.url)
            .widgetBackground { Color.clear }
        case .accessoryInline:
            Label(name.map { "Welcome, \($0)" } ?? "New smile design", systemImage: "plus.circle")
                .widgetURL(Action.new.url)
                .widgetBackground { Color.clear }
        case .systemMedium:
            MediumView(p: p, entry: entry).widgetBackground { Ground(p: ground) }
        case .systemLarge:
            LargeView(p: p, entry: entry).widgetBackground { Ground(p: ground) }
        case .systemExtraLarge:
            ExtraLargeView(p: p, entry: entry).widgetBackground { Ground(p: ground) }
        default:
            SmallView(p: p, entry: entry).widgetBackground { Ground(p: ground) }
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
        let ground = Look(tinted: false, bare: false).palette(scheme)
        switch family {
        case .systemMedium:
            GenerationsMediumView(p: p, entry: entry).widgetBackground { Ground(p: ground) }
        default:
            GenerationsSmallView(p: p, allowance: entry.allowance).widgetBackground { Ground(p: ground) }
        }
    }
}

// MARK: - Widgets

struct SmileComposeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SmileComposeWidget", provider: Provider()) { entry in WidgetView(entry: entry) }
            .configurationDisplayName("SmileCompose")
            .description("Start a new smile design, open your cases, your Case Library or your latest case.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge,
                                .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct SmileComposeGenerationsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SmileComposeGenerations", provider: Provider()) { entry in GenerationsView(entry: entry) }
            .configurationDisplayName("SmileCompose Generations")
            .description("Generations remaining and when your plan renews. Never shows patient details.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct SmileComposeMarkWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SmileComposeMark", provider: Provider()) { _ in MarkWidgetView() }
            .configurationDisplayName("SmileCompose Symbol")
            .description("The SmileCompose symbol. Tap to start a new smile design.")
            .supportedFamilies([.systemSmall])
    }
}

private struct MarkWidgetView: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View { MarkView().widgetBackground { Ground(p: .of(scheme)) } }
}

@main
struct SmileComposeWidgets: WidgetBundle {
    var body: some Widget {
        SmileComposeWidget()
        SmileComposeGenerationsWidget()
        SmileComposeMarkWidget()
    }
}
