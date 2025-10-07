const logEl = document.getElementById("log-content");

function log(...args) {
  const s = args
    .map((x) => (typeof x === "string" ? x : JSON.stringify(x, null, 2)))
    .join(" ");
  logEl.textContent += s + "\n\n";
}

async function createNewSession() {
  try {
    const response = await axios.post("/session", {});
    console.log("Create session response:", response.data);
    return response.data;
  } catch (err) {
    console.log("Error creating session:", err);
    return null;
  }
}

async function writeFile(data) {
  try {
    await fs.writeFile("./prompt.txt", data, "utf8");
    console.log("File written successfully");
  } catch (err) {
    console.error("Error writing file:", err);
  }
}

async function initGreetings() {
  return (await axios.get("/greetings")).data.greetings;
}

async function initInstructions() {
  return (await axios.get("/instructions")).data.instructions;
}

async function initLocationInstruction() {
  return (await axios.get("/locationInstruction")).data.locationInstruction;
}

async function initPropertyTypeInstruction() {
  return (await axios.get("/propertyTypeInstruction")).data
    .propertyTypeInstruction;
}

(async () => {
  try {
    document.getElementById("prompts-greetings").value =
      (await initGreetings()) || "Initial content for Greetings";

    document.getElementById("prompts-instructions").value =
      (await initInstructions()) || "Initial content for Instructions";

    document.getElementById("prompts-location-instruction").value =
      (await initLocationInstruction()) ||
      "Initial content for Location Instruction";

    document.getElementById("prompts-property-instruction").value =
      (await initPropertyTypeInstruction()) ||
      "Initial content for Property Instruction";
  } catch (err) {
    console.error("Error loading instructions:", err);
  }
})();

function openTab(tabNumber) {
  document
    .querySelectorAll(".tab-content")
    .forEach((content) => content.classList.remove("active"));
  document
    .querySelectorAll(".tab-button")
    .forEach((button) => button.classList.remove("active"));
  document.getElementById(`tab${tabNumber}`).classList.add("active");
  document
    .querySelectorAll(".tab-button")
    [tabNumber - 1].classList.add("active");
}

async function updateText(textType) {
  let dataUpdated = "";
  switch (textType) {
    case "greetings":
      dataUpdated = document.getElementById(`prompts-greetings`).value;

      await axios.post("/save-greetings", {
        data: dataUpdated,
      });
      break;

    case "instructions":
      dataUpdated = document.getElementById(`prompts-instructions`).value;

      await axios.post("/save-instructions", {
        data: dataUpdated,
      });
      break;
    case "locationInstruction":
      dataUpdated = document.getElementById(
        `prompts-location-instruction`
      ).value;

      await axios.post("/save-location-instruction", {
        data: dataUpdated,
      });
      break;
    case "propertyTypeInstruction":
      dataUpdated = document.getElementById(
        `prompts-property-instruction`
      ).value;

      await axios.post("/save-propertyType-instruction", {
        data: dataUpdated,
      });
      break;
    default:
      console.log("Unknown text type:", textType);
  }

  if (dataUpdated) {
    await createNewSession();
    stop();
  }
}

async function verifyLocation(keyword) {
  try {
    const result = await axios.get(
      `/search-location?keyword=${encodeURIComponent(keyword)}&page=1`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return result.data;
  } catch (err) {
    console.log("Error fetching location:", err);
    return null;
  }
}

function setCustomerLocationToSession(location) {
  sessionStorage.setItem("customerLocation", JSON.stringify(location));
}

async function listingProperty(
  locationName,
  subLocation,
  province,
  type,
  subType,
  beds,
  baths,
  builtSize,
  ...propertyData
) {
  try {
    const result = await axios.post(`/property/create`, {
      location: locationName,
      subLocation,
      province,
      type,
      subType,
      beds,
      baths,
      builtSize,
      type,
      subType,
      ...propertyData,
    });

    return result.data;
  } catch (err) {
    console.log("Error fetching location:", err);
    return null;
  }
}

// Wait for ICE gathering so SDP has candidates
function waitForIce(pc, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const onChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onChange);
    setTimeout(() => {
      log("ICE wait timeout, continuing with partial candidates.");
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }, timeoutMs);
  });
}

const ToolNames = {
  VerifyLocation: "verify_location",
  ListingProperty: "listing_property",
};

let pc, dc, audioEl, micStream;
let audioChunks = [];

