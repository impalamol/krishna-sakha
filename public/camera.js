// KRISHNA SAKHA — camera presence.
// Uses the visitor's camera ONLY after they tap the camera button. Faces are found by MediaPipe's
// face detector running entirely inside the browser: no image or video ever leaves the device.
// What it does: notices when someone is in front of the screen, follows the nearest person with his
// eyes and head, and tells the page when a person arrives or leaves (the page then greets them with
// a smile and starts a one-to-one voice conversation). It does not identify people or guess personal
// traits such as gender.
(function () {
  const $ = (id) => document.getElementById(id);
  const fab = $("camFab"), box = $("camBox"), video = $("camVideo"), label = $("camLabel");
  const stage = $("stage");
  const Avatar = () => window.SanatanAvatar;

  let stream = null, detector = null, running = false;
  let present = false, lastSeen = 0, firstSeen = 0, absentSince = Date.now(), lastWelcome = 0;
  const ARRIVE_MS = 700;      // someone must be there this long before he greets (ignores flickers)
  const LEAVE_MS = 7000;      // gone this long = they left
  const REGREET_MS = 20000;   // greet again only if they were away at least this long

  const fire = (event, detail = {}) => window.dispatchEvent(new CustomEvent("sanatan-visitor", { detail: { event, ...detail } }));

  async function loadDetector() {
    if (detector) return detector;
    const vision = await import("./vendor/mediapipe/vision_bundle.mjs");
    const files = await vision.FilesetResolver.forVisionTasks("./vendor/mediapipe/wasm");
    const make = (delegate) => vision.FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: "./vendor/mediapipe/blaze_face_short_range.tflite", delegate },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.6,
    });
    try { detector = await make("GPU"); } catch { detector = await make("CPU"); }
    return detector;
  }

  function setUi(on, text) {
    fab.classList.toggle("on", on);
    fab.setAttribute("aria-pressed", String(on));
    fab.title = on ? "Turn the camera off" : "Let Krishna Sakha see you (camera stays on this device)";
    box.hidden = !on;
    if (text) label.textContent = text;
  }

  async function start() {
    if (running) return;
    if (!navigator.mediaDevices?.getUserMedia) { fire("error", { message: "This browser can't use the camera." }); return; }
    try {
      setUi(true, "Starting camera…");
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      label.textContent = "Loading face detection…";
      await loadDetector();
      running = true;
      label.textContent = "👁 He can see you · nothing leaves this device";
      fire("camera-on");
      loop();
    } catch (err) {
      stop();
      const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      fire("error", {
        message: denied
          ? "The camera is blocked. Click the lock icon in the address bar and allow the camera."
          : "The camera could not start. Is another app using it?",
      });
    }
  }

  function stop() {
    running = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    if (present) { present = false; fire("leave"); }
    setUi(false);
    fire("camera-off");
  }

  function loop() {
    if (!running) return;
    try {
      if (video.readyState >= 2) handle(detector.detectForVideo(video, performance.now()).detections || []);
    } catch { /* a dropped frame: keep going */ }
    setTimeout(() => requestAnimationFrame(loop), 110); // ~8 checks a second is plenty
  }

  function handle(dets) {
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    // only people reasonably close to the screen count; the nearest (largest face) is "the visitor"
    const near = dets.filter((d) => d.boundingBox && d.boundingBox.width / vw > 0.07)
      .sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height);
    const now = Date.now();

    if (near.length) {
      const b = near[0].boundingBox;
      // mirror horizontally (the camera faces the visitor), then map into the stage
      const fx = 1 - (b.originX + b.width / 2) / vw;
      const fy = (b.originY + b.height / 2) / vh;
      const r = stage.getBoundingClientRect();
      Avatar().lookAt(fx * r.width, Math.min(0.85, fy) * r.height * 0.9);
      if (!firstSeen) firstSeen = now;
      lastSeen = now;
      if (!present && now - firstSeen > ARRIVE_MS) {
        present = true;
        const away = now - absentSince;
        if (now - lastWelcome > REGREET_MS || away > REGREET_MS) { lastWelcome = now; fire("arrive", { people: near.length }); }
        else fire("return");
      }
    } else {
      firstSeen = 0;
      if (present && now - lastSeen > LEAVE_MS) { present = false; absentSince = now; fire("leave"); }
    }
  }

  fab.addEventListener("click", () => (running ? stop() : start()));
  $("camClose").addEventListener("click", stop);
  window.addEventListener("pagehide", stop);

  window.SanatanCamera = { start, stop, get active() { return running; }, get present() { return present; } };
})();
