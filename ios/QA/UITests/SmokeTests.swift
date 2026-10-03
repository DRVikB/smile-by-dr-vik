import XCTest

final class SmokeTests: XCTestCase {
    private func tapChoice(_ title: String, in app: XCUIApplication) {
        let choice = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
        XCTAssertTrue(choice.waitForExistence(timeout: 10))
        let footer = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Next:'")).firstMatch
        let bottom = footer.exists ? footer.frame.minY - 8 : app.frame.maxY - 110
        // WebKit exposes radio choices as Other; XCTest does not scroll these
        // before tapping. Move them clear of the pinned Next action first.
        let top = app.buttons["Treatment"].frame.maxY + 12
        for _ in 0..<8 {
            if choice.frame.midY < bottom - 12 && choice.frame.midY > top + 12 { break }
            let middle = (top + bottom) / 2
            let end = middle + (choice.frame.midY < top + 12 ? 65 : -65)
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: middle / app.frame.height)).press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: end / app.frame.height)), withVelocity: .slow, thenHoldForDuration: 0.3)
        }
        XCTAssertGreaterThan(choice.frame.midY, top)
        XCTAssertLessThan(choice.frame.midY, bottom)
        print("QA_TREATMENT_TAP " + title + " " + choice.debugDescription)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "before-" + title; shot.lifetime = .keepAlways; add(shot)
        choice.tap()
        if title == "Alignment" { print("QA_ALIGNMENT_SELECTED\n" + app.debugDescription) }
    }
    func testLaunchAndAccessibility() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "uk.co.drvik.smilecompose")
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        if !app.buttons["New Smile Design"].waitForExistence(timeout: 10) {
            for _ in 0..<3 {
                if app.buttons["Back"].exists { app.buttons["Back"].tap() }
                if app.buttons["New Smile Design"].waitForExistence(timeout: 3) { break }
            }
        }
        XCTAssertTrue(app.buttons["New Smile Design"].exists)
        if app.buttons["Settings"].exists {
        app.buttons["Settings"].tap()
        XCTAssertTrue(app.buttons["Sign in or create account"].waitForExistence(timeout: 15))
        app.buttons["Sign in or create account"].tap()

        XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 15))
        app.textFields.firstMatch.tap(); app.textFields.firstMatch.typeText("simulator@example.invalid")
        app.secureTextFields.firstMatch.tap()
        app.secureTextFields.firstMatch.typeText("fixture-only-not-a-credential")
        app.buttons["Sign in"].tap()
        XCTAssertTrue(app.staticTexts["QA."].waitForExistence(timeout: 30))
        }
        XCTAssertTrue(app.buttons["Profile and settings"].waitForExistence(timeout: 30))
        app.buttons["New Smile Design"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Choose from photos'")).firstMatch.waitForExistence(timeout: 20))
        app.switches.firstMatch.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Choose from photos'")).firstMatch.isEnabled)
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'Choose from photos'")).firstMatch.tap()
        XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 30), app.debugDescription)
        let photo = app.images.matching(NSPredicate(format: "identifier == 'PXGGridLayout-Info' AND label CONTAINS '02 October'")).firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 15)); photo.tap()
        XCTAssertTrue(app.buttons["Continue"].waitForExistence(timeout: 45))
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.buttons["Review"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.buttons["Custom"].exists)
        XCTAssertFalse(app.staticTexts["Tooth map · optional"].exists)
        for count in ["4", "6", "8", "10", "6"] { app.switches[count].tap(); XCTAssertEqual(app.switches[count].value as? String, "1") }
        app.buttons["Treatment"].tap()
        for title in ["Whitening", "Veneers", "Alignment", "Full Arch / All-on-X"] {
            XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch.waitForExistence(timeout: 5), "Missing V1 treatment: " + title)
        }
        tapChoice("Alignment", in: app)
        app.buttons["Teeth"].tap()
        XCTAssertTrue(app.staticTexts["Both visible arches. Natural tooth shape and shade are retained."].waitForExistence(timeout: 10))
        XCTAssertFalse(app.switches["6"].exists)
        app.buttons["Shape"].tap()
        XCTAssertFalse(app.buttons["Square"].exists)
        app.buttons["Shade"].tap()
        XCTAssertFalse(app.switches["BL1"].exists)
        app.buttons["Treatment"].tap()
        tapChoice("Full Arch / All-on-X", in: app)
        app.buttons["Arch"].tap()
        XCTAssertTrue(app.staticTexts["Both visible arches · Zirconia."].waitForExistence(timeout: 10))
        for arch in ["Upper", "Lower", "Both"] { XCTAssertFalse(app.switches[arch].exists) }
        let scopeShot = XCTAttachment(screenshot: app.screenshot()); scopeShot.name = "full-arch-scope"; scopeShot.lifetime = .keepAlways; add(scopeShot)
        app.buttons["Treatment"].tap()
        tapChoice("Veneers", in: app)
        let composite = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Composite bonding'")).firstMatch
        XCTAssertTrue(composite.waitForExistence(timeout: 15), app.debugDescription); tapChoice("Composite bonding", in: app)
        app.buttons["Review"].tap()
        XCTAssertTrue(app.buttons["Generate Smile"].waitForExistence(timeout: 15))
        app.buttons["Generate Smile"].tap()
        if app.buttons["Continue"].waitForExistence(timeout: 3) {
            let permission = app.switches.matching(NSPredicate(format: "label BEGINSWITH 'I have explained'")).firstMatch
            XCTAssertTrue(permission.waitForExistence(timeout: 10), app.debugDescription); permission.tap()
            app.buttons["Continue"].tap()
        }
        let options = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Options'")).firstMatch
        XCTAssertTrue(options.waitForExistence(timeout: 90), app.debugDescription)
        let slider = app.sliders["Before and after comparison"]
        XCTAssertTrue(slider.exists); slider.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 0.1, thenDragTo: slider.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)))
        XCTAssertNotEqual(slider.value as? String, "50 percent original, 50 percent concept")
        XCTAssertTrue(app.images["AI-generated smile concept"].exists)
        options.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Overlay'" )).firstMatch.waitForExistence(timeout: 10)); app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Overlay'" )).firstMatch.tap()
        app.buttons["Close options"].tap()
        XCTAssertTrue(app.buttons["Increase overlay strength"].waitForExistence(timeout: 10)); app.buttons["Increase overlay strength"].tap()
        app.buttons["Decrease overlay strength"].tap()
        options.tap(); app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Slide'" )).firstMatch.tap(); app.buttons["Close options"].tap()
        print("QA_GENERATE_TREE\n" + app.debugDescription)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "launch"; shot.lifetime = .keepAlways; add(shot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "accessibility"; tree.lifetime = .keepAlways; add(tree)
        print("QA_ACCESSIBILITY_START\n" + app.debugDescription + "\nQA_ACCESSIBILITY_END")
        app.terminate()
        app.launch()
        XCTAssertTrue(options.waitForExistence(timeout: 30), "Saved comparison must reopen after force-close")
        XCTAssertTrue(app.images["AI-generated smile concept"].exists)
        if app.frame.width > 700 {
            XCUIDevice.shared.orientation = .landscapeLeft
            XCTAssertTrue(options.waitForExistence(timeout: 15)); XCTAssertTrue(app.images["AI-generated smile concept"].exists)
            let landscape = XCTAttachment(screenshot: app.screenshot()); landscape.name = "ipad-landscape"; landscape.lifetime = .keepAlways; add(landscape)
            XCUIDevice.shared.orientation = .portrait
        }
    }
}

