const express = require("express");
const cors = require("cors");
const modules = require("./src/app.js");

const app = express();
const PORT = process.env.PORT || 4000;

// No auth/security middleware yet, by design (see README).
app.use(cors());
app.use(express.json());

app.use("/api/module", modules);

app.listen(PORT, () => {
  console.log(`Samples API running at http://localhost:${PORT}`);
});
