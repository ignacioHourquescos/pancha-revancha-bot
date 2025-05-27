const express = require("express");
const botRoutes = require("./routes/bot");
const xmlparser = require("express-xml-bodyparser");
const cors = require("cors");
const path = require("path");

const logger = require("./middleware/logger");

const app = express();
app.use(cors());
app.use(xmlparser());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(logger);

app.use("/bot", botRoutes);
app.use(express.static(path.join(__dirname, "public")));

// Ruta específica para la página del QR
app.get("/qr", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "qr.html"));
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
	console.log(`Servidor coorrriendo een http://localhost:${PORT}`);
});
