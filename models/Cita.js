const mongoose = require('mongoose');

const citaSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  telefono: { type: String, required: true },
  correo: { type: String, required: true },
  tipoConsulta: { type: String, required: true },
  motivo: { type: String },
  fecha: { type: String, required: true },
  hora: { type: String, required: true },
  atendida: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cita', citaSchema);