// No recipients are selected: native exports are opened, inspected and cancelled.
final class ShareExportTests: XCTestCase {
    func testSavedPreviewAndReportOpenNativeShare() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "uk.co.drvik.smilecompose")
        app.launch()
        XCTAssertTrue(app.buttons["Share"].waitForExistence(timeout: 30), app.debugDescription)
        app.buttons["Share"].tap()
        let preview = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Smile Preview'")).firstMatch
        XCTAssertTrue(preview.waitForExistence(timeout: 15)); preview.tap()
        XCTAssertTrue(app.images["Smile Preview: before and concept"].waitForExistence(timeout: 30), app.debugDescription)
        print("QA_PREVIEW_READY\n" + app.debugDescription)
        // The background comparison also has Share; use the foreground sheet's
        // last Share button rather than trying to tap the obscured control.
        let share = app.buttons.matching(identifier: "Share").allElementsBoundByIndex.last!
        for _ in 0..<6 { if share.isHittable { break }; app.swipeUp() }
        share.tap()
        let nativeShare = app.otherElements["ActivityListView"]
        XCTAssertTrue(nativeShare.waitForExistence(timeout: 30), app.debugDescription)
        print("QA_PREVIEW_NATIVE_SHARE\n" + app.debugDescription)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "native-preview-share"; shot.lifetime = .keepAlways; add(shot)
        app.otherElements["PopoverDismissRegion"].tap()
        XCTAssertFalse(nativeShare.exists, "Native share must be dismissed before returning to report controls")
        XCTAssertTrue(app.buttons["Back"].waitForExistence(timeout: 15)); app.buttons.matching(identifier: "Back").allElementsBoundByIndex.last!.tap()
        let report = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Consultation Report'")).firstMatch
        XCTAssertTrue(report.waitForExistence(timeout: 15)); report.tap()
        let create = app.buttons["Create report"]
        XCTAssertTrue(create.waitForExistence(timeout: 45), app.debugDescription)
        for _ in 0..<8 {
            if create.isHittable { break }
            app.swipeUp()
        }
        create.tap()
        XCTAssertTrue(app.images["Consultation report, page 1"].waitForExistence(timeout: 45), app.debugDescription)
        let reportShot = XCTAttachment(screenshot: app.screenshot()); reportShot.name = "consultation-report-ready"; reportShot.lifetime = .keepAlways; add(reportShot)
        let reportShare = app.buttons.matching(identifier: "Share").allElementsBoundByIndex.last!
        for _ in 0..<6 { if reportShare.isHittable { break }; app.swipeUp() }
        reportShare.tap()
        XCTAssertTrue(nativeShare.waitForExistence(timeout: 30), app.debugDescription)
        print("QA_REPORT_NATIVE_SHARE\n" + app.debugDescription)
        let pdfShot = XCTAttachment(screenshot: app.screenshot()); pdfShot.name = "native-report-share"; pdfShot.lifetime = .keepAlways; add(pdfShot)
        app.otherElements["PopoverDismissRegion"].tap()
        XCTAssertFalse(nativeShare.exists, "Native share must be dismissed before returning to report controls")
    }
}

