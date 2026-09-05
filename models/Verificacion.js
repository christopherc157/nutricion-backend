const mongoose = require('mongoose');

const verificacionSchema = new mongoose.Schema({
  email: { type: String, required: true },
  proposito: { type: String, required: true }, // 'cita' o 'pedido'
  codigo: { type: String, required: true },
  verificado: { type: Boolean, default: false },
  token: { type: String },
  intentos: { type: Number, default: 0 },
  usado: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 600 } // se autoborra a los 10 minutos
});

module.exports = mongoose.model('Verificacion', verificacionSchema);