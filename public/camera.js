// KRISHNA SAKHA — camera presence.
// Uses the visitor's camera ONLY after they tap the camera button. Faces are found by MediaPipe's
// face detector running entirely inside the browser: no image or video ever leaves the device.
// What it does: notices when someone is in front of the screen, follows the nearest person with his
// eyes and head, and tells the page when a person arrives or leaves (the page then greets them with
// a smile and starts a one-to-one voice conversation).
//
// Who is in front of him (man, woman or child), so he can answer each the right way: a child gets simple, gentle,
// child-safe answers; Hindi/Marathi grammar addresses a man or a woman correctly ("आप कह रहे हैं / रही हैं").
// An on-device age/gender model (face-api, ~0.6 MB, in public/vendor/face-api) looks at the nearest face every few
// seconds; several readings are combined, and when it is not sure it says nothing (he then stays neutral). It never
// identifies anyone, nothing is stored or sent anywhere (only the word "man", "woman" or "child" goes with a
// question), the guess is shown under the camera picture, and one tap corrects it.
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

  // ---------- man / woman / child (on-device, best guess, correctable) ----------
  let faceapi = null, classifying = false, lastClassify = 0, readings = [], guess = null, override = null;
  const CLASSIFY_MS = 2500;
  async function loadClassifier() {
    if (faceapi) return faceapi;
    const api = await import("./vendor/face-api/face-api.esm.js");
    try { await api.tf.setBackend("webgl"); } catch { await api.tf.setBackend("cpu"); }
    await api.tf.ready();
    await api.nets.tinyFaceDetector.loadFromUri("./vendor/face-api/model");
    await api.nets.ageGenderNet.loadFromUri("./vendor/face-api/model");
    // the very first run builds the GPU programs (~10 s on this laptop): do it now on a blank picture,
    // so the first real guess comes within seconds of someone sitting down
    try { const c = document.createElement("canvas"); c.width = c.height = 224; await api.detectSingleFace(c, new api.TinyFaceDetectorOptions({ inputSize: 224 })).withAgeAndGender(); } catch {}
    faceapi = api;
    return api;
  }
  async function classify() {
    if (classifying || !faceapi || video.readyState < 2) return;
    classifying = true;
    try {
      const r = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })).withAgeAndGender();
      if (r) {
        readings.push({ age: r.age, gender: r.gender, p: r.genderProbability });
        if (readings.length > 6) readings.shift();
        decide();
      }
    } catch { /* a missed reading: try again later */ }
    classifying = false;
  }
  // combine the last readings: the median age, and a gender only when the readings agree strongly
  function decide() {
    if (readings.length < 3) return;
    const ages = readings.map((x) => x.age).sort((a, b) => a - b);
    const age = ages[Math.floor(ages.length / 2)];
    const score = readings.reduce((s, x) => s + (x.gender === "female" ? x.p : -x.p), 0) / readings.length; // -1 man … +1 woman
    let kind = null;
    if (age < 13) kind = "child";
    else if (score > 0.55) kind = "woman";
    else if (score < -0.55) kind = "man";
    const next = kind ? { kind, age: Math.round(age) } : null;
    if (JSON.stringify(next) !== JSON.stringify(guess)) { guess = next; showWho(); }
  }
  const WHO = { man: "👨 man", woman: "👩 woman", child: "🧒 child" };
  function showWho() {
    if (!running) return;
    const v = visitor();
    whoEl.textContent = v ? `Talking with: ${WHO[v.kind]}${v.source === "you" ? "" : " (guess)"} · tap to change` : "Talking with: a visitor · tap to set";
    whoEl.hidden = !present;
  }
  function visitor() {
    if (override === "none") return null;
    if (override) return { kind: override, source: "you" };
    return present && guess ? { ...guess, source: "camera" } : null;
  }
  // tap: guess -> man -> woman -> child -> don't adapt -> back to the camera's guess
  const ORDER = [null, "man", "woman", "child", "none"];
  const whoEl = document.createElement("button");
  whoEl.type = "button"; whoEl.className = "cam-who"; whoEl.hidden = true;
  whoEl.title = "He adapts his answers: simple and gentle for a child; the right Hindi/Marathi grammar for a man or a woman";
  whoEl.addEventListener("click", () => {
    override = ORDER[(ORDER.indexOf(override) + 1) % ORDER.length];
    if (override === null) readings = [];
    showWho();
    if (override === "none") whoEl.textContent = "Not adapting to who is here · tap to change";
  });
  box.appendChild(whoEl);

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
      loadClassifier().catch(() => { /* no man/woman/child guess on this device: he stays neutral */ });
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
    readings = []; guess = null; override = null; whoEl.hidden = true;
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
      if (present && now - lastClassify > CLASSIFY_MS) { lastClassify = now; classify(); }
      if (!present && now - firstSeen > ARRIVE_MS) {
        present = true;
        // a new person: forget the previous guess (a correction by tap stays until the camera is turned off)
        if (now - absentSince > 3000) { readings = []; guess = null; }
        lastClassify = now - CLASSIFY_MS + 300; showWho();
        const away = now - absentSince;
        if (now - lastWelcome > REGREET_MS || away > REGREET_MS) { lastWelcome = now; fire("arrive", { people: near.length }); }
        else fire("return");
      }
    } else {
      firstSeen = 0;
      if (present && now - lastSeen > LEAVE_MS) { present = false; absentSince = now; whoEl.hidden = true; fire("leave"); }
    }
  }

  fab.addEventListener("click", () => (running ? stop() : start()));
  $("camClose").addEventListener("click", stop);
  window.addEventListener("pagehide", stop);

  window.SanatanCamera = { start, stop, get active() { return running; }, get present() { return present; },
    /** who he is talking with: { kind: "man" | "woman" | "child", age?, source: "camera" | "you" } or null */
    get visitor() { return running ? visitor() : null; } };
})();