async function start() {
  try {
    resetTokenData();
    await createNewSession();

    document.getElementById("start").disabled = true;
    document.getElementById("stop").disabled = false;
    // 1) Microphone
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // // Set up the MediaRecorder to record the audio
    // mediaRecorder = new MediaRecorder(audioStream);
    // mediaRecorder.ondataavailable = (event) => {
    //   audioChunks.push(event.data);
    // };

    // 2) Audio output element (default system output)
    audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.controls = true;
    audioEl.muted = false;
    audioEl.volume = 1.0;
    document.getElementById("audio-container").appendChild(audioEl);

    // 3) PeerConnection — single sendrecv transceiver
    pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onconnectionstatechange = () => log("PC state:", pc.connectionState);
    pc.oniceconnectionstatechange = () =>
      log("ICE state:", pc.iceConnectionState);
    pc.onsignalingstatechange = () => log("Signaling:", pc.signalingState);

    // DataChannel for events / control
    dc = pc.createDataChannel("oai-events");
    dc.onopen = () => {
      log("DataChannel open.");
      document.getElementById("ping").disabled = false;
    };

    let currentEvent = null;
    let eventId = null;
    let sliceWindow = 2; // how many turns to show in cost table
    let i = 0;
    let j = {
      index: 0,
      itemId: null,
    };
    let itemIdList = [];

    dc.onmessage = async (e) => {
      // try {
      //   const evt = JSON.parse(e.data);
      //   console.log("Event:", evt);
      //   currentEvent = evt;
      //   if (
      //     currentEvent.type === "conversation.item.created" &&
      //     (currentEvent.item.role === "user" ||
      //       currentEvent.item.role === "assistant") &&
      //     currentEvent.item.type === "message"
      //   ) {
      //     // should consider conversation from user
      //     console.log("item list:", itemIdList, i, j);
      //     if (i === 0) {
      //       j.itemId = currentEvent.item.id;
      //     }
      //     if (i - j.index > sliceWindow) {
      //       console.log("Deleting old item:", j.itemId);
      //       sendEvent({
      //         type: "conversation.item.delete",
      //         item_id: j.itemId,
      //       });
      //       j.index += 1;
      //       j.itemId = itemIdList[j.index];
      //     }
      //     i += 1;
      //     itemIdList.push(currentEvent.item.id);
      //   }
      //   if (evt.type === "response.done") {
      //     const { response } = evt;
      //     addTurnData(response.usage);
      //   }
      //   if (evt.type === "response.function_call_arguments.done") {
      //     const { name, arguments, call_id } = evt;
      //     const args = JSON.parse(arguments.trim());
      //     let locations, property;
      //     switch (name) {
      //       case ToolNames.VerifyLocation:
      //         locations = await verifyLocation(args.locationName);
      //         sendEvent({
      //           type: "conversation.item.create",
      //           item: {
      //             type: "function_call_output",
      //             call_id: call_id,
      //             output: JSON.stringify({ locations }),
      //           },
      //         });
      //         sendEvent({
      //           type: "response.create",
      //         });
      //         setCustomerLocationToSession(locations[0]);
      //         break;
      //       case ToolNames.ListingProperty:
      //         property = await listingProperty(
      //           args.locationName,
      //           args.subLocation,
      //           args.province,
      //           args.type,
      //           args.subType,
      //           args.bedrooms,
      //           args.bathrooms,
      //           args.builtSize
      //         );
      //         sendEvent({
      //           type: "conversation.item.create",
      //           item: {
      //             type: "function_call_output",
      //             call_id: call_id,
      //             output: JSON.stringify({ property }),
      //           },
      //         });
      //         sendEvent({
      //           type: "response.create",
      //           response: {
      //             // instructions: `Say with: Here is your property id: {property.id}. Everything done. Thank you!;`,
      //             // modalities: ["text", "audio"],
      //           },
      //         });
      //         // sendEvent({
      //         //   type: "response.cancel",
      //         // });
      //         break;
      //       default:
      //         output = { error: "Unknown tool" };
      //         console.log("Unknown tool:", name);
      //         log("Unknown tool:", name);
      //         break;
      //     }
      //   } else {
      //     log("Unhandled Event:", evt.type);
      //   }
      // } catch {
      //   log("Event:", e.data);
      // }
      const evt = JSON.parse(e.data);
      console.log("Event:", evt);
    };

    pc.ondatachannel = (evt) => {
      const ch = evt.channel;
      ch.onmessage = (e) => log("Model event:", e.data);
    };

    // One audio transceiver for both directions; attach mic
    const tr = pc.addTransceiver("audio", { direction: "sendrecv" });
    console.log("Audio transceiver:", tr);
    const a = await tr.sender.replaceTrack(micStream.getAudioTracks()[0]);
    console.log("Replace track result:", a);

    log("Added mic track via sendrecv transceiver.");

    // Remote audio stream → play via default output
    pc.ontrack = async (e) => {
      console.log("Remote track:", e.streams);
      audioEl.srcObject = e.streams[0];
      try {
        await audioEl.play();
        log("Remote audio playing.");
      } catch (err) {
        log("audio.play() failed:", err);
      }
    };

    // Offer → wait for ICE → send to local /sdp → set remote descr
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    log("Local description set. Waiting for ICE…");
    await waitForIce(pc);

    const resp = await fetch("/sdp", {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription.sdp,
    });
    if (!resp.ok) {
      const txt = await resp.text();
      log("SDP error:", txt);
      throw new Error("Failed SDP exchange");
    }

    const answerSdp = await resp.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    log("Connected. Speak!");

    // new greeting
    // 1) Send the exact opener
    sendEvent({
      type: "response.create",
      response: {
        // modalities: ["audio", "text"],
        instructions: await initGreetings(),
      },
    });
  } catch (err) {
    log("ERROR:", err.message || err);
    document.getElementById("start").disabled = false;
    document.getElementById("stop").disabled = true;
  }
}

function sendEvent(obj) {
  if (dc && dc.readyState === "open") {
    dc.send(JSON.stringify(obj));
  } else if (dc) {
    console.log("Waiting for DataChannel…");
    dc.addEventListener("open", () => dc.send(JSON.stringify(obj)), {
      once: true,
    });
  } else {
    console.log("DataChannel not available yet.");
  }
}

function stop() {
  document.getElementById("start").disabled = false;
  document.getElementById("stop").disabled = true;
  document.getElementById("ping").disabled = true;

  if (pc) {
    pc.close();
    pc = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (audioEl) {
    audioEl.srcObject = null;
    audioEl.remove();
    audioEl = null;
  }

  log("Stopped.");
}

// Beep to sanity-check your speakers
document.getElementById("beep").onclick = async () => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 440;
  osc.connect(ctx.destination);
  osc.start();
  setTimeout(() => osc.stop(), 400);
  log("Played test beep.");
};

document.getElementById("start").onclick = start;
document.getElementById("stop").onclick = stop;
document.getElementById("ping").onclick = () => {
  sendEvent({
    type: "response.create",
    response: {
      instructions: "Say: Hello! This is a quick test.",
    },
  });
};