// Reuses disposable synthetic cases from the deterministic simulator fixture.
final class CaseReopenTests: XCTestCase {
    func testHomeDraftOpensEditor() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "uk.co.drvik.smilecompose")
        app.launch()
        if app.buttons["Close saved comparison"].exists { app.buttons["Close saved comparison"].tap() }
        if app.buttons["Close version details"].exists { app.buttons["Close version details"].tap() }
        if app.buttons["Close"].exists { app.buttons["Close"].firstMatch.tap() }
        for _ in 0..<4 {
            if app.buttons["New Smile Design"].waitForExistence(timeout: 2) { break }
            if app.buttons["Back"].exists { app.buttons["Back"].tap() }
        }
        XCTAssertTrue(app.buttons["New Smile Design"].exists, app.debugDescription)
        app.buttons["New Smile Design"].tap()
        let choose = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Choose from photos'")).firstMatch
        XCTAssertTrue(choose.waitForExistence(timeout: 15))
        if !choose.isEnabled { app.switches.firstMatch.tap() }
        choose.tap()
        XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 15))
        let photo = app.images.matching(NSPredicate(format: "identifier == 'PXGGridLayout-Info' AND label CONTAINS '02 October'")).firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 15)); photo.tap()
        XCTAssertTrue(app.buttons["Continue"].waitForExistence(timeout: 30)); app.buttons["Continue"].tap()
        XCTAssertTrue(app.buttons["Review"].waitForExistence(timeout: 20))
        // Leaving the editor retains its photo/settings and records Home as
        // the last screen. Reopening must nevertheless return to the editor.
        app.buttons["Back"].tap()
        XCTAssertTrue(app.buttons["Continue"].waitForExistence(timeout: 10))
        app.buttons["Back"].tap()
        XCTAssertTrue(app.buttons["New Smile Design"].waitForExistence(timeout: 10))
        let recent = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Unnamed case'")).firstMatch
        XCTAssertTrue(recent.waitForExistence(timeout: 15)); recent.tap()
        XCTAssertTrue(app.buttons["Rename case"].waitForExistence(timeout: 10))
        let draft = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Draft'")).firstMatch
        XCTAssertTrue(draft.waitForExistence(timeout: 10)); draft.tap()
        XCTAssertTrue(app.buttons["Review"].waitForExistence(timeout: 20), "Draft reopening must leave Home: " + app.debugDescription)
        app.buttons["Review"].tap()
        XCTAssertTrue(app.buttons["Generate Smile"].waitForExistence(timeout: 10))
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "reopened-draft-editor"; shot.lifetime = .keepAlways; add(shot)
    }
    func testHomeRecentCaseOpensSavedComparison() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "uk.co.drvik.smilecompose")
        app.launch()
        for _ in 0..<4 {
            if app.buttons["New Smile Design"].waitForExistence(timeout: 3) { break }
            if app.buttons["Back"].exists { app.buttons["Back"].tap() }
        }
        XCTAssertTrue(app.buttons["New Smile Design"].waitForExistence(timeout: 10), app.debugDescription)
        let recent = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Unnamed case' AND label CONTAINS 'AI concept'")).firstMatch
        XCTAssertTrue(recent.waitForExistence(timeout: 15), app.debugDescription)
        recent.tap()
        XCTAssertTrue(app.buttons["Rename case"].waitForExistence(timeout: 15), "Recent-case tap must open its case: " + app.debugDescription)
        let version = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Version' OR label BEGINSWITH 'Smile concept'")).firstMatch
        XCTAssertTrue(version.waitForExistence(timeout: 10), app.debugDescription)
        version.tap()
        XCTAssertTrue(app.buttons["Reopen comparison"].waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertTrue(app.buttons["Reopen comparison"].isEnabled, app.debugDescription)
        app.buttons["Reopen comparison"].tap()
        XCTAssertTrue(app.buttons["Close saved comparison"].waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(app.images["AI-generated smile concept"].exists)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "reopened-saved-comparison"; shot.lifetime = .keepAlways; add(shot)
    }
}

