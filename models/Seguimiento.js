const mongoose = require('mongoose');

const seguimientoSchema = new mongoose.Schema({
  pacienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
  fecha: { type: String, required: true },
  peso: { type: Number, required: true },
  estatura: { type: Number },
  imc: { type: Number },
  grasaCorporal: { type: Number },
  cintura: { type: Number },
  cadera: { type: Number },
  observaciones: { type: String },
  proximoObjetivo: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Seguimiento', seguimientoSchema);