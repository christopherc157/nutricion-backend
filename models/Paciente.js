const mongoose = require('mongoose');

const pacienteSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  correo: { type: String, required: true, unique: true },
  telefono: { type: String, required: true },
  fechaPrimeraConsulta: { type: String },
  objetivo: { type: String },
  notasGenerales: { type: String },
  activo: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Paciente', pacienteSchema);