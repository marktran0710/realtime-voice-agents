// Get elements from the DOM
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const visualizerCanvas = document.getElementById("visualizer");
const audioPlayback = document.getElementById("audio-container");

// Initialize variables
let mediaRecorder;
let audioChunks = [];
let audioStream;
let analyser;
let audioContext;
let source;

// Function to capture audio from the microphone
async function startRecording() {
  try {
    // Access user's microphone
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTrack = audioStream.getAudioTracks()[0];

    // Create an AudioContext and analyser for visualizing the audio
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    source = audioContext.createMediaStreamSource(audioStream);
    source.connect(analyser);

    // Set up the MediaRecorder to record the audio
    mediaRecorder = new MediaRecorder(audioStream);
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    // When recording stops, create a Blob and provide a link for playback
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const audioUrl = URL.createObjectURL(audioBlob);
      audioPlayback.src = audioUrl;
    };

    // Start the media recorder
    mediaRecorder.start();
    startButton.disabled = true;
    stopButton.disabled = false;

    // Start audio visualization
    visualizeAudio();
  } catch (err) {
    console.error("Error accessing microphone:", err);
  }
}

// Function to stop recording
function stopRecording() {
  mediaRecorder.stop();
  stopButton.disabled = true;
  startButton.disabled = false;
  audioStream.getTracks().forEach((track) => track.stop()); // Stop the media stream
}

// Function to visualize the audio
function visualizeAudio() {
  const canvasCtx = visualizerCanvas.getContext("2d");
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  // Function to draw the waveform on the canvas
  function draw() {
    analyser.getByteFrequencyData(dataArray);

    canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height); // Clear canvas
    canvasCtx.fillStyle = "rgb(0, 0, 0)";

    const barWidth = (visualizerCanvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i];
      canvasCtx.fillStyle = "rgb(" + (barHeight + 100) + ", 50, 50)";
      canvasCtx.fillRect(
        x,
        visualizerCanvas.height - barHeight / 2,
        barWidth,
        barHeight
      );
      x += barWidth + 1;
    }

    // Continue drawing
    requestAnimationFrame(draw);
  }

  draw();
}

// Attach event listeners to buttons
startButton.addEventListener("click", startRecording);
stopButton.addEventListener("click", stopRecording);