// Explicitly selected by qa:ios-live-generation; never part of deterministic QA.
final class PhotoImportTests: XCTestCase {
    func testAuthorizedFolderImportsWithoutProvider() throws {
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
        let run = safari.buttons["Run local photo checks"]
        XCTAssertTrue(run.waitForExistence(timeout: 45)); run.tap()
        let outcome = safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'PASS:' OR label BEGINSWITH 'FAIL:'")).firstMatch
        XCTAssertTrue(outcome.waitForExistence(timeout: 90), safari.debugDescription)
        XCTAssertTrue(outcome.label.hasPrefix("PASS: six local photo checks"), outcome.label)
    }
}

final class LiveGenerationTests: XCTestCase {
    func testSyntheticStagingGeneration() throws {
        guard ProcessInfo.processInfo.environment["SMILE_QA_LIVE"] == "1" else { throw XCTSkip("Live provider QA requires the explicit live scheme") }
        continueAfterFailure = false
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
        let run = safari.buttons["Run live generations"]
        XCTAssertTrue(run.waitForExistence(timeout: 45))
        run.tap()
        let outcome = safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'PASS:' OR label BEGINSWITH 'FAIL:'")).firstMatch
        XCTAssertTrue(outcome.waitForExistence(timeout: 230), safari.debugDescription)
        XCTAssertTrue(outcome.label.hasPrefix("PASS: all live results"), outcome.label)
        let shot = XCTAttachment(screenshot: safari.screenshot()); shot.name = "live-delivered"; shot.lifetime = .keepAlways; add(shot)
        safari.terminate(); safari.launch()
        let verify = safari.buttons["Verify saved results after relaunch"]
        XCTAssertTrue(verify.waitForExistence(timeout: 45)); verify.tap()
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'PASS:' AND label CONTAINS 'reopened after relaunch'")).firstMatch.waitForExistence(timeout: 30))
        let reopened = XCTAttachment(screenshot: safari.screenshot()); reopened.name = "live-reopened"; reopened.lifetime = .keepAlways; add(reopened)
    }
}
