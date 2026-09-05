const mongoose = require('mongoose');

const recomendadosSchema = new mongoose.Schema({
  titulo: { type: String, default: 'Productos Recomendados' },
  descripcion: { type: String },
  archivoPdf: { type: String },
  nombreArchivoOriginal: { type: String },
  actualizadoEn: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Recomendados', recomendadosSchema);