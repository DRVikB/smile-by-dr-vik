// Compiled together with the marked production definition, never a test-only copy.
private var testCount = 0
private func check(_ name: String, _ block: () -> Void) {
    block()
    testCount += 1
    print("PASS \(name)")
}

check("a new run accepts a synchronised positive first depth frame") {
    var policy = FaceScanCapturePolicy()
    assert(policy.acceptDepth(imageTimestamp: 1, depthTimestamp: 1))
    assert(policy.lastDepthTimestamp == 1)
}

check("each depth sample is accepted at most once") {
    var policy = FaceScanCapturePolicy()
    assert(policy.acceptDepth(imageTimestamp: 10, depthTimestamp: 10))
    assert(!policy.acceptDepth(imageTimestamp: 10.01, depthTimestamp: 10))
    assert(policy.lastDepthTimestamp == 10)
    assert(policy.acceptDepth(imageTimestamp: 10.02, depthTimestamp: 10.02))
}

check("out-of-order depth samples cannot replace a newer accepted sample") {
    var policy = FaceScanCapturePolicy()
    assert(policy.acceptDepth(imageTimestamp: 20, depthTimestamp: 20))
    assert(!policy.acceptDepth(imageTimestamp: 19.99, depthTimestamp: 19.99))
    assert(policy.lastDepthTimestamp == 20)
}

check("front colour and depth timestamps must remain inside the existing 50 ms tolerance") {
    var policy = FaceScanCapturePolicy()
    assert(policy.acceptDepth(imageTimestamp: 1.02, depthTimestamp: 1))
    assert(policy.acceptDepth(imageTimestamp: 1.98, depthTimestamp: 2))
    assert(!policy.acceptDepth(imageTimestamp: 3.051, depthTimestamp: 3))
    assert(!policy.acceptDepth(imageTimestamp: 3.949, depthTimestamp: 4))
    assert(policy.lastDepthTimestamp == 2)
}

check("bad timing does not advance the watermark or suppress a later valid frame") {
    var policy = FaceScanCapturePolicy()
    assert(policy.acceptDepth(imageTimestamp: 1, depthTimestamp: 1))
    assert(!policy.acceptDepth(imageTimestamp: 5, depthTimestamp: 10))
    assert(policy.lastDepthTimestamp == 1)
    assert(policy.acceptDepth(imageTimestamp: 2, depthTimestamp: 2))
}

check("nonfinite, negative and zero image timestamps are rejected") {
    for value in [Double.nan, Double.infinity, -Double.infinity, -1, 0] {
        var policy = FaceScanCapturePolicy()
        assert(!policy.acceptDepth(imageTimestamp: value, depthTimestamp: 1))
        assert(policy.lastDepthTimestamp == nil)
    }
}

check("nonfinite, negative and zero depth timestamps are rejected") {
    for value in [Double.nan, Double.infinity, -Double.infinity, -1, 0] {
        var policy = FaceScanCapturePolicy()
        assert(!policy.acceptDepth(imageTimestamp: 1, depthTimestamp: value))
        assert(policy.lastDepthTimestamp == nil)
    }
}

check("only one photo job can be in flight in a run") {
    var policy = FaceScanCapturePolicy()
    let run = policy.runID
    let ticket = policy.beginPhoto(run: run)
    assert(ticket != nil)
    assert(policy.pendingPhoto == ticket)
    assert(policy.beginPhoto(run: run) == nil)
    assert(policy.pendingPhoto == ticket)
}

check("a matching completion releases exactly its own job") {
    var policy = FaceScanCapturePolicy()
    let run = policy.runID
    let first = policy.beginPhoto(run: run)!
    assert(policy.finishPhoto(first, run: run))
    assert(policy.pendingPhoto == nil)
    assert(!policy.finishPhoto(first, run: run))
    let second = policy.beginPhoto(run: run)!
    assert(second != first)
    assert(policy.finishPhoto(second, run: run))
}

check("an unrelated ticket cannot release the real in-flight job") {
    var policy = FaceScanCapturePolicy()
    let run = policy.runID
    let ticket = policy.beginPhoto(run: run)!
    assert(!policy.finishPhoto(UUID(), run: run))
    assert(policy.pendingPhoto == ticket)
    assert(policy.beginPhoto(run: run) == nil)
    assert(policy.finishPhoto(ticket, run: run))
}

check("reset creates a new epoch and clears the frame and photo watermarks") {
    var policy = FaceScanCapturePolicy()
    let oldRun = policy.runID
    assert(policy.isCurrent(oldRun))
    assert(policy.acceptDepth(imageTimestamp: 10, depthTimestamp: 10))
    assert(policy.beginPhoto(run: oldRun) != nil)
    policy.reset()
    assert(policy.runID != oldRun)
    assert(!policy.isCurrent(oldRun))
    assert(policy.isCurrent(policy.runID))
    assert(policy.pendingPhoto == nil)
    assert(policy.lastDepthTimestamp == nil)
    assert(policy.acceptDepth(imageTimestamp: 1, depthTimestamp: 1))
}

check("a stale run cannot acquire a photo after restart") {
    var policy = FaceScanCapturePolicy()
    let oldRun = policy.runID
    policy.reset()
    assert(policy.beginPhoto(run: oldRun) == nil)
    assert(policy.pendingPhoto == nil)
    assert(policy.beginPhoto(run: policy.runID) != nil)
}

check("a stale callback cannot unlock or masquerade as a new run's photo") {
    var policy = FaceScanCapturePolicy()
    let oldRun = policy.runID
    let oldTicket = policy.beginPhoto(run: oldRun)!
    policy.reset()
    let newRun = policy.runID
    let newTicket = policy.beginPhoto(run: newRun)!
    assert(!policy.finishPhoto(oldTicket, run: oldRun))
    assert(policy.pendingPhoto == newTicket)
    assert(!policy.finishPhoto(oldTicket, run: newRun))
    assert(policy.pendingPhoto == newTicket)
    assert(policy.beginPhoto(run: newRun) == nil)
    assert(policy.finishPhoto(newTicket, run: newRun))
    assert(policy.pendingPhoto == nil)
}

check("a current ticket with an old run cannot release its job") {
    var policy = FaceScanCapturePolicy()
    let oldRun = policy.runID
    policy.reset()
    let newRun = policy.runID
    let ticket = policy.beginPhoto(run: newRun)!
    assert(!policy.finishPhoto(ticket, run: oldRun))
    assert(policy.pendingPhoto == ticket)
    assert(policy.finishPhoto(ticket, run: newRun))
}

check("several restarts keep every earlier callback invalid") {
    var policy = FaceScanCapturePolicy()
    var earlier: [(UUID, UUID)] = []
    for _ in 0..<8 {
        let run = policy.runID
        earlier.append((run, policy.beginPhoto(run: run)!))
        policy.reset()
    }
    let run = policy.runID
    let current = policy.beginPhoto(run: run)!
    for (staleRun, staleTicket) in earlier.reversed() {
        assert(!policy.isCurrent(staleRun))
        assert(!policy.finishPhoto(staleTicket, run: staleRun))
        assert(policy.pendingPhoto == current)
    }
    assert(policy.finishPhoto(current, run: run))
}

print("FaceScanCapturePolicy: \(testCount) executable production-policy checks passed")
