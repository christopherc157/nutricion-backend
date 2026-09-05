const mongoose = require('mongoose');

const disponibilidadSchema = new mongoose.Schema({
  fecha: { type: String, required: true, unique: true }, // formato 'YYYY-MM-DD'
  horas: [
    {
      hora: { type: String, required: true }, // formato 'HH:mm'
      disponible: { type: Boolean, default: true },
      reservadoHasta: { type: Date, default: null }
    }
  ]
});

module.exports = mongoose.model('Disponibilidad', disponibilidadSchema);