// server.cjs  — CommonJS (works even if package.json has "type":"module")
const express = require("express");
const path = require("path");
const cors = require("cors");
const { default: axios } = require("axios");
const { defaultInstructions } = require("./prompt");
const https = require("https");
const fs = require("fs").promises;

require("dotenv").config();

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text({ type: "application/sdp" })); // to accept raw SDP
app.use(express.static("public")); // serves index.html, etc.

console.log(
  "OpenAI key loaded:",
  process.env.OPENAI_API_KEY
    ? process.env.OPENAI_API_KEY.slice(0, 6) + "…"
    : "NO"
);

let cookies = "";

// One place to control session behavior
const BASE_SESSION = {
  model: "gpt-realtime",
  voice: "alloy",
  modalities: ["audio", "text"],
  turn_detection: {
    type: "server_vad",
    threshold: 0.6, // lower = more sensitive
    silence_duration_ms: 1200, // pause to end a turn
    // "type": "semantic_vad",
    // "eagerness": "auto",
    create_response: true, // auto-speak after user turn
    interrupt_response: true,
  },
  input_audio_noise_reduction: {
    type: "near_field",
  },
  input_audio_transcription: {
    model: "gpt-4o-transcribe",
    language: "en",
  },
  tools: [
    {
      type: "function",
      name: "verify_location",
      description: `Call to verify a location in Spain. Return a list of matching locations if ambiguous.`,
      parameters: {
        type: "object",
        properties: {
          locationName: {
            type: "string",
            description: "A location name like Marbella or Mijas Costa",
          },
        },
        required: ["locationName"],
      },
    },
    {
      type: "function",
      name: "listing_property",
      description: "Create a property listing with given parameters.",
      parameters: {
        type: "object",
        properties: {
          locationName: {
            type: "string",
            description:
              "A location name like Marbella or Mijas Costa after customer confirmed",
          },
          subLocation: {
            type: "string",
            description:
              "A subLocation name like La Cala de Mijas or Elviria after customer confirmed",
          },
          province: {
            type: "string",
            description:
              "A province name like Malaga or Cadiz after customer confirmed",
          },
          bedrooms: { type: "number", description: "Number of bedrooms" },
          bathrooms: {
            type: "number",
            description: "Number of bathrooms",
          },
          builtSize: {
            type: "number",
            description: "Build size in square meters",
          },
          type: {
            type: "string",
            description: "Type of the property",
          },
          subType: {
            type: "string",
            description: "subType of the property",
          },
        },
        required: [
          "locationName",
          "type",
          "subType",
          "bedrooms",
          "bathrooms",
          "builtSize",
        ],
      },
    },
  ],
  tool_choice: "auto",
  temperature: 0.6,
  // speed: 1.0,
};

const fileMappingPath = {
  greetings: "/greetings.txt",
  location: "/location.txt",
  propertyType: "/propertyType.txt",
  instructions: "/instructions.txt",
};

async function readFile(instructionName = "instructions") {
  try {
    const filePath = fileMappingPath[instructionName];
    if (!filePath) {
      throw new Error("Invalid file name");
    }
    const data = await fs.readFile("./prompts" + filePath, "utf8");

    return data;
  } catch (err) {
    console.error("Error reading file:", err);
  }
}

async function writeFile(instructionName, data) {
  try {
    const filePath = fileMappingPath[instructionName];
    if (!filePath) {
      throw new Error("Invalid file name");
    }
    await fs.writeFile("./prompts" + filePath, data, "utf8");
  } catch (err) {
    console.error("Error writing file:", err);
  }
}

function prepareInstructions(
  greetings,
  instructions,
  locationInstruction,
  propertyTypeInstruction
) {
  let instructionsWithPrompts = instructions.replace("{greetings}", greetings);

  instructionsWithPrompts = instructions.replace(
    "{locationInstruction}",
    locationInstruction
  );

  instructionsWithPrompts = instructionsWithPrompts.replace(
    "{propertyTypeInstruction}",
    propertyTypeInstruction
  );

  return instructionsWithPrompts;
}

