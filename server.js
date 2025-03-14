const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
const PORT = 5000;

// Storage config for audio uploads
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// Ensure directories exist
["uploads", "output", "features"].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// API Endpoint to Upload & Process Audio
app.post("/upload", upload.single("audio"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const inputPath = req.file.path;
  const outputCsv = `features/${path.basename(inputPath, path.extname(inputPath))}.csv`;
  const processedAudio = `uploads/${path.basename(inputPath, path.extname(inputPath))}.wav`;

  // ✅ Preprocess: Convert to WAV (Mono, 48kHz)
  const ffmpegCmd = `ffmpeg -i ${inputPath} -ac 1 -ar 48000 ${processedAudio}`;
  exec(ffmpegCmd, (err) => {
    if (err) return res.status(500).json({ error: "FFmpeg conversion failed" });

    // ✅ Run Chordino on processed audio
    const command = `sonic-annotator -d vamp:nnls-chroma:chordino:simplechord -w csv ${processedAudio}`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error processing audio: ${stderr}`);
        return res.status(500).json({ error: "Chord detection failed" });
      }

      // ✅ Locate & Read Output File
      fs.readdir("features/", (err, files) => {
        if (err) return res.status(500).json({ error: "Failed to read output folder" });

        // Find the generated CSV file
        const csvFile = files.find((file) => file.includes(path.basename(inputPath, path.extname(inputPath))));
        if (!csvFile) return res.status(500).json({ error: "Chord file not found" });

        fs.readFile(`features/${csvFile}`, "utf8", (err, data) => {
          if (err) return res.status(500).json({ error: "Failed to read chord output" });

          // ✅ Extract chords, remove "N" (no chord)
          const chords = data
            .split("\n")
            .map((line) => line.split(",")[1]?.replace(/"/g, "").trim())
            .filter((chord) => chord && chord !== "N");

          res.json({ chords });
        });
      });
    });
  });
});

// Start Server
app.listen(PORT, () => console.log(`🎸 Chord Detection API running on http://localhost:${PORT}`));
