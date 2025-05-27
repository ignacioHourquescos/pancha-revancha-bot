const {
	default: makeWASocket,
	DisconnectReason,
	useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode");
const path = require("path");
const fs = require("fs").promises;

class BotController {
	constructor() {
		this.sock = null;
		this.qr = null;
		this.isConnected = false;
		// En Railway, usar un directorio temporal
		this.authFolder =
			process.env.NODE_ENV === "production"
				? "/tmp/auth_whatsapp"
				: path.join(__dirname, "../auth");
		this.initializeWhatsApp();
	}

	async initializeWhatsApp() {
		try {
			// Asegurarse de que el directorio existe
			await fs.mkdir(this.authFolder, { recursive: true });

			const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

			this.sock = makeWASocket({
				printQRInTerminal: true,
				auth: state,
				qrTimeout: 60000,
				connectTimeoutMs: 60000,
				defaultQueryTimeoutMs: 60000,
				// Forzar generación de nuevo QR
				regenerateQRIntervalMs: 30000,
			});

			this.sock.ev.on("connection.update", async (update) => {
				const { connection, lastDisconnect, qr } = update;
				console.log("Connection update:", { connection, qr: !!qr });

				if (qr) {
					try {
						this.qr = await qrcode.toDataURL(qr);
						console.log("Nuevo QR generado");
					} catch (err) {
						console.error("Error generando QR:", err);
					}
				}

				if (connection === "open") {
					this.isConnected = true;
					this.qr = null;
					console.log("WhatsApp conectado!");
				}

				if (connection === "close") {
					this.isConnected = false;
					const shouldReconnect =
						(lastDisconnect?.error instanceof Boom)?.output?.statusCode !==
						DisconnectReason.loggedOut;

					if (shouldReconnect) {
						console.log("Reconectando WhatsApp...");
						setTimeout(() => this.initializeWhatsApp(), 5000);
					}
				}
			});

			this.sock.ev.on("creds.update", saveCreds);

			// Manejar mensajes entrantes
			this.sock.ev.on("messages.upsert", async (m) => {
				if (m.type === "notify") {
					for (const msg of m.messages) {
						if (!msg.key.fromMe) {
							const from = msg.key.remoteJid;
							const messageText =
								msg.message?.conversation ||
								msg.message?.extendedTextMessage?.text ||
								"";

							console.log("Mensaje recibido:", {
								from,
								message: messageText,
							});

							// Aquí puedes agregar la lógica para responder mensajes
							//await this.handleIncomingMessage(from, messageText);
						}
					}
				}
			});
		} catch (error) {
			console.error("Error inicializando WhatsApp:", error);
			this.isConnected = false;
			// Reintentar en caso de error
			setTimeout(() => this.initializeWhatsApp(), 5000);
		}
	}

	// async handleIncomingMessage(from, message) {
	// 	try {
	// 		// Ejemplo básico de respuesta
	// 		if (message.toLowerCase() === "hola") {
	// 			await this.sock.sendMessage(from, {
	// 				text: "¡Hola! Soy el bot de Revancha. ¿En qué puedo ayudarte?",
	// 			});
	// 		}
	// 	} catch (error) {
	// 		console.error("Error al manejar mensaje:", error);
	// 	}
	// }

	// Método para enviar mensajes desde otras partes de la aplicación
	async sendMessage(to, message) {
		try {
			if (!this.sock) {
				throw new Error("WhatsApp no está inicializado");
			}

			await this.sock.sendMessage(to, { text: message });
			return { success: true, message: "Mensaje enviado correctamente" };
		} catch (error) {
			console.error("Error al enviar mensaje:", error);
			throw error;
		}
	}

	// Método para obtener el estado actual del QR y la conexión
	async getStatus(req, res) {
		try {
			const status = {
				isConnected: this.isConnected,
				qr: this.qr,
				timestamp: new Date().toISOString(),
				environment: process.env.NODE_ENV,
				authPath: this.authFolder,
			};

			console.log("Status request:", status);

			res.json(status);
		} catch (error) {
			console.error("Error en getStatus:", error);
			res.status(500).json({
				error: "Error al obtener estado",
				details: error.message,
			});
		}
	}

	async resetConnection(req, res) {
		try {
			// Limpiar directorio de auth
			await fs.rm(this.authFolder, { recursive: true, force: true });

			// Reiniciar conexión
			await this.initializeWhatsApp();

			res.json({
				success: true,
				message: "Conexión reiniciada",
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			console.error("Error en resetConnection:", error);
			res.status(500).json({
				error: "Error al reiniciar conexión",
				details: error.message,
			});
		}
	}
}

// Exportar una única instancia del controlador
module.exports = new BotController();