async function login(username, password) {
  try {
    const response = await axios.post(
      `${process.env.RV3_DOMAIN}/auth/login`,
      { username, password },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    cookies = response.headers["set-cookie"];
    if (response.status >= 200 && response.status < 300) {
      console.log("Re-authenticated with backend");
      return response.data;
    }

    return JSON.stringify({
      error: "backend_error",
      message: "Login failed",
    });
  } catch (error) {
    throw error;
  }
}

// ====================== INTERNAL API =======================//
app.get("/greetings", async (req, res) => {
  let greetings = await readFile("greetings");

  return res.status(200).json({ greetings });
});

app.get("/instructions", async (req, res) => {
  let instructions = await readFile("instructions");

  return res.status(200).json({ instructions });
});

app.get("/locationInstruction", async (req, res) => {
  const locationInstruction = await readFile("location");

  return res.status(200).json({ locationInstruction });
});

app.get("/propertyTypeInstruction", async (req, res) => {
  const propertyTypeInstruction = await readFile("propertyType");

  return res.status(200).json({ propertyTypeInstruction });
});

app.post("/save-greetings", async (req, res) => {
  const { data } = req.body;

  try {
    await writeFile("greetings", data);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error saving greeting", error: error.message });
  }

  return res.status(200).json({ message: "Greeting saved successfully" });
});

app.post("/save-instructions", async (req, res) => {
  const { data } = req.body;

  try {
    await writeFile("instructions", data);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error saving instruction", error: error.message });
  }

  return res.status(200).json({ message: "Instruction saved successfully" });
});

app.post("/save-location-instruction", async (req, res) => {
  const { data } = req.body;

  try {
    await writeFile("location", data);
  } catch (error) {
    return res.status(500).json({
      message: "Error saving location instruction",
      error: error.message,
    });
  }

  return res.status(200).json({ message: "Location instruction saved" });
});

app.post("/save-propertyType-instruction", async (req, res) => {
  const { data } = req.body;

  try {
    await writeFile("propertyType", data);
  } catch (error) {
    return res.status(500).json({
      message: "Error saving property type instruction",
      error: error.message,
    });
  }

  return res.status(200).json({ message: "Property type instruction saved" });
});

//======================= OPENAI REALTIME API =======================//
// Optional: expose a session endpoint if you want to introspect the payload
app.post("/session", async (req, res) => {
  try {
    const greetings = await readFile("greetings");
    let instructions = await readFile("instructions");
    const locationInstruction = await readFile("location");
    const propertyTypeInstruction = await readFile("propertyType");

    instructions = (
      prepareInstructions(
        greetings,
        instructions,
        locationInstruction,
        propertyTypeInstruction
      ) || defaultInstructions
    ).trim();

    const payload = {
      ...BASE_SESSION,
      instructions: instructions,
      ...(req.body || {}),
    }; // allow overrides
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify(payload),
    });
    const text = await r.text();

    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).send(String(e));
  }
});

// Proxy the browser's SDP offer to OpenAI; return the SDP answer
app.post("/sdp", async (req, res) => {
  try {
    // 1) Mint an ephemeral token
    const sess = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify(BASE_SESSION),
    });
    if (!sess.ok) {
      const t = await sess.text();
      return res.status(sess.status).send(t);
    }
    const sessionData = await sess.json();
    const ephemeral = sessionData?.client_secret?.value;
    if (!ephemeral) return res.status(500).send("No ephemeral token");

    // 2) Send SDP offer authenticated with ephemeral token
    const r = await fetch(
      "https://api.openai.com/v1/realtime?model=gpt-realtime",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeral}`,
          "Content-Type": "application/sdp",
          "OpenAI-Beta": "realtime=v1",
        },
        body: req.body, // raw SDP from browser
      }
    );

    const answer = await r.text();
    res.status(r.status).type("application/sdp").send(answer);
  } catch (e) {
    res.status(500).send(String(e));
  }
});

// ======================= BACKEND API =======================//
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/main.html", (req, res) => {
  if (!cookies) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "views", "main.html"));
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }
  try {
    const response = await login(username, password);
    return res.status(200).json({ message: "Login successful" });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      message: error.response ? error.response.data?.message : "Login failed",
    });
  }
});

app.get("/search-location", async (req, res) => {
  try {
    const result = await axios.get(
      `${process.env.RV3_DOMAIN}/location/search?keyword=${encodeURIComponent(
        req.query.keyword
      )}&page=${req.query.page || 1}&limit=3`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies,
        },
      }
    );

    return res.status(200).json(result.data);
  } catch (error) {
    return res.status(500).json({
      message: "Error during searching location",
      error: error.message,
    });
  }
});

app.post("/property/create", async (req, res) => {
  try {
    const response = await axios.post(
      `${process.env.RV3_DOMAIN}/property/create`,
      { ...req.body },
      {
        withCredentials: true,
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies,
        },
      }
    );

    if (response.status >= 200 && response.status < 300) {
      return res.status(response.status).json(response.data);
    }

    return res.status(response.status).json({
      error: "backend_error",
      message: "Create property failed",
    });
  } catch (error) {
    console.error("Error creating property:", error);
  }
});

const port = 3000;
let intervalId;

async function startServer() {
  try {
    const key = await fs.readFile("./ssl/key.pem");
    const cert = await fs.readFile("./ssl/cert.pem");

    const options = { key, cert };

    // Create HTTPS server
    const server = https.createServer(options, app).listen(port, () => {
      console.log(`HTTPS server running at https://localhost:${port}`);

      intervalId = setInterval(login, 45 * 60 * 1000); // every 45 minutes
    });

    // Handle server close
    server.on("close", () => {
      if (intervalId) clearInterval(intervalId);
      console.log("Interval cleared and server closed");
    });

    // Handle process termination (Ctrl+C)
    process.on("SIGINT", () => {
      if (intervalId) clearInterval(intervalId);
      server.close(() => {
        console.log("Server and interval cleaned up");
        process.exit(0);
      });
    });
  } catch (err) {
    console.error("Error starting HTTPS server:", err);
  }
}

startServer();
